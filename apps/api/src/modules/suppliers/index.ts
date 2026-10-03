import { Router, Request, Response, NextFunction } from 'express';
import { OrganizationStatus, OrganizationType, SupplierStatus } from '@carbonpilot/shared';
import { OrganizationModel } from '../../models/Organization';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { ProductModel } from '../../models/Product';
import { AppError, sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createSupplierSchema,
  updateSupplierProfileSchema,
  updateSupplierSchema,
  updateSupplierStatusSchema,
  updateSupplierRelationshipSchema,
} from '@carbonpilot/validation';

export class SupplierService {
  async getAll(customerOrganizationId: string, search = '') {
    const relationships = await SupplierRelationshipModel.find({
      customerOrganizationId,
      status: { $ne: SupplierStatus.TERMINATED },
    });
    if (relationships.length === 0) return [];

    const linkedOrganizationIds = relationships.map((relationship) => relationship.supplierOrganizationId);
    const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const organizationFilter: Record<string, unknown> = {
      _id: { $in: linkedOrganizationIds },
      type: OrganizationType.SUPPLIER,
    };
    if (escapedSearch) {
      organizationFilter.$or = ['name', 'legalName', 'industry', 'country', 'city'].map((field) => ({
        [field]: { $regex: escapedSearch, $options: 'i' },
      }));
    }

    const [organizations, suppliers] = await Promise.all([
      OrganizationModel.find(organizationFilter),
      SupplierModel.find({ organizationId: { $in: linkedOrganizationIds } }),
    ]);
    const organizationById = new Map(organizations.map((organization) => [organization._id.toString(), organization]));
    const relationshipByOrganizationId = new Map(
      relationships.map((relationship) => [relationship.supplierOrganizationId.toString(), relationship])
    );

    return Promise.all(
      suppliers.flatMap((supplier) => {
        const organization = organizationById.get(supplier.organizationId.toString());
        const relationship = relationshipByOrganizationId.get(supplier.organizationId.toString());
        return organization && relationship ? [this.toDirectoryEntry(supplier, organization, relationship)] : [];
      })
    );
  }

