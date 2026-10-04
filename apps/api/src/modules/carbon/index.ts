import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { CarbonCalculationModel } from '../../models/CarbonCalculation';
import { CarbonFactorModel } from '../../models/CarbonFactor';
import { PurchaseModel } from '../../models/Purchase';
import { ClaimModel } from '../../models/Claim';
import { ProductModel } from '../../models/Product';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { AppError, sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createCarbonFactorSchema, calculateCarbonSchema, compareCarbonSchema } from '@carbonpilot/validation';
import {
  ClaimStatus,
  OrganizationType,
  CarbonCalculationStatus,
  SupplierStatus,
  QuestionnaireCategory,
  QuestionResponseStatus,
  CertificateStatus,
} from '@carbonpilot/shared';
import { areComparablePcfValues, canApplyCarbonIntensity, normalizeCarbonData } from '../verification/normalization';
import { DataRequestModel } from '../../models/DataRequest';
import { QuestionResponseModel } from '../../models/QuestionResponse';
import { CertificateModel } from '../../models/Certificate';
import { OrganizationModel } from '../../models/Organization';

function normalizeText(value?: string) {
  return value?.trim().toLowerCase().replace(/\s+/g, '') || '';
}

export function calculateExpectedActualTracking(params: {
  expectedQuantity?: number;
  expectedCarbonIntensity?: number;
  expectedCarbonIntensityUnit?: string;
  expectedFunctionalUnit?: string;
  expectedBoundary?: string;
  expectedReportingPeriod?: string;
  actualQuantity?: number;
  actualCarbonIntensity?: number;
  actualCarbonIntensityUnit?: string;
  actualFunctionalUnit?: string;
  actualBoundary?: string;
  actualReportingPeriod?: string;
}) {
  const expectedQuantity = Number.isFinite(params.expectedQuantity) ? Number(params.expectedQuantity) : undefined;
  const expectedIntensity = Number.isFinite(params.expectedCarbonIntensity) ? Number(params.expectedCarbonIntensity) : undefined;
  const actualQuantity = Number.isFinite(params.actualQuantity) ? Number(params.actualQuantity) : undefined;
  const actualIntensity = Number.isFinite(params.actualCarbonIntensity) ? Number(params.actualCarbonIntensity) : undefined;
  const expectedEmissions = expectedQuantity !== undefined && expectedIntensity !== undefined
    ? Number((expectedQuantity * expectedIntensity).toFixed(6))
    : undefined;
  const actualEmissions = actualQuantity !== undefined && actualIntensity !== undefined
    ? Number((actualQuantity * actualIntensity).toFixed(6))
    : undefined;

  const hasExpected = expectedEmissions !== undefined;
  const hasActual = actualEmissions !== undefined;

  if (!hasExpected && !hasActual) {
    return {
      status: 'NOT_AVAILABLE',
      expectedEmissions: undefined,
      actualEmissions: undefined,
      variance: undefined,
      variancePercent: undefined,
      comparisonReason: 'No expected or actual carbon data is available.',
      sourceOfVariance: 'NONE',
      expected: { quantity: expectedQuantity, carbonIntensity: expectedIntensity, carbonIntensityUnit: params.expectedCarbonIntensityUnit, functionalUnit: params.expectedFunctionalUnit, boundary: params.expectedBoundary, reportingPeriod: params.expectedReportingPeriod },
      actual: { quantity: actualQuantity, carbonIntensity: actualIntensity, carbonIntensityUnit: params.actualCarbonIntensityUnit, functionalUnit: params.actualFunctionalUnit, boundary: params.actualBoundary, reportingPeriod: params.actualReportingPeriod },
    };
  }

  if (hasExpected && !hasActual) {
    return {
      status: 'EXPECTED_ONLY',
      expectedEmissions,
      actualEmissions: undefined,
      variance: undefined,
      variancePercent: undefined,
      comparisonReason: 'Actual carbon data is not available for this purchase.',
      sourceOfVariance: 'NONE',
      expected: { quantity: expectedQuantity, carbonIntensity: expectedIntensity, carbonIntensityUnit: params.expectedCarbonIntensityUnit, functionalUnit: params.expectedFunctionalUnit, boundary: params.expectedBoundary, reportingPeriod: params.expectedReportingPeriod },
      actual: { quantity: actualQuantity, carbonIntensity: actualIntensity, carbonIntensityUnit: params.actualCarbonIntensityUnit, functionalUnit: params.actualFunctionalUnit, boundary: params.actualBoundary, reportingPeriod: params.actualReportingPeriod },
    };
  }

  if (!hasExpected && hasActual) {
    return {
      status: 'ACTUAL_ONLY',
      expectedEmissions: undefined,
      actualEmissions,
      variance: undefined,
      variancePercent: undefined,
      comparisonReason: 'Expected carbon baseline is unavailable for this purchase.',
      sourceOfVariance: 'NONE',
      expected: { quantity: expectedQuantity, carbonIntensity: expectedIntensity, carbonIntensityUnit: params.expectedCarbonIntensityUnit, functionalUnit: params.expectedFunctionalUnit, boundary: params.expectedBoundary, reportingPeriod: params.expectedReportingPeriod },
      actual: { quantity: actualQuantity, carbonIntensity: actualIntensity, carbonIntensityUnit: params.actualCarbonIntensityUnit, functionalUnit: params.actualFunctionalUnit, boundary: params.actualBoundary, reportingPeriod: params.actualReportingPeriod },
    };
  }

  const comparable = areComparablePcfValues(
    {
      unit: params.expectedCarbonIntensityUnit || 'kgCO2e/kg',
      functionalUnit: params.expectedFunctionalUnit,
      boundary: params.expectedBoundary,
      reportingPeriod: params.expectedReportingPeriod,
    },
    {
      unit: params.actualCarbonIntensityUnit || 'kgCO2e/kg',
      functionalUnit: params.actualFunctionalUnit,
      boundary: params.actualBoundary,
      reportingPeriod: params.actualReportingPeriod,
    }
  );

  if (!comparable) {
    const reasons: string[] = [];
    if (normalizeText(params.expectedBoundary) !== normalizeText(params.actualBoundary)) reasons.push('Expected and actual carbon data use different lifecycle boundaries.');
    if (normalizeText(params.expectedFunctionalUnit) !== normalizeText(params.actualFunctionalUnit)) reasons.push('Expected and actual carbon data use different functional units.');
    if (normalizeText(params.expectedReportingPeriod) !== normalizeText(params.actualReportingPeriod)) reasons.push('Expected and actual carbon data use different reporting periods.');
    if (!params.expectedCarbonIntensityUnit || !params.actualCarbonIntensityUnit || normalizeText(params.expectedCarbonIntensityUnit) !== normalizeText(params.actualCarbonIntensityUnit)) reasons.push('Expected and actual carbon intensity units are not compatible.');
    return {
      status: 'NOT_COMPARABLE',
      expectedEmissions,
      actualEmissions,
      variance: undefined,
      variancePercent: undefined,
      comparisonReason: reasons[0] || 'Carbon data is not comparable for this purchase.',
      sourceOfVariance: 'NONE',
      expected: { quantity: expectedQuantity, carbonIntensity: expectedIntensity, carbonIntensityUnit: params.expectedCarbonIntensityUnit, functionalUnit: params.expectedFunctionalUnit, boundary: params.expectedBoundary, reportingPeriod: params.expectedReportingPeriod },
      actual: { quantity: actualQuantity, carbonIntensity: actualIntensity, carbonIntensityUnit: params.actualCarbonIntensityUnit, functionalUnit: params.actualFunctionalUnit, boundary: params.actualBoundary, reportingPeriod: params.actualReportingPeriod },
    };
  }

  const variance = Number((actualEmissions! - expectedEmissions!).toFixed(6));
  const variancePercent = expectedEmissions !== undefined && expectedEmissions !== 0
    ? Number(((variance / expectedEmissions) * 100).toFixed(4))
    : 0;
  const quantityVariance = expectedQuantity !== undefined && actualQuantity !== undefined && expectedQuantity !== actualQuantity;
  const intensityVariance = expectedIntensity !== undefined && actualIntensity !== undefined && expectedIntensity !== actualIntensity;
  const sourceOfVariance = quantityVariance && intensityVariance ? 'BOTH' : quantityVariance ? 'QUANTITY' : intensityVariance ? 'CARBON_INTENSITY' : 'NONE';

  return {
    status: 'COMPLETE',
    expectedEmissions,
    actualEmissions,
    variance,
    variancePercent,
    comparisonReason: 'Expected and actual carbon emissions are directly comparable.',
    sourceOfVariance,
    expected: { quantity: expectedQuantity, carbonIntensity: expectedIntensity, carbonIntensityUnit: params.expectedCarbonIntensityUnit, functionalUnit: params.expectedFunctionalUnit, boundary: params.expectedBoundary, reportingPeriod: params.expectedReportingPeriod },
    actual: { quantity: actualQuantity, carbonIntensity: actualIntensity, carbonIntensityUnit: params.actualCarbonIntensityUnit, functionalUnit: params.actualFunctionalUnit, boundary: params.actualBoundary, reportingPeriod: params.actualReportingPeriod },
  };
}

