import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { CarbonCalculationModel } from '../../models/CarbonCalculation';
import { CarbonFactorModel, ICarbonFactorDocument } from '../../models/CarbonFactor';
import { PurchaseModel } from '../../models/Purchase';
import { ClaimModel } from '../../models/Claim';
import { ProductModel } from '../../models/Product';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { AppError, sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType, requireRoles } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createCarbonFactorSchema, calculateCarbonSchema, compareCarbonSchema } from '@carbonpilot/validation';
import {
  ClaimStatus,
  OrganizationType,
  UserRole,
  CarbonCalculationStatus,
  SupplierStatus,
  QuestionnaireCategory,
  QuestionResponseStatus,
  CertificateStatus,
} from '@carbonpilot/shared';
import { areComparablePcfValues, normalizeCarbonData, normalizeUnitValue } from '../verification/normalization';
import { DataRequestModel } from '../../models/DataRequest';
import { QuestionResponseModel } from '../../models/QuestionResponse';
import { CertificateModel } from '../../models/Certificate';
import { OrganizationModel } from '../../models/Organization';

function normalizeText(value?: string) {
  return value?.trim().toLowerCase().replace(/\s+/g, '') || '';
}

function finiteNonNegativeValue(value: unknown): number | undefined {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return undefined;
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function mapSourceReference(sourceReference?: {
  documentId?: unknown;
  page?: number;
  sourceText?: string;
  sourceType?: 'DOCUMENT_EXTRACTION' | 'QUESTIONNAIRE';
  extractionMethod?: 'NATIVE_TEXT' | 'OCR' | 'NATIVE_TEXT_AND_OCR';
} | null) {
  if (!sourceReference) return undefined;
  const document = sourceReference.documentId && typeof sourceReference.documentId === 'object'
    ? sourceReference.documentId as { _id?: { toString(): string }; filename?: string }
    : undefined;
  const documentId = document?._id?.toString()
    || (typeof sourceReference.documentId === 'string' ? sourceReference.documentId : undefined);
  return {
    documentId,
    documentName: document?.filename,
    page: sourceReference.page,
    sourceText: sourceReference.sourceText,
    sourceType: sourceReference.sourceType,
    extractionMethod: sourceReference.extractionMethod,
  };
}

export function calculateCarbonEmissions(quantity: number, quantityUnit: string, intensity: number, intensityUnit: string) {
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(intensity) || intensity < 0) return undefined;
  const normalizedQuantity = normalizeUnitValue(quantity, quantityUnit);
  const normalizedIntensity = normalizeCarbonData({ value: intensity, unit: intensityUnit });
  if (!normalizedQuantity || !normalizedIntensity?.normalizedUnit || normalizedIntensity.normalizedValue === undefined) {
    return undefined;
  }

  const [numerator, denominator, ...extra] = normalizedIntensity.normalizedUnit.split('/');
  if (numerator !== 'kgCO2e' || !denominator || extra.length || denominator !== normalizedQuantity.unit) return undefined;
  const emissions = normalizedQuantity.value * normalizedIntensity.normalizedValue;
  return Number.isFinite(emissions) && emissions >= 0 ? Number(emissions.toFixed(6)) : undefined;
}

function carbonBasis(record: {
  carbonIntensityUnit?: string;
  functionalUnit?: string;
  lifecycleBoundary?: string;
  reportingPeriod?: string;
  methodology?: string;
}) {
  return [
    normalizeText(record.carbonIntensityUnit),
    normalizeText(record.functionalUnit),
    normalizeText(record.lifecycleBoundary),
    normalizeText(record.reportingPeriod),
    normalizeText(record.methodology),
  ].join('|');
}

function sumForSingleCarbonBasis<T extends {
  emissions?: number;
  carbonIntensityUnit?: string;
  functionalUnit?: string;
  lifecycleBoundary?: string;
  reportingPeriod?: string;
  methodology?: string;
}>(records: T[]) {
  const available = records.filter((record) => record.emissions !== undefined && Number.isFinite(record.emissions));
  if (!available.length || available.some((record) => [
    record.carbonIntensityUnit,
    record.functionalUnit,
    record.lifecycleBoundary,
    record.reportingPeriod,
    record.methodology,
  ].some((value) => !value?.trim())) || new Set(available.map(carbonBasis)).size !== 1) return undefined;
  return Number(available.reduce((sum, record) => sum + record.emissions!, 0).toFixed(6));
}

