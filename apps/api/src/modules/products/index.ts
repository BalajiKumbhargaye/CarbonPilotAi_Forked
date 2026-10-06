import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { OrganizationType, ProductStatus, SupplierStatus } from '@carbonpilot/shared';
import { ProductModel } from '../../models/Product';
import { ProductCategoryModel } from '../../models/ProductCategory';
import { OrganizationModel } from '../../models/Organization';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { AppError, sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createProductCategorySchema,
  createProductSchema,
  updateProductSchema,
} from '@carbonpilot/validation';

const defaultCategories = [
  'Steel', 'Aluminium', 'Plastic', 'Packaging', 'Chemicals',
  'Electronics', 'Textiles', 'Paper', 'Glass', 'Other',
];

export class ProductService {
  async getCategories() {
    await Promise.all(defaultCategories.map((name) => {
      const slug = this.slugify(name);
      return ProductCategoryModel.findOneAndUpdate(
        { slug },
        { $setOnInsert: { name, slug, isActive: true } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }));
    await this.backfillLegacyCategories();
    return ProductCategoryModel.find({ isActive: true }).sort({ name: 1 });
  }

  async createCategory(name: string) {
    const slug = this.slugify(name);
    if (!slug) throw new AppError('Enter a valid category name', 400, 'INVALID_CATEGORY');
    try {
      return await ProductCategoryModel.findOneAndUpdate(
        { slug },
        { $setOnInsert: { name: name.trim(), slug, isActive: true } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      );
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        const category = await ProductCategoryModel.findOne({ slug });
        if (category) return category;
      }
      throw error;
    }
  }

  async getAll(user: Request['user'], filters: Record<string, string>) {
    await this.backfillLegacyCategories();
    if (filters.supplierId && !mongoose.isValidObjectId(filters.supplierId)) {
      throw new AppError('Choose a valid supplier', 400, 'INVALID_SUPPLIER');
    }
    if (filters.categoryId && !mongoose.isValidObjectId(filters.categoryId)) {
      throw new AppError('Choose a valid product category', 400, 'INVALID_CATEGORY');
    }

    const isPublicCatalog = user!.organizationType !== OrganizationType.SUPPLIER
      && (filters.catalog === 'true' || !!filters.search?.trim());
    const usePublicSupplierCatalog = isPublicCatalog && filters.status !== ProductStatus.INACTIVE;
    const supplierIds = usePublicSupplierCatalog
      ? await this.getCatalogSupplierIds()
      : await this.getAllowedSupplierIds(user!);
    if (usePublicSupplierCatalog) {
      filters.status = ProductStatus.ACTIVE;
    }
    if (filters.supplierId && !supplierIds.includes(filters.supplierId)) {
      throw new AppError('You cannot access products for this supplier', 403, 'FORBIDDEN');
    }
    if (!supplierIds.length) return [];

    const priceVisibleSupplierIds = usePublicSupplierCatalog
      ? await this.getAllowedSupplierIds(user!)
      : supplierIds;
    let searchableSupplierIds = supplierIds;
    const search = filters.search?.trim();
    let matchingSupplierIds: string[] = [];
    if (search) {
      const escaped = this.escapeRegex(search);
      const matchingOrganizations = await OrganizationModel.find({
        type: OrganizationType.SUPPLIER,
        name: { $regex: escaped, $options: 'i' },
      });
      const matchingSupplierProfiles = await SupplierModel.find({
        organizationId: { $in: matchingOrganizations.map((organization) => organization._id) },
      });
      matchingSupplierIds = matchingSupplierProfiles.map((supplier) => supplier._id.toString());
    }
    if (filters.supplierId) searchableSupplierIds = searchableSupplierIds.filter((id) => id === filters.supplierId);
    if (!searchableSupplierIds.length) return [];

    const query: Record<string, any> = { supplierId: { $in: searchableSupplierIds } };
    if (filters.categoryId) query.categoryId = filters.categoryId;
    if (filters.status) query.status = filters.status;
    if (search) {
      const escaped = this.escapeRegex(search);
      query.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { productCode: { $regex: escaped, $options: 'i' } },
        { supplierId: { $in: matchingSupplierIds } },
      ];
    }

    const products = await ProductModel.find(query).sort({ name: 1 });
    return Promise.all(products.map((product) =>
      this.toResponse(product, priceVisibleSupplierIds.includes(product.supplierId.toString()))
    ));
  }

  async getById(id: string, user: Request['user']) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Product not found', 404, 'NOT_FOUND');
    await this.backfillLegacyCategories();
    const product = await ProductModel.findById(id);
    if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
    if (user!.organizationType === OrganizationType.SUPPLIER || product.status !== ProductStatus.ACTIVE) {
      await this.assertCanAccess(product.supplierId.toString(), user!);
    } else {
      const supplier = await SupplierModel.findById(product.supplierId);
      const organization = supplier ? await OrganizationModel.findById(supplier.organizationId) : null;
      if (!supplier || organization?.type !== OrganizationType.SUPPLIER) {
        throw new AppError('Product not found', 404, 'NOT_FOUND');
      }
      const relationship = await SupplierRelationshipModel.findOne({
        customerOrganizationId: user!.organizationId,
        supplierOrganizationId: supplier.organizationId,
        status: { $ne: SupplierStatus.TERMINATED },
      });
      return this.toResponse(product, !!relationship);
    }
    return this.toResponse(product);
  }

