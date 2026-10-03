import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import path from 'path';
import {
  DocumentStatus,
  DocumentType,
  ExtractionStatus,
  OrganizationType,
  ProductStatus,
  PurchaseStatus,
  SupplierStatus,
  IProcurementReviewData,
} from '@carbonpilot/shared';
import { procurementDocumentReviewSchema } from '@carbonpilot/validation';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { DocumentModel, IDocumentModel } from '../../models/Document';
import { InvoiceModel } from '../../models/Invoice';
import { OrganizationModel } from '../../models/Organization';
import { ProductModel } from '../../models/Product';
import { PurchaseModel } from '../../models/Purchase';
import { PurchaseOrderModel } from '../../models/PurchaseOrder';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { isSupportedProcurementFile, privateDocumentStorage } from '../../services/abstractions/IStorageService';
import { purchasesService } from '../procurement/purchases.service';
import { AppError, sendError, sendSuccess } from '../../utils/response';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const EXTRACTION_UNAVAILABLE_REASON = 'Document extraction service unavailable';
const privateStorage = privateDocumentStorage;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const uploadMiddleware: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      sendError(res, status, error.code, error.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 25 MB limit' : error.message);
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
};

type UploadFile = Express.Multer.File;
type ProcurementDocumentType = DocumentType.INVOICE | DocumentType.PURCHASE_ORDER;

export class ProcurementDocumentsService {
  async getSuppliers(customerOrganizationId: string) {
    const relationships = await SupplierRelationshipModel.find({
      customerOrganizationId,
      status: SupplierStatus.ACTIVE,
    });
    if (!relationships.length) return [];

    const organizationIds = relationships.map((relationship) => relationship.supplierOrganizationId);
    const [organizations, suppliers] = await Promise.all([
      OrganizationModel.find({ _id: { $in: organizationIds }, type: OrganizationType.SUPPLIER }),
      SupplierModel.find({ organizationId: { $in: organizationIds } }),
    ]);
    const names = new Map(organizations.map((organization) => [organization._id.toString(), organization.name]));
    return suppliers.flatMap((supplier) => {
      const name = names.get(supplier.organizationId.toString());
      return name ? [{ _id: supplier._id.toString(), organizationId: supplier.organizationId.toString(), name }] : [];
    });
  }

  async list(customerOrganizationId: string) {
    const documents = await DocumentModel.find({
      organizationId: customerOrganizationId,
      type: { $in: [DocumentType.INVOICE, DocumentType.PURCHASE_ORDER] },
    }).sort({ uploadedAt: -1 });
    return Promise.all(documents.map((document) => this.toResponse(document)));
  }

  async getById(id: string, customerOrganizationId: string) {
    const document = await this.findDocument(id, customerOrganizationId);
    return this.toResponse(document);
  }

  async uploadDocument(params: {
    file: UploadFile;
    customerOrganizationId: string;
    userId: string;
    supplierId: string;
    type: ProcurementDocumentType;
  }) {
    this.validateFile(params.file);
    const { supplier } = await this.getConnectedSupplier(params.supplierId, params.customerOrganizationId);
    const stored = await privateStorage.uploadFile({
      originalname: params.file.originalname,
      buffer: params.file.buffer,
      mimetype: params.file.mimetype,
      size: params.file.size,
    });

    try {
      const document = await DocumentModel.create({
        organizationId: params.customerOrganizationId,
        supplierId: supplier._id,
        uploadedBy: params.userId,
        type: params.type,
        filename: path.basename(params.file.originalname),
        fileUrl: 'private://procurement-document',
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        fileSize: stored.fileSize,
        status: DocumentStatus.UPLOADED,
      });
      document.fileUrl = `/api/procurement-documents/${document._id}/file`;
      await document.save();
      return this.toResponse(document);
    } catch (error) {
      await privateStorage.deleteFile(stored.storageKey).catch(() => false);
      throw error;
    }
  }

  async process(id: string, customerOrganizationId: string) {
    const document = await this.findDocument(id, customerOrganizationId);
    if (document.status === DocumentStatus.IMPORTED) {
      throw new AppError('Imported documents cannot be processed again', 409, 'DOCUMENT_IMPORTED');
    }

    document.status = DocumentStatus.PROCESSING;
    document.processingError = undefined;
    await document.save();

    // The configured provider is MOCK and this repository has no PDF/image text extractor.
    document.status = DocumentStatus.FAILED;
    document.processingError = EXTRACTION_UNAVAILABLE_REASON;
    await document.save();
    return this.toResponse(document);
  }

