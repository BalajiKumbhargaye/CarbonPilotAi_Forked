import { Router, Request, Response, NextFunction } from 'express';
import { ClaimStatus, OrganizationType } from '@carbonpilot/shared';
import { ClaimModel } from '../../models/Claim';
import { ClaimEvidenceLinkModel } from '../../models/ClaimEvidenceLink';
import { AppError, sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createClaimSchema } from '@carbonpilot/validation';
import { assertOwnSupplier, getAccessibleClaim, getAccessibleSupplierIds } from '../verification/access';
import { ProductModel } from '../../models/Product';
import { FacilityModel } from '../../models/Facility';
import { DataRequestModel } from '../../models/DataRequest';
import { normalizeCarbonData } from '../verification/normalization';
import { updateClaimSchema } from '@carbonpilot/validation';

export class ClaimService {
  async getAll(user: NonNullable<Request['user']>) {
    const supplierIds = await getAccessibleSupplierIds(user);
    const filter = { supplierId: { $in: supplierIds } };
    return ClaimModel.find(filter)
      .populate('productId', 'name productCode')
      .populate('facilityId', 'name location');
  }

  async getById(id: string, user: NonNullable<Request['user']>) {
    await getAccessibleClaim(id, user);
    const claim = await ClaimModel.findById(id)
      .populate('productId')
      .populate('facilityId');
    const evidenceLinks = await ClaimEvidenceLinkModel.find({ claimId: id }).populate('documentId');
    return {
      claim,
      evidenceLinks,
    };
  }

  async create(data: Record<string, any>, user: NonNullable<Request['user']>) {
    if (user.organizationType !== OrganizationType.SUPPLIER) {
      throw new AppError('Only supplier organizations can submit claims', 403, 'FORBIDDEN');
    }
    const supplier = await assertOwnSupplier(data.supplierId, user.organizationId);
    if (data.productId && !await ProductModel.findOne({ _id: data.productId, supplierId: supplier._id })) {
      throw new AppError('Product does not belong to this supplier', 404, 'NOT_FOUND');
    }
    if (data.facilityId && !await FacilityModel.findOne({ _id: data.facilityId, supplierId: supplier._id })) {
      throw new AppError('Facility does not belong to this supplier', 404, 'NOT_FOUND');
    }
    if (data.dataRequestId && !await DataRequestModel.findOne({
      _id: data.dataRequestId,
      supplierOrganizationId: user.organizationId,
    })) {
      throw new AppError('Data Request does not belong to this supplier', 404, 'NOT_FOUND');
    }
    const numericValue = typeof data.value === 'number'
      ? data.value
      : /^\s*-?\d+(?:\.\d+)?\s*$/.test(data.value) ? Number(data.value) : undefined;
    const normalizedData = numericValue === undefined || !data.unit ? undefined : normalizeCarbonData({
      value: numericValue,
      unit: data.unit,
      functionalUnit: data.functionalUnit,
      boundary: data.boundary,
      reportingPeriod: data.reportingPeriod,
    });
    return ClaimModel.create({
      ...data,
      claimText: data.claimText || `${data.type}: ${data.value}${data.unit ? ` ${data.unit}` : ''}`,
      normalizedData,
      status: ClaimStatus.PENDING,
      confidence: undefined,
    });
  }

  async update(id: string, data: Record<string, any>, user: NonNullable<Request['user']>) {
    if (user.organizationType !== OrganizationType.SUPPLIER) {
      throw new AppError('Only the submitting supplier can update a claim', 403, 'FORBIDDEN');
    }
    const claim = await getAccessibleClaim(id, user);
    const parsed = updateClaimSchema.safeParse(data);
    if (!parsed.success) throw new AppError('Claim update is invalid', 400, 'VALIDATION_ERROR');
    const update = parsed.data;
    const value = update.value ?? claim.value;
    const unit = update.unit ?? claim.unit;
    const numericValue = typeof value === 'number'
      ? value
      : /^\s*-?\d+(?:\.\d+)?\s*$/.test(String(value)) ? Number(value) : undefined;
    const normalizedData = numericValue === undefined || !unit ? undefined : normalizeCarbonData({
      value: numericValue,
      unit,
      functionalUnit: update.functionalUnit ?? claim.normalizedData?.functionalUnit,
      boundary: update.boundary ?? claim.boundary,
      reportingPeriod: update.reportingPeriod ?? claim.reportingPeriod,
    });
    return ClaimModel.findByIdAndUpdate(id, {
      ...update,
      normalizedData: normalizedData ?? null,
      status: ClaimStatus.PENDING,
    }, { new: true, runValidators: true });
  }
}

export const claimService = new ClaimService();

export class ClaimController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const claims = await claimService.getAll(req.user!);
      return sendSuccess(res, claims);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const claim = await claimService.getById(req.params.id as string, req.user!);
      return sendSuccess(res, claim);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const claim = await claimService.create(req.body, req.user!);
      return sendSuccess(res, claim, 201);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const claim = await claimService.update(req.params.id as string, req.body, req.user!);
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
claimRoutes.post('/', requireOrganizationType(OrganizationType.SUPPLIER), validate(createClaimSchema), (req, res, next) =>
  claimController.create(req, res, next)
);
claimRoutes.put('/:id', requireOrganizationType(OrganizationType.SUPPLIER), validate(updateClaimSchema), (req, res, next) => claimController.update(req, res, next));
