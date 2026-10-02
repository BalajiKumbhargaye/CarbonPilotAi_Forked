import { Router, Request, Response, NextFunction } from 'express';
import { DocumentExtractionModel } from '../../models/DocumentExtraction';
import { DocumentModel } from '../../models/Document';
import { sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { defaultAIOrchestrator } from '../../services/ai/AIOrchestrator';
import { DocumentStatus } from '@carbonpilot/shared';

export class ExtractionService {
  async getByDocumentId(documentId: string) {
    return DocumentExtractionModel.findOne({ documentId });
  }

  async runExtraction(documentId: string) {
    const doc = await DocumentModel.findById(documentId);
    if (!doc) {
      throw new Error('Document not found');
    }

    doc.status = DocumentStatus.PROCESSING;
    await doc.save();

    // Call Document AI Subsystem
    const aiResult = await defaultAIOrchestrator.documentAI.extract(doc.filename, doc.type);

    const extraction = await DocumentExtractionModel.create({
      documentId: doc._id,
      extractionVersion: '1.0',
      fields: aiResult.fields,
      processedAt: new Date(),
    });

    doc.status = DocumentStatus.EXTRACTED;
    await doc.save();

    return extraction;
  }
}

export const extractionService = new ExtractionService();

export class ExtractionController {
  async getByDocumentId(req: Request, res: Response, next: NextFunction) {
    try {
      const extraction = await extractionService.getByDocumentId(req.params.documentId as string);
      return sendSuccess(res, extraction);
    } catch (error) {
      next(error);
    }
  }

  async triggerExtraction(req: Request, res: Response, next: NextFunction) {
    try {
      const extraction = await extractionService.runExtraction(req.params.documentId as string);
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
