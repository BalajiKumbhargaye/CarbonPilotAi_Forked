import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { DocumentModel, IDocumentModel } from '../../models/Document';
import { AppError, sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { isSupportedProcurementFile, LocalStorageService, privateDocumentStorage } from '../../services/abstractions/IStorageService';
import { DocumentType, DocumentStatus, DocumentClassificationSource, OrganizationType, SupplierStatus } from '@carbonpilot/shared';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { DataRequestModel } from '../../models/DataRequest';
import {
  assertSupplierDocumentAccess,
  getAccessibleDocument,
  getAccessibleDocumentSupplierIds,
} from '../verification/access';
import { auditService } from '../audit';
import { correctDocumentClassificationSchema } from '@carbonpilot/validation';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});
const legacyStorage = new LocalStorageService();

export class DocumentService {
  async getDocuments(user: NonNullable<Request['user']>, supplierId?: string) {
    let filter: Record<string, unknown>;
    if (user.organizationType === OrganizationType.SUPPLIER) {
      const accessibleSupplierIds = await getAccessibleDocumentSupplierIds(user);
      filter = {
        $or: [
          { organizationId: user.organizationId },
          { supplierId: { $in: accessibleSupplierIds } },
        ],
      };
    } else {
      const [relationships, requests] = await Promise.all([
        SupplierRelationshipModel.find({
          customerOrganizationId: user.organizationId,
          status: SupplierStatus.ACTIVE,
          'sharedDataPermissions.documents': true,
        }),
        DataRequestModel.find({ customerOrganizationId: user.organizationId }),
      ]);
      const sharedSupplierOrganizationIds = relationships.map((relationship) =>
        relationship.supplierOrganizationId.toString()
      );
      const requestedSupplierOrganizationIds = requests.map((request) =>
        request.supplierOrganizationId.toString()
      );
      const supplierOrganizationIds = [...new Set([
        ...sharedSupplierOrganizationIds,
        ...requestedSupplierOrganizationIds,
      ])];
      const suppliers = supplierOrganizationIds.length
        ? await SupplierModel.find({ organizationId: { $in: supplierOrganizationIds } })
        : [];
      const supplierIdsByOrganization = new Map(
        suppliers.map((supplier) => [supplier.organizationId.toString(), supplier._id.toString()])
      );
      const sharedSupplierIds = sharedSupplierOrganizationIds
        .map((organizationId) => supplierIdsByOrganization.get(organizationId))
        .filter((id): id is string => !!id);
      const requestedSupplierIds = requestedSupplierOrganizationIds
        .map((organizationId) => supplierIdsByOrganization.get(organizationId))
        .filter((id): id is string => !!id);
      const requestIds = requests.map((request) => request._id);
      const visibleDocuments: Record<string, unknown>[] = [
        { organizationId: user.organizationId },
      ];
      if (sharedSupplierIds.length) {
        visibleDocuments.push({
          supplierId: { $in: sharedSupplierIds },
          $or: [{ dataRequestId: { $exists: false } }, { dataRequestId: null }],
        });
      }
      if (requestIds.length && requestedSupplierIds.length) {
        visibleDocuments.push({
          supplierId: { $in: requestedSupplierIds },
          dataRequestId: { $in: requestIds },
        });
      }
      filter = { $or: visibleDocuments };
    }
    if (supplierId) filter.supplierId = supplierId;
    return DocumentModel.find(filter).sort({ uploadedAt: -1 });
  }

  async getById(id: string, user: NonNullable<Request['user']>) {
    return getAccessibleDocument(id, user);
  }