  async create(data: Record<string, any>, user: Request['user']) {
    let supplierId: string;
    if (user!.organizationType === OrganizationType.SUPPLIER) {
      const supplier = await SupplierModel.findOne({ organizationId: user!.organizationId });
      if (!supplier) throw new AppError('Supplier profile not found', 404, 'NOT_FOUND');
      supplierId = supplier._id.toString();
      if (data.sellingPrice === undefined || !data.currency) {
        throw new AppError('Selling price and currency are required for supplier products', 400, 'PRODUCT_PRICE_REQUIRED');
      }
    } else {
      if (data.sellingPrice !== undefined || data.currency !== undefined) {
        throw new AppError('Only the product-owning supplier can set its selling price', 403, 'FORBIDDEN');
      }
      if (!data.supplierId || !mongoose.isValidObjectId(data.supplierId)) {
        throw new AppError('Choose a valid supplier', 400, 'INVALID_SUPPLIER');
      }
      supplierId = data.supplierId;
      await this.assertCanAccess(supplierId, user!);
    }

    const category = await this.getCategory(data.categoryId);
    const productCode = data.productCode?.trim() || undefined;
    if (productCode && await ProductModel.findOne({ supplierId, productCode })) {
      throw new AppError('This product code is already in use by the supplier', 409, 'PRODUCT_EXISTS');
    }
    try {
      const product = await ProductModel.create({
        supplierId,
        name: data.name,
        productCode,
        categoryId: category._id,
        category: category.name,
        unit: data.unit,
        ...(user!.organizationType === OrganizationType.SUPPLIER ? {
          sellingPrice: data.sellingPrice,
          currency: data.currency,
        } : {}),
        description: data.description,
        status: data.status || ProductStatus.ACTIVE,
      });
      return this.toResponse(product);
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new AppError('This product code is already in use by the supplier', 409, 'PRODUCT_EXISTS');
      }
      throw error;
    }
  }

  async update(id: string, data: Record<string, any>, user: Request['user']) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Product not found', 404, 'NOT_FOUND');
    const product = await ProductModel.findById(id);
    if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
    await this.assertCanAccess(product.supplierId.toString(), user!);
    if (user!.organizationType !== OrganizationType.SUPPLIER
      && (data.sellingPrice !== undefined || data.currency !== undefined)) {
      throw new AppError('Only the product-owning supplier can set its selling price', 403, 'FORBIDDEN');
    }
    if (user!.organizationType === OrganizationType.SUPPLIER
      && (data.sellingPrice !== undefined || data.currency !== undefined)
      && (data.sellingPrice ?? product.sellingPrice) === undefined) {
      throw new AppError('Selling price and currency are required for supplier products', 400, 'PRODUCT_PRICE_REQUIRED');
    }
    if (user!.organizationType === OrganizationType.SUPPLIER
      && (data.sellingPrice !== undefined || data.currency !== undefined)
      && !(data.currency ?? product.currency)) {
      throw new AppError('Selling price and currency are required for supplier products', 400, 'PRODUCT_PRICE_REQUIRED');
    }

    const update = { ...data };
    if (data.categoryId !== undefined) {
      const category = await this.getCategory(data.categoryId);
      update.category = category.name;
    }
    if (data.productCode !== undefined) update.productCode = data.productCode.trim();
    if (update.productCode && await ProductModel.findOne({
      supplierId: product.supplierId,
      productCode: update.productCode,
      _id: { $ne: product._id },
    })) {
      throw new AppError('This product code is already in use by the supplier', 409, 'PRODUCT_EXISTS');
    }

    try {
      const updated = await ProductModel.findByIdAndUpdate(id, update, { new: true, runValidators: true });
      return this.toResponse(updated);
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new AppError('This product code is already in use by the supplier', 409, 'PRODUCT_EXISTS');
      }
      throw error;
    }
  }

  private async assertCanAccess(supplierId: string, user: NonNullable<Request['user']>) {
    if (!mongoose.isValidObjectId(supplierId)) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');

    if (user.organizationType === OrganizationType.SUPPLIER) {
      if (supplier.organizationId.toString() !== user.organizationId) {
        throw new AppError('You cannot access products for this supplier', 403, 'FORBIDDEN');
      }
      return;
    }

    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId: user.organizationId,
      supplierOrganizationId: supplier.organizationId,
      status: { $ne: SupplierStatus.TERMINATED },
    });
    if (!relationship) throw new AppError('You cannot access products for this supplier', 403, 'FORBIDDEN');
  }

  private async getAllowedSupplierIds(user: NonNullable<Request['user']>) {
    if (user.organizationType === OrganizationType.SUPPLIER) {
      const supplier = await SupplierModel.findOne({ organizationId: user.organizationId });
      return supplier ? [supplier._id.toString()] : [];
    }
    const relationships = await SupplierRelationshipModel.find({
      customerOrganizationId: user.organizationId,
      status: { $ne: SupplierStatus.TERMINATED },
    });
    if (!relationships.length) return [];
    const organizations = await OrganizationModel.find({
      _id: { $in: relationships.map((relationship) => relationship.supplierOrganizationId) },
      type: OrganizationType.SUPPLIER,
    });
    const suppliers = await SupplierModel.find({ organizationId: { $in: organizations.map((org) => org._id) } });
    return suppliers.map((supplier) => supplier._id.toString());
  }

  private async getCatalogSupplierIds() {
    const organizations = await OrganizationModel.find({ type: OrganizationType.SUPPLIER });
    if (!organizations.length) return [];
    const suppliers = await SupplierModel.find({ organizationId: { $in: organizations.map((organization) => organization._id) } });
    return suppliers.map((supplier) => supplier._id.toString());
  }

  private async getCategory(id: string) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Choose a valid product category', 400, 'INVALID_CATEGORY');
    const category = await ProductCategoryModel.findOne({ _id: id, isActive: true });
    if (!category) throw new AppError('Product category not found', 404, 'NOT_FOUND');
    return category;
  }

  private async backfillLegacyCategories() {
    const legacyNames = await ProductModel.distinct('category', { categoryId: { $exists: false } });
    await Promise.all(legacyNames.filter((name) => typeof name === 'string' && name.trim()).map(async (name) => {
      const category = await this.createCategory(name);
      await ProductModel.updateMany(
        { category: name, categoryId: { $exists: false } },
        { $set: { categoryId: category._id } }
      );
    }));
  }

  private async toResponse(product: any, includeCommercialData = true) {
    const [supplier, category] = await Promise.all([
      SupplierModel.findById(product.supplierId),
      product.categoryId ? ProductCategoryModel.findById(product.categoryId) : null,
    ]);
    const organization = supplier ? await OrganizationModel.findById(supplier.organizationId) : null;
    const value = typeof product.toObject === 'function' ? product.toObject() : product;
    const response = {
      ...value,
      category: category?.name || value.category,
      categoryId: category?._id || value.categoryId,
      supplier: supplier ? {
        _id: supplier._id,
        organizationId: supplier.organizationId,
        name: organization?.name || 'Supplier',
      } : null,
    };
    if (!includeCommercialData) {
      delete response.sellingPrice;
      delete response.currency;
    }
    return response;
  }

  private slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}

