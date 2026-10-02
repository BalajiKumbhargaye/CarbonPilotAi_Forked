import { Router, Request, Response, NextFunction } from 'express';
import { AuditLogModel } from '../../models/AuditLog';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';

export class AuditService {
  async getLogs(orgId?: string, entityType?: string) {
    const filter: Record<string, unknown> = {};
    if (orgId) filter.organizationId = orgId;
    if (entityType) filter.entityType = entityType;
    return AuditLogModel.find(filter)
      .populate('userId', 'name email')
      .sort({ timestamp: -1 })
      .limit(100);
  }

  async logAction(params: {
    organizationId?: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
  }) {
    return AuditLogModel.create(params);
  }
}

export const auditService = new AuditService();

export class AuditController {
  async getLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const logs = await auditService.getLogs(
        req.user?.organizationId,
        req.query.entityType as string
      );
      return sendSuccess(res, logs);
    } catch (error) {
      next(error);
    }
  }
}

export const auditController = new AuditController();

export const auditRoutes = Router();
auditRoutes.use(authenticate);
auditRoutes.get('/', (req, res, next) => auditController.getLogs(req, res, next));
