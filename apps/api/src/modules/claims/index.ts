import { Router, Request, Response, NextFunction } from 'express';
import { ClaimModel } from '../../models/Claim';
import { ClaimEvidenceLinkModel } from '../../models/ClaimEvidenceLink';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createClaimSchema } from '@carbonpilot/validation';

export class ClaimService {
  async getAll(supplierId?: string) {
    const filter = supplierId ? { supplierId } : {};
    return ClaimModel.find(filter)
      .populate('productId', 'name productCode')
      .populate('facilityId', 'name location');
  }

  async getById(id: string) {
    const claim = await ClaimModel.findById(id)
      .populate('productId')
      .populate('facilityId');
    const evidenceLinks = await ClaimEvidenceLinkModel.find({ claimId: id }).populate('documentId');
    return {
      claim,
      evidenceLinks,
    };
  }

  async create(data: Record<string, any>) {
    return ClaimModel.create(data);
  }

  async update(id: string, data: Record<string, any>) {
    return ClaimModel.findByIdAndUpdate(id, data, { new: true });
  }
}

export const claimService = new ClaimService();

export class ClaimController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const claims = await claimService.getAll(req.query.supplierId as string);
      return sendSuccess(res, claims);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const claim = await claimService.getById(req.params.id as string);
      return sendSuccess(res, claim);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const claim = await claimService.create(req.body);
      return sendSuccess(res, claim, 201);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const claim = await claimService.update(req.params.id as string, req.body);
      return sendSuccess(res, claim);
    } catch (error) {
      next(error);
    }
  }
}

export const claimController = new ClaimController();

export const claimRoutes = Router();
claimRoutes.use(authenticate);
claimRoutes.get('/', (req, res, next) => claimController.getAll(req, res, next));
claimRoutes.get('/:id', (req, res, next) => claimController.getById(req, res, next));
claimRoutes.post('/', validate(createClaimSchema), (req, res, next) =>
  claimController.create(req, res, next)
);
claimRoutes.put('/:id', (req, res, next) => claimController.update(req, res, next));