  async saveReview(
    id: string,
    customerOrganizationId: string,
    userId: string,
    input: IProcurementReviewData
  ) {
    const document = await this.findDocument(id, customerOrganizationId);
    if (document.status === DocumentStatus.IMPORTED) {
      throw new AppError('Imported documents cannot be edited', 409, 'DOCUMENT_IMPORTED');
    }
    const parsed = procurementDocumentReviewSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError('Review data is invalid', 400, 'INVALID_REVIEW', parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })));
    }
    if (!mongoose.isValidObjectId(parsed.data.supplierId) || !mongoose.isValidObjectId(parsed.data.productId)) {
      throw new AppError('Choose a valid supplier and product', 400, 'INVALID_MATCH');
    }
    const { supplier } = await this.getConnectedSupplier(parsed.data.supplierId, customerOrganizationId);
    const product = await ProductModel.findById(parsed.data.productId);
    if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
    if (product.supplierId.toString() !== supplier._id.toString()) {
      throw new AppError('Product does not belong to the selected supplier', 400, 'PRODUCT_SUPPLIER_MISMATCH');
    }
    if (product.status !== ProductStatus.ACTIVE) {
      throw new AppError('Inactive products cannot be purchased', 400, 'INACTIVE_PRODUCT');
    }
    if (parsed.data.unit.trim() !== product.unit) {
      throw new AppError(`Purchase unit must match the product unit (${product.unit})`, 400, 'UNIT_MISMATCH');
    }
    if (!Number.isFinite(new Date(parsed.data.documentDate).getTime())) {
      throw new AppError('Enter a valid document date', 400, 'INVALID_REVIEW');
    }

    document.reviewData = {
      ...parsed.data,
      source: 'MANUAL',
    };
    document.status = DocumentStatus.NEEDS_REVIEW;
    document.reviewedBy = undefined;
    document.reviewedAt = undefined;
    await document.save();
    return this.toResponse(document);
  }

  async importDocument(id: string, customerOrganizationId: string, userId: string) {
    const document = await this.findDocument(id, customerOrganizationId);
    if (document.status === DocumentStatus.IMPORTED) {
      throw new AppError('This document has already been imported', 409, 'DOCUMENT_IMPORTED');
    }
    if (document.status !== DocumentStatus.NEEDS_REVIEW || !document.reviewData) {
      throw new AppError('Save and review the procurement data before importing', 400, 'REVIEW_REQUIRED');
    }

    const data = document.reviewData;
    const { supplier, organization } = await this.getConnectedSupplier(data.supplierId, customerOrganizationId);
    const product = await ProductModel.findOne({ _id: data.productId, supplierId: supplier._id, status: ProductStatus.ACTIVE });
    if (!product) throw new AppError('The selected product is unavailable for this supplier', 400, 'INVALID_PRODUCT');

    if (document.type === DocumentType.PURCHASE_ORDER) {
      const duplicate = await PurchaseOrderModel.findOne({
        customerOrganizationId,
        supplierOrganizationId: organization._id,
        orderNumber: this.exactInsensitive(data.documentNumber),
      });
      if (duplicate) throw new AppError('A purchase order with this number already exists', 409, 'POSSIBLE_DUPLICATE');

      let purchaseOrder;
      try {
        purchaseOrder = await PurchaseOrderModel.create({
          customerOrganizationId,
          supplierOrganizationId: organization._id,
          orderNumber: data.documentNumber,
          orderDate: new Date(data.documentDate),
          expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : undefined,
          currency: data.currency,
          totalAmount: Number(data.totalAmount),
          items: [{
            description: product.name,
            quantity: Number(data.quantity),
            unit: data.unit,
            unitPrice: Number(data.unitPrice),
            totalPrice: Number(data.totalAmount),
            productId: product._id,
          }],
          documentId: document._id,
          status: 'ISSUED',
        });
      } catch (error) {
        if (this.isDuplicateKey(error)) {
          throw new AppError('A purchase order with this number already exists', 409, 'POSSIBLE_DUPLICATE');
        }
        throw error;
      }

      try {
        document.purchaseOrderId = purchaseOrder._id.toString();
        document.status = DocumentStatus.IMPORTED;
        document.reviewedBy = userId;
        document.reviewedAt = new Date();
        await document.save();
      } catch (error) {
        await PurchaseOrderModel.deleteOne({ _id: purchaseOrder._id });
        throw error;
      }
      return { document: await this.toResponse(document), purchaseOrder, purchase: null, warning: null };
    }

    const duplicateInvoice = await InvoiceModel.findOne({
      customerOrganizationId,
      supplierOrganizationId: organization._id,
      invoiceNumber: this.exactInsensitive(data.documentNumber),
    });
    const duplicatePurchase = await PurchaseModel.findOne({
      customerOrganizationId,
      referenceNumber: this.exactInsensitive(data.documentNumber),
    });
    if (duplicateInvoice || duplicatePurchase) {
      throw new AppError('This invoice may already have been imported. Check the existing purchase record before continuing.', 409, 'POSSIBLE_DUPLICATE');
    }

    let linkedPurchaseOrder: InstanceType<typeof PurchaseOrderModel> | null = null;
    let warning: string | null = null;
    if (data.purchaseOrderNumber?.trim()) {
      linkedPurchaseOrder = await PurchaseOrderModel.findOne({
        customerOrganizationId,
        supplierOrganizationId: organization._id,
        orderNumber: this.exactInsensitive(data.purchaseOrderNumber),
      });
      if (!linkedPurchaseOrder) warning = 'PO reference found, but matching PO was not found.';
    }

    let invoice;
    try {
      invoice = await InvoiceModel.create({
        customerOrganizationId,
        supplierOrganizationId: organization._id,
        invoiceNumber: data.documentNumber,
        invoiceDate: new Date(data.documentDate),
        currency: data.currency,
        totalAmount: Number(data.totalAmount),
        items: [{
          description: product.name,
          quantity: Number(data.quantity),
          unit: data.unit,
          unitPrice: Number(data.unitPrice),
          totalPrice: Number(data.totalAmount),
          productId: product._id,
        }],
        documentId: document._id,
        purchaseOrderId: linkedPurchaseOrder?._id,
        extractionStatus: ExtractionStatus.FAILED,
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new AppError('This invoice may already have been imported', 409, 'POSSIBLE_DUPLICATE');
      }
      throw error;
    }

    let purchase: Awaited<ReturnType<typeof purchasesService.create>> | undefined;
    try {
      purchase = await purchasesService.create({
        supplierId: supplier._id.toString(),
        productId: product._id.toString(),
        quantity: data.quantity,
        unit: data.unit,
        unitPrice: data.unitPrice,
        totalAmount: data.totalAmount,
        currency: data.currency,
        purchaseDate: data.documentDate,
        referenceNumber: data.documentNumber,
        purchaseOrderId: linkedPurchaseOrder?._id.toString(),
        invoiceId: invoice._id.toString(),
        status: PurchaseStatus.CONFIRMED,
      }, customerOrganizationId);
      document.invoiceId = invoice._id.toString();
      document.purchaseId = purchase._id.toString();
      document.purchaseOrderId = linkedPurchaseOrder?._id.toString();
      document.status = DocumentStatus.IMPORTED;
      document.reviewedBy = userId;
      document.reviewedAt = new Date();
      await document.save();
    } catch (error) {
      if (purchase?._id) {
        await PurchaseModel.deleteOne({ _id: purchase._id }).catch(() => undefined);
      }
      await InvoiceModel.deleteOne({ _id: invoice._id }).catch(() => undefined);
      if (this.isDuplicateKey(error) || (error instanceof AppError && error.code === 'PURCHASE_EXISTS')) {
        throw new AppError('This invoice may already have been imported', 409, 'POSSIBLE_DUPLICATE');
      }
      throw error;
    }

    return { document: await this.toResponse(document), purchaseOrder: linkedPurchaseOrder, purchase, warning };
  }

  async readFile(id: string, customerOrganizationId: string) {
    const document = await DocumentModel.findOne({ _id: id, organizationId: customerOrganizationId }).select('+storageKey');
    if (!document?.storageKey) throw new AppError('Document file not found', 404, 'NOT_FOUND');
    const buffer = await privateStorage.readFile(document.storageKey);
    if (!buffer) throw new AppError('Document file not found', 404, 'NOT_FOUND');
    return { buffer, filename: document.filename, mimeType: document.mimeType };
  }

  private async getConnectedSupplier(supplierId: string, customerOrganizationId: string) {
    if (!mongoose.isValidObjectId(supplierId)) throw new AppError('Choose a valid supplier', 400, 'INVALID_SUPPLIER');
    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId,
      supplierOrganizationId: supplier.organizationId,
      status: SupplierStatus.ACTIVE,
    });
    if (!relationship) throw new AppError('Supplier is not actively connected to your organization', 403, 'FORBIDDEN');
    const organization = await OrganizationModel.findOne({ _id: supplier.organizationId, type: OrganizationType.SUPPLIER });
    if (!organization) throw new AppError('Supplier organization not found', 404, 'NOT_FOUND');
    return { supplier, organization };
  }

  private async findDocument(id: string, customerOrganizationId: string) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Document not found', 404, 'NOT_FOUND');
    const document = await DocumentModel.findOne({ _id: id, organizationId: customerOrganizationId });
    if (!document) throw new AppError('Document not found', 404, 'NOT_FOUND');
    return document;
  }

  private validateFile(file: UploadFile) {
    if (!file || file.size < 1) throw new AppError('Choose a non-empty file', 400, 'INVALID_FILE');
    if (file.size > MAX_FILE_SIZE) throw new AppError('File exceeds the 25 MB limit', 413, 'FILE_TOO_LARGE');
    if (!isSupportedProcurementFile(file)) {
      throw new AppError('Only valid PDF, PNG, and JPG/JPEG files are supported', 415, 'UNSUPPORTED_FILE_TYPE');
    }
  }

  private async toResponse(document: IDocumentModel) {
    const supplier = document.supplierId ? await SupplierModel.findById(document.supplierId) : null;
    const organization = supplier ? await OrganizationModel.findById(supplier.organizationId) : null;
    const result = document.toObject() as Record<string, any>;
    delete result.storageKey;
    delete result.fileUrl;
    return {
      ...result,
      supplier: supplier ? { _id: supplier._id.toString(), name: organization?.name || 'Supplier' } : null,
      downloadPath: `/api/procurement-documents/${document._id}/file`,
    };
  }

  private exactInsensitive(value: string) {
    return { $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  }

  private isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}