export class CarbonService {
  private mapClaimStatusToQuality(status?: ClaimStatus | null) {
    switch (status) {
      case ClaimStatus.SUPPORTED:
        return 'SUPPORTED';
      case ClaimStatus.CORROBORATED:
        return 'CORROBORATED';
      case ClaimStatus.PARTIALLY_SUPPORTED:
        return 'INTERNALLY_CONSISTENT';
      case ClaimStatus.INCONSISTENT:
        return 'INCONSISTENT';
      case ClaimStatus.UNSUPPORTED:
      case ClaimStatus.NEEDS_REVIEW:
        return 'UNSUPPORTED';
      default:
        return 'NOT_AVAILABLE';
    }
  }

  private formatQuestionnaireCategory(category?: string) {
    const labelMap: Record<string, string> = {
      [QuestionnaireCategory.CARBON]: 'Carbon',
      [QuestionnaireCategory.ENERGY]: 'Energy',
      [QuestionnaireCategory.MATERIAL]: 'Materials',
      [QuestionnaireCategory.WASTE]: 'Waste',
      [QuestionnaireCategory.WATER]: 'Water',
      [QuestionnaireCategory.CERTIFICATION]: 'Certifications',
      [QuestionnaireCategory.SUPPLY_CHAIN]: 'Supply Chain',
      [QuestionnaireCategory.GENERAL_SUSTAINABILITY]: 'General Sustainability',
      [QuestionnaireCategory.PRODUCT]: 'Product',
      [QuestionnaireCategory.RENEWABLE_ENERGY]: 'Renewable Energy',
    };
    return labelMap[category || ''] || (category || 'General Sustainability').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private buildQuestionnaireSummary(requestItems: Array<{ category?: string; required?: boolean; _id?: unknown; requestId?: string }>, submittedKeys: Set<string>, certificates: Array<{ status?: string; expiryDate?: Date | string }>) {
    const categories = Object.values(QuestionnaireCategory);
    const expiredCertificates = certificates.filter((certificate) => {
      const status = certificate.status || CertificateStatus.PENDING;
      if (status === CertificateStatus.EXPIRED) return true;
      if (status === CertificateStatus.INVALID || status === CertificateStatus.EXPIRING_SOON) return true;
      if (certificate.expiryDate) {
        const expiryDate = new Date(certificate.expiryDate);
        if (!Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() < Date.now()) {
          return true;
        }
      }
      return false;
    }).length;

    return categories.map((category) => {
      const categoryItems = requestItems.filter((item) => (item.category || QuestionnaireCategory.GENERAL_SUSTAINABILITY) === category);
      if (!categoryItems.length) {
        return { category: this.formatQuestionnaireCategory(category), status: 'NOT_REQUESTED', missingRequiredResponses: 0, submitted: 0, total: 0 };
      }

      const submitted = categoryItems.filter((item) => submittedKeys.has(`${item.requestId}:${item._id?.toString() || ''}`)).length;
      const missingRequired = categoryItems.filter((item) => item.required && !submittedKeys.has(`${item.requestId}:${item._id?.toString() || ''}`)).length;

      if (category === QuestionnaireCategory.CERTIFICATION) {
        if (expiredCertificates > 0) {
          return { category: this.formatQuestionnaireCategory(category), status: 'EXPIRED_CERTIFICATE', missingRequiredResponses: missingRequired, submitted, total: categoryItems.length };
        }
      }

      if (missingRequired > 0) {
        return { category: this.formatQuestionnaireCategory(category), status: 'MISSING_REQUIRED_RESPONSE', missingRequiredResponses: missingRequired, submitted, total: categoryItems.length };
      }

      return { category: this.formatQuestionnaireCategory(category), status: 'COMPLETE', missingRequiredResponses: 0, submitted, total: categoryItems.length };
    });
  }

  async getCalculations(user?: Request['user']) {
    if (!user) return [];
    const filter = user.organizationType === OrganizationType.SUPPLIER
      ? { supplierOrganizationId: await this.getSupplierOrganizationId(user.organizationId) }
      : { customerOrganizationId: user.organizationId };
    return CarbonCalculationModel.find(filter)
      .populate('purchaseId')
      .populate('productId')
      .populate('claimId')
      .sort({ calculatedAt: -1 });
  }

  async getCalculationById(id: string, user: NonNullable<Request['user']>) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Calculation not found', 404, 'NOT_FOUND');
    const calculation = await CarbonCalculationModel.findById(id).populate('purchaseId').populate('productId').populate('claimId');
    if (!calculation) throw new AppError('Calculation not found', 404, 'NOT_FOUND');
    if (user.organizationType === OrganizationType.SUPPLIER) {
      const mySupplier = await SupplierModel.findOne({ organizationId: user.organizationId });
      if (!mySupplier || calculation.supplierOrganizationId.toString() !== mySupplier.organizationId.toString()) {
        throw new AppError('You cannot access this carbon calculation', 403, 'FORBIDDEN');
      }
      return calculation;
    }
    if (calculation.customerOrganizationId.toString() !== user.organizationId) {
      throw new AppError('You cannot access this carbon calculation', 403, 'FORBIDDEN');
    }
    return calculation;
  }

  async getFactors(category?: string) {
    const filter = category ? { category } : {};
    return CarbonFactorModel.find(filter);
  }

  async createFactor(data: Record<string, any>) {
    return CarbonFactorModel.create(data);
  }

  private async getSupplierOrganizationId(organizationId: string) {
    const supplier = await SupplierModel.findOne({ organizationId });
    if (!supplier) throw new AppError('Supplier profile not found', 404, 'NOT_FOUND');
    return supplier.organizationId.toString();
  }

  private async resolveRelevantClaim(productId: string, supplierId?: string, claimId?: string) {
    if (claimId && mongoose.isValidObjectId(claimId)) {
      const claim = await ClaimModel.findById(claimId);
      if (claim) return claim;
    }

    const filter: Record<string, unknown> = { productId };
    if (supplierId) filter.supplierId = supplierId;
    const claim = await ClaimModel.findOne({
      ...filter,
      status: { $in: [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED, ClaimStatus.PARTIALLY_SUPPORTED] },
    }).sort({ createdAt: -1 });
    return claim || null;
  }