  async getById(id: string, customerOrganizationId: string) {
    const supplier = await SupplierModel.findById(id);
    if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');

    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId,
      supplierOrganizationId: supplier.organizationId,
      status: { $ne: SupplierStatus.TERMINATED },
    });
    if (!relationship) throw new AppError('Supplier not found', 404, 'NOT_FOUND');

    const organization = await OrganizationModel.findById(supplier.organizationId);
    if (!organization || organization.type !== OrganizationType.SUPPLIER) {
      throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    }

    const products = await ProductModel.find({ supplierId: supplier._id });
    return {
      ...(await this.toDirectoryEntry(supplier, organization, relationship)),
      products,
    };
  }

  async create(data: Record<string, any>, customerOrganizationId: string) {
    const contactEmail = data.contactEmail.toLowerCase();
    let organization;
    let supplier;
    let createdOrganization = false;

    try {
      organization = await OrganizationModel.findOne({
        type: OrganizationType.SUPPLIER,
        contactEmail,
      });

      if (!organization) {
        organization = await OrganizationModel.create({
          name: data.companyName,
          legalName: data.legalName,
          type: OrganizationType.SUPPLIER,
          industry: data.industry,
          country: data.country,
          city: data.city,
          contactPerson: data.contactPerson,
          contactEmail,
          contactPhone: data.contactPhone,
          website: data.website,
          status: OrganizationStatus.ACTIVE,
        });
        createdOrganization = true;
      }

      supplier = await SupplierModel.findOne({ organizationId: organization._id });
      if (!supplier) {
        supplier = await SupplierModel.create({
          organizationId: organization._id,
          industry: data.industry,
          category: data.category,
          notes: data.notes,
          status: SupplierStatus.PENDING,
        });
      }

      const existingRelationship = await SupplierRelationshipModel.findOne({
        customerOrganizationId,
        supplierOrganizationId: organization._id,
      });
      if (existingRelationship) {
        throw new AppError('This supplier is already connected to your organization', 409, 'SUPPLIER_EXISTS');
      }

      const relationship = await SupplierRelationshipModel.create({
        customerOrganizationId,
        supplierOrganizationId: organization._id,
        status: SupplierStatus.PENDING,
      });

      return this.toDirectoryEntry(supplier, organization, relationship);
    } catch (error) {
      if (createdOrganization && organization) {
        if (supplier) await SupplierModel.deleteOne({ _id: supplier._id });
        await OrganizationModel.deleteOne({ _id: organization._id });
      }
      if (error instanceof AppError) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new AppError('This supplier is already connected to your organization', 409, 'SUPPLIER_EXISTS');
      }
      throw error;
    }
  }

  async update(id: string, data: Record<string, any>, customerOrganizationId: string) {
    const supplier = await SupplierModel.findById(id);
    if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId,
      supplierOrganizationId: supplier.organizationId,
      status: { $ne: SupplierStatus.TERMINATED },
    });
    if (!relationship) throw new AppError('Supplier not found', 404, 'NOT_FOUND');

    const organizationUpdate: Record<string, unknown> = {};
    const organizationFields = [
      ['companyName', 'name'], ['legalName', 'legalName'], ['industry', 'industry'],
      ['country', 'country'], ['city', 'city'], ['contactPerson', 'contactPerson'],
      ['contactEmail', 'contactEmail'], ['contactPhone', 'contactPhone'], ['website', 'website'],
    ];
    for (const [input, field] of organizationFields) {
      if (data[input] !== undefined) organizationUpdate[field] = input === 'contactEmail' ? data[input].toLowerCase() : data[input];
    }

    const [organization] = await Promise.all([
      Object.keys(organizationUpdate).length
        ? OrganizationModel.findByIdAndUpdate(supplier.organizationId, organizationUpdate, { new: true, runValidators: true })
        : OrganizationModel.findById(supplier.organizationId),
      SupplierModel.findByIdAndUpdate(supplier._id, {
        ...(data.industry !== undefined ? { industry: data.industry } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      }, { new: true, runValidators: true }),
    ]);

    return this.toDirectoryEntry(supplier, organization, relationship);
  }

  async updateStatus(id: string, status: SupplierStatus, customerOrganizationId: string) {
    const supplier = await SupplierModel.findById(id);
    if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    const relationship = await SupplierRelationshipModel.findOneAndUpdate(
      {
        customerOrganizationId,
        supplierOrganizationId: supplier.organizationId,
      },
      { status },
      { new: true, runValidators: true }
    );
    if (!relationship) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    const organization = await OrganizationModel.findById(supplier.organizationId);
    if (!organization) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    return this.toDirectoryEntry(supplier, organization, relationship);
  }

  async getOwnProfile(organizationId: string) {
    const organization = await OrganizationModel.findOne({ _id: organizationId, type: OrganizationType.SUPPLIER });
    if (!organization) throw new AppError('Supplier organization not found', 404, 'NOT_FOUND');
    let supplier = await SupplierModel.findOne({ organizationId });
    if (!supplier) {
      supplier = await SupplierModel.create({
        organizationId,
        industry: organization.industry || 'General',
        status: SupplierStatus.ACTIVE,
      });
    }
    return { ...organization.toObject(), supplierId: supplier._id, category: supplier.category };
  }

  async updateOwnProfile(organizationId: string, data: Record<string, any>) {
    const organization = await OrganizationModel.findOneAndUpdate(
      { _id: organizationId, type: OrganizationType.SUPPLIER },
      data,
      { new: true, runValidators: true }
    );
    if (!organization) throw new AppError('Supplier organization not found', 404, 'NOT_FOUND');

    if (data.industry !== undefined) {
      const supplier = await SupplierModel.findOne({ organizationId });
      if (supplier) {
        await SupplierModel.findByIdAndUpdate(supplier._id, { industry: data.industry }, { runValidators: true });
      }
    }
    return this.getOwnProfile(organizationId);
  }

  private async toDirectoryEntry(supplier: any, organization: any, relationship: any) {
    const productsCount = await ProductModel.countDocuments({ supplierId: supplier._id });
    return {
      _id: supplier._id,
      organizationId: organization._id,
      companyName: organization.name,
      legalName: organization.legalName,
      industry: organization.industry || supplier.industry,
      country: organization.country,
      city: organization.city,
      contactPerson: organization.contactPerson,
      contactEmail: organization.contactEmail,
      contactPhone: organization.contactPhone,
      website: organization.website,
      category: supplier.category,
      notes: supplier.notes,
      status: relationship.status,
      productsCount,
      createdAt: supplier.createdAt,
      connectedAt: relationship.createdAt,
    };
  }

  async getRelationships(organizationId: string) {
    return SupplierRelationshipModel.find({
      customerOrganizationId: organizationId,
    })
      .populate('customerOrganizationId', 'name industry')
      .populate('supplierOrganizationId', 'name industry');
  }

  async updateRelationship(id: string, data: Record<string, any>, customerOrganizationId: string) {
    const relationship = await SupplierRelationshipModel.findOneAndUpdate(
      { _id: id, customerOrganizationId },
      data,
      { new: true, runValidators: true }
    );
    if (!relationship) throw new AppError('Supplier relationship not found', 404, 'NOT_FOUND');
    return relationship;
  }
}

