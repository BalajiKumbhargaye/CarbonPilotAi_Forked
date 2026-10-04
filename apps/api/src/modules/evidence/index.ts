import { Router, Request, Response, NextFunction } from 'express';
import { OrganizationType } from '@carbonpilot/shared';
import { ClaimEvidenceLinkModel } from '../../models/ClaimEvidenceLink';
import { EvidenceCheckModel } from '../../models/EvidenceCheck';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { linkEvidenceSchema } from '@carbonpilot/validation';
import { AppError } from '../../utils/response';
import { getAccessibleClaim, getAccessibleDocument } from '../verification/access';

export class EvidenceService {
  async linkEvidence(data: Record<string, any>, user: NonNullable<Request['user']>) {
    if (user.organizationType !== OrganizationType.SUPPLIER) {
      throw new AppError('Only the submitting supplier can attach claim evidence', 403, 'FORBIDDEN');
    }
    const [claim, document] = await Promise.all([
      getAccessibleClaim(data.claimId, user),
      getAccessibleDocument(data.documentId, user),
    ]);
    if (claim.supplierId.toString() !== document.supplierId?.toString()) {
      throw new AppError('Claim and evidence must belong to the same supplier', 404, 'NOT_FOUND');
    }
    return ClaimEvidenceLinkModel.create(data);
  }

  async getEvidenceForClaim(claimId: string, user: NonNullable<Request['user']>) {
    await getAccessibleClaim(claimId, user);
    return ClaimEvidenceLinkModel.find({ claimId }).populate('documentId');
  }

  async getChecksForClaim(claimId: string, user: NonNullable<Request['user']>) {
    await getAccessibleClaim(claimId, user);
    return EvidenceCheckModel.find({ claimId }).sort({ checkedAt: -1 });
  }
}

export const evidenceService = new EvidenceService();

export class EvidenceController {
  async linkEvidence(req: Request, res: Response, next: NextFunction) {
    try {
      const link = await evidenceService.linkEvidence(req.body, req.user!);
      return sendSuccess(res, link, 201);
    } catch (error) {
      next(error);
    }
  }

  async getEvidenceForClaim(req: Request, res: Response, next: NextFunction) {
    try {
      const evidence = await evidenceService.getEvidenceForClaim(req.params.claimId as string, req.user!);
      return sendSuccess(res, evidence);
    } catch (error) {
      next(error);
    }
  }

  async getChecksForClaim(req: Request, res: Response, next: NextFunction) {
    try {
      const checks = await evidenceService.getChecksForClaim(req.params.claimId as string, req.user!);
      return sendSuccess(res, checks);
    } catch (error) {
      next(error);
    }
  }
}

export const evidenceController = new EvidenceController();

export const evidenceRoutes = Router();
evidenceRoutes.use(authenticate);
evidenceRoutes.post('/link', requireOrganizationType(OrganizationType.SUPPLIER), validate(linkEvidenceSchema), (req, res, next) =>
  evidenceController.linkEvidence(req, res, next)
);
evidenceRoutes.get('/claim/:claimId', (req, res, next) =>
  evidenceController.getEvidenceForClaim(req, res, next)
);
evidenceRoutes.get('/checks/:claimId', (req, res, next) =>
  evidenceController.getChecksForClaim(req, res, next)
);