  async calculatePurchaseEmissions(params: {
    purchaseId: string;
    carbonFactorId?: string;
    customFactor?: number;
    claimId?: string;
    customerOrgId: string;
  }) {
    const purchase = await PurchaseModel.findById(params.purchaseId).populate('productId');
    if (!purchase) {
      throw new AppError('Purchase not found', 404, 'NOT_FOUND');
    }

    const product = await ProductModel.findById(purchase.productId);
    if (!product) {
      throw new AppError('Purchase product not found', 404, 'NOT_FOUND');
    }

    const claim = await this.resolveRelevantClaim(product._id.toString(), purchase.supplierId?.toString(), params.claimId);
    const candidateFactor = params.customFactor ?? (product.carbonData?.pcf ?? undefined);
    const candidateUnit = product.carbonData?.unit ?? claim?.unit ?? 'kgCO2e/kg';

    let factorValue = Number(candidateFactor ?? claim?.value ?? 0);
    let factorUnit = claim?.unit || candidateUnit || 'kgCO2e/kg';
    let factorSource = claim ? `Supplier Claim (${claim.reportingPeriod || 'reporting period not provided'})` : 'Manual Input Factor';
    let methodology = claim?.methodology || product.carbonData?.methodology || 'GHG Protocol';
    let evidenceStatus: ClaimStatus = claim?.status || ClaimStatus.PENDING;
    let claimId = claim?._id?.toString();
    let reason: string | undefined;
    let status: CarbonCalculationStatus = CarbonCalculationStatus.CALCULATED;
    let totalEmissions = 0;

    if (params.carbonFactorId) {
      const factor = await CarbonFactorModel.findById(params.carbonFactorId);
      if (factor) {
        factorValue = Number(factor.value);
        factorUnit = factor.unit;
        factorSource = factor.source;
        methodology = factor.methodology;
        evidenceStatus = ClaimStatus.PARTIALLY_SUPPORTED;
      }
    }

    if (claim && [ClaimStatus.UNSUPPORTED, ClaimStatus.NEEDS_REVIEW, ClaimStatus.INCONSISTENT].includes(claim.status)) {
      status = CarbonCalculationStatus.BLOCKED;
      reason = 'Cannot calculate procurement emissions. Carbon claim is unsupported or inconsistent.';
    } else if (!claim && !params.customFactor && !params.carbonFactorId && !product.carbonData?.pcf) {
      status = CarbonCalculationStatus.BLOCKED;
      reason = 'Cannot calculate procurement emissions. No compatible carbon intensity is available for this purchase.';
    }

    if (status !== CarbonCalculationStatus.BLOCKED && !canApplyCarbonIntensity(purchase.unit, factorUnit)) {
      status = CarbonCalculationStatus.BLOCKED;
      reason = 'Cannot calculate procurement emissions. Supplier submitted PCF value but the declared functional unit is not compatible with the purchased quantity.';
    }

    if (status === CarbonCalculationStatus.BLOCKED) {
      return CarbonCalculationModel.create({
        customerOrganizationId: params.customerOrgId,
        buyerOrganizationId: params.customerOrgId,
        supplierOrganizationId: purchase.supplierOrganizationId,
        supplierId: purchase.supplierId,
        purchaseId: purchase._id,
        productId: purchase.productId,
        quantity: purchase.quantity,
        inputQuantity: purchase.quantity,
        quantityUnit: purchase.unit,
        inputUnit: purchase.unit,
        carbonFactor: Number(factorValue) || 0,
        carbonFactorUnit: factorUnit,
        normalizedCarbonIntensity: Number(factorValue) || 0,
        normalizedUnit: factorUnit,
        functionalUnit: claim?.normalizedData?.functionalUnit || product.unit,
        lifecycleBoundary: claim?.normalizedData?.boundary || product.carbonData?.boundary || 'UNKNOWN',
        reportingPeriod: claim?.normalizedData?.reportingPeriod || product.carbonData?.reportingPeriod || purchase.reportingPeriod,
        factorSource,
        methodology,
        totalEmissions: 0,
        calculatedEmissions: 0,
        emissionsUnit: 'kgCO2e',
        status,
        evidenceStatus,
        claimId,
        reason,
        calculationVersion: 1,
        calculatedAt: new Date(),
      });
    }

    const normalized = normalizeCarbonData({
      value: Number(factorValue),
      unit: factorUnit,
      functionalUnit: claim?.normalizedData?.functionalUnit || product.unit,
      boundary: claim?.normalizedData?.boundary || product.carbonData?.boundary || 'UNKNOWN',
      reportingPeriod: claim?.normalizedData?.reportingPeriod || product.carbonData?.reportingPeriod || purchase.reportingPeriod,
    });

    const normalizedValue = (normalized?.normalizedValue ?? Number(factorValue)) || 1;
    totalEmissions = Number((purchase.quantity * normalizedValue).toFixed(6));

    const calculation = await CarbonCalculationModel.create({
      customerOrganizationId: params.customerOrgId,
      buyerOrganizationId: params.customerOrgId,
      supplierOrganizationId: purchase.supplierOrganizationId,
      supplierId: purchase.supplierId,
      purchaseId: purchase._id,
      productId: purchase.productId,
      quantity: purchase.quantity,
      inputQuantity: purchase.quantity,
      quantityUnit: purchase.unit,
      inputUnit: purchase.unit,
      carbonFactor: Number(factorValue),
      carbonFactorUnit: factorUnit,
      normalizedCarbonIntensity: normalized?.normalizedValue ?? Number(factorValue),
      normalizedUnit: normalized?.normalizedUnit ?? factorUnit,
      functionalUnit: normalized?.functionalUnit || claim?.normalizedData?.functionalUnit || product.unit,
      lifecycleBoundary: normalized?.boundary || claim?.normalizedData?.boundary || product.carbonData?.boundary || 'UNKNOWN',
      reportingPeriod: normalized?.reportingPeriod || claim?.normalizedData?.reportingPeriod || product.carbonData?.reportingPeriod || purchase.reportingPeriod,
      factorSource,
      methodology,
      totalEmissions,
      calculatedEmissions: totalEmissions,
      emissionsUnit: 'kgCO2e',
      status,
      evidenceStatus,
      claimId,
      calculationVersion: 1,
      calculatedAt: new Date(),
    });

    purchase.carbonCalculationId = calculation._id.toString();
    await purchase.save();

    return calculation;
  }

  async getPurchaseCarbonView(purchaseId: string, user: NonNullable<Request['user']>) {
    if (!mongoose.isValidObjectId(purchaseId)) throw new AppError('Purchase not found', 404, 'NOT_FOUND');
    const purchase = await PurchaseModel.findById(purchaseId);
    if (!purchase) throw new AppError('Purchase not found', 404, 'NOT_FOUND');

    if (user.organizationType === OrganizationType.SUPPLIER) {
      const supplier = await SupplierModel.findOne({ organizationId: user.organizationId });
      if (!supplier || supplier._id.toString() !== purchase.supplierId.toString()) {
        throw new AppError('You cannot access this purchase', 403, 'FORBIDDEN');
      }
    } else if (purchase.customerOrganizationId.toString() !== user.organizationId) {
      throw new AppError('You cannot access this purchase', 403, 'FORBIDDEN');
    }

    const calculations = await CarbonCalculationModel.find({ purchaseId }).sort({ calculatedAt: -1 });
    return { purchase, calculations };
  }

  async getProductCarbonProfile(productId: string, user: NonNullable<Request['user']>) {
    if (!mongoose.isValidObjectId(productId)) throw new AppError('Product not found', 404, 'NOT_FOUND');
    const product = await ProductModel.findById(productId);
    if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');

    const supplier = await SupplierModel.findById(product.supplierId);
    if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');

    if (user.organizationType === OrganizationType.SUPPLIER) {
      if (supplier.organizationId.toString() !== user.organizationId) {
        throw new AppError('You cannot access this product carbon profile', 403, 'FORBIDDEN');
      }
    } else {
      const relationship = await SupplierRelationshipModel.findOne({
        customerOrganizationId: user.organizationId,
        supplierOrganizationId: supplier.organizationId,
        status: { $ne: SupplierStatus.TERMINATED },
      });
      if (!relationship) throw new AppError('You cannot access this product carbon profile', 403, 'FORBIDDEN');
    }

    const claims = await ClaimModel.find({ productId }).sort({ createdAt: -1 });
    return {
      product,
      supplier,
      latestClaim: claims[0] || null,
      claims,
    };
  }