export const procurementDocumentsService = new ProcurementDocumentsService();

export class ProcurementDocumentsController {
  async getSuppliers(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await procurementDocumentsService.getSuppliers(req.user!.organizationId)); }
    catch (error) { return next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await procurementDocumentsService.list(req.user!.organizationId)); }
    catch (error) { return next(error); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await procurementDocumentsService.getById(req.params.id as string, req.user!.organizationId)); }
    catch (error) { return next(error); }
  }

  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) return sendError(res, 400, 'NO_FILE', 'Choose a document to upload');
      if (![DocumentType.INVOICE, DocumentType.PURCHASE_ORDER].includes(req.body.type)) {
        return sendError(res, 400, 'INVALID_DOCUMENT_TYPE', 'Choose an invoice or purchase order');
      }
      if (typeof req.body.supplierId !== 'string') {
        return sendError(res, 400, 'INVALID_SUPPLIER', 'Choose a connected supplier');
      }
      const document = await procurementDocumentsService.uploadDocument({
        file: req.file,
        customerOrganizationId: req.user!.organizationId,
        userId: req.user!.userId,
        supplierId: req.body.supplierId,
        type: req.body.type,
      });
      return sendSuccess(res, document, 201);
    } catch (error) { return next(error); }
  }

  async process(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await procurementDocumentsService.process(req.params.id as string, req.user!.organizationId)); }
    catch (error) { return next(error); }
  }

  async review(req: Request, res: Response, next: NextFunction) {
    try {
      const document = await procurementDocumentsService.saveReview(
        req.params.id as string,
        req.user!.organizationId,
        req.user!.userId,
        req.body as IProcurementReviewData
      );
      return sendSuccess(res, document);
    } catch (error) { return next(error); }
  }

  async import(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDocumentsService.importDocument(
        req.params.id as string,
        req.user!.organizationId,
        req.user!.userId
      ), 201);
    } catch (error) { return next(error); }
  }

  async getFile(req: Request, res: Response, next: NextFunction) {
    try {
      const file = await procurementDocumentsService.readFile(req.params.id as string, req.user!.organizationId);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(file.buffer);
    } catch (error) { return next(error); }
  }
}

