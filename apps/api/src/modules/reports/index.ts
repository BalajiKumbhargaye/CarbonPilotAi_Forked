import { Router, Request, Response, NextFunction } from 'express';
import { OrganizationType } from '@carbonpilot/shared';
import { EvidencePackModel } from '../../models/EvidencePack';
import { sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createEvidencePackSchema } from '@carbonpilot/validation';
import { EvidencePackStatus } from '@carbonpilot/shared';

export class ReportService {
  async getEvidencePacks(orgId?: string) {
    const filter = orgId
      ? { $or: [{ customerOrganizationId: orgId }, { supplierId: orgId }] }
      : {};
    return EvidencePackModel.find(filter)
      .populate('claims')
      .populate('documents')
      .populate('carbonCalculations');
  }

  async getById(id: string) {
    return EvidencePackModel.findById(id)
      .populate('claims')
      .populate('documents')
      .populate('carbonCalculations')
      .populate('verificationRuns');
  }

  async createEvidencePack(data: Record<string, any>, customerOrgId: string) {
    return EvidencePackModel.create({
      ...data,
      customerOrganizationId: customerOrgId,
      status: EvidencePackStatus.READY,
    });
  }
}

export const reportService = new ReportService();

export class ReportController {
  async getEvidencePacks(req: Request, res: Response, next: NextFunction) {
    try {
      const packs = await reportService.getEvidencePacks(req.user?.organizationId);
      return sendSuccess(res, packs);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const pack = await reportService.getById(req.params.id as string);
      if (!pack) {
        return sendError(res, 404, 'NOT_FOUND', 'Evidence pack not found');
      }
      return sendSuccess(res, pack);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const pack = await reportService.createEvidencePack(req.body, req.user.organizationId);
      return sendSuccess(res, pack, 201);
    } catch (error) {
      next(error);
    }
  }
}

export const reportController = new ReportController();

export const reportRoutes = Router();
reportRoutes.use(authenticate);
reportRoutes.use(requireOrganizationType(OrganizationType.CUSTOMER));
reportRoutes.get('/evidence-packs', (req, res, next) =>
  reportController.getEvidencePacks(req, res, next)
);
reportRoutes.get('/evidence-packs/:id', (req, res, next) =>
  reportController.getById(req, res, next)
);
reportRoutes.post('/evidence-packs', validate(createEvidencePackSchema), (req, res, next) =>
  reportController.create(req, res, next)
);