  async getSupplierCarbonProfile(supplierId: string, user: NonNullable<Request['user']>) {
    if (!mongoose.isValidObjectId(supplierId)) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');

    if (user.organizationType === OrganizationType.SUPPLIER) {
      if (supplier.organizationId.toString() !== user.organizationId) {
        throw new AppError('You cannot access this supplier carbon profile', 403, 'FORBIDDEN');
      }
    } else {
      const relationship = await SupplierRelationshipModel.findOne({
        customerOrganizationId: user.organizationId,
        supplierOrganizationId: supplier.organizationId,
        status: { $ne: SupplierStatus.TERMINATED },
      });
      if (!relationship) throw new AppError('You cannot access this supplier carbon profile', 403, 'FORBIDDEN');
    }

    const [products, claims, certificates, dataRequests, questionResponses, organization] = await Promise.all([
      ProductModel.find({ supplierId: supplier._id }).sort({ name: 1 }),
      ClaimModel.find({ supplierId: supplier._id }).sort({ createdAt: -1 }),
      CertificateModel.find({ supplierId: supplier._id }).sort({ expiryDate: 1 }),
      DataRequestModel.find({ supplierOrganizationId: supplier.organizationId }).sort({ createdAt: -1 }),
      QuestionResponseModel.find({ supplierId: supplier._id }).sort({ submittedAt: -1 }),
      OrganizationModel.findById(supplier.organizationId),
    ]);

    const productIds = products.map((product) => product._id);
    const validClaims = claims.filter((claim): claim is typeof claim & { productId: string } => !!claim.productId && productIds.some((id) => id.toString() === claim.productId!.toString()));
    const reportedCarbonIntensityValues = validClaims
      .map((claim) => Number(claim.value))
      .filter((value) => Number.isFinite(value));
    const reportingPeriods = [...new Set(validClaims.map((claim) => claim.normalizedData?.reportingPeriod || claim.reportingPeriod).filter(Boolean))];
    const lifecycleBoundaries = [...new Set(validClaims.map((claim) => claim.normalizedData?.boundary || claim.boundary).filter(Boolean))];
    const functionalUnits = [...new Set(validClaims.map((claim) => claim.normalizedData?.functionalUnit || claim.unit).filter(Boolean))];

    const productSummary = products.map((product) => {
      const relevantClaims = claims.filter((claim) => claim.productId?.toString() === product._id.toString());
      const latestClaim = relevantClaims[0] || null;
      const carbonIntensity = latestClaim ? Number(latestClaim.value) : product.carbonData?.pcf ?? null;
      const evidenceStatus = latestClaim ? latestClaim.status : 'NOT_AVAILABLE';
      const corroborationStatus = latestClaim?.status === ClaimStatus.CORROBORATED ? 'Corroborated' : latestClaim ? 'Not available' : 'Not available';
      const dataQualityStatus = latestClaim ? this.mapClaimStatusToQuality(latestClaim.status) : 'NOT_AVAILABLE';
      return {
        product: product.name,
        unit: latestClaim?.unit || product.carbonData?.unit || product.unit,
        carbonIntensity: carbonIntensity ?? null,
        functionalUnit: latestClaim?.normalizedData?.functionalUnit || product.unit,
        lifecycleBoundary: latestClaim?.normalizedData?.boundary || product.carbonData?.boundary || 'UNKNOWN',
        reportingPeriod: latestClaim?.normalizedData?.reportingPeriod || product.carbonData?.reportingPeriod || latestClaim?.reportingPeriod || 'UNKNOWN',
        evidenceStatus,
        corroborationStatus,
        dataQualityStatus,
      };
    });

    const requestItems = dataRequests.flatMap((request) => (request.requestedItems || []).map((item) => ({
      _id: item._id?.toString() || item.key,
      requestId: request._id.toString(),
      category: item.category || QuestionnaireCategory.GENERAL_SUSTAINABILITY,
      required: !!item.required,
    })));
    const submittedKeys = new Set(
      questionResponses
        .filter((response) => response.status && [QuestionResponseStatus.SUBMITTED, QuestionResponseStatus.ACCEPTED].includes(response.status as QuestionResponseStatus))
        .map((response) => `${response.dataRequestId.toString()}:${response.requestedItemId.toString()}`)
    );

    const requested = requestItems.length;
    const completed = requestItems.filter((item) => submittedKeys.has(`${item.requestId}:${item._id}`)).length;
    const missing = Math.max(0, requested - completed);
    const requiredMissing = requestItems.filter((item) => item.required && !submittedKeys.has(`${item.requestId}:${item._id}`)).length;
    const optionalMissing = requestItems.filter((item) => !item.required && !submittedKeys.has(`${item.requestId}:${item._id}`)).length;
    const completeness = requested ? Math.round((completed / requested) * 100) : 0;

    const questionnaireSummary = this.buildQuestionnaireSummary(requestItems, submittedKeys, certificates);

    const certificateSummary = certificates.map((certificate) => {
      const expiryDate = certificate.expiryDate ? new Date(certificate.expiryDate) : null;
      const isExpired = certificate.status === CertificateStatus.EXPIRED || (expiryDate && expiryDate.getTime() < Date.now());
      const status = certificate.status === CertificateStatus.PENDING ? 'NOT_VERIFIED' : certificate.status;
      return {
        certificate: certificate.type,
        issuer: certificate.issuingBody,
        certificateNumber: certificate.certificateNumber,
        issueDate: certificate.issueDate,
        expiryDate: certificate.expiryDate,
        status: isExpired ? 'EXPIRED' : status,
        scope: certificate.scope,
      };
    });

    const certificatesSummary = certificateSummary;

    const validCertificates = certificates.filter((certificate) => certificate.status === CertificateStatus.VALID).length;
    const expiredCertificates = certificates.filter((certificate) => certificate.status === CertificateStatus.EXPIRED || (certificate.expiryDate && new Date(certificate.expiryDate).getTime() < Date.now())).length;
    const certificatesRequiringReview = certificates.filter((certificate) => [CertificateStatus.INVALID, CertificateStatus.EXPIRING_SOON, CertificateStatus.PENDING].includes(certificate.status as CertificateStatus)).length;

    const metrics = {
      totalPurchasedQuantity: 0,
      totalCalculatedProcurementEmissions: 0,
      totalProductsWithCarbonData: products.filter((product) => !!product.carbonData).length,
      numberOfProductsWithCarbonData: products.filter((product) => !!product.carbonData).length,
      productsWithMissingCarbonData: products.filter((product) => !product.carbonData).length,
      supportedClaims: claims.filter((claim) => claim.status === ClaimStatus.SUPPORTED).length,
      unsupportedClaims: claims.filter((claim) => claim.status === ClaimStatus.UNSUPPORTED || claim.status === ClaimStatus.NEEDS_REVIEW).length,
      inconsistentClaims: claims.filter((claim) => claim.status === ClaimStatus.INCONSISTENT).length,
      corroboratedClaims: claims.filter((claim) => claim.status === ClaimStatus.CORROBORATED).length,
      productsWithoutCarbonData: products.filter((product) => !product.carbonData).length,
      missingEvidence: claims.filter((claim) => claim.status === ClaimStatus.UNSUPPORTED || claim.status === ClaimStatus.NEEDS_REVIEW || claim.status === ClaimStatus.PENDING).length,
      internallyConsistentClaims: claims.filter((claim) => claim.status === ClaimStatus.SUPPORTED || claim.status === ClaimStatus.CORROBORATED).length,
    };

    const dataQuality = {
      SUPPORTED: claims.filter((claim) => claim.status === ClaimStatus.SUPPORTED).length,
      CORROBORATED: claims.filter((claim) => claim.status === ClaimStatus.CORROBORATED).length,
      INTERNALLY_CONSISTENT: claims.filter((claim) => claim.status === ClaimStatus.PARTIALLY_SUPPORTED || claim.status === ClaimStatus.SUPPORTED || claim.status === ClaimStatus.CORROBORATED).length,
      INCONSISTENT: claims.filter((claim) => claim.status === ClaimStatus.INCONSISTENT).length,
      UNSUPPORTED: claims.filter((claim) => claim.status === ClaimStatus.UNSUPPORTED || claim.status === ClaimStatus.NEEDS_REVIEW).length,
      NOT_AVAILABLE: Math.max(0, products.length - products.filter((product) => !!product.carbonData).length),
    };

    const carbonData = {
      numberOfProductsWithCarbonData: products.filter((product) => !!product.carbonData).length,
      productsWithMissingCarbonData: products.filter((product) => !product.carbonData).length,
      reportedCarbonIntensityValues: reportedCarbonIntensityValues,
      reportingPeriods,
      lifecycleBoundaries,
      functionalUnits,
    };

    const evidenceQuality = {
      supportedClaims: metrics.supportedClaims,
      corroboratedClaims: metrics.corroboratedClaims,
      internallyConsistentClaims: metrics.internallyConsistentClaims,
      unsupportedClaims: metrics.unsupportedClaims,
      inconsistentClaims: metrics.inconsistentClaims,
      missingEvidence: metrics.missingEvidence,
    };

    const dataCompleteness = {
      requested,
      submitted: completed,
      missing,
      completeness,
      requiredMissing,
      optionalMissing,
      notRequested: 0,
      completedQuestionnaireResponses: completed,
      missingRequiredResponses: requiredMissing,
    };

    const trend = products.flatMap((product) => {
      const productClaims = claims.filter((claim) => claim.productId?.toString() === product._id.toString());
      if (productClaims.length < 2) return [];

      const comparableValues = productClaims
        .map((claim) => ({
          value: Number(claim.value),
          unit: claim.unit || product.carbonData?.unit || 'kgCO2e/kg',
          functionalUnit: claim.normalizedData?.functionalUnit || product.unit,
          lifecycleBoundary: claim.normalizedData?.boundary || product.carbonData?.boundary || 'UNKNOWN',
          reportingPeriod: claim.normalizedData?.reportingPeriod || claim.reportingPeriod || product.carbonData?.reportingPeriod || 'UNKNOWN',
          status: claim.status,
        }))
        .filter((entry) => Number.isFinite(entry.value));

      if (!comparableValues.length) return [];

      const baseline = comparableValues[0];
      const values = comparableValues.filter((entry) =>
        entry.unit === baseline.unit &&
        entry.functionalUnit === baseline.functionalUnit &&
        entry.lifecycleBoundary === baseline.lifecycleBoundary &&
        entry.reportingPeriod !== 'UNKNOWN'
      );

      if (values.length < 2) return [];

      return [{
        productId: product._id.toString(),
        productName: product.name,
        values: values
          .map((entry) => ({
            reportingPeriod: entry.reportingPeriod,
            value: entry.value,
            unit: entry.unit,
            functionalUnit: entry.functionalUnit,
            lifecycleBoundary: entry.lifecycleBoundary,
          }))
          .sort((left, right) => left.reportingPeriod.localeCompare(right.reportingPeriod, undefined, { numeric: true })),
      }];
    });

    const profile = {
      supplier: {
        ...supplier.toObject(),
        organization: organization ? organization.toObject() : null,
      },
      organization,
      products,
      claims,
      metrics,
      carbonData,
      evidenceQuality,
      dataQuality,
      dataCompleteness,
      questionnaireSummary,
      certificates: certificatesSummary,
      certificateSummary,
      productSummary,
      trend,
      validCertificates,
      expiredCertificates,
      certificatesRequiringReview,
    };

    return profile;
  }

