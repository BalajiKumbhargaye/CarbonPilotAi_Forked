import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import {
  DataRequestResponseType,
  DataRequestStatus,
  ClaimStatus,
  DocumentStatus,
  DocumentType,
  OrganizationType,
  ProductStatus,
  QuestionnaireCategory,
  QuestionResponseStatus,
  SupplierStatus,
  UserStatus,
  UserRole,
} from '@carbonpilot/shared';
import {
  createDataRequestSchema,
  requestClarificationSchema,
  saveDataRequestItemResponseSchema,
  updateDataRequestSchema,
} from '@carbonpilot/validation';
import { authenticate, AuthUserPayload } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import {
  DataRequestModel,
  ClaimModel,
  ClaimEvidenceLinkModel,
  DocumentModel,
  NotificationModel,
  OrganizationMemberModel,
  OrganizationModel,
  ProductModel,
  QuestionResponseModel,
  QuestionnaireTemplateModel,
  SupplierModel,
  SupplierRelationshipModel,
  DocumentExtractionModel,
  VerificationRunModel,
  UserModel,
} from '../../models';
import { isSupportedProcurementFile, privateDocumentStorage } from '../../services/abstractions/IStorageService';
import { AppError, sendError, sendSuccess } from '../../utils/response';
import { logger } from '../../utils/logger';
import { normalizeCarbonData } from '../verification/normalization';
import { auditService } from '../audit';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

const uploadMiddleware: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      sendError(res, tooLarge ? 413 : 400, error.code, tooLarge ? 'File exceeds the 25 MB limit' : error.message);
      return;
    }

    if (error) return next(error);
    return next();
  });
};

type RequestItem = {
  _id: mongoose.Types.ObjectId | string;
  key: string;
  label: string;
  description?: string;
  responseType: DataRequestResponseType;
  category: string;
  required: boolean;
  requiresEvidence?: boolean;
  unit?: string;
  options?: string[];
  conditions?: Array<{ questionKey: string; operator: 'EQUALS' | 'NOT_EQUALS'; value: string | number | boolean }>;
  order: number;
  metadata?: Record<string, unknown>;
};

type RequestRecord = {
  _id: mongoose.Types.ObjectId | string;
  customerOrganizationId: mongoose.Types.ObjectId | string;
  supplierOrganizationId: mongoose.Types.ObjectId | string;
  createdBy: mongoose.Types.ObjectId | string;
  title: string;
  description: string;
  deadline?: Date | string;
  status: DataRequestStatus;
  productId?: mongoose.Types.ObjectId | string;
  templateId?: mongoose.Types.ObjectId | string;
  requestedItems: RequestItem[];
  allowPartialSubmission: boolean;
  foundFields: string[];
  missingFields: string[];
  lastSubmittedAt?: Date;
  clarificationMessage?: string;
  clarificationItemIds?: Array<mongoose.Types.ObjectId | string>;
  toObject: () => Record<string, any>;
  save: () => Promise<unknown>;
};

export class DataRequestsService {
  private documentTypeForRequestItem(item: RequestItem, filename: string): DocumentType {
    const context = `${item.label} ${item.key} ${filename}`.toLowerCase();
    if (/\bepd\b|environmental product declaration/.test(context)) return DocumentType.EPD;
    if (/\bpcf\b|product carbon footprint|carbon footprint/.test(context)) return DocumentType.PCF_REPORT;
    if (/certificate|iso\s*14001|iso\s*50001/.test(context)) return DocumentType.CERTIFICATE;
    if (/ghg inventory|scope\s*[123]\s+emissions?/.test(context)) return DocumentType.GHG_INVENTORY;
    if (/energy report/.test(context)) return DocumentType.ENERGY_REPORT;
    if (/sustainability report/.test(context)) return DocumentType.SUSTAINABILITY_REPORT;
    return DocumentType.OTHER;
  }

  async getSuppliers(buyerOrganizationId: string) {
    const relationships = await SupplierRelationshipModel.find({
      customerOrganizationId: buyerOrganizationId,
      status: SupplierStatus.ACTIVE,
    });
    if (!relationships.length) return [];
    const organizationIds = relationships.map((item) => item.supplierOrganizationId);
    const [organizations, profiles] = await Promise.all([
      OrganizationModel.find({ _id: { $in: organizationIds }, type: OrganizationType.SUPPLIER }),
      SupplierModel.find({ organizationId: { $in: organizationIds }, status: SupplierStatus.ACTIVE }),
    ]);
    const orgById = new Map(organizations.map((org) => [org._id.toString(), org]));
    return profiles.flatMap((profile) => {
      const organization = orgById.get(profile.organizationId.toString());
      return organization ? [{
        _id: profile._id.toString(),
        organizationId: organization._id.toString(),
        name: organization.name,
      }] : [];
    });
  }

  async getProductsForSupplier(supplierId: string, buyerOrganizationId: string) {
    const { supplier } = await this.getConnectedSupplier(supplierId, buyerOrganizationId);
    return ProductModel.find({ supplierId: supplier._id, status: ProductStatus.ACTIVE }).sort({ name: 1 });
  }

  async create(data: Record<string, any>, user: AuthUserPayload) {
    const parsed = createDataRequestSchema.safeParse(data);
    if (!parsed.success) throw this.validationError(parsed.error.issues);
    const { supplier, organization } = await this.getConnectedSupplier(parsed.data.supplierId, user.organizationId);
    let productId: string | undefined;
    let selectedProduct: any;
    if (parsed.data.productId) {
      selectedProduct = await ProductModel.findOne({
        _id: parsed.data.productId,
        supplierId: supplier._id,
        status: ProductStatus.ACTIVE,
      });
      if (!selectedProduct) throw new AppError('Choose a product belonging to the selected supplier', 400, 'INVALID_PRODUCT');
      productId = selectedProduct._id.toString();
    }
    if (parsed.data.templateId) {
      const template = await QuestionnaireTemplateModel.findOne({ _id: parsed.data.templateId, isActive: true });
      if (!template) throw new AppError('Questionnaire template not found', 404, 'NOT_FOUND');
      this.assertTemplateMatches(template, supplier, selectedProduct);
    }
    const requestedItems = this.normalizeQuestionSet(parsed.data.requestedItems);

    const request = await DataRequestModel.create({
      customerOrganizationId: user.organizationId,
      supplierOrganizationId: organization._id,
      createdBy: user.userId,
      title: parsed.data.title,
      description: parsed.data.description,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
      productId,
      templateId: parsed.data.templateId,
      status: DataRequestStatus.DRAFT,
      allowPartialSubmission: parsed.data.allowPartialSubmission,
      requestedItems,
      requiredFields: requestedItems.filter((item) => item.required).map((item) => item.label),
      foundFields: [],
      missingFields: requestedItems.filter((item) => item.required).map((item) => item.label),
    });
    return this.toResponse(request as unknown as RequestRecord, true);
  }

