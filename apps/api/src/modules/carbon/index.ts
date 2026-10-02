import { Router, Request, Response, NextFunction } from 'express';
import { CarbonCalculationModel } from '../../models/CarbonCalculation';
import { CarbonFactorModel } from '../../models/CarbonFactor';
import { PurchaseModel } from '../../models/Purchase';
import { ClaimModel } from '../../models/Claim';
import { sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createCarbonFactorSchema, calculateCarbonSchema } from '@carbonpilot/validation';
import { ClaimStatus } from '@carbonpilot/shared';

export class CarbonService {
  async getCalculations(customerOrgId?: string) {
    const filter = customerOrgId ? { customerOrganizationId: customerOrgId } : {};
    return CarbonCalculationModel.find(filter)
      .populate('purchaseId')
      .populate('productId')
      .populate('claimId');
  }

  async getFactors(category?: string) {
    const filter = category ? { category } : {};
    return CarbonFactorModel.find(filter);
  }

  async createFactor(data: Record<string, any>) {
    return CarbonFactorModel.create(data);
  }

  async calculatePurchaseEmissions(params: {
    purchaseId: string;
    carbonFactorId?: string;
    customFactor?: number;
    customerOrgId: string;
  }) {
    const purchase = await PurchaseModel.findById(params.purchaseId).populate('productId');
    if (!purchase) {
      throw new Error('Purchase not found');
    }

    // Check if supplier has a verified Claim for this product first (Supplier-specific PCF)
    const verifiedClaim = await ClaimModel.findOne({
      productId: purchase.productId,
      status: ClaimStatus.SUPPORTED,
    });

    let factorValue = 1.0;
    let factorUnit = 'kgCO2e/kg';
    let factorSource = 'Default Benchmark';
    let methodology = 'GHG Protocol';
    let evidenceStatus: ClaimStatus = ClaimStatus.PENDING;
    let claimId: string | undefined;

    if (verifiedClaim) {
      factorValue = Number(verifiedClaim.value) || 1.0;
      factorUnit = verifiedClaim.unit;
      factorSource = `Supplier Claim (${verifiedClaim.reportingPeriod})`;
      methodology = verifiedClaim.methodology;
      evidenceStatus = ClaimStatus.SUPPORTED;
      claimId = verifiedClaim._id.toString();
    } else if (params.carbonFactorId) {
      const factor = await CarbonFactorModel.findById(params.carbonFactorId);
      if (factor) {
        factorValue = factor.value;
        factorUnit = factor.unit;
        factorSource = factor.source;
        methodology = factor.methodology;
        evidenceStatus = ClaimStatus.PARTIALLY_SUPPORTED;
      }
    } else if (params.customFactor) {
      factorValue = params.customFactor;
      factorSource = 'Manual Input Factor';
    }

    const totalEmissions = purchase.quantity * factorValue;

    const calculation = await CarbonCalculationModel.create({
      customerOrganizationId: params.customerOrgId,
      supplierOrganizationId: purchase.supplierOrganizationId,
      purchaseId: purchase._id,
      productId: purchase.productId,
      quantity: purchase.quantity,
      quantityUnit: purchase.unit,
      carbonFactor: factorValue,
      carbonFactorUnit: factorUnit,
      factorSource,
      methodology,
      totalEmissions,
      emissionsUnit: 'kgCO2e',
      evidenceStatus,
      claimId,
      calculatedAt: new Date(),
    });

    purchase.carbonCalculationId = calculation._id.toString();
    await purchase.save();

    return calculation;
  }
}

export const carbonService = new CarbonService();

export class CarbonController {
  async getCalculations(req: Request, res: Response, next: NextFunction) {
    try {
      const calculations = await carbonService.getCalculations(req.user?.organizationId);
      return sendSuccess(res, calculations);
    } catch (error) {
      next(error);
    }
  }

  async getFactors(req: Request, res: Response, next: NextFunction) {
    try {
      const factors = await carbonService.getFactors(req.query.category as string);
      return sendSuccess(res, factors);
    } catch (error) {
      next(error);
    }
  }

  async createFactor(req: Request, res: Response, next: NextFunction) {
    try {
      const factor = await carbonService.createFactor(req.body);
      return sendSuccess(res, factor, 201);
    } catch (error) {
      next(error);
    }
  }

  async calculate(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const calculation = await carbonService.calculatePurchaseEmissions({
        purchaseId: req.body.purchaseId,
        carbonFactorId: req.body.carbonFactorId,
        customFactor: req.body.customFactor,
        customerOrgId: req.user.organizationId,
      });
      return sendSuccess(res, calculation, 201);
    } catch (error) {
      next(error);
    }
  }
}

export const carbonController = new CarbonController();

export const carbonRoutes = Router();
carbonRoutes.use(authenticate);

// Calculations
carbonRoutes.get('/calculations', (req, res, next) =>
  carbonController.getCalculations(req, res, next)
);
carbonRoutes.post('/calculate', validate(calculateCarbonSchema), (req, res, next) =>
  carbonController.calculate(req, res, next)
);

// Emission Factors
carbonRoutes.get('/factors', (req, res, next) => carbonController.getFactors(req, res, next));
carbonRoutes.post('/factors', validate(createCarbonFactorSchema), (req, res, next) =>
  carbonController.createFactor(req, res, next)
);
