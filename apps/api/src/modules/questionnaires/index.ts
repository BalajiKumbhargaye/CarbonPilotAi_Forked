import { Router, Request, Response, NextFunction } from 'express';
import { DataRequestModel } from '../../models/DataRequest';
import { QuestionResponseModel } from '../../models/QuestionResponse';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createDataRequestSchema, submitQuestionResponseSchema } from '@carbonpilot/validation';
import { defaultAIOrchestrator } from '../../services/ai/AIOrchestrator';

export class QuestionnaireService {
  async getDataRequests(orgId?: string) {
    const filter = orgId
      ? { $or: [{ customerOrganizationId: orgId }, { supplierOrganizationId: orgId }] }
      : {};
    return DataRequestModel.find(filter)
      .populate('customerOrganizationId', 'name')
      .populate('supplierOrganizationId', 'name');
  }

  async getRequestById(id: string) {
    const request = await DataRequestModel.findById(id);
    const responses = await QuestionResponseModel.find({ dataRequestId: id });
    return { request, responses };
  }

  async createDataRequest(data: Record<string, any>, customerOrgId: string) {
    return DataRequestModel.create({
      ...data,
      customerOrganizationId: customerOrgId,
    });
  }

  async submitResponse(data: Record<string, any>, supplierId: string) {
    return QuestionResponseModel.create({
      ...data,
      supplierId,
    });
  }

  async generateAdaptiveQuestions(dataRequestId: string) {
    const request = await DataRequestModel.findById(dataRequestId);
    if (!request) {
      throw new Error('Data request not found');
    }
    const aiResult = await defaultAIOrchestrator.questionnaireAI.generateAdaptiveQuestions(
      request.missingFields
    );
    return aiResult.generatedQuestions;
  }
}

export const questionnaireService = new QuestionnaireService();

export class QuestionnaireController {
  async getDataRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const requests = await questionnaireService.getDataRequests(req.user?.organizationId);
      return sendSuccess(res, requests);
    } catch (error) {
      next(error);
    }
  }

  async getRequestById(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await questionnaireService.getRequestById(req.params.id as string);
      return sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }

  async createDataRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await questionnaireService.createDataRequest(
        req.body,
        req.user!.organizationId
      );
      return sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  async submitResponse(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await questionnaireService.submitResponse(
        req.body,
        req.body.supplierId || req.user!.organizationId
      );
      return sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  async getAdaptiveQuestions(req: Request, res: Response, next: NextFunction) {
    try {
      const questions = await questionnaireService.generateAdaptiveQuestions(
        req.params.id as string
      );
      return sendSuccess(res, questions);
    } catch (error) {
      next(error);
    }
  }
}

export const questionnaireController = new QuestionnaireController();

export const questionnaireRoutes = Router();
questionnaireRoutes.use(authenticate);

// Data requests
questionnaireRoutes.get('/requests', (req, res, next) =>
  questionnaireController.getDataRequests(req, res, next)
);
questionnaireRoutes.get('/requests/:id', (req, res, next) =>
  questionnaireController.getRequestById(req, res, next)
);
questionnaireRoutes.post('/requests', validate(createDataRequestSchema), (req, res, next) =>
  questionnaireController.createDataRequest(req, res, next)
);
questionnaireRoutes.get('/requests/:id/adaptive-questions', (req, res, next) =>
  questionnaireController.getAdaptiveQuestions(req, res, next)
);

// Question responses
questionnaireRoutes.post('/responses', validate(submitQuestionResponseSchema), (req, res, next) =>
  questionnaireController.submitResponse(req, res, next)
);