  async updateDraft(id: string, data: Record<string, any>, user: AuthUserPayload) {
    const request = await this.findBuyerRequest(id, user.organizationId);
    if (request.status !== DataRequestStatus.DRAFT) {
      throw new AppError('Only draft requests can be edited', 409, 'REQUEST_NOT_EDITABLE');
    }
    const parsed = updateDataRequestSchema.safeParse(data);
    if (!parsed.success) throw this.validationError(parsed.error.issues);

    if (parsed.data.requestedItems) {
      const existingResponse = await QuestionResponseModel.exists({ dataRequestId: request._id });
      if (existingResponse) throw new AppError('Requirements cannot change after supplier responses exist', 409, 'RESPONSES_EXIST');
    }
    const supplier = await SupplierModel.findOne({ organizationId: request.supplierOrganizationId });
    const selectedProductId = parsed.data.productId !== undefined ? parsed.data.productId : request.productId?.toString();
    const product = selectedProductId && supplier ? await ProductModel.findOne({
      _id: selectedProductId,
      supplierId: supplier._id,
      status: ProductStatus.ACTIVE,
    }) : null;
    if (parsed.data.productId && !product) {
      throw new AppError('Choose a product belonging to the selected supplier', 400, 'INVALID_PRODUCT');
    }
    const selectedTemplateId = parsed.data.templateId || request.templateId?.toString();
    if (selectedTemplateId) {
      const template = await QuestionnaireTemplateModel.findOne({ _id: selectedTemplateId, isActive: true });
      if (!template) throw new AppError('Questionnaire template not found', 404, 'NOT_FOUND');
      if (!supplier) throw new AppError('Supplier profile not found', 404, 'NOT_FOUND');
      this.assertTemplateMatches(template, supplier, product);
    }

    const updates: Record<string, unknown> = {
      ...parsed.data,
      ...(parsed.data.requestedItems ? { requestedItems: this.normalizeQuestionSet(parsed.data.requestedItems) } : {}),
    };
    if ('deadline' in parsed.data) updates.deadline = parsed.data.deadline ? new Date(parsed.data.deadline) : undefined;
    if ('productId' in parsed.data) updates.productId = parsed.data.productId || undefined;
    Object.assign(request, {
      ...updates,
      ...(parsed.data.requestedItems ? {
        requiredFields: parsed.data.requestedItems.filter((item) => item.required).map((item) => item.label),
        missingFields: parsed.data.requestedItems.filter((item) => item.required).map((item) => item.label),
      } : {}),
    });
    await request.save();
    return this.toResponse(request, true);
  }

  async send(id: string, user: AuthUserPayload) {
    const request = await this.findBuyerRequest(id, user.organizationId);
    if (request.status !== DataRequestStatus.DRAFT) {
      throw new AppError('Only draft requests can be sent', 409, 'INVALID_TRANSITION');
    }
    if (!request.requestedItems.length) throw new AppError('Add at least one requirement before sending', 400, 'NO_REQUIREMENTS');
    request.status = DataRequestStatus.SENT;
    await request.save();
    await this.notifyOrganization(
      request.supplierOrganizationId.toString(),
      'New data request',
      `A buyer sent you “${request.title}”.`,
      `/supplier/data-requests/${request._id}`,
      'INFO'
    );
    return this.toResponse(request, true);
  }

  async list(user: AuthUserPayload, incoming = false) {
    const filter = user.organizationType === OrganizationType.CUSTOMER
      ? { customerOrganizationId: user.organizationId }
      : { supplierOrganizationId: user.organizationId, status: { $nin: [DataRequestStatus.DRAFT, DataRequestStatus.CANCELLED] } };
    const requests = await DataRequestModel.find(filter).sort({ updatedAt: -1 });
    return Promise.all(requests.map((request) => this.toResponse(request as unknown as RequestRecord, !incoming, user.organizationType)));
  }

  async summary(user: AuthUserPayload) {
    const filter = user.organizationType === OrganizationType.CUSTOMER
      ? { customerOrganizationId: user.organizationId }
      : { supplierOrganizationId: user.organizationId, status: { $nin: [DataRequestStatus.DRAFT, DataRequestStatus.CANCELLED] } };
    const requests = await DataRequestModel.find(filter).select('status');
    const statuses = user.organizationType === OrganizationType.CUSTOMER
      ? [DataRequestStatus.SENT, DataRequestStatus.IN_PROGRESS, DataRequestStatus.SUBMITTED, DataRequestStatus.NEEDS_CLARIFICATION, DataRequestStatus.COMPLETED]
      : [DataRequestStatus.SENT, DataRequestStatus.IN_PROGRESS, DataRequestStatus.SUBMITTED, DataRequestStatus.NEEDS_CLARIFICATION];
    return {
      total: requests.length,
      counts: Object.fromEntries(statuses.map((status) => [status, requests.filter((item) => item.status === status).length])),
    };
  }

  async getById(id: string, user: AuthUserPayload) {
    const request = await this.findParticipantRequest(id, user);
    if (user.organizationType === OrganizationType.SUPPLIER
      && [DataRequestStatus.DRAFT, DataRequestStatus.CANCELLED].includes(request.status)) {
      throw new AppError('Data request not found', 404, 'NOT_FOUND');
    }
    return this.toResponse(request, true, user.organizationType);
  }

