import { Router, Request, Response, NextFunction } from 'express';
import { OrganizationModel } from '../../models/Organization';
import { OrganizationMemberModel } from '../../models/OrganizationMember';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createOrganizationSchema, updateOrganizationSchema } from '@carbonpilot/validation';

export class OrganizationService {
  async getAll() {
    return OrganizationModel.find().sort({ createdAt: -1 });
  }

  async getById(id: string) {
    return OrganizationModel.findById(id);
  }

  async create(data: Record<string, any>) {
    return OrganizationModel.create(data);
  }

  async update(id: string, data: Record<string, any>) {
    return OrganizationModel.findByIdAndUpdate(id, data, { new: true });
  }

  async getMembers(organizationId: string) {
    return OrganizationMemberModel.find({ organizationId }).populate('userId', 'name email status');
  }
}

export const organizationService = new OrganizationService();

export class OrganizationController {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const orgs = await organizationService.getAll();
      return sendSuccess(res, orgs);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const org = await organizationService.getById(req.params.id as string);
      return sendSuccess(res, org);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const org = await organizationService.create(req.body);
      return sendSuccess(res, org, 201);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const org = await organizationService.update(req.params.id as string, req.body);
      return sendSuccess(res, org);
    } catch (error) {
      next(error);
    }
  }

  async getMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const members = await organizationService.getMembers(req.params.id as string);
      return sendSuccess(res, members);
    } catch (error) {
      next(error);
    }
  }
}

export const organizationController = new OrganizationController();

export const organizationRoutes = Router();
organizationRoutes.use(authenticate);
organizationRoutes.get('/', (req, res, next) => organizationController.getAll(req, res, next));
organizationRoutes.get('/:id', (req, res, next) => organizationController.getById(req, res, next));
organizationRoutes.post('/', validate(createOrganizationSchema), (req, res, next) =>
  organizationController.create(req, res, next)
);
organizationRoutes.put('/:id', validate(updateOrganizationSchema), (req, res, next) =>
  organizationController.update(req, res, next)
);
organizationRoutes.get('/:id/members', (req, res, next) =>
  organizationController.getMembers(req, res, next)
);