export const productService = new ProductService();

export class ProductController {
  async getCategories(_req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await productService.getCategories());
    } catch (error) {
      next(error);
    }
  }

  async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await productService.createCategory(req.body.name), 201);
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const filters: Record<string, string> = {};
      for (const field of ['supplierId', 'categoryId', 'status', 'search', 'catalog']) {
        const value = req.query[field];
        if (typeof value === 'string') filters[field] = value;
      }
      if (filters.status && !Object.values(ProductStatus).includes(filters.status as ProductStatus)) {
        throw new AppError('Choose a valid product status', 400, 'INVALID_STATUS');
      }
      return sendSuccess(res, await productService.getAll(req.user, filters));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await productService.getById(req.params.id as string, req.user));
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await productService.create(req.body, req.user), 201);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await productService.update(req.params.id as string, req.body, req.user));
    } catch (error) {
      next(error);
    }
  }
}

export const productController = new ProductController();
export const productRoutes = Router();
productRoutes.use(authenticate);
productRoutes.get('/categories', (req, res, next) => productController.getCategories(req, res, next));
productRoutes.post('/categories', validate(createProductCategorySchema), (req, res, next) => productController.createCategory(req, res, next));
productRoutes.get('/', (req, res, next) => productController.getAll(req, res, next));
productRoutes.get('/:id', (req, res, next) => productController.getById(req, res, next));
productRoutes.post('/', validate(createProductSchema), (req, res, next) => productController.create(req, res, next));
productRoutes.patch('/:id', validate(updateProductSchema), (req, res, next) => productController.update(req, res, next));
productRoutes.patch('/:id/status', validate(updateProductSchema.pick({ status: true })), (req, res, next) => productController.update(req, res, next));
