import { Router, Request, Response, NextFunction } from 'express';
import { ProductModel } from '../../models/Product';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createProductSchema, updateProductSchema } from '@carbonpilot/validation';

export class ProductService {
  async getAll(supplierId?: string) {
    const filter = supplierId ? { supplierId } : {};
    return ProductModel.find(filter).populate('productionFacilityIds');
  }

  async getById(id: string) {
    return ProductModel.findById(id).populate('productionFacilityIds');
  }

  async create(data: Record<string, any>) {
    return ProductModel.create(data);
  }

  async update(id: string, data: Record<string, any>) {
    return ProductModel.findByIdAndUpdate(id, data, { new: true });
  }
}

export const productService = new ProductService();

export class ProductController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const supplierId = req.query.supplierId as string | undefined;
      const products = await productService.getAll(supplierId);
      return sendSuccess(res, products);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await productService.getById(req.params.id as string);
      return sendSuccess(res, product);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await productService.create(req.body);
      return sendSuccess(res, product, 201);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await productService.update(req.params.id as string, req.body);
      return sendSuccess(res, product);
    } catch (error) {
      next(error);
    }
  }
}

export const productController = new ProductController();

export const productRoutes = Router();
productRoutes.use(authenticate);
productRoutes.get('/', (req, res, next) => productController.getAll(req, res, next));
productRoutes.get('/:id', (req, res, next) => productController.getById(req, res, next));
productRoutes.post('/', validate(createProductSchema), (req, res, next) =>
  productController.create(req, res, next)
);
productRoutes.put('/:id', validate(updateProductSchema), (req, res, next) =>
  productController.update(req, res, next)
);
