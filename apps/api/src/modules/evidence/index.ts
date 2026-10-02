import { Router, Request, Response, NextFunction } from 'express';
import { ClaimEvidenceLinkModel } from '../../models/ClaimEvidenceLink';
import { EvidenceCheckModel } from '../../models/EvidenceCheck';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { linkEvidenceSchema } from '@carbonpilot/validation';

export class EvidenceService {
  async linkEvidence(data: Record<string, any>) {
    return ClaimEvidenceLinkModel.create(data);
  }

  async getEvidenceForClaim(claimId: string) {
    return ClaimEvidenceLinkModel.find({ claimId }).populate('documentId');
  }

  async getChecksForClaim(claimId: string) {
    return EvidenceCheckModel.find({ claimId }).sort({ checkedAt: -1 });
  }
}

export const evidenceService = new EvidenceService();

export class EvidenceController {
  async linkEvidence(req: Request, res: Response, next: NextFunction) {
    try {
      const link = await evidenceService.linkEvidence(req.body);
      return sendSuccess(res, link, 201);
    } catch (error) {
      next(error);
    }
  }

  async getEvidenceForClaim(req: Request, res: Response, next: NextFunction) {
    try {
      const evidence = await evidenceService.getEvidenceForClaim(req.params.claimId as string);
      return sendSuccess(res, evidence);
    } catch (error) {
      next(error);
    }
  }

  async getChecksForClaim(req: Request, res: Response, next: NextFunction) {
    try {
      const checks = await evidenceService.getChecksForClaim(req.params.claimId as string);
      return sendSuccess(res, checks);
    } catch (error) {
      next(error);
    }
  }
}

export const evidenceController = new EvidenceController();

export const evidenceRoutes = Router();
evidenceRoutes.use(authenticate);
evidenceRoutes.post('/link', validate(linkEvidenceSchema), (req, res, next) =>
  evidenceController.linkEvidence(req, res, next)
);
evidenceRoutes.get('/claim/:claimId', (req, res, next) =>
  evidenceController.getEvidenceForClaim(req, res, next)
);
evidenceRoutes.get('/checks/:claimId', (req, res, next) =>
  evidenceController.getChecksForClaim(req, res, next)
);