  async saveResponse(id: string, itemId: string, data: unknown, user: AuthUserPayload) {
    const { request, supplier } = await this.findSupplierRequest(id, user.organizationId);
    this.assertSupplierCanRespond(request);
    const item = this.findItem(request, itemId);
    if (item.responseType === DataRequestResponseType.DOCUMENT) {
      throw new AppError('Upload a document for this requirement', 400, 'DOCUMENT_REQUIRED');
    }
    const parsed = saveDataRequestItemResponseSchema.safeParse(data);
    if (!parsed.success) throw this.validationError(parsed.error.issues);
    const normalized = this.normalizeValue(item, parsed.data.value);
    const currentResponses = await QuestionResponseModel.find({ dataRequestId: request._id, supplierId: supplier._id });
    const answersByKey = this.answersByKey(request, currentResponses);
    if (!this.isVisible(item, answersByKey)) {
      throw new AppError('This follow-up question is not currently applicable', 409, 'QUESTION_NOT_ACTIVE');
    }

    const response = await QuestionResponseModel.findOneAndUpdate(
      { dataRequestId: request._id, supplierId: supplier._id, requestedItemId: item._id },
      {
        $set: {
          question: item.label,
          field: item.key,
          answer: Array.isArray(normalized) ? normalized.join(', ') : String(normalized),
          value: normalized,
          unit: parsed.data.unit || item.unit,
          status: QuestionResponseStatus.DRAFT,
          submittedAt: undefined,
        },
        $setOnInsert: {
          dataRequestId: request._id,
          supplierId: supplier._id,
          requestedItemId: item._id,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await this.markInProgress(request);
    return response;
  }

  async uploadResponseDocument(id: string, itemId: string, file: Express.Multer.File | undefined, user: AuthUserPayload) {
    if (!file || !file.size) throw new AppError('Choose a document to upload', 400, 'NO_FILE');
    if (file.size > MAX_FILE_SIZE) throw new AppError('File exceeds the 25 MB limit', 413, 'FILE_TOO_LARGE');
    if (!isSupportedProcurementFile(file)) {
      throw new AppError('Only valid PDF, PNG, and JPG/JPEG files are supported', 415, 'UNSUPPORTED_FILE_TYPE');
    }
    const { request, supplier } = await this.findSupplierRequest(id, user.organizationId);
    this.assertSupplierCanRespond(request);
    const item = this.findItem(request, itemId);
    const currentResponses = await QuestionResponseModel.find({ dataRequestId: request._id, supplierId: supplier._id });
    if (!this.isVisible(item, this.answersByKey(request, currentResponses))) {
      throw new AppError('This follow-up question is not currently applicable', 409, 'QUESTION_NOT_ACTIVE');
    }
    if (item.responseType !== DataRequestResponseType.DOCUMENT && !item.requiresEvidence) {
      throw new AppError('This question does not request an evidence document', 400, 'EVIDENCE_NOT_REQUESTED');
    }

    const stored = await privateDocumentStorage.uploadFile({
      originalname: file.originalname,
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    });
    let document;
    try {
      document = await DocumentModel.create({
        organizationId: user.organizationId,
        supplierId: supplier._id,
        productId: request.productId,
        uploadedBy: user.userId,
        type: this.documentTypeForRequestItem(item, file.originalname),
        filename: file.originalname.replace(/[\\/]/g, '_'),
        fileUrl: `/api/data-requests/${request._id}/documents/${item._id}/file`,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        fileSize: stored.fileSize,
        dataRequestId: request._id,
        requestedItemId: item._id,
        status: DocumentStatus.UPLOADED,
      });
      await QuestionResponseModel.findOneAndUpdate(
        { dataRequestId: request._id, supplierId: supplier._id, requestedItemId: item._id },
        {
          $set: { question: item.label, field: item.label, answer: 'Document attached', value: 'Document attached', status: QuestionResponseStatus.DRAFT, submittedAt: undefined },
          $setOnInsert: { dataRequestId: request._id, supplierId: supplier._id, requestedItemId: item._id },
          $addToSet: { evidenceDocumentIds: document._id },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      await this.markInProgress(request);
    } catch (error) {
      await privateDocumentStorage.deleteFile(stored.storageKey).catch(() => false);
      if (document) await DocumentModel.deleteOne({ _id: document._id }).catch(() => undefined);
      throw error;
    }

    try {
      await this.processUploadedDocument(document, request, supplier, user);
    } catch (error) {
      logger.error('Data request document pipeline failed', {
        documentId: document._id.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      document.status = DocumentStatus.NEEDS_REVIEW;
      document.processingError = error instanceof Error ? error.message : 'Document processing needs manual review.';
      await document.save();
    }
    return {
      _id: document._id.toString(),
      filename: document.filename,
      uploadedAt: document.uploadedAt,
      status: document.status,
      processingError: document.processingError,
    };
  }

  async reprocessDocument(documentId: string, user: AuthUserPayload) {
    if (user.organizationType !== OrganizationType.SUPPLIER) {
      throw new AppError('Only the submitting supplier can retry document processing', 403, 'FORBIDDEN');
    }
    if (!mongoose.isValidObjectId(documentId)) throw new AppError('Document not found', 404, 'NOT_FOUND');
    const document = await DocumentModel.findOne({
      _id: documentId,
      organizationId: user.organizationId,
      dataRequestId: { $exists: true },
    });
    if (!document?.dataRequestId || !document.supplierId) throw new AppError('Document not found', 404, 'NOT_FOUND');
    const { request, supplier } = await this.findSupplierRequest(document.dataRequestId.toString(), user.organizationId);
    if (supplier._id.toString() !== document.supplierId.toString()) throw new AppError('Document not found', 404, 'NOT_FOUND');
    try {
      await this.processUploadedDocument(document, request, supplier, user);
    } catch (error) {
      logger.error('Retried Data Request document pipeline failed', {
        documentId: document._id.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      document.status = DocumentStatus.NEEDS_REVIEW;
      document.processingError = error instanceof Error ? error.message : 'Document processing needs manual review.';
      await document.save();
    }
    return {
      _id: document._id.toString(),
      filename: document.filename,
      status: document.status,
      processingError: document.processingError,
    };
  }

  private async processUploadedDocument(
    document: any,
    request: RequestRecord,
    supplier: any,
    user: AuthUserPayload,
    reusedExtraction?: any
  ) {
    const { extractionService } = await import('../extraction');
    const { verificationService } = await import('../verification');
    let needsReview = false;

    let extraction: any;
    try {
      extraction = reusedExtraction || await extractionService.runExtraction(document._id.toString(), user);
    } catch (error) {
      logger.warn('Data request document extraction failed', {
        documentId: document._id.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const fields = (extraction.fields || []).filter((field: any) =>
      field.extractionStatus !== 'NEEDS_REVIEW'
    );
    const fieldValue = (name: string) => fields.find((field: any) => field.field === name);
    const productField = fieldValue('PRODUCT_NAME');
    const productCodeField = fieldValue('PRODUCT_CODE');
    let productId = request.productId?.toString() || document.productId?.toString();
    if (!productId && (productField || productCodeField)) {
      const product = await ProductModel.findOne({
        supplierId: supplier._id,
        ...(productCodeField ? { productCode: String(productCodeField.value) } : { name: String(productField.value) }),
      });
      productId = product?._id?.toString();
    }

    const boundary = fieldValue('LIFECYCLE_BOUNDARY');
    const functionalUnit = fieldValue('FUNCTIONAL_UNIT');
    const reportingPeriod = fieldValue('REPORTING_PERIOD');
    const methodology = fieldValue('METHODOLOGY');
    const claimTypeByField: Record<string, string> = {
      PCF_VALUE: 'PCF_VALUE',
      RECYCLED_CONTENT: 'RECYCLED_CONTENT',
      RENEWABLE_ENERGY_PERCENTAGE: 'RENEWABLE_ELECTRICITY',
      SCOPE_1: 'GHG_SCOPE_1',
      SCOPE_2: 'GHG_SCOPE_2',
      SCOPE_3: 'GHG_SCOPE_3',
      CERTIFICATE_NUMBER: 'CERTIFICATE',
    };
    const extractedClaimFields = fields.filter((field: any) => {
      if (!claimTypeByField[field.field]) return false;
      if (field.field === 'CERTIFICATE_NUMBER') return typeof field.value === 'string' && Boolean(field.value.trim());
      return typeof field.value === 'number'
        && Number.isFinite(field.value)
        && (field.field === 'RECYCLED_CONTENT' || field.field === 'RENEWABLE_ENERGY_PERCENTAGE' || Boolean(field.unit));
    });
    const seenClaims = new Set<string>();
    const claims: any[] = [];

    for (const field of extractedClaimFields) {
      const type = claimTypeByField[field.field];
      const dedupeKey = `${type}|${field.value}|${field.unit || ''}`;
      if (seenClaims.has(dedupeKey)) continue;
      seenClaims.add(dedupeKey);

      const sourceText = field.sourceText || String(field.value);
      const exactMatch: any = await ClaimModel.findOne({
        supplierId: supplier._id,
        dataRequestId: request._id,
        ...(productId ? { productId } : {}),
        type,
        value: field.value,
        unit: field.unit,
      });
      const claim = exactMatch || await ClaimModel.create({
        supplierId: supplier._id,
        buyerOrganizationId: request.customerOrganizationId,
        productId,
        documentId: document._id,
        dataRequestId: request._id,
        type,
        value: field.value,
        unit: field.unit,
        methodology: methodology?.value,
        reportingPeriod: reportingPeriod?.value,
        boundary: boundary?.value,
        claimText: `${type}: ${field.value}${field.unit ? ` ${field.unit}` : ''}`,
        sourceReference: {
          documentId: document._id,
          page: field.page,
          section: field.field,
          sourceText,
          sourceType: 'DOCUMENT_EXTRACTION',
          extractionMethod: extraction.method,
        },
        normalizedData: field.unit && typeof field.value === 'number' ? normalizeCarbonData({
          value: field.value,
          unit: field.unit,
          functionalUnit: functionalUnit?.value,
          boundary: boundary?.value,
          reportingPeriod: reportingPeriod?.value,
        }) : undefined,
        status: ClaimStatus.PENDING,
      });

      const existingLink = await ClaimEvidenceLinkModel.findOne({
        claimId: claim._id,
        documentId: document._id,
      });
      if (!existingLink) {
        await ClaimEvidenceLinkModel.create({
          claimId: claim._id,
          documentId: document._id,
          page: field.page,
          section: field.field,
          sourceText,
          relationshipType: 'PRIMARY_SOURCE',
        });
      }
      claims.push(claim);
    }

    if (!claims.length) {
      needsReview = true;
      document.status = DocumentStatus.NEEDS_REVIEW;
      document.processingError = 'Text was extracted, but no supported structured carbon or sustainability claims were identified.';
      await document.save();
      return;
    }

    try {
      const [membership, buyerUser] = await Promise.all([
        (await import('../../models/OrganizationMember')).OrganizationMemberModel.findOne({
          organizationId: request.customerOrganizationId,
          userId: request.createdBy,
          status: UserStatus.ACTIVE,
        }),
        UserModel.findById(request.createdBy),
      ]);
      if (!membership || !buyerUser) {
        throw new Error('The requesting buyer user is unavailable for verification.');
      }
      const buyerActor: AuthUserPayload = {
        userId: request.createdBy.toString(),
        organizationId: request.customerOrganizationId.toString(),
        organizationType: OrganizationType.CUSTOMER,
        role: membership.role || UserRole.CUSTOMER_ADMIN,
        email: buyerUser.email,
      };

      for (const claim of claims) {
        try {
          const run = await verificationService.runVerification(claim._id.toString(), buyerActor);
          if ([ClaimStatus.NEEDS_REVIEW, ClaimStatus.INCONSISTENT, ClaimStatus.UNSUPPORTED].includes(run.overallStatus)) {
            needsReview = true;
          }
        } catch (error) {
          needsReview = true;
          logger.error('Automatic document claim verification failed', {
            documentId: document._id.toString(),
            claimId: claim._id.toString(),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      needsReview = true;
      logger.error('Automatic document verification could not be initialized', {
        documentId: document._id.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (needsReview) {
      document.status = DocumentStatus.NEEDS_REVIEW;
      document.processingError = 'Extraction completed, but one or more claims need buyer review. See verification checks for details.';
    } else {
      document.status = DocumentStatus.EXTRACTED;
      document.processingError = undefined;
    }
    await document.save();
  }

  async reuseExistingDocument(id: string, itemId: string, documentId: string, user: AuthUserPayload) {
    const { request, supplier } = await this.findSupplierRequest(id, user.organizationId);
    this.assertSupplierCanRespond(request);
    const item = this.findItem(request, itemId);
    if (!mongoose.isValidObjectId(documentId)) throw new AppError('Document not found', 404, 'NOT_FOUND');
    if (item.responseType !== DataRequestResponseType.DOCUMENT && !item.requiresEvidence) {
      throw new AppError('This question does not request an evidence document', 400, 'EVIDENCE_NOT_REQUESTED');
    }
    const currentResponses = await QuestionResponseModel.find({ dataRequestId: request._id, supplierId: supplier._id });
    if (!this.isVisible(item, this.answersByKey(request, currentResponses))) {
      throw new AppError('This follow-up question is not currently applicable', 409, 'QUESTION_NOT_ACTIVE');
    }
    const sourceQuery = DocumentModel.findOne({
      _id: documentId,
      organizationId: user.organizationId,
      supplierId: supplier._id,
    });
    const source = await sourceQuery.select('+storageKey');
    if (!source?.storageKey || !await privateDocumentStorage.readFile(source.storageKey)) {
      throw new AppError('Document not found', 404, 'NOT_FOUND');
    }

    const document = await DocumentModel.create({
      organizationId: user.organizationId,
      supplierId: supplier._id,
      uploadedBy: user.userId,
      type: source.type,
      filename: source.filename,
      fileUrl: `/api/data-requests/${request._id}/documents/${item._id}/file`,
      storageKey: source.storageKey,
      mimeType: source.mimeType,
      fileSize: source.fileSize,
      dataRequestId: request._id,
      requestedItemId: item._id,
      status: DocumentStatus.UPLOADED,
    });
    await QuestionResponseModel.findOneAndUpdate(
      { dataRequestId: request._id, supplierId: supplier._id, requestedItemId: item._id },
      {
        $set: { question: item.label, field: item.key, answer: 'Document attached', value: 'Document attached', status: QuestionResponseStatus.DRAFT, submittedAt: undefined },
        $setOnInsert: { dataRequestId: request._id, supplierId: supplier._id, requestedItemId: item._id },
        $addToSet: { evidenceDocumentIds: document._id },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await this.markInProgress(request);
    const sourceExtractionQuery = DocumentExtractionModel.findOne({ documentId: source._id });
    const sourceExtraction: any = await sourceExtractionQuery.sort({ processedAt: -1 });
    let reusedExtraction: any;
    if (sourceExtraction?.status === 'SUCCESS' && sourceExtraction.text) {
      reusedExtraction = await DocumentExtractionModel.create({
        documentId: document._id,
        sourceDocumentId: source._id,
        extractionVersion: sourceExtraction.extractionVersion,
        method: sourceExtraction.method,
        status: sourceExtraction.status,
        language: sourceExtraction.language,
        text: sourceExtraction.text,
        pages: sourceExtraction.pages,
        pageCount: sourceExtraction.pageCount,
        fields: sourceExtraction.fields,
        processedAt: new Date(),
      });
      document.status = DocumentStatus.EXTRACTED;
      await document.save();
    }
    try {
      await this.processUploadedDocument(document, request, supplier, user, reusedExtraction);
    } catch (error) {
      logger.error('Reused Data Request document pipeline failed', {
        documentId: document._id.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      document.status = DocumentStatus.NEEDS_REVIEW;
      document.processingError = error instanceof Error ? error.message : 'Document processing needs manual review.';
      await document.save();
    }
    return {
      _id: document._id.toString(),
      filename: document.filename,
      uploadedAt: document.uploadedAt,
      status: document.status,
      processingError: document.processingError,
    };
  }

  async submit(id: string, user: AuthUserPayload) {
    const { request, supplier } = await this.findSupplierRequest(id, user.organizationId);
    this.assertSupplierCanRespond(request);
    const responses = await QuestionResponseModel.find({ dataRequestId: request._id, supplierId: supplier._id });
    const responseByItem = new Map(responses.map((response) => [response.requestedItemId.toString(), response]));
    const answersByKey = this.answersByKey(request, responses);
    const activeItems = request.requestedItems.filter((item) => this.isVisible(item, answersByKey));
    const missingRequired = activeItems.filter((item) => item.required
      && !this.isComplete(item, responseByItem.get(item._id.toString())));
    if (missingRequired.length && !request.allowPartialSubmission) {
      throw new AppError(
        `Complete required items: ${missingRequired.map((item) => item.label).join(', ')}`,
        400,
        'REQUIRED_RESPONSES_MISSING'
      );
    }

    const completeItems = activeItems.filter((item) => this.isComplete(item, responseByItem.get(item._id.toString())));
    request.status = DataRequestStatus.SUBMITTED;
    request.lastSubmittedAt = new Date();
    request.foundFields = completeItems.map((item) => item.label);
    request.missingFields = missingRequired.map((item) => item.label);
    await request.save();
    await QuestionResponseModel.updateMany(
      { dataRequestId: request._id, supplierId: supplier._id },
      { $set: { status: QuestionResponseStatus.SUBMITTED, submittedAt: new Date() } }
    );
    await this.identifyClaimsFromResponses(
      request,
      supplier,
      completeItems.flatMap((item) => {
        const response = responseByItem.get(item._id.toString());
        return response ? [{ item, response }] : [];
      }),
      user
    );
    await this.notifyOrganization(
      request.customerOrganizationId.toString(),
      'Supplier submitted a data request',
      `A supplier submitted information for “${request.title}”.`,
      `/customer/data-requests/${request._id}`,
      'SUCCESS'
    );
    return this.toResponse(request, true, OrganizationType.SUPPLIER);
  }

  private claimTypeForQuestion(item: RequestItem) {
    const key = `${item.key} ${item.label}`.toLowerCase().replace(/[_-]+/g, ' ');
    if (/\bpcf\b|product carbon footprint|carbon footprint/.test(key)) return 'PCF_VALUE';
    if (/recycled content|recycled material percentage/.test(key)) return 'RECYCLED_CONTENT';
    if (/renewable (electricity|energy)|electricity from renewable/.test(key)) return 'RENEWABLE_ELECTRICITY';
    if (/electricity consumption|energy consumption/.test(key)) return 'ENERGY_CONSUMPTION';
    if (/scope 1 emissions?/.test(key)) return 'GHG_SCOPE_1';
    if (/scope 2 emissions?/.test(key)) return 'GHG_SCOPE_2';
    if (/scope 3 emissions?/.test(key)) return 'GHG_SCOPE_3';
    return undefined;
  }

  private async identifyClaimsFromResponses(
    request: RequestRecord,
    supplier: any,
    submitted: Array<{ item: RequestItem; response: any }>,
    user: AuthUserPayload
  ) {
    for (const { item, response } of submitted) {
      const type = this.claimTypeForQuestion(item);
      const value = response.value;
      const numericValue = typeof value === 'number' && Number.isFinite(value)
        ? value
        : typeof value === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/.test(value) ? Number(value) : undefined;
      if (!type || numericValue === undefined) continue;

      const unit = response.unit || item.unit;
      const sourceText = response.answer || `${value}${unit ? ` ${unit}` : ''}`;
      const linkedDocumentIds = [...new Set([
        ...(response.evidenceDocumentIds || []),
        ...(response.evidenceDocumentId ? [response.evidenceDocumentId] : []),
      ].map((documentId: unknown) => String(documentId)))];
      const documents = await Promise.all(linkedDocumentIds.map((documentId) =>
        DocumentModel.findOne({
          _id: documentId,
          dataRequestId: request._id,
          supplierId: supplier._id,
        })
      ));
      const validDocuments = documents.filter((document): document is NonNullable<typeof document> => Boolean(document));
      const normalizedData = unit ? normalizeCarbonData({
        value: numericValue,
        unit,
      }) : undefined;
      const existing = await ClaimModel.findOne({
        dataRequestId: request._id,
        'sourceReference.questionResponseId': response._id,
        type,
        value,
        unit,
      });
      const equivalent = existing || await ClaimModel.findOne({
        dataRequestId: request._id,
        supplierId: supplier._id,
        ...(request.productId ? { productId: request.productId } : {}),
        type,
        value: numericValue,
        unit,
      });
      if (equivalent) {
        for (const document of validDocuments) {
          const evidence = await ClaimEvidenceLinkModel.findOne({
            claimId: equivalent._id,
            documentId: document._id,
          });
          if (!evidence) {
            await ClaimEvidenceLinkModel.create({
              claimId: equivalent._id,
              documentId: document._id,
              sourceText,
              relationshipType: 'QUESTIONNAIRE_SUPPORT',
            });
          }
        }
        continue;
      }

      const claim = await ClaimModel.create({
        supplierId: supplier._id,
        buyerOrganizationId: request.customerOrganizationId,
        productId: request.productId,
        dataRequestId: request._id,
        documentId: validDocuments[0]?._id,
        type,
        value,
        unit,
        claimText: `${response.question}: ${sourceText}`,
        sourceReference: {
          documentId: validDocuments[0]?._id,
          questionResponseId: response._id,
          sourceText,
        },
        normalizedData,
        status: ClaimStatus.PENDING,
      });

      for (const document of validDocuments) {
        await ClaimEvidenceLinkModel.create({
          claimId: claim._id,
          documentId: document._id,
          sourceText,
          relationshipType: 'QUESTIONNAIRE_SUPPORT',
        });
      }
      await auditService.logAction({
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'CLAIM_CREATED',
        entityType: 'Claim',
        entityId: claim._id.toString(),
        newValue: { type, value, unit, dataRequestId: request._id.toString(), evidenceCount: validDocuments.length },
      });
    }
  }

  async requestClarification(id: string, data: unknown, user: AuthUserPayload) {
    const request = await this.findBuyerRequest(id, user.organizationId);
    if (request.status !== DataRequestStatus.SUBMITTED) {
      throw new AppError('Clarification can only be requested after supplier submission', 409, 'INVALID_TRANSITION');
    }
    const parsed = requestClarificationSchema.safeParse(data);
    if (!parsed.success) throw this.validationError(parsed.error.issues);
    const itemIds = parsed.data.itemIds || [];
    for (const itemId of itemIds) this.findItem(request, itemId);
    request.status = DataRequestStatus.NEEDS_CLARIFICATION;
    request.clarificationMessage = parsed.data.message;
    request.clarificationItemIds = itemIds;
    await request.save();
    await QuestionResponseModel.updateMany(
      {
        dataRequestId: request._id,
        ...(itemIds.length ? { requestedItemId: { $in: itemIds } } : {}),
      },
      { $set: { status: QuestionResponseStatus.REJECTED } }
    );
    await this.notifyOrganization(
      request.supplierOrganizationId.toString(),
      'Buyer requested clarification',
      `Please update “${request.title}”: ${parsed.data.message}`,
      `/supplier/data-requests/${request._id}`,
      'WARNING'
    );
    return this.toResponse(request, true);
  }

  async complete(id: string, user: AuthUserPayload) {
    const request = await this.findBuyerRequest(id, user.organizationId);
    if (request.status !== DataRequestStatus.SUBMITTED) {
      throw new AppError('Only submitted requests can be completed', 409, 'INVALID_TRANSITION');
    }
    request.status = DataRequestStatus.COMPLETED;
    await request.save();
    await this.notifyOrganization(
      request.supplierOrganizationId.toString(),
      'Data request completed',
      `The buyer completed “${request.title}”.`,
      `/supplier/data-requests/${request._id}`,
      'SUCCESS'
    );
    return this.toResponse(request, true);
  }

  async readEvidenceDocument(requestId: string, documentId: string, user: AuthUserPayload) {
    if (!mongoose.isValidObjectId(documentId)) throw new AppError('Document not found', 404, 'NOT_FOUND');
    const request = await this.findParticipantRequest(requestId, user);
    const documentQuery = DocumentModel.findOne({ _id: documentId, dataRequestId: request._id });
    const document = await documentQuery.select('+storageKey');
    if (!document?.storageKey) throw new AppError('Document not found', 404, 'NOT_FOUND');
    if (document.organizationId.toString() !== request.supplierOrganizationId.toString()) {
      throw new AppError('Document not found', 404, 'NOT_FOUND');
    }
    const buffer = await privateDocumentStorage.readFile(document.storageKey);
    if (!buffer) throw new AppError('Document not found', 404, 'NOT_FOUND');
    return { buffer, filename: document.filename, mimeType: document.mimeType };
  }

  private async findBuyerRequest(id: string, buyerOrganizationId: string): Promise<RequestRecord> {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Data request not found', 404, 'NOT_FOUND');
    const request = await DataRequestModel.findOne({ _id: id, customerOrganizationId: buyerOrganizationId });
    if (!request) throw new AppError('Data request not found', 404, 'NOT_FOUND');
    return request as unknown as RequestRecord;
  }

  private async findSupplierRequest(id: string, supplierOrganizationId: string) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Data request not found', 404, 'NOT_FOUND');
    const request = await DataRequestModel.findOne({ _id: id, supplierOrganizationId });
    if (!request || [DataRequestStatus.DRAFT, DataRequestStatus.CANCELLED].includes(request.status)) {
      throw new AppError('Data request not found', 404, 'NOT_FOUND');
    }
    const supplier = await SupplierModel.findOne({ organizationId: supplierOrganizationId });
    if (!supplier) throw new AppError('Supplier profile not found', 404, 'NOT_FOUND');
    return { request: request as unknown as RequestRecord, supplier };
  }

  private async findParticipantRequest(id: string, user: AuthUserPayload): Promise<RequestRecord> {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Data request not found', 404, 'NOT_FOUND');
    const filter = user.organizationType === OrganizationType.CUSTOMER
      ? { _id: id, customerOrganizationId: user.organizationId }
      : { _id: id, supplierOrganizationId: user.organizationId, status: { $nin: [DataRequestStatus.DRAFT, DataRequestStatus.CANCELLED] } };
    const request = await DataRequestModel.findOne(filter);
    if (!request) throw new AppError('Data request not found', 404, 'NOT_FOUND');
    return request as unknown as RequestRecord;
  }

  private async getConnectedSupplier(supplierId: string, buyerOrganizationId: string) {
    if (!mongoose.isValidObjectId(supplierId)) throw new AppError('Choose a valid supplier', 400, 'INVALID_SUPPLIER');
    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier || supplier.status !== SupplierStatus.ACTIVE) throw new AppError('Active supplier not found', 404, 'NOT_FOUND');
    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId: buyerOrganizationId,
      supplierOrganizationId: supplier.organizationId,
      status: SupplierStatus.ACTIVE,
    });
    if (!relationship) throw new AppError('Supplier is not actively connected to your organization', 403, 'FORBIDDEN');
    const organization = await OrganizationModel.findOne({ _id: supplier.organizationId, type: OrganizationType.SUPPLIER });
    if (!organization) throw new AppError('Supplier organization not found', 404, 'NOT_FOUND');
    return { supplier, organization };
  }

  private findItem(request: RequestRecord, itemId: string) {
    if (!mongoose.isValidObjectId(itemId)) throw new AppError('Requested item not found', 404, 'NOT_FOUND');
    const index = request.requestedItems.findIndex((candidate) => candidate._id.toString() === itemId);
    if (index < 0) throw new AppError('Requested item not found', 404, 'NOT_FOUND');
    const item = request.requestedItems[index];
    if (!item.key) item.key = this.createQuestionKey(item.label, index);
    if (item.order === undefined) item.order = index;
    if (!item.conditions) item.conditions = [];
    return item;
  }

  private normalizeQuestionSet(items: Array<Record<string, any>>) {
    const normalized: Array<Record<string, any>> = items.map((item, index) => ({
      ...item,
      key: (item.key || this.createQuestionKey(item.label, index)).trim().toLowerCase(),
      order: item.order ?? index,
      conditions: item.conditions || [],
      options: item.options || [],
    })).sort((left, right) => left.order - right.order);
    const keys = new Set<string>();
    for (const item of normalized) {
      if (keys.has(item.key)) throw new AppError(`Question key “${item.key}” must be unique`, 400, 'DUPLICATE_QUESTION_KEY');
      keys.add(item.key);
      if ([DataRequestResponseType.SINGLE_SELECT, DataRequestResponseType.MULTI_SELECT].includes(item.responseType)
        && !item.options.length) {
        throw new AppError(`Add options for “${item.label}”`, 400, 'QUESTION_OPTIONS_REQUIRED');
      }
      if (![DataRequestResponseType.SINGLE_SELECT, DataRequestResponseType.MULTI_SELECT].includes(item.responseType)
        && item.options.length) {
        throw new AppError(`Remove options from “${item.label}” or choose a select response type`, 400, 'UNEXPECTED_QUESTION_OPTIONS');
      }
      for (const condition of item.conditions) {
        const parentIndex = normalized.findIndex((candidate) => candidate.key === condition.questionKey);
        if (parentIndex < 0 || parentIndex >= normalized.indexOf(item)) {
          throw new AppError(`Condition for “${item.label}” must reference an earlier question`, 400, 'INVALID_QUESTION_CONDITION');
        }
        const parent = normalized[parentIndex];
        if (![DataRequestResponseType.YES_NO, DataRequestResponseType.BOOLEAN, DataRequestResponseType.SINGLE_SELECT].includes(parent.responseType)) {
          throw new AppError(`Condition “${condition.questionKey}” must reference a yes/no, boolean, or single-select question`, 400, 'INVALID_QUESTION_CONDITION');
        }
        if (condition.operator === 'EQUALS' && parent.options?.length && !parent.options.includes(String(condition.value))) {
          throw new AppError(`Condition value is not an option for “${parent.label}”`, 400, 'INVALID_QUESTION_CONDITION');
        }
        if (parent.responseType === DataRequestResponseType.BOOLEAN && typeof condition.value !== 'boolean') {
          throw new AppError(`Condition value for “${parent.label}” must be yes or no`, 400, 'INVALID_QUESTION_CONDITION');
        }
        if (parent.responseType === DataRequestResponseType.YES_NO && !['YES', 'NO'].includes(String(condition.value).toUpperCase())) {
          throw new AppError(`Condition value for “${parent.label}” must be yes or no`, 400, 'INVALID_QUESTION_CONDITION');
        }
      }
    }
    return normalized;
  }

  private createQuestionKey(label: string, index: number) {
    const base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'question';
    return `${base}_${index + 1}`;
  }

  private assertTemplateMatches(template: any, supplier: any, product: any) {
    if (template.productCategories?.length && (!product
      || !template.productCategories.some((category: string) => category.toLowerCase() === String(product.category).toLowerCase()))) {
      throw new AppError('This questionnaire template does not match the selected product', 400, 'TEMPLATE_PRODUCT_MISMATCH');
    }
    if (template.supplierIndustries?.length && !template.supplierIndustries.some((industry: string) =>
      industry.toLowerCase() === String(supplier.industry || '').toLowerCase()
    )) {
      throw new AppError('This questionnaire template does not match the supplier industry', 400, 'TEMPLATE_SUPPLIER_MISMATCH');
    }
  }

  private answersByKey(request: RequestRecord, responses: any[]) {
    const responseById = new Map(responses.map((response) => [response.requestedItemId.toString(), response]));
    return new Map(request.requestedItems.map((item, index) => {
      const response = responseById.get(item._id.toString());
      return [item.key || this.createQuestionKey(item.label, index), response?.value ?? response?.answer];
    }));
  }

  private isVisible(item: RequestItem, answersByKey: Map<string, unknown>) {
    return (item.conditions || []).every((condition) => {
      const actual = answersByKey.get(condition.questionKey);
      if (actual === undefined || actual === null || actual === '') return false;
      const expected = condition.value;
      const equal = typeof actual === 'string' && typeof expected === 'string'
        ? actual.toLowerCase() === expected.toLowerCase()
        : actual === expected;
      return condition.operator === 'NOT_EQUALS' ? !equal : equal;
    });
  }

  private assertSupplierCanRespond(request: RequestRecord) {
    if (![DataRequestStatus.SENT, DataRequestStatus.IN_PROGRESS, DataRequestStatus.NEEDS_CLARIFICATION].includes(request.status)) {
      throw new AppError('This request is not accepting supplier updates', 409, 'REQUEST_NOT_OPEN');
    }
  }

  private async markInProgress(request: RequestRecord) {
    if ([DataRequestStatus.SENT, DataRequestStatus.NEEDS_CLARIFICATION].includes(request.status)) {
      request.status = DataRequestStatus.IN_PROGRESS;
      await request.save();
    }
  }

  private normalizeValue(item: RequestItem, value: string | number | boolean | string[]) {
    switch (item.responseType) {
      case DataRequestResponseType.TEXT: {
        if (Array.isArray(value)) throw new AppError('Enter a text response', 400, 'INVALID_RESPONSE');
        const text = String(value).trim();
        if (!text) throw new AppError('Enter a response', 400, 'INVALID_RESPONSE');
        return text;
      }
      case DataRequestResponseType.NUMBER:
      case DataRequestResponseType.DECIMAL: {
        if (Array.isArray(value) || typeof value === 'boolean') throw new AppError('Enter a valid number', 400, 'INVALID_RESPONSE');
        if (typeof value === 'string' && !value.trim()) throw new AppError('Enter a valid number', 400, 'INVALID_RESPONSE');
        const number = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(number)) throw new AppError('Enter a valid number', 400, 'INVALID_RESPONSE');
        return number;
      }
      case DataRequestResponseType.DATE: {
        if (Array.isArray(value) || typeof value === 'boolean') throw new AppError('Enter a valid date', 400, 'INVALID_RESPONSE');
        const date = new Date(String(value));
        if (Number.isNaN(date.getTime())) throw new AppError('Enter a valid date', 400, 'INVALID_RESPONSE');
        return date.toISOString().slice(0, 10);
      }
      case DataRequestResponseType.YES_NO: {
        if (Array.isArray(value)) throw new AppError('Choose yes or no', 400, 'INVALID_RESPONSE');
        const answer = typeof value === 'boolean' ? value ? 'YES' : 'NO' : String(value).toUpperCase();
        if (answer !== 'YES' && answer !== 'NO') throw new AppError('Choose yes or no', 400, 'INVALID_RESPONSE');
        return answer;
      }
      case DataRequestResponseType.BOOLEAN: {
        if (typeof value === 'boolean') return value;
        if (Array.isArray(value)) throw new AppError('Choose yes or no', 400, 'INVALID_RESPONSE');
        const normalized = String(value).toUpperCase();
        if (normalized === 'YES' || normalized === 'TRUE') return true;
        if (normalized === 'NO' || normalized === 'FALSE') return false;
        throw new AppError('Choose yes or no', 400, 'INVALID_RESPONSE');
      }
      case DataRequestResponseType.SINGLE_SELECT: {
        if (Array.isArray(value) || typeof value !== 'string' || !item.options?.includes(value)) {
          throw new AppError('Choose an available option', 400, 'INVALID_RESPONSE');
        }
        return value;
      }
      case DataRequestResponseType.MULTI_SELECT: {
        if (!Array.isArray(value) || !value.length || !item.options?.length || value.some((option) => !item.options?.includes(option))) {
          throw new AppError('Choose one or more available options', 400, 'INVALID_RESPONSE');
        }
        return [...new Set(value)];
      }
      default:
        throw new AppError('Upload a document for this requirement', 400, 'DOCUMENT_REQUIRED');
    }
  }

  private isComplete(item: RequestItem, response: any) {
    if (!response) return false;
    if (item.responseType === DataRequestResponseType.DOCUMENT) {
      return Boolean(response.evidenceDocumentId || response.evidenceDocumentIds?.length);
    }
    if (response.value === undefined || response.value === null || response.value === '') return false;
    let valueIsComplete = true;
    if (item.responseType === DataRequestResponseType.NUMBER || item.responseType === DataRequestResponseType.DECIMAL) valueIsComplete = Number.isFinite(Number(response.value));
    else if (item.responseType === DataRequestResponseType.DATE) valueIsComplete = !Number.isNaN(Date.parse(String(response.value)));
    else if (item.responseType === DataRequestResponseType.YES_NO) valueIsComplete = ['YES', 'NO', true, false].includes(response.value);
    else valueIsComplete = String(response.value).trim().length > 0;
    return valueIsComplete && (!item.requiresEvidence || Boolean(response.evidenceDocumentId || response.evidenceDocumentIds?.length));
  }

  private async toResponse(request: RequestRecord, includeResponses: boolean, viewerType?: OrganizationType) {
    const [buyer, supplier, product, responses] = await Promise.all([
      OrganizationModel.findById(request.customerOrganizationId),
      OrganizationModel.findById(request.supplierOrganizationId),
      request.productId ? ProductModel.findById(request.productId) : null,
      includeResponses ? QuestionResponseModel.find({ dataRequestId: request._id }) : Promise.resolve([]),
    ]);
    const responseByItem = new Map(responses.map((response: any) => [response.requestedItemId?.toString(), response]));
    const answersByKey = this.answersByKey(request, responses);
    const supplierProfile = viewerType === OrganizationType.SUPPLIER
      ? await SupplierModel.findOne({ organizationId: request.supplierOrganizationId })
      : null;
    const historicalResponses = includeResponses && supplierProfile
      ? await QuestionResponseModel.find({
        supplierId: supplierProfile._id,
        dataRequestId: { $ne: request._id },
        status: QuestionResponseStatus.SUBMITTED,
        field: { $in: request.requestedItems.flatMap((item, index) => [
          item.key || this.createQuestionKey(item.label, index),
          item.label,
        ]) },
      }).sort({ submittedAt: -1 })
      : [];
    const historicalByField = new Map<string, any>();
    for (const historical of historicalResponses as any[]) {
      if (!historicalByField.has(historical.field)) historicalByField.set(historical.field, historical);
    }
    const requestedItems = await Promise.all(request.requestedItems.map(async (item) => {
      const response: any = responseByItem.get(item._id.toString());
      const itemWithKey = {
        ...item,
        key: item.key || this.createQuestionKey(item.label, request.requestedItems.indexOf(item)),
        category: item.category || QuestionnaireCategory.GENERAL_SUSTAINABILITY,
        order: item.order ?? request.requestedItems.indexOf(item),
        conditions: item.conditions || [],
      };
      const documentIds: string[] = response?.evidenceDocumentIds?.map((documentId: any) => documentId.toString()) || [];
      if (response?.evidenceDocumentId && !documentIds.includes(response.evidenceDocumentId.toString())) {
        documentIds.push(response.evidenceDocumentId.toString());
      }
      const documents = documentIds.length
        ? await DocumentModel.find({ _id: { $in: documentIds }, dataRequestId: request._id })
          .select('filename uploadedAt status processingError mimeType productId type')
        : [];
      const historical = !response && supplierProfile
        ? historicalByField.get(itemWithKey.key) || historicalByField.get(item.label)
        : undefined;
      const historicalDocumentIds: string[] = historical?.evidenceDocumentIds?.map((documentId: any) => documentId.toString()) || [];
      if (historical?.evidenceDocumentId && !historicalDocumentIds.includes(historical.evidenceDocumentId.toString())) {
        historicalDocumentIds.push(historical.evidenceDocumentId.toString());
      }
      const historicalDocuments = historicalDocumentIds.length
        ? await DocumentModel.find({
          _id: { $in: historicalDocumentIds },
          organizationId: request.supplierOrganizationId,
        }).select('filename dataRequestId')
        : [];
      return {
        ...((item as any).toObject?.() ?? item),
        key: itemWithKey.key,
        visible: this.isVisible(itemWithKey, answersByKey),
        completed: this.isComplete(itemWithKey, response),
        previouslySubmitted: historical ? {
          value: historical.value,
          answer: historical.answer,
          unit: historical.unit,
          evidenceDocuments: historicalDocuments.map((document: any) => ({
            _id: document._id.toString(),
            filename: document.filename,
            downloadPath: `/api/data-requests/${document.dataRequestId}/documents/${document._id}/file`,
          })),
        } : undefined,
        response: response ? {
          _id: response._id.toString(),
          value: response.value,
          answer: response.answer,
          unit: response.unit,
          status: response.status,
          submittedAt: response.submittedAt,
          evidenceDocuments: await Promise.all(documents.map(async (document: any) => {
            const [extractionQuery, evidenceLinks] = await Promise.all([
              DocumentExtractionModel.findOne({ documentId: document._id }).sort({ processedAt: -1 }),
              ClaimEvidenceLinkModel.find({ documentId: document._id }),
            ]);
            const links = evidenceLinks || [];
            const linkedClaims = viewerType === OrganizationType.SUPPLIER ? [] : await Promise.all(links.map(async (link: any) => {
              const claim = await ClaimModel.findById(link.claimId);
              if (!claim || claim.dataRequestId?.toString() !== request._id.toString()) return null;
              const runs = await VerificationRunModel.find({ claimId: claim._id }).sort({ verifiedAt: -1 });
              return {
                _id: claim._id.toString(),
                type: claim.type,
                value: claim.value,
                unit: claim.unit,
                methodology: claim.methodology,
                reportingPeriod: claim.reportingPeriod,
                boundary: claim.boundary,
                status: claim.status,
                sourceReference: claim.sourceReference,
                evidence: {
                  page: link.page,
                  section: link.section,
                  sourceText: link.sourceText,
                  relationshipType: link.relationshipType,
                },
                verification: runs?.[0] || null,
                eligibleForCarbonCalculation: claim.type === 'PCF_VALUE'
                  && typeof claim.value === 'number'
                  && Number.isFinite(claim.value)
                  && Boolean(claim.unit)
                  && [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED, ClaimStatus.PARTIALLY_SUPPORTED].includes(claim.status),
              };
            }));
            const extraction = extractionQuery || null;
            return {
              _id: document._id.toString(),
              filename: document.filename,
              documentType: document.type,
              uploadedAt: document.uploadedAt,
              downloadPath: `/api/data-requests/${request._id}/documents/${document._id}/file`,
              status: document.status,
              processingError: document.processingError,
              mimeType: document.mimeType,
              extraction: extraction ? {
                method: extraction.method,
                status: extraction.status,
                text: extraction.text,
                pages: extraction.pages,
                fields: extraction.fields,
                pageCount: extraction.pageCount,
                errorMessage: extraction.errorMessage,
              } : null,
              ...(viewerType === OrganizationType.SUPPLIER ? {} : { claims: linkedClaims.filter(Boolean) }),
            };
          })),
        } : null,
      };
    }));
    const activeItems = requestedItems.filter((item) => item.visible);
    const completeCount = activeItems.filter((item) => item.completed).length;
    const missingRequiredItems = activeItems.filter((item) => item.required && !item.completed).map((item) => ({ _id: item._id, label: item.label }));
    return {
      ...request.toObject(),
      customerOrganization: buyer ? { _id: buyer._id.toString(), name: buyer.name } : null,
      supplierOrganization: supplier ? { _id: supplier._id.toString(), name: supplier.name } : null,
      product: product ? { _id: product._id.toString(), name: product.name, productCode: product.productCode } : null,
      requestedItems,
      completion: { completed: completeCount, total: activeItems.length, missingRequiredItems },
    };
  }

  private async notifyOrganization(
    organizationId: string,
    title: string,
    message: string,
    link: string,
    type: 'INFO' | 'WARNING' | 'SUCCESS'
  ) {
    const members = await OrganizationMemberModel.find({ organizationId, status: UserStatus.ACTIVE });
    if (!members.length) return;
    try {
      await NotificationModel.insertMany(members.map((member) => ({
        userId: member.userId,
        organizationId,
        title,
        message,
        link,
        type,
        read: false,
      })));
    } catch (error) {
      logger.warn('Unable to persist data request notification', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private validationError(issues: Array<{ path: PropertyKey[]; message: string }>) {
    return new AppError('Request data is invalid', 400, 'VALIDATION_ERROR', issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })));
  }
}

export const dataRequestsService = new DataRequestsService();

export class DataRequestsController {
  async getSuppliers(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.getSuppliers(req.user!.organizationId)); }
    catch (error) { return next(error); }
  }

  async getProducts(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.getProductsForSupplier(req.params.supplierId as string, req.user!.organizationId)); }
    catch (error) { return next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.create(req.body, req.user!), 201); }
    catch (error) { return next(error); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.updateDraft(req.params.id as string, req.body, req.user!)); }
    catch (error) { return next(error); }
  }

  async send(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.send(req.params.id as string, req.user!)); }
    catch (error) { return next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.list(req.user!, req.path === '/incoming')); }
    catch (error) { return next(error); }
  }

  async summary(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.summary(req.user!)); }
    catch (error) { return next(error); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.getById(req.params.id as string, req.user!)); }
    catch (error) { return next(error); }
  }

  async saveResponse(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.saveResponse(req.params.id as string, req.params.itemId as string, req.body, req.user!)); }
    catch (error) { return next(error); }
  }

  async uploadDocument(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await dataRequestsService.uploadResponseDocument(
        req.params.id as string,
        req.params.itemId as string,
        req.file,
        req.user!
      ), 201);
    } catch (error) { return next(error); }
  }

  async reuseDocument(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await dataRequestsService.reuseExistingDocument(
        req.params.id as string,
        req.params.itemId as string,
        req.body.documentId as string,
        req.user!
      ), 201);
    } catch (error) { return next(error); }
  }

