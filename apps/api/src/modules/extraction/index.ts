import { Router, Request, Response, NextFunction } from 'express';
import { DocumentExtractionModel } from '../../models/DocumentExtraction';
import { DocumentModel } from '../../models/Document';
import { AppError, sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { DocumentStatus } from '@carbonpilot/shared';
import { getAccessibleDocument } from '../verification/access';
import { auditService } from '../audit';
import { logger } from '../../utils/logger';

export class ExtractionService {
  async getByDocumentId(documentId: string, user: NonNullable<Request['user']>) {
    await getAccessibleDocument(documentId, user);
    return DocumentExtractionModel.findOne({ documentId });
  }

  async runExtraction(documentId: string, user: NonNullable<Request['user']>) {
    const doc = await getAccessibleDocument(documentId, user);

    doc.status = DocumentStatus.PROCESSING;
    await doc.save();
    try {
      await auditService.logAction({
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'EXTRACTION_STARTED',
        entityType: 'Document',
        entityId: doc._id.toString(),
        oldValue: { status: DocumentStatus.UPLOADED },
        newValue: { status: DocumentStatus.PROCESSING },
      });
    } catch (auditError) {
      logger.error('Failed to record extraction start audit event', { error: String(auditError) });
    }

    const reason = 'Document extraction is unavailable because no document text or OCR provider is configured.';
    doc.status = DocumentStatus.FAILED;
    doc.processingError = reason;
    await doc.save();
    try {
      await auditService.logAction({
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'EXTRACTION_FAILED',
        entityType: 'Document',
        entityId: doc._id.toString(),
        oldValue: { status: DocumentStatus.PROCESSING },
        newValue: { status: DocumentStatus.FAILED, reason },
      });
    } catch (auditError) {
      logger.error('Failed to record extraction failure audit event', { error: String(auditError) });
    }
    throw new AppError(reason, 503, 'EXTRACTION_UNAVAILABLE');
  }
}

export const extractionService = new ExtractionService();

export class ExtractionController {
  async getByDocumentId(req: Request, res: Response, next: NextFunction) {
    try {
      const extraction = await extractionService.getByDocumentId(req.params.documentId as string, req.user!);
      return sendSuccess(res, extraction);
    } catch (error) {
      next(error);
    }
  }

  async triggerExtraction(req: Request, res: Response, next: NextFunction) {
    try {
      const extraction = await extractionService.runExtraction(req.params.documentId as string, req.user!);
      return sendSuccess(res, extraction, 201);
    } catch (error) {
      next(error);
    }
  }
}

export const extractionController = new ExtractionController();

export const extractionRoutes = Router();
extractionRoutes.use(authenticate);
extractionRoutes.get('/:documentId', (req, res, next) =>
  extractionController.getByDocumentId(req, res, next)
);
extractionRoutes.post('/:documentId/run', (req, res, next) =>
  extractionController.triggerExtraction(req, res, next)
);
