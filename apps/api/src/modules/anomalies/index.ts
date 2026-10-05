import { Router, Request, Response, NextFunction } from 'express';
import { AnomalyModel } from '../../models/Anomaly';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createAnomalySchema, resolveAnomalySchema } from '@carbonpilot/validation';
import { AnomalyStatus, OrganizationType } from '@carbonpilot/shared';
import { AuthUserPayload } from '../../middleware/auth.middleware';
import { AppError } from '../../utils/response';
import {
  getAccessibleAnomaly,
  getAccessibleAnomalyFilter,
  getAccessibleDocument,
  getAccessibleSupplierIds,
} from '../verification/access';

export class AnomalyService {
  async getAll(user: AuthUserPayload, status?: string) {
    const filter: Record<string, unknown> = await getAccessibleAnomalyFilter(user);
    if (status) filter.status = status;
    return AnomalyModel.find(filter)
      .populate('supplierId')
      .populate('documents')
      .sort({ detectedAt: -1 });
  }

  async getById(id: string, user: AuthUserPayload) {
    const anomaly = await getAccessibleAnomaly(id, user);
    return AnomalyModel.findById(anomaly._id).populate('documents');
  }

  async create(data: Record<string, any>, user: AuthUserPayload) {
    if (user.organizationType !== OrganizationType.CUSTOMER) {
      throw new AppError('Only a buyer can create an issue', 403, 'FORBIDDEN');
    }
    const supplierIds = await getAccessibleSupplierIds(user);
    if (!supplierIds.includes(String(data.supplierId))) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    for (const documentId of data.documents ?? []) {
      const document = await getAccessibleDocument(documentId, user);
      if (document.supplierId?.toString() !== String(data.supplierId)) {
        throw new AppError('Document not found', 404, 'NOT_FOUND');
      }
    }
    return AnomalyModel.create({ ...data, buyerOrganizationId: user.organizationId });
  }

  async resolve(id: string, note: string, status: AnomalyStatus.RESOLVED | AnomalyStatus.IGNORED, user: AuthUserPayload) {
    if (user.organizationType !== OrganizationType.CUSTOMER) {
      throw new AppError('Only a buyer can resolve or dismiss an issue', 403, 'FORBIDDEN');
    }
    const anomaly = await getAccessibleAnomaly(id, user);
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
