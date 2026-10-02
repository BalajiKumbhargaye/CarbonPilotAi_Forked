import { Router, Request, Response, NextFunction } from 'express';
import { FacilityModel } from '../../models/Facility';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createFacilitySchema, updateFacilitySchema } from '@carbonpilot/validation';

export class FacilityService {
  async getAll(supplierId?: string) {
    const filter = supplierId ? { supplierId } : {};
    return FacilityModel.find(filter);
  }

  async getById(id: string) {
    return FacilityModel.findById(id);
  }

  async create(data: Record<string, any>) {
    return FacilityModel.create(data);
  }

  async update(id: string, data: Record<string, any>) {
    return FacilityModel.findByIdAndUpdate(id, data, { new: true });
  }
}

export const facilityService = new FacilityService();

export class FacilityController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const supplierId = req.query.supplierId as string | undefined;
      const facilities = await facilityService.getAll(supplierId);
      return sendSuccess(res, facilities);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const facility = await facilityService.getById(req.params.id as string);
      return sendSuccess(res, facility);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const facility = await facilityService.create(req.body);
      return sendSuccess(res, facility, 201);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const facility = await facilityService.update(req.params.id as string, req.body);
      return sendSuccess(res, facility);
    } catch (error) {
      next(error);
    }
  }
}

export const facilityController = new FacilityController();

export const facilityRoutes = Router();
facilityRoutes.use(authenticate);
facilityRoutes.get('/', (req, res, next) => facilityController.getAll(req, res, next));
facilityRoutes.get('/:id', (req, res, next) => facilityController.getById(req, res, next));
facilityRoutes.post('/', validate(createFacilitySchema), (req, res, next) =>
  facilityController.create(req, res, next)
);
facilityRoutes.put('/:id', validate(updateFacilitySchema), (req, res, next) =>
  facilityController.update(req, res, next)
);
