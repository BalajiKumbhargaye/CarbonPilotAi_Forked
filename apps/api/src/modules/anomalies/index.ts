import { Router, Request, Response, NextFunction } from 'express';
import { AnomalyModel } from '../../models/Anomaly';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createAnomalySchema, resolveAnomalySchema } from '@carbonpilot/validation';
import { AnomalyStatus } from '@carbonpilot/shared';

export class AnomalyService {
  async getAll(supplierId?: string, status?: string) {
    const filter: Record<string, unknown> = {};
    if (supplierId) filter.supplierId = supplierId;
    if (status) filter.status = status;
    return AnomalyModel.find(filter)
      .populate('supplierId')
      .populate('documents')
      .sort({ detectedAt: -1 });
  }

  async getById(id: string) {
    return AnomalyModel.findById(id).populate('supplierId').populate('documents');
  }

  async create(data: Record<string, any>) {
    return AnomalyModel.create(data);
  }

  async resolve(id: string, note: string, status: AnomalyStatus.RESOLVED | AnomalyStatus.IGNORED) {
    return AnomalyModel.findByIdAndUpdate(
      id,
      {
        status,
        resolutionNote: note,
        resolvedAt: new Date(),
      },
      { new: true }
    );
  }
}

export const anomalyService = new AnomalyService();

export class AnomalyController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const anomalies = await anomalyService.getAll(
        req.query.supplierId as string,
        req.query.status as string
      );
      return sendSuccess(res, anomalies);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const anomaly = await anomalyService.getById(req.params.id as string);
      return sendSuccess(res, anomaly);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const anomaly = await anomalyService.create(req.body);
      return sendSuccess(res, anomaly, 201);
    } catch (error) {
      next(error);
    }
  }

  async resolve(req: Request, res: Response, next: NextFunction) {
    try {
      const anomaly = await anomalyService.resolve(
        req.params.id as string,
        req.body.resolutionNote,
        req.body.status
      );
      return sendSuccess(res, anomaly);
    } catch (error) {
      next(error);
    }
  }
}

export const anomalyController = new AnomalyController();

export const anomalyRoutes = Router();
anomalyRoutes.use(authenticate);
anomalyRoutes.get('/', (req, res, next) => anomalyController.getAll(req, res, next));
anomalyRoutes.get('/:id', (req, res, next) => anomalyController.getById(req, res, next));
anomalyRoutes.post('/', validate(createAnomalySchema), (req, res, next) =>
  anomalyController.create(req, res, next)
);
anomalyRoutes.put('/:id/resolve', validate(resolveAnomalySchema), (req, res, next) =>
  anomalyController.resolve(req, res, next)
);
