import { Router, Request, Response, NextFunction } from 'express';
import { CertificateModel } from '../../models/Certificate';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createCertificateSchema } from '@carbonpilot/validation';

export class CertificateService {
  async getAll(supplierId?: string) {
    const filter = supplierId ? { supplierId } : {};
    return CertificateModel.find(filter).populate('documentId');
  }

  async getById(id: string) {
    return CertificateModel.findById(id).populate('documentId');
  }

  async create(data: Record<string, any>) {
    return CertificateModel.create(data);
  }

  async update(id: string, data: Record<string, any>) {
    return CertificateModel.findByIdAndUpdate(id, data, { new: true });
  }
}

export const certificateService = new CertificateService();

export class CertificateController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const certs = await certificateService.getAll(req.query.supplierId as string);
      return sendSuccess(res, certs);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const cert = await certificateService.getById(req.params.id as string);
      return sendSuccess(res, cert);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const cert = await certificateService.create(req.body);
      return sendSuccess(res, cert, 201);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const cert = await certificateService.update(req.params.id as string, req.body);
      return sendSuccess(res, cert);
    } catch (error) {
      next(error);
    }
  }
}

export const certificateController = new CertificateController();

export const certificateRoutes = Router();
certificateRoutes.use(authenticate);
certificateRoutes.get('/', (req, res, next) => certificateController.getAll(req, res, next));
certificateRoutes.get('/:id', (req, res, next) => certificateController.getById(req, res, next));
certificateRoutes.post('/', validate(createCertificateSchema), (req, res, next) =>
  certificateController.create(req, res, next)
);
certificateRoutes.put('/:id', (req, res, next) => certificateController.update(req, res, next));