  async getPurchaseCarbonTracking(purchaseId: string, user: NonNullable<Request['user']>) {
    if (!mongoose.isValidObjectId(purchaseId)) throw new AppError('Purchase not found', 404, 'NOT_FOUND');
    const purchase = await PurchaseModel.findById(purchaseId).populate('productId').populate('supplierId');
    if (!purchase) throw new AppError('Purchase not found', 404, 'NOT_FOUND');

    if (user.organizationType === OrganizationType.SUPPLIER) {
      const supplier = await SupplierModel.findOne({ organizationId: user.organizationId });
      if (!supplier || supplier._id.toString() !== purchase.supplierId?.toString()) {
        throw new AppError('You cannot access this carbon tracking record', 403, 'FORBIDDEN');
      }
    } else if (purchase.customerOrganizationId.toString() !== user.organizationId) {
      throw new AppError('You cannot access this carbon tracking record', 403, 'FORBIDDEN');
    }

    const product = purchase.productId as any;
    const supplier = purchase.supplierId as any;
    if (!product || !supplier) throw new AppError('Purchase product or supplier is missing', 404, 'NOT_FOUND');

    const claim = await ClaimModel.findOne({
      supplierId: supplier._id,
      productId: product._id,
      status: { $in: [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED, ClaimStatus.PARTIALLY_SUPPORTED] },
    }).sort({ createdAt: -1 });

    const expectedIntensitySource = claim && Number.isFinite(Number(claim.value))
      ? {
          value: Number(claim.value),
          unit: claim.unit || product.unit,
          functionalUnit: claim.normalizedData?.functionalUnit || product.unit,
          boundary: claim.normalizedData?.boundary || claim.boundary || product.carbonData?.boundary || 'UNKNOWN',
          reportingPeriod: claim.normalizedData?.reportingPeriod || claim.reportingPeriod || product.carbonData?.reportingPeriod || purchase.reportingPeriod || 'UNKNOWN',
          evidenceStatus: claim.status,
          source: 'claim',
        }
      : product.carbonData && Number.isFinite(Number(product.carbonData.pcf))
        ? {
            value: Number(product.carbonData.pcf),
            unit: product.carbonData.unit,
            functionalUnit: product.unit,
            boundary: product.carbonData.boundary || 'UNKNOWN',
            reportingPeriod: product.carbonData.reportingPeriod || purchase.reportingPeriod || 'UNKNOWN',
            evidenceStatus: product.carbonData.verificationStatus || ClaimStatus.PENDING,
            source: 'product',
          }
        : null;

    const actualCalculation = await CarbonCalculationModel.findOne({ purchaseId: purchase._id }).sort({ calculatedAt: -1 });
    const actualIntensitySource = actualCalculation && Number.isFinite(Number(actualCalculation.normalizedCarbonIntensity ?? actualCalculation.carbonFactor))
      ? {
          value: Number(actualCalculation.normalizedCarbonIntensity ?? actualCalculation.carbonFactor),
          unit: actualCalculation.normalizedUnit ?? actualCalculation.carbonFactorUnit,
          functionalUnit: actualCalculation.functionalUnit || product.unit,
          boundary: actualCalculation.lifecycleBoundary || product.carbonData?.boundary || 'UNKNOWN',
          reportingPeriod: actualCalculation.reportingPeriod || product.carbonData?.reportingPeriod || purchase.reportingPeriod || 'UNKNOWN',
          evidenceStatus: actualCalculation.evidenceStatus || ClaimStatus.PENDING,
          source: 'calculation',
        }
      : null;

    const result = calculateExpectedActualTracking({
      expectedQuantity: Number(purchase.quantity),
      expectedCarbonIntensity: expectedIntensitySource?.value,
      expectedCarbonIntensityUnit: expectedIntensitySource?.unit,
      expectedFunctionalUnit: expectedIntensitySource?.functionalUnit,
      expectedBoundary: expectedIntensitySource?.boundary,
      expectedReportingPeriod: expectedIntensitySource?.reportingPeriod,
      actualQuantity: actualCalculation ? Number(actualCalculation.quantity || purchase.quantity) : undefined,
      actualCarbonIntensity: actualIntensitySource?.value,
      actualCarbonIntensityUnit: actualIntensitySource?.unit,
      actualFunctionalUnit: actualIntensitySource?.functionalUnit,
      actualBoundary: actualIntensitySource?.boundary,
      actualReportingPeriod: actualIntensitySource?.reportingPeriod,
    });

    return {
      purchase: {
        _id: purchase._id.toString(),
        referenceNumber: purchase.referenceNumber,
        status: purchase.status,
        quantity: Number(purchase.quantity),
        unit: purchase.unit,
        purchaseDate: purchase.purchaseDate,
        currency: purchase.currency,
      },
      supplier: {
        _id: supplier._id.toString(),
        name: supplier.companyName || 'Supplier',
      },
      product: {
        _id: product._id.toString(),
        name: product.name,
        productCode: product.productCode,
        category: product.category,
        unit: product.unit,
      },
      expected: {
        quantity: Number(purchase.quantity),
        carbonIntensity: expectedIntensitySource?.value,
        carbonIntensityUnit: expectedIntensitySource?.unit,
        functionalUnit: expectedIntensitySource?.functionalUnit,
        lifecycleBoundary: expectedIntensitySource?.boundary,
        reportingPeriod: expectedIntensitySource?.reportingPeriod,
        evidenceStatus: expectedIntensitySource?.evidenceStatus || ClaimStatus.PENDING,
        carbonDataSource: expectedIntensitySource?.source || 'UNAVAILABLE',
        emissions: result.expectedEmissions,
      },
      actual: {
        quantity: actualCalculation ? Number(actualCalculation.quantity || purchase.quantity) : undefined,
        carbonIntensity: actualIntensitySource?.value,
        carbonIntensityUnit: actualIntensitySource?.unit,
        functionalUnit: actualIntensitySource?.functionalUnit,
        lifecycleBoundary: actualIntensitySource?.boundary,
        reportingPeriod: actualIntensitySource?.reportingPeriod,
        evidenceStatus: actualIntensitySource?.evidenceStatus || ClaimStatus.PENDING,
        carbonDataSource: actualIntensitySource?.source || 'UNAVAILABLE',
        emissions: result.actualEmissions,
        calculationVersion: actualCalculation?.calculationVersion ?? 1,
      },
      status: result.status,
      variance: result.variance,
      variancePercent: result.variancePercent,
      comparisonReason: result.comparisonReason,
      sourceOfVariance: result.sourceOfVariance,
      calculatedAt: actualCalculation?.calculatedAt || null,
    };
  }