export const supplierService = new SupplierService();

export class SupplierController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const suppliers = await supplierService.getAll(req.user!.organizationId, String(req.query.search || ''));
      return sendSuccess(res, suppliers);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const supplier = await supplierService.getById(req.params.id as string, req.user!.organizationId);
      return sendSuccess(res, supplier);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const supplier = await supplierService.create(req.body, req.user!.organizationId);
      return sendSuccess(res, supplier, 201);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const supplier = await supplierService.update(req.params.id as string, req.body, req.user!.organizationId);
      return sendSuccess(res, supplier);
    } catch (error) {
      next(error);
    }
  }

  async getRelationships(req: Request, res: Response, next: NextFunction) {
    try {
      const rels = await supplierService.getRelationships(req.user!.organizationId);
      return sendSuccess(res, rels);
    } catch (error) {
      next(error);
    }
  }

  async updateRelationship(req: Request, res: Response, next: NextFunction) {
    try {
      const rel = await supplierService.updateRelationship(req.params.id as string, req.body, req.user!.organizationId);
      return sendSuccess(res, rel);
    } catch (error) {
      next(error);
    }
  }

  async getOwnProfile(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await supplierService.getOwnProfile(req.user!.organizationId));
    } catch (error) {
      next(error);
    }
  }

  async updateOwnProfile(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await supplierService.updateOwnProfile(req.user!.organizationId, req.body));
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await supplierService.updateStatus(
        req.params.id as string,
        req.body.status,
        req.user!.organizationId
      );
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
}

export const supplierController = new SupplierController();

export const supplierRoutes = Router();
supplierRoutes.use(authenticate);
supplierRoutes.get('/profile', requireOrganizationType(OrganizationType.SUPPLIER), (req, res, next) =>
  supplierController.getOwnProfile(req, res, next)
);
supplierRoutes.patch('/profile', requireOrganizationType(OrganizationType.SUPPLIER), validate(updateSupplierProfileSchema), (req, res, next) =>
  supplierController.updateOwnProfile(req, res, next)
);
supplierRoutes.use(requireOrganizationType(OrganizationType.CUSTOMER));
supplierRoutes.get('/', (req, res, next) => supplierController.getAll(req, res, next));
supplierRoutes.get('/relationships', (req, res, next) => supplierController.getRelationships(req, res, next));
supplierRoutes.patch('/relationships/:id', validate(updateSupplierRelationshipSchema), (req, res, next) =>
  supplierController.updateRelationship(req, res, next)
);
supplierRoutes.get('/:id', (req, res, next) => supplierController.getById(req, res, next));
supplierRoutes.post('/', validate(createSupplierSchema), (req, res, next) =>
  supplierController.create(req, res, next)
);
supplierRoutes.patch('/:id/status', validate(updateSupplierStatusSchema), (req, res, next) =>
  supplierController.updateStatus(req, res, next)
);
supplierRoutes.patch('/:id', validate(updateSupplierSchema), (req, res, next) =>
  supplierController.update(req, res, next)
);