  async submit(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.submit(req.params.id as string, req.user!)); }
    catch (error) { return next(error); }
  }

  async requestClarification(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.requestClarification(req.params.id as string, req.body, req.user!)); }
    catch (error) { return next(error); }
  }

  async complete(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await dataRequestsService.complete(req.params.id as string, req.user!)); }
    catch (error) { return next(error); }
  }

  async readDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const file = await dataRequestsService.readEvidenceDocument(req.params.id as string, req.params.documentId as string, req.user!);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(file.buffer);
    } catch (error) { return next(error); }
  }
}

export const dataRequestsController = new DataRequestsController();
export const dataRequestsRoutes = Router();
dataRequestsRoutes.use(authenticate);
dataRequestsRoutes.get('/summary', (req, res, next) => dataRequestsController.summary(req, res, next));
dataRequestsRoutes.get('/incoming', requireOrganizationType(OrganizationType.SUPPLIER), (req, res, next) => dataRequestsController.list(req, res, next));
dataRequestsRoutes.get('/suppliers', requireOrganizationType(OrganizationType.CUSTOMER), (req, res, next) => dataRequestsController.getSuppliers(req, res, next));
dataRequestsRoutes.get('/suppliers/:supplierId/products', requireOrganizationType(OrganizationType.CUSTOMER), (req, res, next) => dataRequestsController.getProducts(req, res, next));
dataRequestsRoutes.get('/', (req, res, next) => dataRequestsController.list(req, res, next));
dataRequestsRoutes.post('/', requireOrganizationType(OrganizationType.CUSTOMER), (req, res, next) => dataRequestsController.create(req, res, next));
dataRequestsRoutes.get('/:id/responses', (req, res, next) => dataRequestsController.getById(req, res, next));
dataRequestsRoutes.get('/:id/documents/:documentId/file', (req, res, next) => dataRequestsController.readDocument(req, res, next));
dataRequestsRoutes.get('/:id', (req, res, next) => dataRequestsController.getById(req, res, next));
dataRequestsRoutes.patch('/:id', requireOrganizationType(OrganizationType.CUSTOMER), (req, res, next) => dataRequestsController.update(req, res, next));
dataRequestsRoutes.post('/:id/send', requireOrganizationType(OrganizationType.CUSTOMER), (req, res, next) => dataRequestsController.send(req, res, next));
dataRequestsRoutes.patch('/:id/items/:itemId', requireOrganizationType(OrganizationType.SUPPLIER), (req, res, next) => dataRequestsController.saveResponse(req, res, next));
dataRequestsRoutes.post('/:id/items/:itemId/document', requireOrganizationType(OrganizationType.SUPPLIER), uploadMiddleware, (req, res, next) => dataRequestsController.uploadDocument(req, res, next));
dataRequestsRoutes.post('/:id/items/:itemId/reuse-document', requireOrganizationType(OrganizationType.SUPPLIER), (req, res, next) => dataRequestsController.reuseDocument(req, res, next));
dataRequestsRoutes.post('/:id/submit', requireOrganizationType(OrganizationType.SUPPLIER), (req, res, next) => dataRequestsController.submit(req, res, next));
dataRequestsRoutes.post('/:id/clarification', requireOrganizationType(OrganizationType.CUSTOMER), (req, res, next) => dataRequestsController.requestClarification(req, res, next));
dataRequestsRoutes.post('/:id/complete', requireOrganizationType(OrganizationType.CUSTOMER), (req, res, next) => dataRequestsController.complete(req, res, next));