  async getCarbonTrackingDashboard(user: NonNullable<Request['user']>) {
    if (user.organizationType === OrganizationType.SUPPLIER) {
      throw new AppError('Supplier organizations do not have access to buyer carbon tracking dashboards', 403, 'FORBIDDEN');
    }

    const purchases = await PurchaseModel.find({ customerOrganizationId: user.organizationId })
      .populate('productId')
      .populate('supplierId')
      .sort({ purchaseDate: -1 });

    const records = await Promise.all(purchases.map((purchase) => this.getPurchaseCarbonTracking(purchase._id.toString(), user).catch(() => null)));
    const validRecords = records.filter((record): record is NonNullable<typeof record> => !!record);

    const totalExpected = validRecords.reduce((sum, record) => sum + (record.expected.emissions ?? 0), 0);
    const totalActual = validRecords.reduce((sum, record) => sum + (record.actual.emissions ?? 0), 0);
    const totalVariance = validRecords.reduce((sum, record) => sum + (record.variance ?? 0), 0);
    const comparableRecords = validRecords.filter((record) => record.status === 'COMPLETE');
    const variancePercent = totalExpected !== 0 ? (totalVariance / totalExpected) * 100 : 0;

    return {
      summary: {
        totalExpectedEmissions: Number(totalExpected.toFixed(6)),
        totalActualEmissions: Number(totalActual.toFixed(6)),
        totalVariance: Number(totalVariance.toFixed(6)),
        variancePercent: Number(variancePercent.toFixed(4)),
        trackedPurchaseCount: validRecords.length,
        expectedOnlyCount: validRecords.filter((record) => record.status === 'EXPECTED_ONLY').length,
        actualOnlyCount: validRecords.filter((record) => record.status === 'ACTUAL_ONLY').length,
        notComparableCount: validRecords.filter((record) => record.status === 'NOT_COMPARABLE').length,
        completeCount: comparableRecords.length,
      },
      purchases: validRecords,
    };
  }

  async compareSuppliersForProduct(params: {
    productId: string;
    supplierIds: string[];
    quantity?: number;
    user: NonNullable<Request['user']>;
  }) {
    if (!mongoose.isValidObjectId(params.productId)) throw new AppError('Product not found', 404, 'NOT_FOUND');

    const product = await ProductModel.findById(params.productId);
    if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');

    if (!Array.isArray(params.supplierIds) || params.supplierIds.length < 2) {
      throw new AppError('Choose at least two suppliers to compare', 400, 'INVALID_SUPPLIER_SELECTION');
    }

    const uniqueSupplierIds = [...new Set(params.supplierIds.filter(Boolean))];
    if (uniqueSupplierIds.length < 2) {
      throw new AppError('Choose at least two suppliers to compare', 400, 'INVALID_SUPPLIER_SELECTION');
    }

    const supplierRecords = await SupplierModel.find({ _id: { $in: uniqueSupplierIds } });
    if (supplierRecords.length !== uniqueSupplierIds.length) {
      throw new AppError('One or more suppliers are unavailable', 404, 'NOT_FOUND');
    }

    const organizationIds = supplierRecords.map((supplier) => supplier.organizationId);
    const relationships = await SupplierRelationshipModel.find({
      customerOrganizationId: params.user.organizationId,
      supplierOrganizationId: { $in: organizationIds },
      status: { $ne: SupplierStatus.TERMINATED },
    });
    if (relationships.length !== uniqueSupplierIds.length) {
      throw new AppError('You cannot compare these suppliers', 403, 'FORBIDDEN');
    }

    const organizationById = new Map((await OrganizationModel.find({ _id: { $in: organizationIds } })).map((organization) => [organization._id.toString(), organization]));
    const suppliers = await Promise.all(uniqueSupplierIds.map(async (supplierId) => {
      const supplier = supplierRecords.find((record) => record._id.toString() === supplierId);
      if (!supplier) return null;

      const candidateProduct = await ProductModel.findOne({
        supplierId: supplier._id,
        $or: [{ _id: product._id }, { name: product.name, category: product.category }],
      });
      if (!candidateProduct) return null;

      const claim = await ClaimModel.findOne({ productId: candidateProduct._id }).sort({ createdAt: -1 });
      const purchaseRows = await PurchaseModel.find({
        customerOrganizationId: params.user.organizationId,
        supplierId: supplier._id,
        productId: candidateProduct._id,
      }).sort({ purchaseDate: -1 });

      const purchaseCount = purchaseRows.length;
      const totalQuantity = purchaseRows.reduce((sum, purchase) => sum + Number(purchase.quantity || 0), 0);
      const lastPurchase = purchaseRows[0];
      const latestPrice = purchaseRows.find((purchase) => purchase.unitPrice != null && Number(purchase.unitPrice) > 0);
      const pricePerUnit = latestPrice ? Number(latestPrice.unitPrice) : candidateProduct.sellingPrice ?? null;
      const priceCurrency = latestPrice?.currency || candidateProduct.currency || undefined;

      const dataRequests = await DataRequestModel.find({ supplierOrganizationId: supplier.organizationId });
      const requestedItems = dataRequests.flatMap((request) => (request.requestedItems || []).map((item) => ({
        _id: item._id?.toString() || item.key,
        requestId: request._id.toString(),
        required: !!item.required,
      })));
      const submittedKeys = new Set(
        (await QuestionResponseModel.find({ supplierId: supplier._id, status: { $in: [QuestionResponseStatus.SUBMITTED, QuestionResponseStatus.ACCEPTED] } }))
          .map((response) => `${response.dataRequestId.toString()}:${response.requestedItemId.toString()}`)
      );
      const completed = requestedItems.filter((item) => submittedKeys.has(`${item.requestId}:${item._id}`)).length;
      const dataCompleteness = requestedItems.length
        ? { requested: requestedItems.length, completed, percentage: Math.round((completed / requestedItems.length) * 100) }
        : { requested: 0, completed: 0, percentage: 0 };

      const certificates = await CertificateModel.find({ supplierId: supplier._id }).sort({ expiryDate: 1 });
      const latestCertificate = certificates[0];
      const evidenceStatus = claim?.status || 'NOT_AVAILABLE';
      const corroborationStatus = claim && claim.status === ClaimStatus.CORROBORATED ? 'CORROBORATED' : 'NOT_AVAILABLE';
      const comparableCarbon = claim && claim.value !== undefined && claim.unit ? {
        value: Number(claim.value),
        unit: claim.unit,
        functionalUnit: claim.normalizedData?.functionalUnit || candidateProduct.unit,
        boundary: claim.normalizedData?.boundary || claim.boundary || candidateProduct.carbonData?.boundary || 'UNKNOWN',
        reportingPeriod: claim.normalizedData?.reportingPeriod || claim.reportingPeriod || candidateProduct.carbonData?.reportingPeriod || 'UNKNOWN',
      } : null;

      return {
        supplierId: supplier._id.toString(),
        supplierName: organizationById.get(supplier.organizationId.toString())?.name || 'Supplier',
        productId: candidateProduct._id.toString(),
        productName: candidateProduct.name,
        productCode: candidateProduct.productCode,
        category: candidateProduct.category,
        unit: candidateProduct.unit,
        pricePerUnit,
        currency: priceCurrency,
        priceSource: latestPrice ? 'Purchasing history' : (candidateProduct.sellingPrice != null ? 'Product price' : 'N/A'),
        carbonIntensity: claim ? Number(claim.value) : null,
        carbonUnit: claim?.unit || candidateProduct.carbonData?.unit || null,
        functionalUnit: claim?.normalizedData?.functionalUnit || candidateProduct.unit,
        lifecycleBoundary: claim?.normalizedData?.boundary || claim?.boundary || candidateProduct.carbonData?.boundary || 'UNKNOWN',
        reportingPeriod: claim?.normalizedData?.reportingPeriod || claim?.reportingPeriod || candidateProduct.carbonData?.reportingPeriod || 'UNKNOWN',
        evidenceStatus,
        corroborationStatus,
        carbonStatus: comparableCarbon ? 'AVAILABLE' : 'NOT_AVAILABLE',
        dataCompleteness,
        certificate: latestCertificate ? {
          type: latestCertificate.type,
          issuer: latestCertificate.issuingBody,
          status: latestCertificate.status,
          issueDate: latestCertificate.issueDate,
          expiryDate: latestCertificate.expiryDate,
        } : null,
        purchaseHistory: {
          count: purchaseCount,
          totalQuantity,
          lastPurchaseDate: lastPurchase?.purchaseDate || null,
          lastPrice: latestPrice ? Number(latestPrice.unitPrice) : null,
          currency: lastPurchase?.currency || priceCurrency || null,
        },
        warnings: [
          ...(claim && claim.status === ClaimStatus.INCONSISTENT ? ['Evidence issue: this supplier carbon claim is internally inconsistent.'] : []),
          ...(claim && [ClaimStatus.UNSUPPORTED, ClaimStatus.NEEDS_REVIEW].includes(claim.status) ? ['Carbon evidence is unsupported or requires review.'] : []),
          ...(!claim ? ['Carbon data unavailable.'] : []),
        ],
        comparableCarbon,
      };
    }));

    const rows = suppliers.filter((row): row is NonNullable<typeof row> => !!row);
    if (!rows.length) throw new AppError('No supplier comparisons available', 404, 'NOT_FOUND');

    const warnings: string[] = [];
    const comparableRows = rows.filter((row) => row.comparableCarbon && row.comparableCarbon.value !== null && row.comparableCarbon.value !== undefined);
    if (comparableRows.length > 1) {
      const baseline = comparableRows[0];
      for (const row of comparableRows.slice(1)) {
        const comparable = areComparablePcfValues(baseline.comparableCarbon!, row.comparableCarbon!);
        if (!comparable) {
          warnings.push(`Not directly comparable — lifecycle or unit differences exist for ${row.supplierName}.`);
        }
      }
    }

    let tradeOff;
    if (params.quantity && params.quantity > 0 && rows.length >= 2) {
      const cheapest = rows.reduce((current, row) => row.pricePerUnit !== null && (current.pricePerUnit === null || row.pricePerUnit < current.pricePerUnit) ? row : current, rows[0]);
      const cheapestCarbon = rows.filter((row) => row.comparableCarbon).sort((left, right) => (left.comparableCarbon?.value ?? Number.MAX_SAFE_INTEGER) - (right.comparableCarbon?.value ?? Number.MAX_SAFE_INTEGER))[0];
      if (cheapest && cheapestCarbon && cheapest !== cheapestCarbon) {
        const cheapestEmissions = cheapestCarbon.comparableCarbon ? cheapestCarbon.comparableCarbon.value * params.quantity : undefined;
        const cheapestCost = cheapest.pricePerUnit !== null ? cheapest.pricePerUnit * params.quantity : undefined;
        const expensiveRow = rows.find((row) => row.supplierId !== cheapest.supplierId && row.pricePerUnit !== null);
        const expensiveCost = expensiveRow && expensiveRow.pricePerUnit !== null ? expensiveRow.pricePerUnit * params.quantity : undefined;
        if (cheapestCost !== undefined && expensiveCost !== undefined && cheapestEmissions !== undefined) {
          const costDifference = expensiveCost - cheapestCost;
          const emissionDifference = (expensiveRow?.comparableCarbon?.value ?? 0) * params.quantity - cheapestEmissions;
          tradeOff = {
            quantity: params.quantity,
            unit: product.unit,
            cheapestSupplier: cheapest.supplierName,
            lowestCost: cheapestCost,
            comparisonSupplier: expensiveRow?.supplierName || null,
            costDifference,
            emissionDifference,
            costPerEstimatedTonneAvoided: emissionDifference !== 0 ? Math.abs(costDifference) / (Math.abs(emissionDifference) / 1000) : undefined,
          };
        }
      }
    }

    return {
      product: {
        _id: product._id.toString(),
        name: product.name,
        productCode: product.productCode,
        category: product.category,
        unit: product.unit,
      },
      suppliers: rows,
      warnings,
      tradeOff,
      comparability: {
        directlyComparableCount: rows.filter((row) => row.comparableCarbon).length,
        totalSuppliers: rows.length,
      },
    };
  }

