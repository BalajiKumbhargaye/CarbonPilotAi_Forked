import { Router, Request, Response, NextFunction } from 'express';
import { DocumentExtractionModel } from '../../models/DocumentExtraction';
import { DocumentModel } from '../../models/Document';
import { AppError, sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { DocumentStatus, OrganizationType } from '@carbonpilot/shared';
import { getAccessibleDocument } from '../verification/access';
import { auditService } from '../audit';
import { logger } from '../../utils/logger';
import { privateDocumentStorage } from '../../services/abstractions/IStorageService';
import { extractDocumentTextFromBuffer } from '../../services/ocr/document-extractor';

export class ExtractionService {
  async getByDocumentId(documentId: string, user: NonNullable<Request['user']>) {
    await getAccessibleDocument(documentId, user);
    return DocumentExtractionModel.findOne({ documentId }).sort({ processedAt: -1 });
  }

  private async readDocumentBuffer(document: any) {
    const storageKeyCandidates = [
      document?.storageKey,
      document?.fileUrl?.match(/\/uploads\/([^/?#]+)$/)?.[1],
      document?.fileUrl?.match(/\/documents\/([^/?#]+)(?:\/.*)?$/)?.[1],
      document?.fileUrl?.match(/\/([^/?#]+)$/)?.[1],
    ].filter((value): value is string => Boolean(value));

    for (const storageKey of storageKeyCandidates) {
      const buffer = await privateDocumentStorage.readFile(storageKey);
      if (buffer && buffer.length > 0) return buffer;
    }

    return null;
  }

  async runExtraction(documentId: string, user: NonNullable<Request['user']>) {
    let doc = await getAccessibleDocument(documentId, user);
    const previousStatus = doc.status;
    const existingExtractionQuery = DocumentExtractionModel.findOne({ documentId });
    const existingExtraction = await existingExtractionQuery.sort({ processedAt: -1 });
    if (existingExtraction?.status === 'SUCCESS' && existingExtraction.text) {
      if (doc.status !== DocumentStatus.EXTRACTED) {
        doc.status = DocumentStatus.EXTRACTED;
        doc.processingError = undefined;
        await doc.save();
      }
      return existingExtraction;
    }
    if (doc.status === DocumentStatus.PROCESSING) {
      throw new AppError('Document extraction is already in progress.', 409, 'EXTRACTION_IN_PROGRESS');
    }
    const lockQuery = DocumentModel.findOneAndUpdate(
      { _id: documentId, status: { $ne: DocumentStatus.PROCESSING } },
      { $set: { status: DocumentStatus.PROCESSING, processingError: undefined } },
      { new: true }
    );
    const lockedDocument = typeof (lockQuery as any)?.select === 'function'
      ? await lockQuery.select('+storageKey')
      : await lockQuery;
    if (!lockedDocument) {
      throw new AppError('Document extraction is already in progress.', 409, 'EXTRACTION_IN_PROGRESS');
    }
    doc = lockedDocument;
    const sourceDocument = lockedDocument;
    try {
      await auditService.logAction({
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'EXTRACTION_STARTED',
        entityType: 'Document',
        entityId: doc._id.toString(),
        oldValue: { status: previousStatus },
        newValue: { status: DocumentStatus.PROCESSING },
      });
    } catch (auditError) {
      logger.error('Failed to record extraction start audit event', { error: String(auditError) });
    }

    let extractionRecordPersisted = false;
    try {
      const buffer = await this.readDocumentBuffer(sourceDocument);
      if (!buffer || buffer.length === 0) {
        throw new AppError('No readable document content was found on disk.', 422, 'EXTRACTION_FAILED');
      }

      const extractionPayload = await extractDocumentTextFromBuffer(
        sourceDocument.filename,
        buffer,
        sourceDocument.mimeType || 'application/octet-stream',
        { language: process.env.OCR_LANGUAGE || 'eng' }
      );

      const extractionRecord = await DocumentExtractionModel.create({
        documentId: documentId,
        extractionVersion: '1.0',
        method: extractionPayload.method,
        status: extractionPayload.text ? 'SUCCESS' : 'FAILED',
        language: extractionPayload.language,
        errorMessage: extractionPayload.errorMessage,
        text: extractionPayload.text,
        pages: extractionPayload.pages,
        pageCount: extractionPayload.pages.length,
        fields: extractionPayload.fields,
        processedAt: new Date(),
      });
      extractionRecordPersisted = true;

      if (!extractionPayload.text || !extractionPayload.fields.length) {
        doc.status = DocumentStatus.FAILED;
        doc.processingError = extractionPayload.errorMessage || 'No usable text was extracted from the document.';
        await doc.save();
        await auditService.logAction({
          organizationId: user.organizationId,
          userId: user.userId,
          action: 'EXTRACTION_FAILED',
          entityType: 'Document',
          entityId: doc._id.toString(),
          oldValue: { status: DocumentStatus.PROCESSING },
          newValue: { status: DocumentStatus.FAILED, reason: doc.processingError },
        });
        throw new AppError(doc.processingError, 422, 'EXTRACTION_FAILED');
      }

      doc.status = DocumentStatus.EXTRACTED;
      doc.processingError = undefined;
      await doc.save();
      await auditService.logAction({
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'EXTRACTION_COMPLETED',
        entityType: 'Document',
        entityId: doc._id.toString(),
        oldValue: { status: DocumentStatus.PROCESSING },
        newValue: { status: DocumentStatus.EXTRACTED, extractionMethod: extractionPayload.method, pageCount: extractionPayload.pages.length },
      });

      return extractionRecord;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document extraction failed.';
      doc.status = DocumentStatus.FAILED;
      doc.processingError = message;
      await doc.save();
      if (!extractionRecordPersisted) {
        try {
          await DocumentExtractionModel.create({
            documentId,
            extractionVersion: '1.0',
            method: 'NATIVE_TEXT_AND_OCR',
            status: 'FAILED',
            errorMessage: message,
            text: '',
            pages: [],
            pageCount: 0,
            fields: [],
            processedAt: new Date(),
          });
        } catch (persistError) {
          logger.error('Failed to persist document extraction failure', {
            documentId,
            error: persistError instanceof Error ? persistError.message : String(persistError),
          });
        }
      }
      try {
        await auditService.logAction({
          organizationId: user.organizationId,
          userId: user.userId,
          action: 'EXTRACTION_FAILED',
          entityType: 'Document',
          entityId: doc._id.toString(),
          oldValue: { status: DocumentStatus.PROCESSING },
          newValue: { status: DocumentStatus.FAILED, reason: message },
        });
      } catch (auditError) {
        logger.error('Failed to record extraction failure audit event', { error: String(auditError) });
      }
      if (error instanceof AppError) throw error;
      throw new AppError(message, 422, 'EXTRACTION_FAILED');
    }
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
      if (req.user!.organizationType === OrganizationType.SUPPLIER && extraction.status === 'SUCCESS') {
        const { dataRequestsService } = await import('../data-requests');
        await dataRequestsService.reprocessDocument(req.params.documentId as string, req.user!);
      }
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