  async getFile(id: string, user: NonNullable<Request['user']>) {
    await getAccessibleDocument(id, user);
    const document = await DocumentModel.findById(id).select('+storageKey');
    if (!document) throw new AppError('Document not found', 404, 'NOT_FOUND');
    const legacyKey = document?.fileUrl.match(/\/uploads\/([^/?#]+)$/)?.[1];
    const buffer = document?.storageKey
      ? await privateDocumentStorage.readFile(document.storageKey)
      : legacyKey
        ? await legacyStorage.readFile(legacyKey)
        : null;
    if (!buffer) throw new AppError('Document file not found', 404, 'NOT_FOUND');
    return { document, buffer };
  }

  async uploadDocument(params: {
    file: Express.Multer.File;
    user: NonNullable<Request['user']>;
    supplierId?: string;
    type: DocumentType;
    reportingPeriod?: string;
  }) {
    if (!isSupportedProcurementFile(params.file)) {
      throw new AppError('Only valid PDF, PNG, JPG/JPEG, and WEBP files are supported', 415, 'UNSUPPORTED_FILE_TYPE');
    }

    let supplierId = params.supplierId;
    if (params.user.organizationType === OrganizationType.SUPPLIER) {
      const supplier = await SupplierModel.findOne({ organizationId: params.user.organizationId });
      if (!supplier || (supplierId && supplierId !== supplier._id.toString())) {
        throw new AppError('Supplier document ownership could not be confirmed', 404, 'NOT_FOUND');
      }
      supplierId = supplier._id.toString();
    } else if (supplierId) {
      await assertSupplierDocumentAccess(supplierId, params.user);
    }

    const uploaded = await privateDocumentStorage.uploadFile({
      originalname: params.file.originalname,
      buffer: params.file.buffer,
      mimetype: params.file.mimetype,
      size: params.file.size,
    });

    let document: IDocumentModel;
    try {
      document = await DocumentModel.create({
        organizationId: params.user.organizationId,
        supplierId,
        uploadedBy: params.user.userId,
        type: params.type,
        classificationSource: DocumentClassificationSource.SUPPLIER_DECLARED,
        filename: params.file.originalname.replace(/[\\/]/g, '_'),
        fileUrl: 'private://document',
        storageKey: uploaded.storageKey,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
        reportingPeriod: params.reportingPeriod,
        status: DocumentStatus.UPLOADED,
      });
      document.fileUrl = `/api/documents/${document._id}/file`;
      await document.save();
    } catch (error) {
      await privateDocumentStorage.deleteFile(uploaded.storageKey).catch(() => false);
      throw error;
    }
    await auditService.logAction({
      organizationId: params.user.organizationId,
      userId: params.user.userId,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'Document',
      entityId: document._id.toString(),
      newValue: { supplierId, type: params.type, filename: document.filename },
    });
    return document;
  }

  async correctClassification(id: string, data: unknown, user: NonNullable<Request['user']>) {
    const document = await getAccessibleDocument(id, user);
    const parsed = correctDocumentClassificationSchema.safeParse(data);
    if (!parsed.success) throw new AppError('Document classification is invalid', 400, 'VALIDATION_ERROR');
    const previousType = document.type;
    document.type = parsed.data.type;
    document.classificationSource = DocumentClassificationSource.MANUAL;
    document.classifiedBy = user.userId;
    document.classifiedAt = new Date();
    document.classificationConfidence = undefined;
    await document.save();
    await auditService.logAction({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'DOCUMENT_CLASSIFIED',
      entityType: 'Document',
      entityId: document._id.toString(),
      oldValue: { type: previousType },
      newValue: { type: document.type, source: DocumentClassificationSource.MANUAL },
    });
    return document;
  }
}

export const documentService = new DocumentService();

export class DocumentController {
  async correctClassification(req: Request, res: Response, next: NextFunction) {
    try {
      const document = await documentService.correctClassification(req.params.id as string, req.body, req.user!);
      return sendSuccess(res, document);
    } catch (error) {
      next(error);
    }
  }

  async getDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const docs = await documentService.getDocuments(req.user!, req.query.supplierId as string);
      return sendSuccess(res, docs);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await documentService.getById(req.params.id as string, req.user!);
      return sendSuccess(res, doc);
    } catch (error) {
      next(error);
    }
  }

  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return sendError(res, 400, 'NO_FILE', 'File must be provided');
      }

      const type = (req.body.type as DocumentType) || DocumentType.OTHER;
      if (!Object.values(DocumentType).includes(type)) {
        return sendError(res, 400, 'INVALID_DOCUMENT_TYPE', 'Choose a supported document type');
      }
      const doc = await documentService.uploadDocument({
        file: req.file,
        user: req.user!,
        supplierId: req.body.supplierId,
        type,
        reportingPeriod: req.body.reportingPeriod,
      });

      return sendSuccess(res, doc, 201);
    } catch (error) {
      next(error);
    }
  }

  async getFile(req: Request, res: Response, next: NextFunction) {
    try {
      const { document, buffer } = await documentService.getFile(req.params.id as string, req.user!);
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${document.filename.replace(/["\\\r\n]/g, '_')}"`);
      return res.status(200).send(buffer);
    } catch (error) {
      next(error);
    }
  }
}

export const documentController = new DocumentController();

export const documentRoutes = Router();
documentRoutes.use(authenticate);
documentRoutes.get('/', (req, res, next) => documentController.getDocuments(req, res, next));
documentRoutes.get('/:id/file', (req, res, next) => documentController.getFile(req, res, next));
documentRoutes.patch('/:id/classification', (req, res, next) => documentController.correctClassification(req, res, next));
documentRoutes.get('/:id', (req, res, next) => documentController.getById(req, res, next));
documentRoutes.post('/upload', upload.single('file'), (req, res, next) =>
  documentController.upload(req, res, next)
);