  async compareProducts(params: {
    leftProductId: string;
    rightProductId: string;
    quantity?: number;
    user: NonNullable<Request['user']>;
  }) {
    const leftProduct = await ProductModel.findById(params.leftProductId);
    const rightProduct = await ProductModel.findById(params.rightProductId);
    if (!leftProduct || !rightProduct) throw new AppError('Product not found', 404, 'NOT_FOUND');

    const leftSupplier = await SupplierModel.findById(leftProduct.supplierId);
    const rightSupplier = await SupplierModel.findById(rightProduct.supplierId);
    if (!leftSupplier || !rightSupplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');

    if (params.user.organizationType === OrganizationType.SUPPLIER) {
      if (leftSupplier.organizationId.toString() !== params.user.organizationId && rightSupplier.organizationId.toString() !== params.user.organizationId) {
        throw new AppError('You cannot compare these products', 403, 'FORBIDDEN');
      }
    } else {
      const leftRelationship = await SupplierRelationshipModel.findOne({
        customerOrganizationId: params.user.organizationId,
        supplierOrganizationId: leftSupplier.organizationId,
        status: { $ne: SupplierStatus.TERMINATED },
      });
      const rightRelationship = await SupplierRelationshipModel.findOne({
        customerOrganizationId: params.user.organizationId,
        supplierOrganizationId: rightSupplier.organizationId,
        status: { $ne: SupplierStatus.TERMINATED },
      });
      if (!leftRelationship || !rightRelationship) throw new AppError('You cannot compare these products', 403, 'FORBIDDEN');
    }

    const leftClaim = await ClaimModel.findOne({ productId: leftProduct._id, status: { $in: [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED, ClaimStatus.PARTIALLY_SUPPORTED] } }).sort({ createdAt: -1 });
    const rightClaim = await ClaimModel.findOne({ productId: rightProduct._id, status: { $in: [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED, ClaimStatus.PARTIALLY_SUPPORTED] } }).sort({ createdAt: -1 });

    if (!leftClaim || !rightClaim) {
      return {
        status: CarbonCalculationStatus.BLOCKED,
        reason: 'Comparison requires supported supplier carbon claims for both products.',
      };
    }

    const leftComparable = {
      unit: leftClaim.unit || leftProduct.carbonData?.unit || 'kgCO2e/kg',
      functionalUnit: leftClaim.normalizedData?.functionalUnit || leftProduct.unit,
      boundary: leftClaim.normalizedData?.boundary || leftProduct.carbonData?.boundary || 'UNKNOWN',
      reportingPeriod: leftClaim.normalizedData?.reportingPeriod || leftProduct.carbonData?.reportingPeriod || 'UNKNOWN',
    };
    const rightComparable = {
      unit: rightClaim.unit || rightProduct.carbonData?.unit || 'kgCO2e/kg',
      functionalUnit: rightClaim.normalizedData?.functionalUnit || rightProduct.unit,
      boundary: rightClaim.normalizedData?.boundary || rightProduct.carbonData?.boundary || 'UNKNOWN',
      reportingPeriod: rightClaim.normalizedData?.reportingPeriod || rightProduct.carbonData?.reportingPeriod || 'UNKNOWN',
    };

    const comparable = areComparablePcfValues(leftComparable, rightComparable);
    const warnings: string[] = [];
    if (!comparable) {
      if (normalizeText(leftComparable.functionalUnit) !== normalizeText(rightComparable.functionalUnit)) warnings.push('Different functional units');
      if (normalizeText(leftComparable.boundary) !== normalizeText(rightComparable.boundary)) warnings.push('Different life-cycle boundaries');
      if (normalizeText(leftComparable.reportingPeriod) !== normalizeText(rightComparable.reportingPeriod)) warnings.push('Different reporting years');
      if (leftClaim.status === ClaimStatus.UNSUPPORTED || rightClaim.status === ClaimStatus.UNSUPPORTED) warnings.push('Carbon value is unsupported');
    }

    const leftValue = Number(leftClaim.value) || 0;
    const rightValue = Number(rightClaim.value) || 0;
    const absoluteDifference = Math.abs(leftValue - rightValue);
    const relativeDifference = leftValue === 0 ? 0 : (absoluteDifference / leftValue) * 100;

    return {
      status: comparable ? 'COMPARABLE' : 'NOT_DIRECTLY_COMPARABLE',
      comparable,
      warnings,
      left: { supplier: leftSupplier, product: leftProduct, claim: leftClaim, value: leftValue, unit: leftComparable.unit },
      right: { supplier: rightSupplier, product: rightProduct, claim: rightClaim, value: rightValue, unit: rightComparable.unit },
      absoluteDifference,
      relativeDifference,
      purchaseQuantity: params.quantity ?? 0,
      estimatedDifferenceForQuantity: params.quantity ? Math.abs((leftValue - rightValue) * params.quantity) : undefined,
    };
  }

  async getDashboard(user: NonNullable<Request['user']>) {
    const calculations = await CarbonCalculationModel.find({ customerOrganizationId: user.organizationId }).sort({ calculatedAt: -1 });
    const purchases = await PurchaseModel.find({ customerOrganizationId: user.organizationId });
    const totalProcurementEmissions = calculations
      .filter((calculation) => calculation.status === CarbonCalculationStatus.CALCULATED)
      .reduce((sum, calculation) => sum + Number(calculation.totalEmissions || 0), 0);

    const metrics = {
      totalProcurementEmissions,
      totalPurchasesWithCarbonData: calculations.length,
      productsWithSupportedCarbonData: calculations.filter((calculation) => calculation.evidenceStatus === ClaimStatus.SUPPORTED).length,
      productsRequiringVerification: calculations.filter((calculation) => calculation.evidenceStatus === ClaimStatus.PENDING || calculation.evidenceStatus === ClaimStatus.NEEDS_REVIEW).length,
      purchasesMissingCarbonData: purchases.filter((purchase) => !purchase.carbonCalculationId).length,
    };

    if (!calculations.length && !purchases.length) {
      return { metrics, message: 'No sufficient data available.' };
    }

    return { metrics };
  }

  async getFactorsForCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const factors = await this.getFactors(req.query.category as string);
      return sendSuccess(res, factors);
    } catch (error) {
      next(error);
    }
  }
}