export function calculateExpectedActualTracking(params: {
  expectedQuantity?: number;
  expectedQuantityUnit?: string;
  expectedCarbonIntensity?: number;
  expectedCarbonIntensityUnit?: string;
  expectedFunctionalUnit?: string;
  expectedBoundary?: string;
  expectedReportingPeriod?: string;
  expectedMethodology?: string;
  actualQuantity?: number;
  actualQuantityUnit?: string;
  actualCarbonIntensity?: number;
  actualCarbonIntensityUnit?: string;
  actualFunctionalUnit?: string;
  actualBoundary?: string;
  actualReportingPeriod?: string;
  actualMethodology?: string;
}) {
  const expectedQuantity = Number.isFinite(params.expectedQuantity) ? Number(params.expectedQuantity) : undefined;
  const expectedIntensity = Number.isFinite(params.expectedCarbonIntensity) ? Number(params.expectedCarbonIntensity) : undefined;
  const actualQuantity = Number.isFinite(params.actualQuantity) ? Number(params.actualQuantity) : undefined;
  const actualIntensity = Number.isFinite(params.actualCarbonIntensity) ? Number(params.actualCarbonIntensity) : undefined;
  const expectedEmissions = expectedQuantity !== undefined && expectedIntensity !== undefined
    && params.expectedQuantityUnit && params.expectedCarbonIntensityUnit
    ? calculateCarbonEmissions(expectedQuantity, params.expectedQuantityUnit, expectedIntensity, params.expectedCarbonIntensityUnit)
    : undefined;
  const actualEmissions = actualQuantity !== undefined && actualIntensity !== undefined
    && params.actualQuantityUnit && params.actualCarbonIntensityUnit
    ? calculateCarbonEmissions(actualQuantity, params.actualQuantityUnit, actualIntensity, params.actualCarbonIntensityUnit)
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
      expected: { quantity: expectedQuantity, quantityUnit: params.expectedQuantityUnit, carbonIntensity: expectedIntensity, carbonIntensityUnit: params.expectedCarbonIntensityUnit, functionalUnit: params.expectedFunctionalUnit, boundary: params.expectedBoundary, reportingPeriod: params.expectedReportingPeriod, methodology: params.expectedMethodology },
      actual: { quantity: actualQuantity, quantityUnit: params.actualQuantityUnit, carbonIntensity: actualIntensity, carbonIntensityUnit: params.actualCarbonIntensityUnit, functionalUnit: params.actualFunctionalUnit, boundary: params.actualBoundary, reportingPeriod: params.actualReportingPeriod, methodology: params.actualMethodology },
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
      expected: { quantity: expectedQuantity, quantityUnit: params.expectedQuantityUnit, carbonIntensity: expectedIntensity, carbonIntensityUnit: params.expectedCarbonIntensityUnit, functionalUnit: params.expectedFunctionalUnit, boundary: params.expectedBoundary, reportingPeriod: params.expectedReportingPeriod, methodology: params.expectedMethodology },
      actual: { quantity: actualQuantity, quantityUnit: params.actualQuantityUnit, carbonIntensity: actualIntensity, carbonIntensityUnit: params.actualCarbonIntensityUnit, functionalUnit: params.actualFunctionalUnit, boundary: params.actualBoundary, reportingPeriod: params.actualReportingPeriod, methodology: params.actualMethodology },
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
      expected: { quantity: expectedQuantity, quantityUnit: params.expectedQuantityUnit, carbonIntensity: expectedIntensity, carbonIntensityUnit: params.expectedCarbonIntensityUnit, functionalUnit: params.expectedFunctionalUnit, boundary: params.expectedBoundary, reportingPeriod: params.expectedReportingPeriod, methodology: params.expectedMethodology },
      actual: { quantity: actualQuantity, quantityUnit: params.actualQuantityUnit, carbonIntensity: actualIntensity, carbonIntensityUnit: params.actualCarbonIntensityUnit, functionalUnit: params.actualFunctionalUnit, boundary: params.actualBoundary, reportingPeriod: params.actualReportingPeriod, methodology: params.actualMethodology },
    };
  }

  const comparable = areComparablePcfValues(
    {
      unit: params.expectedCarbonIntensityUnit || '',
      functionalUnit: params.expectedFunctionalUnit,
      boundary: params.expectedBoundary,
      reportingPeriod: params.expectedReportingPeriod,
      methodology: params.expectedMethodology,
    },
    {
      unit: params.actualCarbonIntensityUnit || '',
      functionalUnit: params.actualFunctionalUnit,
      boundary: params.actualBoundary,
      reportingPeriod: params.actualReportingPeriod,
      methodology: params.actualMethodology,
    },
    true
  );

  if (!comparable) {
    const reasons: string[] = [];
    if (!params.expectedBoundary || !params.actualBoundary || normalizeText(params.expectedBoundary) !== normalizeText(params.actualBoundary)) reasons.push('Expected and actual carbon data use different or missing lifecycle boundaries.');
    if (!params.expectedFunctionalUnit || !params.actualFunctionalUnit || normalizeText(params.expectedFunctionalUnit) !== normalizeText(params.actualFunctionalUnit)) reasons.push('Expected and actual carbon data use different or missing functional units.');
    if (!params.expectedReportingPeriod || !params.actualReportingPeriod || normalizeText(params.expectedReportingPeriod) !== normalizeText(params.actualReportingPeriod)) reasons.push('Expected and actual carbon data use different or missing reporting periods.');
    if (!params.expectedCarbonIntensityUnit || !params.actualCarbonIntensityUnit || normalizeText(params.expectedCarbonIntensityUnit) !== normalizeText(params.actualCarbonIntensityUnit)) {
      const expectedUnit = params.expectedCarbonIntensityUnit ? normalizeCarbonData({ value: 1, unit: params.expectedCarbonIntensityUnit })?.normalizedUnit : undefined;
      const actualUnit = params.actualCarbonIntensityUnit ? normalizeCarbonData({ value: 1, unit: params.actualCarbonIntensityUnit })?.normalizedUnit : undefined;
      if (!expectedUnit || !actualUnit || expectedUnit !== actualUnit) reasons.push('Expected and actual carbon intensity units are not compatible.');
    }
    if (!params.expectedMethodology || !params.actualMethodology || normalizeText(params.expectedMethodology) !== normalizeText(params.actualMethodology)) reasons.push('Expected and actual carbon data use different or missing methodologies.');
    return {
      status: 'NOT_COMPARABLE',
      expectedEmissions,
      actualEmissions,
      variance: undefined,
      variancePercent: undefined,
      comparisonReason: reasons.join(' ') || 'Carbon data is not comparable for this purchase.',
      sourceOfVariance: 'NONE',
      expected: { quantity: expectedQuantity, quantityUnit: params.expectedQuantityUnit, carbonIntensity: expectedIntensity, carbonIntensityUnit: params.expectedCarbonIntensityUnit, functionalUnit: params.expectedFunctionalUnit, boundary: params.expectedBoundary, reportingPeriod: params.expectedReportingPeriod, methodology: params.expectedMethodology },
      actual: { quantity: actualQuantity, quantityUnit: params.actualQuantityUnit, carbonIntensity: actualIntensity, carbonIntensityUnit: params.actualCarbonIntensityUnit, functionalUnit: params.actualFunctionalUnit, boundary: params.actualBoundary, reportingPeriod: params.actualReportingPeriod, methodology: params.actualMethodology },
    };
  }

  const variance = Number((actualEmissions! - expectedEmissions!).toFixed(6));
  const variancePercent = expectedEmissions !== undefined && expectedEmissions !== 0
    ? Number(((variance / expectedEmissions) * 100).toFixed(4))
    : undefined;
  const quantityVariance = expectedQuantity !== undefined && actualQuantity !== undefined && expectedQuantity !== actualQuantity;
  const expectedNormalizedIntensity = expectedIntensity !== undefined && params.expectedCarbonIntensityUnit
    ? normalizeCarbonData({ value: expectedIntensity, unit: params.expectedCarbonIntensityUnit })?.normalizedValue
    : undefined;
  const actualNormalizedIntensity = actualIntensity !== undefined && params.actualCarbonIntensityUnit
    ? normalizeCarbonData({ value: actualIntensity, unit: params.actualCarbonIntensityUnit })?.normalizedValue
    : undefined;
  const intensityVariance = expectedNormalizedIntensity !== undefined && actualNormalizedIntensity !== undefined
    ? expectedNormalizedIntensity !== actualNormalizedIntensity
    : expectedIntensity !== undefined && actualIntensity !== undefined && expectedIntensity !== actualIntensity;
  const sourceOfVariance = quantityVariance && intensityVariance ? 'BOTH' : quantityVariance ? 'QUANTITY' : intensityVariance ? 'CARBON_INTENSITY' : 'NONE';

  return {
    status: 'COMPLETE',
    expectedEmissions,
    actualEmissions,
    variance,
    variancePercent,
    comparisonReason: 'Expected and actual carbon emissions are directly comparable.',
    sourceOfVariance,
    expected: { quantity: expectedQuantity, quantityUnit: params.expectedQuantityUnit, carbonIntensity: expectedIntensity, carbonIntensityUnit: params.expectedCarbonIntensityUnit, functionalUnit: params.expectedFunctionalUnit, boundary: params.expectedBoundary, reportingPeriod: params.expectedReportingPeriod, methodology: params.expectedMethodology },
    actual: { quantity: actualQuantity, quantityUnit: params.actualQuantityUnit, carbonIntensity: actualIntensity, carbonIntensityUnit: params.actualCarbonIntensityUnit, functionalUnit: params.actualFunctionalUnit, boundary: params.actualBoundary, reportingPeriod: params.actualReportingPeriod, methodology: params.actualMethodology },
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

  private async resolveRelevantClaim(productId: string, supplierId: string, buyerOrganizationId: string, claimId?: string) {
    const claimFilter = {
      productId,
      supplierId,
      type: /PCF|CARBON[_ ]?FOOTPRINT|CARBON[_ ]?INTENSITY/i,
      $or: [
        { buyerOrganizationId },
        { buyerOrganizationId: { $exists: false } },
        { buyerOrganizationId: null },
      ],
    };
    if (claimId) {
      if (!mongoose.isValidObjectId(claimId)) throw new AppError('Carbon claim not found', 404, 'NOT_FOUND');
      const claim = await ClaimModel.findById(claimId);
      if (!claim) throw new AppError('Carbon claim not found', 404, 'NOT_FOUND');
      const claimBuyerId = claim.buyerOrganizationId?.toString();
      if (
        claim.productId?.toString() !== productId
        || claim.supplierId.toString() !== supplierId
        || (claimBuyerId && claimBuyerId !== buyerOrganizationId)
        || !/PCF|CARBON[_ ]?FOOTPRINT|CARBON[_ ]?INTENSITY/i.test(claim.type)
      ) {
        throw new AppError('The selected carbon claim does not belong to this purchase', 403, 'FORBIDDEN');
      }
      return claim;
    }

    const claim = await ClaimModel.findOne(claimFilter).sort({ createdAt: -1 });
    return claim || null;
  }

  async calculatePurchaseEmissions(params: {
    purchaseId: string;
    carbonFactorId?: string;
    customFactor?: number;
    claimId?: string;
    customerOrgId: string;
  }) {
    if (!mongoose.isValidObjectId(params.purchaseId)) {
      throw new AppError('Purchase not found', 404, 'NOT_FOUND');
    }
    const purchase = await PurchaseModel.findById(params.purchaseId).populate('productId');
    if (!purchase) {
      throw new AppError('Purchase not found', 404, 'NOT_FOUND');
    }
    if (purchase.customerOrganizationId.toString() !== params.customerOrgId) {
      throw new AppError('You cannot calculate emissions for this purchase', 403, 'FORBIDDEN');
    }

    const supplierRecord = await SupplierModel.findById(purchase.supplierId);
    if (!supplierRecord || supplierRecord.organizationId.toString() !== purchase.supplierOrganizationId.toString()) {
      throw new AppError('Purchase supplier organization is invalid', 409, 'INVALID_PURCHASE');
    }

    const product = await ProductModel.findById(purchase.productId);
    if (!product) {
      throw new AppError('Purchase product not found', 404, 'NOT_FOUND');
    }
    if (product.supplierId.toString() !== purchase.supplierId.toString()) {
      throw new AppError('Purchase product does not belong to its supplier', 409, 'INVALID_PURCHASE');
    }

    if (params.carbonFactorId && (params.claimId || params.customFactor !== undefined)) {
      throw new AppError('Choose one carbon source for this calculation', 400, 'INVALID_FACTOR_SELECTION');
    }
    if (params.carbonFactorId && !mongoose.isValidObjectId(params.carbonFactorId)) {
      throw new AppError('The selected carbon factor was not found', 404, 'NOT_FOUND');
    }

    let configuredFactor: ICarbonFactorDocument | null = null;
    if (params.carbonFactorId) {
      configuredFactor = await CarbonFactorModel.findById(params.carbonFactorId);
    }
    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId: params.customerOrgId,
      supplierOrganizationId: purchase.supplierOrganizationId,
      status: { $ne: SupplierStatus.TERMINATED },
    });
    if (!configuredFactor && !relationship?.sharedDataPermissions.carbon && params.claimId) {
      throw new AppError('Carbon data is not shared with this buyer', 403, 'FORBIDDEN');
    }
    const claim = !params.carbonFactorId && relationship?.sharedDataPermissions.carbon
      ? await this.resolveRelevantClaim(product._id.toString(), purchase.supplierId.toString(), params.customerOrgId, params.claimId)
      : null;
    const claimValue = finiteNonNegativeValue(claim?.value);
    let factorValue = claimValue;
    let factorUnit = claim?.unit || '';
    let factorSource = claim ? `Supplier Claim (${claim.reportingPeriod || 'reporting period not provided'})` : 'UNAVAILABLE';
    let methodology = claim?.methodology;
    let evidenceStatus: ClaimStatus = claim?.status || ClaimStatus.PENDING;
    let claimId = claim?._id.toString();
    let reason: string | undefined;
    let status: CarbonCalculationStatus = CarbonCalculationStatus.CALCULATED;
    let totalEmissions = 0;
    const requestedFactorFound = !params.carbonFactorId || !!configuredFactor;
    let factorFunctionalUnit = claim?.normalizedData?.functionalUnit;
    let factorBoundary = claim?.normalizedData?.boundary || claim?.boundary;
    let factorReportingPeriod = claim?.normalizedData?.reportingPeriod || claim?.reportingPeriod;
    let sourceReference = claim?.sourceReference;

    if (configuredFactor) {
      factorValue = finiteNonNegativeValue(configuredFactor.value);
      factorUnit = configuredFactor.unit;
      factorSource = configuredFactor.source;
      methodology = configuredFactor.methodology;
      factorReportingPeriod = String(configuredFactor.year);
      factorFunctionalUnit = undefined;
      factorBoundary = undefined;
      evidenceStatus = ClaimStatus.PARTIALLY_SUPPORTED;
      claimId = undefined;
      sourceReference = undefined;
    }

    if (!params.carbonFactorId && claim && ![ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED, ClaimStatus.PARTIALLY_SUPPORTED].includes(claim.status)) {
      status = CarbonCalculationStatus.BLOCKED;
      reason = 'Cannot calculate procurement emissions. Carbon claim has not met the existing support and verification rules.';
    } else if (!claim && !params.carbonFactorId) {
      status = CarbonCalculationStatus.BLOCKED;
      reason = 'Cannot calculate procurement emissions. No supported claim or configured carbon factor is available for this purchase.';
    } else if (params.customFactor !== undefined && (!claim || finiteNonNegativeValue(params.customFactor) !== claimValue)) {
      status = CarbonCalculationStatus.BLOCKED;
      reason = 'Cannot calculate procurement emissions. A custom input cannot override supported claim data without verification.';
    } else if (!requestedFactorFound) {
      status = CarbonCalculationStatus.BLOCKED;
      reason = 'Cannot calculate procurement emissions. The selected carbon factor was not found.';
    } else if (!params.carbonFactorId && claim && claimValue === undefined) {
      status = CarbonCalculationStatus.BLOCKED;
      reason = 'Cannot calculate procurement emissions. The carbon claim does not contain a finite, non-negative value.';
    } else if (!factorUnit || factorValue === undefined || !Number.isFinite(factorValue) || factorValue < 0) {
      status = CarbonCalculationStatus.BLOCKED;
      reason = 'Cannot calculate procurement emissions. The carbon factor value or unit is unavailable or invalid.';
    } else if (!finiteNonNegativeValue(purchase.quantity) || !purchase.unit) {
      status = CarbonCalculationStatus.BLOCKED;
      reason = 'Cannot calculate procurement emissions. The purchased quantity or unit is unavailable or invalid.';
    }

    const normalizedIntensity = factorValue !== undefined && factorUnit
      ? normalizeCarbonData({
          value: factorValue,
          unit: factorUnit,
          functionalUnit: factorFunctionalUnit,
          boundary: factorBoundary,
          reportingPeriod: factorReportingPeriod,
        })
      : undefined;
    const normalizedQuantity = status === CarbonCalculationStatus.BLOCKED
      ? undefined
      : normalizeUnitValue(Number(purchase.quantity), purchase.unit);
    const normalizedDenominator = normalizedIntensity?.normalizedUnit?.split('/')[1];
    if (status !== CarbonCalculationStatus.BLOCKED && (
      !normalizedIntensity
      || normalizedIntensity.normalizedValue === undefined
      || !normalizedIntensity.normalizedUnit
      || !normalizedQuantity
      || !normalizedDenominator
      || normalizedDenominator !== normalizedQuantity.unit
    )) {
      status = CarbonCalculationStatus.BLOCKED;
      reason = 'Cannot calculate procurement emissions. Carbon intensity is not dimensionally compatible with the purchased quantity unit.';
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
        carbonFactor: factorValue,
        carbonFactorUnit: factorUnit || undefined,
        normalizedCarbonIntensity: normalizedIntensity?.normalizedValue,
        normalizedUnit: normalizedIntensity?.normalizedUnit,
        functionalUnit: factorFunctionalUnit,
        lifecycleBoundary: factorBoundary,
        reportingPeriod: factorReportingPeriod,
        factorSource,
        methodology,
        emissionsUnit: 'kgCO2e',
        status,
        evidenceStatus,
        claimId,
        sourceReference,
        reason,
        calculationVersion: 1,
        calculatedAt: new Date(),
      });
    }

    totalEmissions = Number((normalizedQuantity!.value * normalizedIntensity!.normalizedValue!).toFixed(6));

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
      carbonFactor: factorValue!,
      carbonFactorUnit: factorUnit,
      normalizedCarbonIntensity: normalizedIntensity!.normalizedValue,
      normalizedUnit: normalizedIntensity!.normalizedUnit,
      functionalUnit: normalizedIntensity!.functionalUnit,
      lifecycleBoundary: normalizedIntensity!.boundary,
      reportingPeriod: normalizedIntensity!.reportingPeriod,
      factorSource,
      methodology,
      totalEmissions,
      calculatedEmissions: totalEmissions,
      emissionsUnit: 'kgCO2e',
      status,
      evidenceStatus,
      claimId,
      sourceReference,
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

    let canViewCarbon = true;
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
      canViewCarbon = relationship.sharedDataPermissions.carbon === true;
    }

    const claims = canViewCarbon
      ? await ClaimModel.find({
          productId,
          supplierId: supplier._id,
          ...(user.organizationType === OrganizationType.CUSTOMER ? {
            $or: [
              { buyerOrganizationId: user.organizationId },
              { buyerOrganizationId: { $exists: false } },
              { buyerOrganizationId: null },
            ],
          } : {}),
        }).populate('sourceReference.documentId', 'filename').sort({ createdAt: -1 })
      : [];
    const productView = product.toObject();
    if (!canViewCarbon || user.organizationType === OrganizationType.CUSTOMER) delete productView.carbonData;
    return {
      product: productView,
      supplier,
      latestClaim: claims[0] || null,
      claims,
    };
  }

  async getSupplierCarbonProfile(supplierId: string, user: NonNullable<Request['user']>) {
    if (!mongoose.isValidObjectId(supplierId)) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');

    let canViewCarbon = true;
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
      canViewCarbon = relationship.sharedDataPermissions.carbon === true;
    }

    const [products, claims, certificates, dataRequests, questionResponses, organization] = await Promise.all([
      ProductModel.find({ supplierId: supplier._id }).sort({ name: 1 }),
      canViewCarbon
        ? ClaimModel.find({
            supplierId: supplier._id,
            ...(user.organizationType === OrganizationType.CUSTOMER ? {
              $or: [
                { buyerOrganizationId: user.organizationId },
                { buyerOrganizationId: { $exists: false } },
                { buyerOrganizationId: null },
              ],
            } : {}),
          }).sort({ createdAt: -1 })
        : Promise.resolve([]),
      CertificateModel.find({ supplierId: supplier._id }).sort({ expiryDate: 1 }),
      DataRequestModel.find({ supplierOrganizationId: supplier.organizationId }).sort({ createdAt: -1 }),
      QuestionResponseModel.find({ supplierId: supplier._id }).sort({ submittedAt: -1 }),
      OrganizationModel.findById(supplier.organizationId),
    ]);

    const productIds = products.map((product) => product._id);
    const validClaims = claims.filter((claim): claim is typeof claim & { productId: string } => !!claim.productId && productIds.some((id) => id.toString() === claim.productId!.toString()));
    const carbonClaims = validClaims.filter((claim) => /PCF|CARBON[_ ]?FOOTPRINT|CARBON[_ ]?INTENSITY/i.test(claim.type));
    const reportedCarbonIntensityValues = carbonClaims
      .map((claim) => ({ value: finiteNonNegativeValue(claim.value), unit: claim.unit }))
      .filter((entry): entry is { value: number; unit: string } => entry.value !== undefined && !!entry.unit)
      .map((entry) => entry.value);
    const reportingPeriods = [...new Set(validClaims.map((claim) => claim.normalizedData?.reportingPeriod || claim.reportingPeriod).filter(Boolean))];
    const lifecycleBoundaries = [...new Set(validClaims.map((claim) => claim.normalizedData?.boundary || claim.boundary).filter(Boolean))];
    const functionalUnits = [...new Set(validClaims.map((claim) => claim.normalizedData?.functionalUnit || claim.unit).filter(Boolean))];

    const productSummary = products.map((product) => {
      const relevantClaims = carbonClaims.filter((claim) => claim.productId?.toString() === product._id.toString());
      const latestClaim = relevantClaims[0] || null;
      const carbonValue = latestClaim ? finiteNonNegativeValue(latestClaim.value) : undefined;
      const carbonIntensity = latestClaim && latestClaim.unit ? carbonValue ?? null : null;
      const evidenceStatus = latestClaim ? latestClaim.status : 'NOT_AVAILABLE';
      const corroborationStatus = latestClaim?.status === ClaimStatus.CORROBORATED ? 'Corroborated' : latestClaim ? 'Not available' : 'Not available';
      const dataQualityStatus = latestClaim ? this.mapClaimStatusToQuality(latestClaim.status) : 'NOT_AVAILABLE';
      return {
        product: product.name,
        unit: latestClaim?.unit || 'Unavailable',
        carbonIntensity: carbonIntensity ?? null,
        functionalUnit: latestClaim?.normalizedData?.functionalUnit || 'UNKNOWN',
        lifecycleBoundary: latestClaim?.normalizedData?.boundary || latestClaim?.boundary || 'UNKNOWN',
        reportingPeriod: latestClaim?.normalizedData?.reportingPeriod || latestClaim?.reportingPeriod || 'UNKNOWN',
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
      totalProductsWithCarbonData: new Set(carbonClaims.filter((claim) => finiteNonNegativeValue(claim.value) !== undefined && !!claim.unit).map((claim) => claim.productId!.toString())).size,
      numberOfProductsWithCarbonData: new Set(carbonClaims.filter((claim) => finiteNonNegativeValue(claim.value) !== undefined && !!claim.unit).map((claim) => claim.productId!.toString())).size,
      productsWithMissingCarbonData: products.length - new Set(carbonClaims.filter((claim) => finiteNonNegativeValue(claim.value) !== undefined && !!claim.unit).map((claim) => claim.productId!.toString())).size,
      supportedClaims: carbonClaims.filter((claim) => claim.status === ClaimStatus.SUPPORTED).length,
      unsupportedClaims: carbonClaims.filter((claim) => claim.status === ClaimStatus.UNSUPPORTED || claim.status === ClaimStatus.NEEDS_REVIEW).length,
      inconsistentClaims: carbonClaims.filter((claim) => claim.status === ClaimStatus.INCONSISTENT).length,
      corroboratedClaims: carbonClaims.filter((claim) => claim.status === ClaimStatus.CORROBORATED).length,
      productsWithoutCarbonData: products.length - new Set(carbonClaims.filter((claim) => finiteNonNegativeValue(claim.value) !== undefined && !!claim.unit).map((claim) => claim.productId!.toString())).size,
      missingEvidence: carbonClaims.filter((claim) => claim.status === ClaimStatus.UNSUPPORTED || claim.status === ClaimStatus.NEEDS_REVIEW || claim.status === ClaimStatus.PENDING).length,
      internallyConsistentClaims: carbonClaims.filter((claim) => claim.status === ClaimStatus.PARTIALLY_SUPPORTED).length,
    };

    const dataQuality = {
      SUPPORTED: carbonClaims.filter((claim) => claim.status === ClaimStatus.SUPPORTED).length,
      CORROBORATED: carbonClaims.filter((claim) => claim.status === ClaimStatus.CORROBORATED).length,
      INTERNALLY_CONSISTENT: carbonClaims.filter((claim) => claim.status === ClaimStatus.PARTIALLY_SUPPORTED).length,
      INCONSISTENT: carbonClaims.filter((claim) => claim.status === ClaimStatus.INCONSISTENT).length,
      UNSUPPORTED: carbonClaims.filter((claim) => claim.status === ClaimStatus.UNSUPPORTED || claim.status === ClaimStatus.NEEDS_REVIEW).length,
      NOT_AVAILABLE: Math.max(0, products.length - new Set(carbonClaims.filter((claim) => finiteNonNegativeValue(claim.value) !== undefined && !!claim.unit).map((claim) => claim.productId!.toString())).size),
    };

    const carbonData = {
      numberOfProductsWithCarbonData: new Set(carbonClaims.filter((claim) => finiteNonNegativeValue(claim.value) !== undefined && !!claim.unit).map((claim) => claim.productId!.toString())).size,
      productsWithMissingCarbonData: products.length - new Set(carbonClaims.filter((claim) => finiteNonNegativeValue(claim.value) !== undefined && !!claim.unit).map((claim) => claim.productId!.toString())).size,
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
      const productClaims = carbonClaims.filter((claim) => claim.productId?.toString() === product._id.toString());
      if (productClaims.length < 2) return [];

      const comparableValues = productClaims
        .filter((claim) => [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED].includes(claim.status))
        .map((claim) => {
          const value = finiteNonNegativeValue(claim.value);
          const normalized = value !== undefined && claim.unit
            ? normalizeCarbonData({ value, unit: claim.unit })
            : undefined;
          return {
            value: normalized?.normalizedValue,
            unit: normalized?.normalizedUnit,
            functionalUnit: claim.normalizedData?.functionalUnit,
            lifecycleBoundary: claim.normalizedData?.boundary || claim.boundary,
            reportingPeriod: claim.normalizedData?.reportingPeriod || claim.reportingPeriod,
            methodology: claim.methodology,
          };
        })
        .filter((entry): entry is typeof entry & {
          value: number;
          unit: string;
          functionalUnit: string;
          lifecycleBoundary: string;
          reportingPeriod: string;
          methodology: string;
        } => entry.value !== undefined && !!entry.unit && !!entry.functionalUnit && !!entry.lifecycleBoundary && !!entry.reportingPeriod && !!entry.methodology);

      if (!comparableValues.length) return [];

      const baseline = comparableValues[0];
      const values = comparableValues.filter((entry) =>
        entry.unit === baseline.unit &&
        entry.functionalUnit === baseline.functionalUnit &&
        entry.lifecycleBoundary === baseline.lifecycleBoundary &&
        entry.methodology === baseline.methodology
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
      products: canViewCarbon && user.organizationType === OrganizationType.SUPPLIER ? products : products.map((item) => {
        const productView = item.toObject();
        delete productView.carbonData;
        return productView;
      }),
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

    const claimScope = {
      supplierId: supplier._id,
      productId: product._id,
      $or: [
        { buyerOrganizationId: purchase.customerOrganizationId },
        { buyerOrganizationId: { $exists: false } },
        { buyerOrganizationId: null },
      ],
    };
    const claim = await ClaimModel.findOne({
      ...claimScope,
      type: /PCF|CARBON[_ ]?FOOTPRINT|CARBON[_ ]?INTENSITY/i,
    }).populate('sourceReference.documentId', 'filename').sort({ createdAt: -1 });
    const relationship = user.organizationType === OrganizationType.SUPPLIER
      ? undefined
      : await SupplierRelationshipModel.findOne({
          customerOrganizationId: purchase.customerOrganizationId,
          supplierOrganizationId: purchase.supplierOrganizationId,
          status: { $ne: SupplierStatus.TERMINATED },
        });
    const canViewCarbon = user.organizationType === OrganizationType.SUPPLIER
      || relationship?.sharedDataPermissions.carbon === true;
    const claimValue = finiteNonNegativeValue(claim?.value);
    const eligibleClaim = canViewCarbon && claim
      && [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED, ClaimStatus.PARTIALLY_SUPPORTED].includes(claim.status)
      && claimValue !== undefined
      && !!claim.unit
      ? claim
      : null;
    const expectedIntensitySource = eligibleClaim
      ? {
          value: claimValue!,
          unit: eligibleClaim.unit,
          functionalUnit: eligibleClaim.normalizedData?.functionalUnit,
          boundary: eligibleClaim.normalizedData?.boundary || eligibleClaim.boundary,
          reportingPeriod: eligibleClaim.normalizedData?.reportingPeriod || eligibleClaim.reportingPeriod,
          methodology: eligibleClaim.methodology,
          evidenceStatus: eligibleClaim.status,
          source: 'claim',
          claimId: eligibleClaim._id.toString(),
          sourceReference: mapSourceReference(eligibleClaim.sourceReference),
        }
      : null;

    const actualCalculation = await CarbonCalculationModel.findOne({ purchaseId: purchase._id })
      .populate('sourceReference.documentId', 'filename')
      .sort({ calculatedAt: -1 });
    const actualValue = finiteNonNegativeValue(actualCalculation?.normalizedCarbonIntensity);
    const actualIntensitySource = actualCalculation
      && actualCalculation.status === CarbonCalculationStatus.CALCULATED
      && [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED, ClaimStatus.PARTIALLY_SUPPORTED].includes(actualCalculation.evidenceStatus)
      && actualValue !== undefined
      && actualCalculation.normalizedUnit
      ? {
          value: actualValue,
          unit: actualCalculation.normalizedUnit,
          functionalUnit: actualCalculation.functionalUnit,
          boundary: actualCalculation.lifecycleBoundary,
          reportingPeriod: actualCalculation.reportingPeriod,
          methodology: actualCalculation.methodology,
          evidenceStatus: actualCalculation.evidenceStatus,
          source: 'calculation',
          sourceReference: mapSourceReference(actualCalculation.sourceReference),
        }
      : null;

    const result = calculateExpectedActualTracking({
      expectedQuantity: Number(purchase.quantity),
      expectedQuantityUnit: purchase.unit,
      expectedCarbonIntensity: expectedIntensitySource?.value,
      expectedCarbonIntensityUnit: expectedIntensitySource?.unit,
      expectedFunctionalUnit: expectedIntensitySource?.functionalUnit,
      expectedBoundary: expectedIntensitySource?.boundary,
      expectedReportingPeriod: expectedIntensitySource?.reportingPeriod,
      expectedMethodology: expectedIntensitySource?.methodology,
      actualQuantity: actualIntensitySource ? Number(actualCalculation!.quantity) : undefined,
      actualQuantityUnit: actualIntensitySource ? actualCalculation!.quantityUnit : undefined,
      actualCarbonIntensity: actualIntensitySource?.value,
      actualCarbonIntensityUnit: actualIntensitySource?.unit,
      actualFunctionalUnit: actualIntensitySource?.functionalUnit,
      actualBoundary: actualIntensitySource?.boundary,
      actualReportingPeriod: actualIntensitySource?.reportingPeriod,
      actualMethodology: actualIntensitySource?.methodology,
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
        quantityUnit: purchase.unit,
        carbonIntensity: expectedIntensitySource?.value,
        carbonIntensityUnit: expectedIntensitySource?.unit,
        functionalUnit: expectedIntensitySource?.functionalUnit,
        lifecycleBoundary: expectedIntensitySource?.boundary,
        reportingPeriod: expectedIntensitySource?.reportingPeriod,
        methodology: expectedIntensitySource?.methodology,
        evidenceStatus: expectedIntensitySource?.evidenceStatus || ClaimStatus.PENDING,
        carbonDataSource: expectedIntensitySource?.source || 'UNAVAILABLE',
        claimId: expectedIntensitySource?.claimId,
        sourceReference: expectedIntensitySource?.sourceReference,
        emissions: result.expectedEmissions,
      },
      actual: {
        quantity: actualIntensitySource ? Number(actualCalculation!.quantity) : undefined,
        quantityUnit: actualIntensitySource ? actualCalculation!.quantityUnit : undefined,
        carbonIntensity: actualIntensitySource?.value,
        carbonIntensityUnit: actualIntensitySource?.unit,
        functionalUnit: actualIntensitySource?.functionalUnit,
        lifecycleBoundary: actualIntensitySource?.boundary,
        reportingPeriod: actualIntensitySource?.reportingPeriod,
        methodology: actualIntensitySource?.methodology,
        evidenceStatus: actualIntensitySource?.evidenceStatus || ClaimStatus.PENDING,
        carbonDataSource: actualIntensitySource?.source || 'UNAVAILABLE',
        sourceReference: actualIntensitySource?.sourceReference,
        factorSource: actualIntensitySource ? actualCalculation?.factorSource : undefined,
        emissions: result.actualEmissions,
        calculationId: actualIntensitySource ? actualCalculation?._id.toString() : undefined,
        calculationVersion: actualIntensitySource ? actualCalculation?.calculationVersion : undefined,
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

    const validRecords = await Promise.all(purchases.map((purchase) => this.getPurchaseCarbonTracking(purchase._id.toString(), user)));

    const totalExpected = sumForSingleCarbonBasis(validRecords.map((record) => ({
      emissions: record.expected.emissions,
      carbonIntensityUnit: record.expected.carbonIntensityUnit,
      functionalUnit: record.expected.functionalUnit,
      lifecycleBoundary: record.expected.lifecycleBoundary,
      reportingPeriod: record.expected.reportingPeriod,
      methodology: record.expected.methodology,
    })));
    const totalActual = sumForSingleCarbonBasis(validRecords.map((record) => ({
      emissions: record.actual.emissions,
      carbonIntensityUnit: record.actual.carbonIntensityUnit,
      functionalUnit: record.actual.functionalUnit,
      lifecycleBoundary: record.actual.lifecycleBoundary,
      reportingPeriod: record.actual.reportingPeriod,
      methodology: record.actual.methodology,
    })));
    const comparableRecords = validRecords.filter((record) => record.status === 'COMPLETE');
    const completeBases = new Set(comparableRecords.map((record) => carbonBasis({
      carbonIntensityUnit: record.expected.carbonIntensityUnit,
      functionalUnit: record.expected.functionalUnit,
      lifecycleBoundary: record.expected.lifecycleBoundary,
      reportingPeriod: record.expected.reportingPeriod,
      methodology: record.expected.methodology,
    })));
    const comparableExpected = sumForSingleCarbonBasis(comparableRecords.map((record) => ({
      emissions: record.expected.emissions,
      carbonIntensityUnit: record.expected.carbonIntensityUnit,
      functionalUnit: record.expected.functionalUnit,
      lifecycleBoundary: record.expected.lifecycleBoundary,
      reportingPeriod: record.expected.reportingPeriod,
      methodology: record.expected.methodology,
    })));
    const totalVariance = comparableRecords.length > 0 && completeBases.size === 1
      ? comparableRecords.reduce((sum, record) => sum + (record.variance ?? 0), 0)
      : undefined;
    const variancePercent = totalVariance !== undefined && comparableExpected !== undefined && comparableExpected !== 0
      ? (totalVariance / comparableExpected) * 100
      : undefined;

    return {
      summary: {
        totalExpectedEmissions: totalExpected ?? null,
        totalActualEmissions: totalActual ?? null,
        totalVariance: totalVariance === undefined ? null : Number(totalVariance.toFixed(6)),
        variancePercent: variancePercent === undefined ? null : Number(variancePercent.toFixed(4)),
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

    const relationshipByOrganizationId = new Map(relationships.map((relationship) => [
      relationship.supplierOrganizationId.toString(),
      relationship,
    ]));
    const organizationById = new Map((await OrganizationModel.find({ _id: { $in: organizationIds } })).map((organization) => [organization._id.toString(), organization]));
    const suppliers = await Promise.all(uniqueSupplierIds.map(async (supplierId) => {
      const supplier = supplierRecords.find((record) => record._id.toString() === supplierId);
      if (!supplier) return null;

      const candidateProduct = await ProductModel.findOne({
        supplierId: supplier._id,
        $or: [{ _id: product._id }, { name: product.name, category: product.category }],
      });
      if (!candidateProduct) return null;

      const relationship = relationshipByOrganizationId.get(supplier.organizationId.toString());
      const canViewCarbon = relationship?.sharedDataPermissions.carbon === true;
      const claim = canViewCarbon
        ? await ClaimModel.findOne({
            productId: candidateProduct._id,
            supplierId: supplier._id,
            type: /PCF|CARBON[_ ]?FOOTPRINT|CARBON[_ ]?INTENSITY/i,
            $or: [
              { buyerOrganizationId: params.user.organizationId },
              { buyerOrganizationId: { $exists: false } },
              { buyerOrganizationId: null },
            ],
          }).populate('sourceReference.documentId', 'filename').sort({ createdAt: -1 })
        : null;
      const purchaseRows = await PurchaseModel.find({
        customerOrganizationId: params.user.organizationId,
        supplierId: supplier._id,
        productId: candidateProduct._id,
      }).sort({ purchaseDate: -1 });

      const purchaseCount = purchaseRows.length;
      const normalizedPurchaseQuantities = purchaseRows.map((purchase) => {
        const quantity = finiteNonNegativeValue(purchase.quantity);
        return quantity !== undefined && purchase.unit
          ? normalizeUnitValue(quantity, purchase.unit)
          : undefined;
      });
      const quantityUnits = new Set(normalizedPurchaseQuantities.map((quantity) => quantity?.unit));
      const totalQuantity = purchaseRows.length > 0
        && normalizedPurchaseQuantities.every((quantity) => quantity !== undefined)
        && quantityUnits.size === 1
        ? Number(normalizedPurchaseQuantities.reduce((sum, quantity) => sum + quantity!.value, 0).toFixed(6))
        : null;
      const totalQuantityUnit = totalQuantity !== null ? normalizedPurchaseQuantities[0]?.unit || null : null;
      const lastPurchase = purchaseRows[0];
      const latestPrice = purchaseRows.find((purchase) => {
        const price = finiteNonNegativeValue(purchase.unitPrice?.toString());
        return price !== undefined;
      });
      const currentPrice = finiteNonNegativeValue(candidateProduct.sellingPrice);
      const baseQuantity = normalizeUnitValue(1, product.unit);
      const candidateQuantity = normalizeUnitValue(1, candidateProduct.unit);
      const pricePerUnit = currentPrice !== undefined && baseQuantity && candidateQuantity
        && baseQuantity.unit === candidateQuantity.unit
        ? Number((currentPrice * baseQuantity.value / candidateQuantity.value).toFixed(6))
        : null;
      const priceCurrency = pricePerUnit !== null ? candidateProduct.currency || undefined : undefined;

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
      const rawIntensity = finiteNonNegativeValue(claim?.value);
      const normalizedCarbon = rawIntensity !== undefined && claim?.unit
        ? normalizeCarbonData({ value: rawIntensity, unit: claim.unit })
        : undefined;
      const comparableCarbon = claim
        && [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED].includes(claim.status)
        && normalizedCarbon
        && normalizedCarbon.normalizedValue !== undefined
        && !!normalizedCarbon.normalizedUnit
        && claim.normalizedData?.functionalUnit
        && (claim.normalizedData?.boundary || claim.boundary)
        && (claim.normalizedData?.reportingPeriod || claim.reportingPeriod)
        && claim.methodology
        ? {
            value: normalizedCarbon.normalizedValue,
            unit: normalizedCarbon.normalizedUnit,
            functionalUnit: claim.normalizedData.functionalUnit,
            boundary: claim.normalizedData.boundary || claim.boundary,
            reportingPeriod: claim.normalizedData.reportingPeriod || claim.reportingPeriod,
            methodology: claim.methodology,
          }
        : null;

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
        priceSource: pricePerUnit !== null ? 'Current product price' : 'NOT_AVAILABLE',
        carbonIntensity: rawIntensity ?? null,
        carbonUnit: claim?.unit || null,
        functionalUnit: claim?.normalizedData?.functionalUnit,
        lifecycleBoundary: claim?.normalizedData?.boundary || claim?.boundary,
        reportingPeriod: claim?.normalizedData?.reportingPeriod || claim?.reportingPeriod,
        methodology: claim?.methodology,
        sourceReference: mapSourceReference(claim?.sourceReference),
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
          totalQuantityUnit,
          lastPurchaseDate: latestPrice?.purchaseDate || lastPurchase?.purchaseDate || null,
          lastPrice: latestPrice ? finiteNonNegativeValue(latestPrice.unitPrice?.toString()) ?? null : null,
          currency: latestPrice ? latestPrice.currency : null,
        },
        warnings: [
          ...(claim && claim.status === ClaimStatus.INCONSISTENT ? ['Evidence issue: this supplier carbon claim is internally inconsistent.'] : []),
          ...(claim && [ClaimStatus.UNSUPPORTED, ClaimStatus.NEEDS_REVIEW].includes(claim.status) ? ['Carbon evidence is unsupported or requires review.'] : []),
          ...(claim && !comparableCarbon && ![ClaimStatus.UNSUPPORTED, ClaimStatus.NEEDS_REVIEW, ClaimStatus.INCONSISTENT].includes(claim.status) ? ['Carbon data is not eligible for direct comparison because support or required PCF metadata is unavailable.'] : []),
          ...(!claim ? ['Carbon data unavailable.'] : []),
          ...(!canViewCarbon ? ['Carbon data is not shared with this buyer.'] : []),
          ...(pricePerUnit === null && latestPrice ? ['Historical purchase pricing is shown separately; a current product price is unavailable.'] : []),
        ],
        comparableCarbon,
      };
    }));

    const rows = suppliers.filter((row): row is NonNullable<typeof row> => !!row);
    if (!rows.length) throw new AppError('No supplier comparisons available', 404, 'NOT_FOUND');

    const warnings: string[] = [];
    const comparableRows = rows.filter((row): row is typeof row & {
      comparableCarbon: NonNullable<typeof row.comparableCarbon> & {
        value: number;
        unit: string;
        functionalUnit: string;
        boundary: string;
        reportingPeriod: string;
        methodology: string;
      };
    } => !!row.comparableCarbon
      && row.comparableCarbon.value !== undefined
      && !!row.comparableCarbon.unit
      && !!row.comparableCarbon.functionalUnit
      && !!row.comparableCarbon.boundary
      && !!row.comparableCarbon.reportingPeriod
      && !!row.comparableCarbon.methodology);
    const comparisonGroups = new Map<string, typeof comparableRows>();
    for (const row of comparableRows) {
      const carbon = row.comparableCarbon!;
      const key = [
        normalizeText(carbon.unit),
        normalizeText(carbon.functionalUnit),
        normalizeText(carbon.boundary),
        normalizeText(carbon.reportingPeriod),
        normalizeText(carbon.methodology),
      ].join('|');
      comparisonGroups.set(key, [...(comparisonGroups.get(key) || []), row]);
    }
    const largestComparableGroup = [...comparisonGroups.values()].sort((left, right) => right.length - left.length)[0] || [];
    if (comparableRows.length > largestComparableGroup.length) {
      warnings.push('Some supported carbon claims were excluded because their units, functional units, lifecycle boundaries, reporting periods, or methodologies differ.');
    }

    let tradeOff;
    const pricedComparableRows = largestComparableGroup.filter((row) => row.pricePerUnit !== null && row.currency);
    const currencies = new Set(pricedComparableRows.map((row) => row.currency));
    if (Number.isFinite(params.quantity) && params.quantity! > 0 && pricedComparableRows.length >= 2 && currencies.size === 1) {
      const cheapest = [...pricedComparableRows].sort((left, right) => left.pricePerUnit! - right.pricePerUnit!)[0];
      const lowestEmissions = [...pricedComparableRows].sort((left, right) => left.comparableCarbon!.value - right.comparableCarbon!.value)[0];
      if (cheapest && lowestEmissions && cheapest !== lowestEmissions) {
        const cheapestEmissions = calculateCarbonEmissions(params.quantity!, product.unit, lowestEmissions.comparableCarbon!.value, lowestEmissions.comparableCarbon!.unit);
        const comparisonEmissions = calculateCarbonEmissions(params.quantity!, product.unit, cheapest.comparableCarbon!.value, cheapest.comparableCarbon!.unit);
        const cheapestCost = cheapest.pricePerUnit! * params.quantity!;
        const comparisonCost = lowestEmissions.pricePerUnit! * params.quantity!;
        if (cheapestEmissions !== undefined && comparisonEmissions !== undefined) {
          const costDifference = comparisonCost - cheapestCost;
          const emissionDifference = comparisonEmissions - cheapestEmissions;
          tradeOff = {
            quantity: params.quantity!,
            unit: product.unit,
            cheapestSupplier: cheapest.supplierName,
            lowestCost: cheapestCost,
            comparisonSupplier: lowestEmissions.supplierName,
            costDifference,
            currency: cheapest.currency,
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
        directlyComparableCount: largestComparableGroup.length > 1 ? largestComparableGroup.length : 0,
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
      if (leftSupplier.organizationId.toString() !== params.user.organizationId || rightSupplier.organizationId.toString() !== params.user.organizationId) {
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

    const buyerClaimFilter = {
      $or: [
        { buyerOrganizationId: params.user.organizationId },
        { buyerOrganizationId: { $exists: false } },
        { buyerOrganizationId: null },
      ],
    };
    const leftRelationship = params.user.organizationType === OrganizationType.SUPPLIER
      ? undefined
      : await SupplierRelationshipModel.findOne({
          customerOrganizationId: params.user.organizationId,
          supplierOrganizationId: leftSupplier.organizationId,
          status: { $ne: SupplierStatus.TERMINATED },
        });
    const rightRelationship = params.user.organizationType === OrganizationType.SUPPLIER
      ? undefined
      : await SupplierRelationshipModel.findOne({
          customerOrganizationId: params.user.organizationId,
          supplierOrganizationId: rightSupplier.organizationId,
          status: { $ne: SupplierStatus.TERMINATED },
        });
    const canViewLeftCarbon = params.user.organizationType === OrganizationType.SUPPLIER
      || leftRelationship?.sharedDataPermissions.carbon === true;
    const canViewRightCarbon = params.user.organizationType === OrganizationType.SUPPLIER
      || rightRelationship?.sharedDataPermissions.carbon === true;
    const leftClaim = canViewLeftCarbon
      ? await ClaimModel.findOne({ productId: leftProduct._id, supplierId: leftSupplier._id, type: /PCF|CARBON[_ ]?FOOTPRINT|CARBON[_ ]?INTENSITY/i, ...buyerClaimFilter }).populate('sourceReference.documentId', 'filename').sort({ createdAt: -1 })
      : null;
    const rightClaim = canViewRightCarbon
      ? await ClaimModel.findOne({ productId: rightProduct._id, supplierId: rightSupplier._id, type: /PCF|CARBON[_ ]?FOOTPRINT|CARBON[_ ]?INTENSITY/i, ...buyerClaimFilter }).populate('sourceReference.documentId', 'filename').sort({ createdAt: -1 })
      : null;

    if (!leftClaim || !rightClaim) {
      return {
        status: CarbonCalculationStatus.BLOCKED,
        reason: 'Comparison requires supported supplier carbon claims for both products.',
      };
    }

    const leftValue = finiteNonNegativeValue(leftClaim.value);
    const rightValue = finiteNonNegativeValue(rightClaim.value);
    const leftNormalized = leftValue !== undefined && leftClaim.unit
      ? normalizeCarbonData({ value: leftValue, unit: leftClaim.unit })
      : undefined;
    const rightNormalized = rightValue !== undefined && rightClaim.unit
      ? normalizeCarbonData({ value: rightValue, unit: rightClaim.unit })
      : undefined;
    const leftComparable = {
      unit: leftNormalized?.normalizedUnit || '',
      functionalUnit: leftClaim.normalizedData?.functionalUnit,
      boundary: leftClaim.normalizedData?.boundary || leftClaim.boundary,
      reportingPeriod: leftClaim.normalizedData?.reportingPeriod || leftClaim.reportingPeriod,
      methodology: leftClaim.methodology,
    };
    const rightComparable = {
      unit: rightNormalized?.normalizedUnit || '',
      functionalUnit: rightClaim.normalizedData?.functionalUnit,
      boundary: rightClaim.normalizedData?.boundary || rightClaim.boundary,
      reportingPeriod: rightClaim.normalizedData?.reportingPeriod || rightClaim.reportingPeriod,
      methodology: rightClaim.methodology,
    };
    const leftEligible = [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED].includes(leftClaim.status)
      && leftNormalized !== undefined;
    const rightEligible = [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED].includes(rightClaim.status)
      && rightNormalized !== undefined;
    const comparable = leftEligible && rightEligible
      && areComparablePcfValues(leftComparable, rightComparable, true);
    const warnings: string[] = [];
    if (!comparable) {
      if (normalizeText(leftComparable.functionalUnit) !== normalizeText(rightComparable.functionalUnit)) warnings.push('Different functional units');
      if (normalizeText(leftComparable.boundary) !== normalizeText(rightComparable.boundary)) warnings.push('Different life-cycle boundaries');
      if (normalizeText(leftComparable.reportingPeriod) !== normalizeText(rightComparable.reportingPeriod)) warnings.push('Different reporting years');
      if (normalizeText(leftComparable.methodology) !== normalizeText(rightComparable.methodology)) warnings.push('Methodologies differ or are missing');
      if (!leftEligible || !rightEligible) warnings.push('Carbon data is not eligible for comparison because a supported carbon claim is unavailable.');
    }

    const normalizedLeftValue = comparable ? leftNormalized!.normalizedValue : undefined;
    const normalizedRightValue = comparable ? rightNormalized!.normalizedValue : undefined;
    const absoluteDifference = normalizedLeftValue !== undefined && normalizedRightValue !== undefined
      ? Math.abs(normalizedLeftValue - normalizedRightValue)
      : undefined;
    const relativeDifference = normalizedLeftValue !== undefined && normalizedRightValue !== undefined && normalizedLeftValue !== 0
      ? (absoluteDifference! / normalizedLeftValue) * 100
      : undefined;
    const leftQuantity = params.quantity === undefined ? undefined : normalizeUnitValue(params.quantity, leftProduct.unit);
    const rightUnit = normalizeUnitValue(1, rightProduct.unit);
    const rightQuantity = leftQuantity && rightUnit && leftQuantity.unit === rightUnit.unit
      ? leftQuantity.value / rightUnit.value
      : undefined;
    const leftEmissions = comparable && params.quantity !== undefined
      ? calculateCarbonEmissions(params.quantity, leftProduct.unit, normalizedLeftValue!, leftComparable.unit)
      : undefined;
    const rightEmissions = comparable && rightQuantity !== undefined
      ? calculateCarbonEmissions(rightQuantity, rightProduct.unit, normalizedRightValue!, rightComparable.unit)
      : undefined;
    const estimatedDifferenceForQuantity = leftEmissions !== undefined && rightEmissions !== undefined
      ? Math.abs(leftEmissions - rightEmissions)
      : undefined;

    return {
      status: comparable ? 'COMPARABLE' : 'NOT_DIRECTLY_COMPARABLE',
      comparable,
      warnings,
      left: { supplier: leftSupplier, product: leftProduct, claim: leftClaim, value: normalizedLeftValue, unit: leftComparable.unit },
      right: { supplier: rightSupplier, product: rightProduct, claim: rightClaim, value: normalizedRightValue, unit: rightComparable.unit },
      absoluteDifference,
      relativeDifference,
      purchaseQuantity: params.quantity ?? 0,
      estimatedDifferenceForQuantity: estimatedDifferenceForQuantity !== undefined && Number.isFinite(estimatedDifferenceForQuantity)
        ? Number(estimatedDifferenceForQuantity.toFixed(6))
        : undefined,
    };
  }

  async getDashboard(user: NonNullable<Request['user']>) {
    const calculations = await CarbonCalculationModel.find({ customerOrganizationId: user.organizationId }).sort({ calculatedAt: -1 });
    const purchases = await PurchaseModel.find({ customerOrganizationId: user.organizationId });
    const latestByPurchase = new Map<string, typeof calculations[number]>();
    for (const calculation of calculations) {
      const purchaseId = calculation.purchaseId.toString();
      if (!latestByPurchase.has(purchaseId)) latestByPurchase.set(purchaseId, calculation);
    }
    const latestCalculations = [...latestByPurchase.values()];
    const calculatedRecords = latestCalculations.filter((calculation) =>
      calculation.status === CarbonCalculationStatus.CALCULATED
      && [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED, ClaimStatus.PARTIALLY_SUPPORTED].includes(calculation.evidenceStatus)
      && finiteNonNegativeValue(calculation.totalEmissions) !== undefined
    );
    const totalProcurementEmissions = sumForSingleCarbonBasis(calculatedRecords.map((calculation) => ({
      emissions: finiteNonNegativeValue(calculation.totalEmissions),
      carbonIntensityUnit: calculation.normalizedUnit,
      functionalUnit: calculation.functionalUnit,
      lifecycleBoundary: calculation.lifecycleBoundary,
      reportingPeriod: calculation.reportingPeriod,
      methodology: calculation.methodology === 'Not provided' ? undefined : calculation.methodology,
    })));
    const calculationPurchaseIds = new Set(calculatedRecords.map((calculation) => calculation.purchaseId.toString()));
    const supportedProductIds = new Set(calculatedRecords
      .filter((calculation) => calculation.evidenceStatus === ClaimStatus.SUPPORTED || calculation.evidenceStatus === ClaimStatus.CORROBORATED)
      .map((calculation) => calculation.productId.toString()));

    const metrics = {
      totalProcurementEmissions: totalProcurementEmissions ?? null,
      totalPurchasesWithCarbonData: calculatedRecords.length,
      productsWithSupportedCarbonData: supportedProductIds.size,
      productsRequiringVerification: latestCalculations.filter((calculation) =>
        calculation.status !== CarbonCalculationStatus.CALCULATED
        || ![ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED, ClaimStatus.PARTIALLY_SUPPORTED].includes(calculation.evidenceStatus)
      ).length,
      purchasesMissingCarbonData: purchases.filter((purchase) => !calculationPurchaseIds.has(purchase._id.toString())).length,
    };

    if (!latestCalculations.length && !purchases.length) {
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
carbonRoutes.post(
  '/factors',
  requireRoles(UserRole.CUSTOMER_ADMIN),
  validate(createCarbonFactorSchema),
  (req, res, next) => carbonController.createFactor(req, res, next)
);
