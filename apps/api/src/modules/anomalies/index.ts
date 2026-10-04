import { Router, Request, Response, NextFunction } from 'express';
import { AnomalyModel } from '../../models/Anomaly';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createAnomalySchema, resolveAnomalySchema } from '@carbonpilot/validation';
import { AnomalyStatus, OrganizationType } from '@carbonpilot/shared';
import { AuthUserPayload } from '../../middleware/auth.middleware';
import { AppError } from '../../utils/response';
import { getAccessibleSupplierIds } from '../verification/access';

export class AnomalyService {
  async getAll(user: AuthUserPayload, status?: string) {
    const supplierIds = await getAccessibleSupplierIds(user);
    const filter: Record<string, unknown> = { supplierId: { $in: supplierIds } };
    if (status) filter.status = status;
    return AnomalyModel.find(filter)
      .populate('supplierId')
      .populate('documents')
      .sort({ detectedAt: -1 });
  }

  async getById(id: string, user: AuthUserPayload) {
    const anomaly = await AnomalyModel.findById(id).populate('documents');
    if (!anomaly) throw new AppError('Issue not found', 404, 'NOT_FOUND');
    const supplierIds = await getAccessibleSupplierIds(user);
    if (!supplierIds.includes(anomaly.supplierId.toString())) {
      throw new AppError('Issue not found', 404, 'NOT_FOUND');
    }
    return anomaly;
  }

  async create(data: Record<string, any>, user: AuthUserPayload) {
    if (user.organizationType !== OrganizationType.CUSTOMER) {
      throw new AppError('Only a buyer can create an issue', 403, 'FORBIDDEN');
    }
    const supplierIds = await getAccessibleSupplierIds(user);
    if (!supplierIds.includes(String(data.supplierId))) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    return AnomalyModel.create(data);
  }

  async resolve(id: string, note: string, status: AnomalyStatus.RESOLVED | AnomalyStatus.IGNORED, user: AuthUserPayload) {
    if (user.organizationType !== OrganizationType.CUSTOMER) {
      throw new AppError('Only a buyer can resolve or dismiss an issue', 403, 'FORBIDDEN');
    }
    const anomaly = await AnomalyModel.findById(id);
    if (!anomaly) throw new AppError('Issue not found', 404, 'NOT_FOUND');
    const supplierIds = await getAccessibleSupplierIds(user);
    if (!supplierIds.includes(anomaly.supplierId.toString())) throw new AppError('Issue not found', 404, 'NOT_FOUND');
    return AnomalyModel.findByIdAndUpdate(id,
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
      const anomalies = await anomalyService.getAll(req.user!, req.query.status as string);
      return sendSuccess(res, anomalies);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const anomaly = await anomalyService.getById(req.params.id as string, req.user!);
      return sendSuccess(res, anomaly);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const anomaly = await anomalyService.create(req.body, req.user!);
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
        req.body.status,
        req.user!
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
