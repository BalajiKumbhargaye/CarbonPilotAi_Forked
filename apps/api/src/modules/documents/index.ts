import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { DocumentModel } from '../../models/Document';
import { sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { LocalStorageService } from '../../services/abstractions/IStorageService';
import { DocumentType, DocumentStatus } from '@carbonpilot/shared';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

const storageService = new LocalStorageService();

export class DocumentService {
  async getDocuments(orgId?: string, supplierId?: string) {
    const filter: Record<string, unknown> = {};
    if (orgId) filter.organizationId = orgId;
    if (supplierId) filter.supplierId = supplierId;
    return DocumentModel.find(filter).sort({ uploadedAt: -1 });
  }

  async getById(id: string) {
    return DocumentModel.findById(id);
  }

  async uploadDocument(params: {
    file: Express.Multer.File;
    organizationId: string;
    supplierId?: string;
    uploadedBy: string;
    type: DocumentType;
    reportingPeriod?: string;
  }) {
    const uploaded = await storageService.uploadFile({
      originalname: params.file.originalname,
      buffer: params.file.buffer,
      mimetype: params.file.mimetype,
      size: params.file.size,
    });

    return DocumentModel.create({
      organizationId: params.organizationId,
      supplierId: params.supplierId,
      uploadedBy: params.uploadedBy,
      type: params.type,
      filename: params.file.originalname,
      fileUrl: uploaded.fileUrl,
      mimeType: uploaded.mimeType,
      fileSize: uploaded.fileSize,
      reportingPeriod: params.reportingPeriod,
      status: DocumentStatus.UPLOADED,
    });
  }
}

export const documentService = new DocumentService();

export class DocumentController {
  async getDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const docs = await documentService.getDocuments(
        req.user?.organizationId,
        req.query.supplierId as string
      );
      return sendSuccess(res, docs);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await documentService.getById(req.params.id as string);
      if (!doc) {
        return sendError(res, 404, 'NOT_FOUND', 'Document not found');
      }
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

      const doc = await documentService.uploadDocument({
        file: req.file,
        organizationId: req.user!.organizationId,
        supplierId: req.body.supplierId,
        uploadedBy: req.user!.userId,
        type: (req.body.type as DocumentType) || DocumentType.OTHER,
        reportingPeriod: req.body.reportingPeriod,
      });

      return sendSuccess(res, doc, 201);
    } catch (error) {
      next(error);
    }
  }
}

export const documentController = new DocumentController();

export const documentRoutes = Router();
documentRoutes.use(authenticate);
documentRoutes.get('/', (req, res, next) => documentController.getDocuments(req, res, next));
documentRoutes.get('/:id', (req, res, next) => documentController.getById(req, res, next));
documentRoutes.post('/upload', upload.single('file'), (req, res, next) =>
  documentController.upload(req, res, next)
);
