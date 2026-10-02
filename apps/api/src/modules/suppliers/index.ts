import { Router, Request, Response, NextFunction } from 'express';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createSupplierSchema, updateSupplierSchema, updateSupplierRelationshipSchema } from '@carbonpilot/validation';

export class SupplierService {
  async getAll() {
    return SupplierModel.find().populate('organizationId', 'name gstin industry address website status');
  }

  async getById(id: string) {
    return SupplierModel.findById(id).populate('organizationId');
  }

  async create(data: Record<string, any>) {
    return SupplierModel.create(data);
  }

  async update(id: string, data: Record<string, any>) {
    return SupplierModel.findByIdAndUpdate(id, data, { new: true });
  }

  async getRelationships(organizationId: string) {
    return SupplierRelationshipModel.find({
      $or: [{ customerOrganizationId: organizationId }, { supplierOrganizationId: organizationId }],
    })
      .populate('customerOrganizationId', 'name industry')
      .populate('supplierOrganizationId', 'name industry');
  }

  async updateRelationship(id: string, data: Record<string, any>) {
    return SupplierRelationshipModel.findByIdAndUpdate(id, data, { new: true });
  }
}

export const supplierService = new SupplierService();

export class SupplierController {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const suppliers = await supplierService.getAll();
      return sendSuccess(res, suppliers);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const supplier = await supplierService.getById(req.params.id as string);
      return sendSuccess(res, supplier);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const supplier = await supplierService.create(req.body);
      return sendSuccess(res, supplier, 201);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const supplier = await supplierService.update(req.params.id as string, req.body);
      return sendSuccess(res, supplier);
    } catch (error) {
      next(error);
    }
  }

  async getRelationships(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user?.organizationId || (req.params.orgId as string);
      const rels = await supplierService.getRelationships(orgId);
      return sendSuccess(res, rels);
    } catch (error) {
      next(error);
    }
  }

  async updateRelationship(req: Request, res: Response, next: NextFunction) {
    try {
      const rel = await supplierService.updateRelationship(req.params.id as string, req.body);
      return sendSuccess(res, rel);
    } catch (error) {
      next(error);
    }
  }
}

export const supplierController = new SupplierController();

export const supplierRoutes = Router();
supplierRoutes.use(authenticate);
supplierRoutes.get('/', (req, res, next) => supplierController.getAll(req, res, next));
supplierRoutes.get('/relationships', (req, res, next) => supplierController.getRelationships(req, res, next));
supplierRoutes.put('/relationships/:id', validate(updateSupplierRelationshipSchema), (req, res, next) =>
  supplierController.updateRelationship(req, res, next)
);
supplierRoutes.get('/:id', (req, res, next) => supplierController.getById(req, res, next));
supplierRoutes.post('/', validate(createSupplierSchema), (req, res, next) =>
  supplierController.create(req, res, next)
);
supplierRoutes.put('/:id', validate(updateSupplierSchema), (req, res, next) =>
  supplierController.update(req, res, next)
);