export const carbonService = new CarbonService();

export class CarbonController {
  async getCalculations(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const calculations = await carbonService.getCalculations(req.user);
      return sendSuccess(res, calculations);
    } catch (error) {
      next(error);
    }
  }

  async getCalculationById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const calculation = await carbonService.getCalculationById(req.params.id, req.user);
      return sendSuccess(res, calculation);
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
        claimId: req.body.claimId,
        customerOrgId: req.user.organizationId,
      });
      return sendSuccess(res, calculation, 201);
    } catch (error) {
      next(error);
    }
  }

  async getPurchaseCarbonView(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const view = await carbonService.getPurchaseCarbonView(req.params.purchaseId, req.user);
      return sendSuccess(res, view);
    } catch (error) {
      next(error);
    }
  }

  async getProductCarbonProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const profile = await carbonService.getProductCarbonProfile(req.params.productId, req.user);
      return sendSuccess(res, profile);
    } catch (error) {
      next(error);
    }
  }

  async getSupplierCarbonProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const profile = await carbonService.getSupplierCarbonProfile(req.params.supplierId, req.user);
      return sendSuccess(res, profile);
    } catch (error) {
      next(error);
    }
  }

  async getPurchaseCarbonTracking(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const tracking = await carbonService.getPurchaseCarbonTracking(req.params.purchaseId, req.user);
      return sendSuccess(res, tracking);
    } catch (error) {
      next(error);
    }
  }

  async getCarbonTrackingDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const report = await carbonService.getCarbonTrackingDashboard(req.user);
      return sendSuccess(res, report);
    } catch (error) {
      next(error);
    }
  }

  async compareSuppliers(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const rawSupplierIds = Array.isArray(req.body?.supplierIds)
        ? req.body.supplierIds
        : typeof req.body?.supplierIds === 'string'
          ? req.body.supplierIds.split(',').map((entry: string) => entry.trim()).filter(Boolean)
          : typeof req.query.supplierIds === 'string'
            ? req.query.supplierIds.split(',').map((entry) => entry.trim()).filter(Boolean)
            : [];
      const result = await carbonService.compareSuppliersForProduct({
        productId: req.body?.productId || req.query.productId as string,
        supplierIds: rawSupplierIds,
        quantity: req.body?.quantity ?? Number(req.query.quantity ?? 0),
        user: req.user,
      });
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async compare(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const result = await carbonService.compareProducts({
        leftProductId: req.body.leftProductId || req.query.leftProductId as string,
        rightProductId: req.body.rightProductId || req.query.rightProductId as string,
        quantity: req.body.quantity ?? Number(req.query.quantity ?? 0),
        user: req.user,
      });
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const dashboard = await carbonService.getDashboard(req.user);
      return sendSuccess(res, dashboard);
    } catch (error) {
      next(error);
    }
  }
}

export const carbonController = new CarbonController();

export const carbonRoutes = Router();
carbonRoutes.use(authenticate);

carbonRoutes.get('/calculations', (req, res, next) => carbonController.getCalculations(req, res, next));
carbonRoutes.get('/calculations/:id', (req, res, next) => carbonController.getCalculationById(req, res, next));
carbonRoutes.get('/purchases/:purchaseId', (req, res, next) => carbonController.getPurchaseCarbonView(req, res, next));
carbonRoutes.get('/products/:productId', (req, res, next) => carbonController.getProductCarbonProfile(req, res, next));
carbonRoutes.get('/suppliers/:supplierId', (req, res, next) => carbonController.getSupplierCarbonProfile(req, res, next));
carbonRoutes.get('/tracking', (req, res, next) => carbonController.getCarbonTrackingDashboard(req, res, next));
carbonRoutes.get('/tracking/:purchaseId', (req, res, next) => carbonController.getPurchaseCarbonTracking(req, res, next));
carbonRoutes.get('/purchases/:purchaseId/carbon-tracking', (req, res, next) => carbonController.getPurchaseCarbonTracking(req, res, next));
carbonRoutes.get('/suppliers/compare', (req, res, next) => carbonController.compareSuppliers(req, res, next));
carbonRoutes.post('/suppliers/compare', (req, res, next) => carbonController.compareSuppliers(req, res, next));
carbonRoutes.get('/comparison/suppliers', (req, res, next) => carbonController.compareSuppliers(req, res, next));
carbonRoutes.post('/comparison/suppliers', (req, res, next) => carbonController.compareSuppliers(req, res, next));
carbonRoutes.get('/comparison', (req, res, next) => carbonController.compare(req, res, next));
carbonRoutes.post('/comparison', validate(compareCarbonSchema), (req, res, next) => carbonController.compare(req, res, next));
carbonRoutes.get('/dashboard', (req, res, next) => carbonController.getDashboard(req, res, next));
carbonRoutes.post('/calculations', requireOrganizationType(OrganizationType.CUSTOMER), validate(calculateCarbonSchema), (req, res, next) => carbonController.calculate(req, res, next));
carbonRoutes.post('/calculate', requireOrganizationType(OrganizationType.CUSTOMER), validate(calculateCarbonSchema), (req, res, next) => carbonController.calculate(req, res, next));
carbonRoutes.get('/factors', (req, res, next) => carbonController.getFactors(req, res, next));
carbonRoutes.post('/factors', validate(createCarbonFactorSchema), (req, res, next) => carbonController.createFactor(req, res, next));