export const procurementDocumentsController = new ProcurementDocumentsController();
export const procurementDocumentsRoutes = Router();
procurementDocumentsRoutes.use(authenticate, requireOrganizationType(OrganizationType.CUSTOMER));
procurementDocumentsRoutes.get('/suppliers', (req, res, next) => procurementDocumentsController.getSuppliers(req, res, next));
procurementDocumentsRoutes.get('/', (req, res, next) => procurementDocumentsController.list(req, res, next));
procurementDocumentsRoutes.post('/upload', uploadMiddleware, (req, res, next) => procurementDocumentsController.upload(req, res, next));
procurementDocumentsRoutes.get('/:id/file', (req, res, next) => procurementDocumentsController.getFile(req, res, next));
procurementDocumentsRoutes.get('/:id', (req, res, next) => procurementDocumentsController.getById(req, res, next));
procurementDocumentsRoutes.post('/:id/process', (req, res, next) => procurementDocumentsController.process(req, res, next));
procurementDocumentsRoutes.post('/:id/retry', (req, res, next) => procurementDocumentsController.process(req, res, next));
procurementDocumentsRoutes.patch('/:id/review', (req, res, next) => procurementDocumentsController.review(req, res, next));
procurementDocumentsRoutes.post('/:id/import', (req, res, next) => procurementDocumentsController.import(req, res, next));