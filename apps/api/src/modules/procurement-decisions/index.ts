import { NextFunction, Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import {
  ClaimStatus,
  ComparisonStatus,
  OrganizationType,
  ProcurementDecisionStatus,
  CertificateStatus,
  ProductStatus,
  PurchaseStatus,
  SupplierStatus,
  IProcurementDecisionPriorities,
  IProcurementFactorResult,
  IProcurementRecommendationSnapshot,
  ProcurementDecisionFactor,
  ProcurementPriorityLevel,
} from '@carbonpilot/shared';
import {
  createProcurementDecisionSchema,
  finalizeProcurementDecisionSchema,
  procurementScenarioSchema,
  updateProcurementDecisionSchema,
} from '@carbonpilot/validation';
import { AuditLogModel } from '../../models/AuditLog';
import { ClaimModel } from '../../models/Claim';
import { IClaimDocument } from '../../models/Claim';
import { ClaimEvidenceLinkModel } from '../../models/ClaimEvidenceLink';
import { CertificateModel } from '../../models/Certificate';
import { DocumentModel } from '../../models/Document';
import { AnomalyModel } from '../../models/Anomaly';
import { OrganizationModel } from '../../models/Organization';
import { ProductModel } from '../../models/Product';
import { IProductDocument } from '../../models/Product';
import { ProcurementDecisionModel } from '../../models/ProcurementDecision';
import { PurchaseModel } from '../../models/Purchase';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { VerificationRunModel } from '../../models/VerificationRun';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { areComparablePcfValues, normalizeCarbonData, normalizeUnitValue } from '../verification/normalization';
import { calculateCarbonEmissions } from '../carbon';
import { AppError, sendSuccess } from '../../utils/response';

type AuthUser = NonNullable<Request['user']>;
type ProductRecord = IProductDocument | null;
type ClaimRecord = IClaimDocument | null;

const usableCarbonStatuses = new Set([ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED]);

function finiteNonNegativeValue(value: unknown): number | undefined {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return undefined;
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function normalizedText(value?: string) {
  return value?.trim().toLowerCase().replace(/\s+/g, '') || '';
}

function productsAreCompatible(left: NonNullable<ProductRecord>, right: NonNullable<ProductRecord>) {
  if (normalizedText(left.category) !== normalizedText(right.category)) return false;
  if (left.productCode && right.productCode) {
    if (normalizedText(left.productCode) !== normalizedText(right.productCode)) return false;
  } else if (normalizedText(left.name) !== normalizedText(right.name)) {
    return false;
  }

  const leftUnit = normalizeUnitValue(1, left.unit);
  const rightUnit = normalizeUnitValue(1, right.unit);
  return !!leftUnit && !!rightUnit && leftUnit.unit === rightUnit.unit;
}

function carbonDescription(claim: NonNullable<ClaimRecord>) {
  const rawValue = claim.value === null || claim.value === undefined || claim.value === '' ? Number.NaN : Number(claim.value);
  const normalizedValue = claim.normalizedData?.normalizedValue;
  const value = normalizedValue ?? rawValue;
  return {
    value: Number.isFinite(value) && value >= 0 ? value : undefined,
    unit: claim.normalizedData?.normalizedUnit || claim.unit || '',
    functionalUnit: claim.normalizedData?.functionalUnit,
    boundary: claim.normalizedData?.boundary || claim.boundary,
    reportingPeriod: claim.normalizedData?.reportingPeriod || claim.reportingPeriod,
    methodology: claim.methodology,
  };
}

function carbonSourceReference(claim: NonNullable<ClaimRecord>) {
  const reference = claim.sourceReference;
  if (!reference) return undefined;
  const document = reference.documentId && typeof reference.documentId === 'object'
    ? reference.documentId as unknown as { _id?: { toString(): string }; filename?: string }
    : undefined;
  return {
    documentId: document?._id?.toString()
      || (typeof reference.documentId === 'string' ? reference.documentId : undefined),
    documentName: document?.filename,
    page: reference.page,
    sourceText: reference.sourceText,
    sourceType: reference.sourceType,
    extractionMethod: reference.extractionMethod,
  };
}

function estimateEmissions(
  quantity: number,
  quantityUnit: string,
  intensity: number,
  intensityUnit: string
) {
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(intensity) || intensity < 0) return undefined;
  return calculateCarbonEmissions(quantity, quantityUnit, intensity, intensityUnit);
}

export function calculateDecisionTradeOff(left: {
  supplierId: string;
  supplierName: string;
  pricePerUnit?: number;
  totalCost?: number;
  currency?: string;
  priceUnit?: string;
  emissions?: number;
  intensity?: number;
  intensityUnit?: string;
  functionalUnit?: string;
  boundary?: string;
  reportingPeriod?: string;
  methodology?: string;
  evidenceStatus: string;
}, right: {
  supplierId: string;
  supplierName: string;
  pricePerUnit?: number;
  totalCost?: number;
  currency?: string;
  emissions?: number;
  intensity?: number;
  intensityUnit?: string;
  functionalUnit?: string;
  boundary?: string;
  reportingPeriod?: string;
  methodology?: string;
  evidenceStatus: string;
}) {
  const hasLeftCarbon = ['SUPPORTED', 'CORROBORATED'].includes(left.evidenceStatus)
    && Number.isFinite(left.emissions) && left.emissions! >= 0 && Number.isFinite(left.intensity) && left.intensity! >= 0 && !!left.intensityUnit;
  const hasRightCarbon = ['SUPPORTED', 'CORROBORATED'].includes(right.evidenceStatus)
    && Number.isFinite(right.emissions) && right.emissions! >= 0 && Number.isFinite(right.intensity) && right.intensity! >= 0 && !!right.intensityUnit;
  const comparable = hasLeftCarbon && hasRightCarbon && areComparablePcfValues(
    {
      unit: left.intensityUnit!,
      functionalUnit: left.functionalUnit,
      boundary: left.boundary,
      reportingPeriod: left.reportingPeriod,
      methodology: left.methodology,
    },
    {
      unit: right.intensityUnit!,
      functionalUnit: right.functionalUnit,
      boundary: right.boundary,
      reportingPeriod: right.reportingPeriod,
      methodology: right.methodology,
    },
    true
  );
  const carbonDifference = comparable ? Number((left.emissions! - right.emissions!).toFixed(6)) : undefined;
  const sameCurrency = !!left.currency && left.currency === right.currency;
  const costDifference = left.totalCost !== undefined && right.totalCost !== undefined && sameCurrency
    ? Number((left.totalCost - right.totalCost).toFixed(2))
    : undefined;
  const compatibilityWarnings: string[] = [];
  if (hasLeftCarbon && hasRightCarbon && !comparable) {
    if (normalizeUnitValue(1, left.intensityUnit!)?.unit !== normalizeUnitValue(1, right.intensityUnit!)?.unit) {
      compatibilityWarnings.push('Carbon intensity units differ.');
    }
    if (normalizedText(left.functionalUnit) !== normalizedText(right.functionalUnit)) {
      compatibilityWarnings.push('Functional units differ or are missing.');
    }
    if (normalizedText(left.boundary) !== normalizedText(right.boundary)) {
      compatibilityWarnings.push('Life-cycle boundaries differ or are missing.');
    }
    if (normalizedText(left.reportingPeriod) !== normalizedText(right.reportingPeriod)) {
      compatibilityWarnings.push('Reporting periods differ or are missing.');
    }
    if (normalizedText(left.methodology) !== normalizedText(right.methodology)) {
      compatibilityWarnings.push('Methodologies differ or are missing.');
    }
  }

  let costPerEstimatedTonneAvoided: number | undefined;
  if (comparable && costDifference !== undefined && carbonDifference !== undefined && carbonDifference !== 0) {
    const higherCostOptionHasLowerEmissions = (costDifference > 0 && carbonDifference < 0)
      || (costDifference < 0 && carbonDifference > 0);
    if (higherCostOptionHasLowerEmissions) {
      costPerEstimatedTonneAvoided = Number(
        (Math.abs(costDifference) / (Math.abs(carbonDifference) / 1000)).toFixed(2)
      );
    }
  }

  return {
    leftSupplierId: left.supplierId,
    rightSupplierId: right.supplierId,
    leftSupplierName: left.supplierName,
    rightSupplierName: right.supplierName,
    comparisonStatus: comparable ? ComparisonStatus.COMPARABLE : ComparisonStatus.NOT_DIRECTLY_COMPARABLE,
    currency: sameCurrency ? left.currency : undefined,
    purchaseCostDifference: costDifference,
    emissionsDifference: carbonDifference,
    emissionsDifferencePercent: comparable && carbonDifference !== undefined && right.emissions !== 0
      ? Number((carbonDifference! / right.emissions! * 100).toFixed(2))
      : undefined,
    costPerEstimatedTonneAvoided,
    warnings: [
      ...compatibilityWarnings,
      ...(!hasLeftCarbon || !hasRightCarbon ? ['Carbon comparison unavailable because valid supported carbon data is missing.'] : []),
      ...(!sameCurrency && left.totalCost !== undefined && right.totalCost !== undefined ? ['Purchase cost comparison unavailable because currencies differ.'] : []),
      ...(costPerEstimatedTonneAvoided !== undefined ? ['Cost per estimated tCO2e avoided is a mathematical estimate, not a guaranteed abatement cost.'] : []),
    ],
  };
}

const DEFAULT_DECISION_PRIORITIES: IProcurementDecisionPriorities = {
  price: 'MEDIUM',
  carbon: 'MEDIUM',
  evidenceQuality: 'MEDIUM',
  verificationStatus: 'MEDIUM',
  dataCompleteness: 'MEDIUM',
  sustainabilityEvidence: 'MEDIUM',
  procurementReliability: 'MEDIUM',
};

const priorityWeight: Record<ProcurementPriorityLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const decisionFactors: ProcurementDecisionFactor[] = [
  'price',
  'carbon',
  'evidenceQuality',
  'verificationStatus',
  'dataCompleteness',
  'sustainabilityEvidence',
  'procurementReliability',
];

function describeRecommendationFactor(option: RankedScenarioOption, factor: ProcurementDecisionFactor) {
  switch (factor) {
    case 'price':
      return option.pricePerUnit === undefined
        ? 'Current price is unavailable'
        : `Current price is ${option.currency || 'currency unavailable'} ${option.pricePerUnit}/${option.priceUnit || 'unit unavailable'}; scenario cost is ${option.currency || 'currency unavailable'} ${option.totalCost ?? 'unavailable'}`;
    case 'carbon':
      return option.carbonIntensity === undefined || option.estimatedEmissions === undefined
        ? 'Eligible carbon data is unavailable'
        : `Eligible carbon intensity is ${option.carbonIntensity} ${option.carbonIntensityUnit || 'unit unavailable'}; estimated emissions are ${option.estimatedEmissions} kgCO2e`;
    case 'evidenceQuality':
      return `Existing claim evidence status is ${option.evidenceStatus}`;
    case 'verificationStatus':
      return `Existing verification result is ${option.verificationStatus || 'NOT_AVAILABLE'}`;
    case 'dataCompleteness':
      return `Defined information fields available: ${option.dataCompleteness.available}/${option.dataCompleteness.total}`;
    case 'sustainabilityEvidence':
      return option.certificateEvidenceCount === undefined
        ? 'Certificate information is not available to this buyer'
        : `Current supplier-submitted certificates: ${option.certificateEvidenceCount}; this does not imply external authentication`;
    case 'procurementReliability':
      return option.procurementHistory === undefined
        ? 'Buyer procurement history is unavailable'
        : `Completed recorded purchases: ${option.procurementHistory.completedPurchaseCount} of ${option.procurementHistory.purchaseCount}`;
  }
}

type RankedScenarioOption = {
  supplierId: string;
  productId: string;
  supplierName: string;
  pricePerUnit?: number;
  totalCost?: number;
  currency?: string;
  priceUnit?: string;
  estimatedEmissions?: number;
  carbonIntensity?: number;
  carbonIntensityUnit?: string;
  functionalUnit?: string;
  lifecycleBoundary?: string;
  reportingPeriod?: string;
  methodology?: string;
  evidenceStatus: string;
  verificationStatus?: string;
  dataCompleteness: {
    available: number;
    total: number;
    fields?: Array<{ name: string; available: boolean; included?: boolean }>;
  };
  certificateEvidenceCount?: number;
  procurementHistory?: { completedPurchaseCount: number; purchaseCount: number };
  eligibilityStatus?: 'ELIGIBLE' | 'PARTIALLY_ELIGIBLE' | 'NOT_COMPARABLE' | 'INSUFFICIENT_DATA';
  recommendationScore?: number;
  recommendationReasons?: string[];
  whyNotRecommended?: string[];
  factorResults?: IProcurementFactorResult[];
};

function statusQuality(status?: string) {
  const rank: Record<string, number> = {
    CORROBORATED: 7,
    SUPPORTED: 6,
    PARTIALLY_SUPPORTED: 5,
    EXTRACTED: 4,
    PENDING: 3,
    NEEDS_REVIEW: 2,
    UNSUPPORTED: 1,
    INCONSISTENT: 0,
    MISSING: -1,
  };
  return status === undefined ? undefined : rank[status] ?? -1;
}

function pairwiseFactorResult(
  factor: ProcurementDecisionFactor,
  left: RankedScenarioOption,
  right: RankedScenarioOption,
  requestedCurrency?: string
): -1 | 0 | 1 | undefined {
  let leftValue: number | undefined;
  let rightValue: number | undefined;
  let lowerIsBetter = false;

  switch (factor) {
    case 'price':
      if (left.totalCost === undefined || right.totalCost === undefined || !left.currency || left.currency !== right.currency) return undefined;
      if (requestedCurrency && left.currency !== requestedCurrency) return undefined;
      leftValue = left.totalCost;
      rightValue = right.totalCost;
      lowerIsBetter = true;
      break;
    case 'carbon': {
      if (!usableCarbonStatuses.has(left.evidenceStatus as ClaimStatus)
        || !usableCarbonStatuses.has(right.evidenceStatus as ClaimStatus)
        || left.estimatedEmissions === undefined
        || right.estimatedEmissions === undefined
        || left.carbonIntensity === undefined
        || right.carbonIntensity === undefined
        || !left.carbonIntensityUnit
        || !right.carbonIntensityUnit) return undefined;
      const comparison = calculateDecisionTradeOff({
        supplierId: left.supplierId,
        supplierName: left.supplierName,
        emissions: left.estimatedEmissions,
        intensity: left.carbonIntensity,
        intensityUnit: left.carbonIntensityUnit,
        functionalUnit: left.functionalUnit,
        boundary: left.lifecycleBoundary,
        reportingPeriod: left.reportingPeriod,
        methodology: left.methodology,
        evidenceStatus: left.evidenceStatus,
      }, {
        supplierId: right.supplierId,
        supplierName: right.supplierName,
        emissions: right.estimatedEmissions,
        intensity: right.carbonIntensity,
        intensityUnit: right.carbonIntensityUnit,
        functionalUnit: right.functionalUnit,
        boundary: right.lifecycleBoundary,
        reportingPeriod: right.reportingPeriod,
        methodology: right.methodology,
        evidenceStatus: right.evidenceStatus,
      });
      if (comparison.comparisonStatus !== ComparisonStatus.COMPARABLE || comparison.emissionsDifference === undefined) return undefined;
      return comparison.emissionsDifference < 0 ? -1 : comparison.emissionsDifference > 0 ? 1 : 0;
    }
    case 'evidenceQuality':
      leftValue = statusQuality(left.evidenceStatus);
      rightValue = statusQuality(right.evidenceStatus);
      break;
    case 'verificationStatus':
      leftValue = statusQuality(left.verificationStatus);
      rightValue = statusQuality(right.verificationStatus);
      break;
    case 'dataCompleteness':
      if (left.dataCompleteness.fields && right.dataCompleteness.fields) {
        const rightFields = new Map(right.dataCompleteness.fields.map((field) => [field.name, field]));
        const comparableFields = left.dataCompleteness.fields.filter((field) => {
          const counterpart = rightFields.get(field.name);
          return field.included !== false && counterpart?.included !== false && counterpart !== undefined;
        });
        if (!comparableFields.length) return undefined;
        leftValue = comparableFields.filter((field) => field.available).length / comparableFields.length;
        rightValue = comparableFields.filter((field) => rightFields.get(field.name)?.available).length / comparableFields.length;
      } else {
        if (!left.dataCompleteness.total || !right.dataCompleteness.total) return undefined;
        leftValue = left.dataCompleteness.available / left.dataCompleteness.total;
        rightValue = right.dataCompleteness.available / right.dataCompleteness.total;
      }
      break;
    case 'sustainabilityEvidence':
      if (left.certificateEvidenceCount === undefined || right.certificateEvidenceCount === undefined) return undefined;
      leftValue = left.certificateEvidenceCount;
      rightValue = right.certificateEvidenceCount;
      break;
    case 'procurementReliability':
      if (left.procurementHistory === undefined || right.procurementHistory === undefined) return undefined;
      leftValue = left.procurementHistory.completedPurchaseCount;
      rightValue = right.procurementHistory.completedPurchaseCount;
      break;
  }

  if (leftValue === undefined || rightValue === undefined) return undefined;
  const difference = leftValue - rightValue;
  if (Math.abs(difference) < 1e-9) return 0;
  const result = difference < 0 ? -1 : 1;
  return lowerIsBetter ? result === -1 ? -1 : 1 : result;
}

function rankScenarioOptions(
  options: RankedScenarioOption[],
  priorities: IProcurementDecisionPriorities,
  requestedCurrency?: string
) {
  const results = new Map<string, IProcurementFactorResult[]>();
  const scores = new Map<string, { points: number; maximum: number }>();
  for (const option of options) {
    results.set(`${option.supplierId}:${option.productId}`, decisionFactors.map((factor) => ({
      factor,
      priority: priorities[factor],
      weight: priorityWeight[priorities[factor]],
      eligibleComparisons: 0,
      wins: 0,
      ties: 0,
      losses: 0,
      weightedContribution: 0,
      maximumContribution: 0,
    })));
    scores.set(`${option.supplierId}:${option.productId}`, { points: 0, maximum: 0 });
  }

  for (let leftIndex = 0; leftIndex < options.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < options.length; rightIndex += 1) {
      const left = options[leftIndex];
      const right = options[rightIndex];
      const leftKey = `${left.supplierId}:${left.productId}`;
      const rightKey = `${right.supplierId}:${right.productId}`;
      const leftResults = results.get(leftKey)!;
      const rightResults = results.get(rightKey)!;
      for (const factor of decisionFactors) {
        const outcome = pairwiseFactorResult(factor, left, right, requestedCurrency);
        if (outcome === undefined) continue;
        const leftResult = leftResults.find((result) => result.factor === factor)!;
        const rightResult = rightResults.find((result) => result.factor === factor)!;
        const weight = priorityWeight[priorities[factor]];
        leftResult.eligibleComparisons += 1;
        rightResult.eligibleComparisons += 1;
        leftResult.maximumContribution += weight;
        rightResult.maximumContribution += weight;
        scores.get(leftKey)!.maximum += weight;
        scores.get(rightKey)!.maximum += weight;
        if (outcome < 0) {
          leftResult.wins += 1;
          rightResult.losses += 1;
          leftResult.weightedContribution += weight;
          scores.get(leftKey)!.points += weight;
        } else if (outcome > 0) {
          leftResult.losses += 1;
          rightResult.wins += 1;
          rightResult.weightedContribution += weight;
          scores.get(rightKey)!.points += weight;
        } else {
          leftResult.ties += 1;
          rightResult.ties += 1;
          leftResult.weightedContribution += weight / 2;
          rightResult.weightedContribution += weight / 2;
          scores.get(leftKey)!.points += weight / 2;
          scores.get(rightKey)!.points += weight / 2;
        }
      }
    }
  }

  return options.map((option) => {
    const key = `${option.supplierId}:${option.productId}`;
    const factorResults = results.get(key)!;
    const highPriorityFactors = decisionFactors.filter((factor) => priorities[factor] === 'HIGH');
    const missingHighFactors = highPriorityFactors.filter((factor) =>
      !factorResults.find((result) => result.factor === factor)?.eligibleComparisons
    );
    const hasAnyComparableFactor = factorResults.some((result) => result.eligibleComparisons > 0);
    const carbonUnavailableForComparison = missingHighFactors.includes('carbon')
      && option.carbonIntensity !== undefined
      && usableCarbonStatuses.has(option.evidenceStatus as ClaimStatus);
    const eligibilityStatus: NonNullable<RankedScenarioOption['eligibilityStatus']> = missingHighFactors.length
      ? carbonUnavailableForComparison ? 'NOT_COMPARABLE' : 'INSUFFICIENT_DATA'
      : factorResults.every((result) => result.eligibleComparisons > 0)
        ? 'ELIGIBLE'
        : hasAnyComparableFactor ? 'PARTIALLY_ELIGIBLE' : 'INSUFFICIENT_DATA';
    return {
      ...option,
      eligibilityStatus,
      factorResults,
      recommendationScore: scores.get(key)!.maximum
        ? Number((scores.get(key)!.points / scores.get(key)!.maximum * 100).toFixed(2))
        : undefined,
    };
  });
}

export function recommendScenarioSuppliers<T extends RankedScenarioOption>(
  options: T[],
  priorities: IProcurementDecisionPriorities,
  requestedCurrency?: string
): {
  options: Array<T & RankedScenarioOption>;
  recommendation: IProcurementRecommendationSnapshot;
} {
  const preliminary = rankScenarioOptions(options, priorities, requestedCurrency);
  const eligible = preliminary.filter((option) => option.eligibilityStatus === 'ELIGIBLE' || option.eligibilityStatus === 'PARTIALLY_ELIGIBLE');
  const scored = rankScenarioOptions(eligible, priorities, requestedCurrency);
  const scoreByKey = new Map(scored.map((option) => [`${option.supplierId}:${option.productId}`, option]));
  const ranked = preliminary.map((option) => ({
    ...option,
    ...(scoreByKey.get(`${option.supplierId}:${option.productId}`) || {}),
  }));
  const sorted = [...scored].sort((left, right) =>
    (right.recommendationScore ?? -1) - (left.recommendationScore ?? -1)
  );
  const leading = sorted[0];
  const runnerUp = sorted[1];
  const isTie = !!leading && !!runnerUp && leading.recommendationScore === runnerUp.recommendationScore;
  const substantiveFactors: ProcurementDecisionFactor[] = [
    'price', 'carbon', 'evidenceQuality', 'verificationStatus', 'sustainabilityEvidence', 'procurementReliability',
  ];
  const comparableSubstantiveFactors = leading?.factorResults?.filter((result) =>
    substantiveFactors.includes(result.factor) && result.eligibleComparisons > 0
  ).length || 0;
  const explicitlyPrioritizedFactorAvailable = leading?.factorResults?.some((result) =>
    result.priority === 'HIGH' && result.eligibleComparisons > 0
  ) || false;
  const hasEnoughComparableFactors = comparableSubstantiveFactors >= 2 || explicitlyPrioritizedFactorAvailable;
  const hasRecommendation = !!leading && !!runnerUp && !isTie && hasEnoughComparableFactors;
  const mainFactors: ProcurementDecisionFactor[] = [
    'price', 'carbon', 'evidenceQuality', 'verificationStatus', 'dataCompleteness',
  ];
  const availableMainFactors = hasRecommendation
    ? mainFactors.filter((factor) =>
      leading.factorResults?.some((result) => result.factor === factor && result.eligibleComparisons > 0)
    ).length
    : 0;
  const confidence: IProcurementRecommendationSnapshot['confidence'] = !hasRecommendation
    ? 'NO_RECOMMENDATION'
    : availableMainFactors === mainFactors.length
      ? 'HIGH'
      : availableMainFactors >= 3
        ? 'MEDIUM'
        : 'LOW';
  const reasons = hasRecommendation
    ? leading.factorResults!
      .filter((result) => result.eligibleComparisons > 0 && result.weightedContribution > result.maximumContribution / 2)
      .map((result) => `${result.factor}: ${describeRecommendationFactor(leading, result.factor)}. Ranked ahead in ${result.wins} comparable pair(s), tied in ${result.ties}, and behind in ${result.losses}; buyer priority ${result.priority} (weight ${result.weight}).`)
    : [];
  const explanation = hasRecommendation
    ? `CarbonPilot recommends ${leading.supplierName} based on the buyer's selected priorities and comparable available data. The buyer makes the final procurement decision.`
    : sorted.length < 2
      ? 'No recommendation: at least two suppliers must be comparable on the selected priorities.'
      : !hasEnoughComparableFactors
        ? 'No recommendation: there is not enough comparable procurement or sustainability information to support a defensible ranking.'
      : 'No recommendation: the highest-ranked suppliers are tied on the available weighted comparisons.';
  const whyNotRecommended = ranked
    .filter((option) => !hasRecommendation || option.supplierId !== leading.supplierId || option.productId !== leading.productId)
    .map((option) => {
      const reasonsForOption = option.eligibilityStatus === 'NOT_COMPARABLE'
        ? ['Carbon evidence is present but cannot be compared using compatible units, functional units, lifecycle boundaries, periods, and methodology.']
        : option.eligibilityStatus === 'INSUFFICIENT_DATA'
          ? decisionFactors
            .filter((factor) => priorities[factor] === 'HIGH' && !option.factorResults?.find((result) => result.factor === factor)?.eligibleComparisons)
            .map((factor) => `High-priority ${factor} data is missing or not comparable.`)
          : option.factorResults
            ?.filter((result) => result.eligibleComparisons > 0 && result.weightedContribution < result.maximumContribution / 2)
            .map((result) => `Ranked behind on ${result.factor} under the selected ${result.priority.toLowerCase()} priority.`) || [];
      if (!reasonsForOption.length && isTie) reasonsForOption.push('Tied with the leading option on the available weighted comparisons; CarbonPilot makes no recommendation.');
      if (!reasonsForOption.length && !hasEnoughComparableFactors) reasonsForOption.push('There are not enough comparable decision factors to support a defensible recommendation.');
      if (hasRecommendation && option.recommendationScore !== undefined) {
        reasonsForOption.push(`Weighted pairwise result: ${option.recommendationScore}/100 versus ${leading.recommendationScore}/100 for ${leading.supplierName}.`);
      }
      return { supplierId: option.supplierId, productId: option.productId, reasons: reasonsForOption };
    });

  const recommendation: IProcurementRecommendationSnapshot = {
      status: hasRecommendation ? 'RECOMMENDED' : 'NO_RECOMMENDATION',
      confidence,
      recommendedSupplierId: hasRecommendation ? leading.supplierId : undefined,
      recommendedProductId: hasRecommendation ? leading.productId : undefined,
      explanation,
      reasons,
      whyNotRecommended,
      methodology: 'Each buyer-selected factor is compared pairwise only when both suppliers have usable, compatible data. LOW/MEDIUM/HIGH weights are 1/2/3. A pairwise win earns the factor weight, a tie earns half, and missing or incomparable pairs earn no points. Scores normalize earned points over comparable factor weights; no unavailable value is imputed. A recommendation requires at least two eligible options, a unique highest result, and either one comparable HIGH-priority factor or two comparable substantive factors (price, carbon, evidence, verification, certificates, or completed purchase history). Confidence is HIGH when price, carbon, evidence, verification, and completeness comparisons are all available; MEDIUM when at least three are available; otherwise LOW.',
      generatedAt: new Date(),
  };
  const whyNotRecommendedByOption = new Map(
    recommendation.whyNotRecommended.map((entry) => [`${entry.supplierId}:${entry.productId}`, entry.reasons])
  );
  const rankedWithReasons = ranked.map((option) => ({
    ...option,
    recommendationReasons: hasRecommendation
      && option.supplierId === leading.supplierId
      && option.productId === leading.productId
      ? reasons
      : [],
    whyNotRecommended: whyNotRecommendedByOption.get(`${option.supplierId}:${option.productId}`) || [],
  }));

  return {
    options: rankedWithReasons as Array<T & RankedScenarioOption>,
    recommendation,
  };
}

function snapshotScenarioOptions(options: any[]) {
  return options.map((option) => ({
    supplierId: option.supplierId,
    productId: option.productId,
    supplierName: option.supplierName,
    productName: option.productName,
    pricePerUnit: option.pricePerUnit,
    totalCost: option.totalCost,
    currency: option.currency,
    priceSource: option.priceSource,
    lastRecordedPrice: option.lastRecordedPrice,
    lastRecordedPriceCurrency: option.lastRecordedPriceCurrency,
    lastRecordedPriceUnit: option.lastRecordedPriceUnit,
    lastRecordedPriceDate: option.lastRecordedPriceDate,
    carbonIntensity: option.carbonIntensity,
    carbonIntensityUnit: option.carbonIntensityUnit,
    estimatedEmissions: option.estimatedEmissions,
    functionalUnit: option.functionalUnit,
    lifecycleBoundary: option.lifecycleBoundary,
    reportingPeriod: option.reportingPeriod,
    methodology: option.methodology,
    claimId: option.claimId,
    sourceReference: option.sourceReference,
    evidence: option.evidence,
    evidenceCount: option.evidenceCount,
    evidenceDocumentsShared: option.evidenceDocumentsShared,
    verification: option.verification,
    carbonCalculation: option.carbonCalculation,
    eligibleForCarbonCalculation: option.eligibleForCarbonCalculation,
    currentPriceUpdatedAt: option.currentPriceUpdatedAt,
    dataFreshness: option.dataFreshness,
    evidenceStatus: option.evidenceStatus,
    corroborationStatus: option.corroborationStatus,
    comparisonStatus: option.comparisonStatus,
    verificationStatus: option.verificationStatus,
    certificates: option.certificates,
    certificateEvidenceCount: option.certificateEvidenceCount,
    procurementHistory: option.procurementHistory,
    dataCompleteness: option.dataCompleteness,
    eligibilityStatus: option.eligibilityStatus,
    recommendationReasons: option.recommendationReasons,
    whyNotRecommended: option.whyNotRecommended,
    recommendationScore: option.recommendationScore,
    factorResults: option.factorResults,
  }));
}

export class ProcurementDecisionService {
  private async assertConnectedProduct(productId: string, organizationId: string) {
    if (!mongoose.isValidObjectId(productId)) throw new AppError('Product not found', 404, 'NOT_FOUND');
    const product = await ProductModel.findById(productId);
    if (!product || product.status !== ProductStatus.ACTIVE) throw new AppError('Product not found', 404, 'NOT_FOUND');
    const supplier = await SupplierModel.findById(product.supplierId);
    if (!supplier) throw new AppError('Product supplier not found', 404, 'NOT_FOUND');
    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId: organizationId,
      supplierOrganizationId: supplier.organizationId,
      status: SupplierStatus.ACTIVE,
    });
    if (!relationship) throw new AppError('Product is not from an active connected supplier', 403, 'FORBIDDEN');
    return { product, supplier, relationship };
  }

  private async writeAudit(user: AuthUser, action: string, entityId: string, details: Record<string, unknown>) {
    return AuditLogModel.create({
      organizationId: user.organizationId,
      userId: user.userId,
      action,
      entityType: 'PROCUREMENT_DECISION',
      entityId,
      newValue: details,
    });
  }

  async createScenario(
    productId: string,
    quantity: number,
    user: AuthUser,
    recordAudit = true,
    currency?: string,
    requestedPriorities?: IProcurementDecisionPriorities
  ) {
    const { product: baseProduct } = await this.assertConnectedProduct(productId, user.organizationId);
    const requestedCurrency = currency?.toUpperCase();
    const priorities = requestedPriorities || DEFAULT_DECISION_PRIORITIES;
    const relationships = await SupplierRelationshipModel.find({
      customerOrganizationId: user.organizationId,
      status: SupplierStatus.ACTIVE,
    });
    const organizationIds = relationships.map((item) => item.supplierOrganizationId);
    const suppliers = await SupplierModel.find({ organizationId: { $in: organizationIds } });
    const supplierById = new Map(suppliers.map((supplier) => [supplier._id.toString(), supplier]));
    const organizations = await OrganizationModel.find({ _id: { $in: organizationIds } });
    const organizationById = new Map(organizations.map((organization) => [organization._id.toString(), organization]));
    const products = await ProductModel.find({
      supplierId: { $in: suppliers.map((supplier) => supplier._id) },
      status: ProductStatus.ACTIVE,
    });
    const compatibleProducts = products.filter((candidate) => productsAreCompatible(baseProduct, candidate));
    if (!compatibleProducts.some((item) => item._id.toString() === baseProduct._id.toString())) {
      compatibleProducts.push(baseProduct);
    }

    const supplierIds = [...new Set(compatibleProducts.map((item) => item.supplierId.toString()))];
    const productIds = compatibleProducts.map((item) => item._id);
    const purchasePromise = PurchaseModel.find({
      customerOrganizationId: user.organizationId,
      supplierId: { $in: supplierIds },
      productId: { $in: productIds },
      status: { $nin: [PurchaseStatus.DRAFT, PurchaseStatus.CANCELLED] },
    }).sort({ purchaseDate: -1, createdAt: -1 });
    const claimsPromise = ClaimModel.find({
      supplierId: { $in: supplierIds },
      productId: { $in: productIds },
    }).populate('sourceReference.documentId', 'filename').sort({ createdAt: -1 });
    const certificatesPromise = CertificateModel.find({ supplierId: { $in: supplierIds } }).sort({ expiryDate: -1 });
    const [purchases, allClaims, certificates] = await Promise.all([
      purchasePromise,
      claimsPromise,
      certificatesPromise,
    ]);

    const relationshipByOrganizationId = new Map(relationships.map((item) => [
      item.supplierOrganizationId.toString(),
      item,
    ]));
    const purchaseByProduct = new Map<string, typeof purchases[number]>();
    const purchasesByProduct = new Map<string, typeof purchases>();
    for (const purchase of purchases) {
      if (!purchaseByProduct.has(purchase.productId.toString())) purchaseByProduct.set(purchase.productId.toString(), purchase);
      const productPurchaseHistory = purchasesByProduct.get(purchase.productId.toString()) || [];
      productPurchaseHistory.push(purchase);
      purchasesByProduct.set(purchase.productId.toString(), productPurchaseHistory);
    }
    const claimByProduct = new Map<string, typeof allClaims[number]>();
    for (const claim of allClaims) {
      if (claim.buyerOrganizationId && claim.buyerOrganizationId.toString() !== user.organizationId) continue;
      const isCarbonClaim = /PCF|CARBON[_ ]?FOOTPRINT|CARBON[_ ]?INTENSITY/i.test(claim.type);
      if (isCarbonClaim && !claimByProduct.has(claim.productId?.toString() || '')) {
        claimByProduct.set(claim.productId?.toString() || '', claim);
      }
    }
    const claimIds = [...claimByProduct.values()].map((claim) => claim._id);
    const [verificationRuns, evidenceLinks, anomalies] = claimIds.length
      ? await Promise.all([
        VerificationRunModel.find({ claimId: { $in: claimIds } }).sort({ verifiedAt: -1 }),
        ClaimEvidenceLinkModel.find({ claimId: { $in: claimIds } }).sort({ createdAt: -1 }),
        AnomalyModel.find({
          supplierId: { $in: supplierIds },
          claimId: { $in: claimIds },
          $or: [
            { buyerOrganizationId: user.organizationId },
            { buyerOrganizationId: { $exists: false } },
            { buyerOrganizationId: null },
          ],
        }).sort({ detectedAt: -1 }),
      ])
      : [[], [], []];
    const evidenceDocuments = evidenceLinks.length
      ? await DocumentModel.find({ _id: { $in: evidenceLinks.map((link) => link.documentId) } }).select('filename dataRequestId')
      : [];
    const evidenceDocumentById = new Map(evidenceDocuments.map((document) => [document._id.toString(), document]));
    const evidenceByClaimId = new Map<string, typeof evidenceLinks>();
    for (const link of evidenceLinks) {
      const linked = evidenceByClaimId.get(link.claimId.toString()) || [];
      linked.push(link);
      evidenceByClaimId.set(link.claimId.toString(), linked);
    }
    const anomaliesByClaimId = new Map<string, typeof anomalies>();
    for (const anomaly of anomalies) {
      if (!anomaly.claimId) continue;
      const linked = anomaliesByClaimId.get(anomaly.claimId.toString()) || [];
      linked.push(anomaly);
      anomaliesByClaimId.set(anomaly.claimId.toString(), linked);
    }
    const verificationByClaimId = new Map<string, typeof verificationRuns[number]>();
    const corroboratedClaimIds = new Set<string>();
    for (const run of verificationRuns) {
      const claimKey = run.claimId.toString();
      if (!verificationByClaimId.has(claimKey)) {
        verificationByClaimId.set(claimKey, run);
        if (run.corroborationResults?.some((result) => result.result === 'CORROBORATED')) {
          corroboratedClaimIds.add(claimKey);
        }
      }
    }
    const certificateBySupplierId = new Map<string, typeof certificates>();
    for (const certificate of certificates) {
      const supplierKey = certificate.supplierId.toString();
      const records = certificateBySupplierId.get(supplierKey) || [];
      records.push(certificate);
      certificateBySupplierId.set(supplierKey, records);
    }

    const options = compatibleProducts.map((candidate) => {
      const supplier = supplierById.get(candidate.supplierId.toString());
      const relationship = supplier ? relationshipByOrganizationId.get(supplier.organizationId.toString()) : undefined;
      if (!supplier || !relationship) return undefined;

      const purchase = purchaseByProduct.get(candidate._id.toString());
      const purchaseHistory = purchasesByProduct.get(candidate._id.toString()) || [];
      const quantityFactor = normalizeUnitValue(quantity, baseProduct.unit);
      const candidateUnitFactor = normalizeUnitValue(1, candidate.unit);
      const candidateQuantity = quantityFactor && candidateUnitFactor && quantityFactor.unit === candidateUnitFactor.unit
        ? quantityFactor.value / candidateUnitFactor.value
        : undefined;
      const currentPrice = candidate.sellingPrice;
      const priceAvailable = currentPrice !== undefined && Number.isFinite(currentPrice) && currentPrice >= 0 && !!candidate.currency;
      const pricePerUnit = priceAvailable && candidateQuantity !== undefined && quantity > 0
        ? Number((currentPrice! * candidateQuantity / quantity).toFixed(6))
        : undefined;
      const totalCost = priceAvailable && candidateQuantity !== undefined
        ? Number((currentPrice! * candidateQuantity).toFixed(2))
        : undefined;

      const canViewCarbon = relationship.sharedDataPermissions.carbon;
      const claim = canViewCarbon ? claimByProduct.get(candidate._id.toString()) : undefined;
      const canViewEvidenceDocuments = relationship.sharedDataPermissions.documents;
      const evidenceStatus: ClaimStatus | 'MISSING' = claim?.status || 'MISSING';
      const carbon = claim ? carbonDescription(claim) : undefined;
      const supported = !!claim && usableCarbonStatuses.has(claim.status);
      const emissions = supported && carbon?.value !== undefined && carbon.unit
        ? estimateEmissions(candidateQuantity ?? quantity, candidate.unit, carbon.value, carbon.unit)
        : undefined;
      const corroborationStatus = claim && (
        claim.status === ClaimStatus.CORROBORATED || corroboratedClaimIds.has(claim._id.toString())
      ) ? 'CORROBORATED' as const : 'NOT_AVAILABLE' as const;
      const verificationRun = claim ? verificationByClaimId.get(claim._id.toString()) : undefined;
      const linkedEvidence = claim ? evidenceByClaimId.get(claim._id.toString()) || [] : [];
      const claimAnomalies = claim ? anomaliesByClaimId.get(claim._id.toString()) || [] : [];
      const certificatesShared = relationship.sharedDataPermissions.certificates;
      const supplierCertificates = certificatesShared
        ? certificateBySupplierId.get(supplier._id.toString()) || []
        : [];
      const currentCertificates = supplierCertificates.filter((certificate) =>
        [CertificateStatus.VALID, CertificateStatus.EXPIRING_SOON].includes(certificate.status)
        && new Date(certificate.expiryDate).getTime() >= Date.now()
      );
      const comparisonStatus = emissions !== undefined
        ? 'COMPARABLE' as const
        : carbon
          ? 'NOT_DIRECTLY_COMPARABLE' as const
          : 'NOT_AVAILABLE' as const;

      const completenessFields = [
        { name: 'Current product price', available: priceAvailable },
        { name: 'Eligible carbon value and quantity calculation', available: emissions !== undefined },
        { name: 'Claim evidence source', available: !!claim && (!!claim.sourceReference || linkedEvidence.length > 0) },
        { name: 'Existing verification result', available: !!verificationRun },
        ...(certificatesShared ? [{ name: 'Supplier-submitted certificate information', available: supplierCertificates.length > 0 }] : []),
        { name: 'Buyer procurement history query', available: true },
        { name: 'Product record update date', available: !!candidate.updatedAt },
      ];
      const dataCompleteness = {
        available: completenessFields.filter((field) => field.available).length,
        total: completenessFields.length,
        fields: completenessFields,
      };
      const carbonUpdatedAt = claim?.updatedAt || claim?.createdAt;
      const isOlderThanOneYear = (date?: Date | string) => !!date
        && Date.now() - new Date(date).getTime() > 365 * 24 * 60 * 60 * 1000;
      const documentDownloadPath = (documentId: string, dataRequestId?: string) =>
        relationship.sharedDataPermissions.documents
          ? dataRequestId
            ? `/api/data-requests/${dataRequestId}/documents/${documentId}/file`
            : `/api/documents/${documentId}/file`
          : undefined;
      const warnings: string[] = [];
      if (!priceAvailable) warnings.push(purchase ? 'Current product price is unavailable; historical purchase pricing is not used as a current quote.' : 'Current product price is unavailable.');
      if (requestedCurrency && priceAvailable && candidate.currency !== requestedCurrency) warnings.push(`Current quote is in ${candidate.currency}; no currency conversion to ${requestedCurrency} is performed.`);
      if (!claim) warnings.push(canViewCarbon ? 'Supplier has not provided a PCF claim.' : 'Carbon data is not shared with this buyer.');
      if (claim && !supported) warnings.push(`Carbon claim status is ${claim.status}; it is not used to estimate emissions.`);
      if (supported && carbon?.value === undefined) warnings.push('Carbon claim value is missing or invalid.');
      if (claim && emissions === undefined) warnings.push('Carbon intensity is incompatible with the product quantity unit.');
      if (claim && corroborationStatus === 'NOT_AVAILABLE') warnings.push('Independent corroboration is not available.');
      if (!certificatesShared) warnings.push('Certificate information is not shared with this buyer.');
      if (certificatesShared && supplierCertificates.length === 0) warnings.push('No supplier-submitted certificates are available.');
      if (isOlderThanOneYear(candidate.updatedAt)) warnings.push('Product and current price record was last updated more than one year ago.');
      if (isOlderThanOneYear(carbonUpdatedAt)) warnings.push('Carbon claim was last updated more than one year ago.');
      warnings.push('Supplier availability is not tracked in the available procurement data.');

      return {
        supplierId: supplier._id.toString(),
        supplierOrganizationId: supplier.organizationId.toString(),
        supplierName: organizationById.get(supplier.organizationId.toString())?.name || 'Supplier',
        productId: candidate._id.toString(),
        productName: candidate.name,
        productCode: candidate.productCode,
        category: candidate.category,
        productUnit: candidate.unit,
        quantity: candidateQuantity,
        scenarioQuantity: quantity,
        scenarioUnit: baseProduct.unit,
        pricePerUnit,
        priceUnit: baseProduct.unit,
        totalCost,
        currency: priceAvailable ? candidate.currency : undefined,
        priceSource: priceAvailable ? 'CURRENT_PRODUCT_PRICE' as const : 'NOT_AVAILABLE' as const,
        lastRecordedPrice: purchase && finiteNonNegativeValue(purchase.unitPrice?.toString()) !== undefined
          ? finiteNonNegativeValue(purchase.unitPrice.toString())
          : undefined,
        lastRecordedPriceCurrency: purchase?.currency,
        lastRecordedPriceUnit: purchase?.unit,
        lastRecordedPriceDate: purchase?.purchaseDate,
        currentPriceUpdatedAt: candidate.updatedAt,
        carbonIntensity: carbon?.value,
        carbonIntensityUnit: carbon?.unit,
        functionalUnit: carbon?.functionalUnit,
        lifecycleBoundary: carbon?.boundary,
        reportingPeriod: carbon?.reportingPeriod,
        methodology: carbon?.methodology,
        claimId: claim?._id.toString(),
        sourceReference: claim && canViewEvidenceDocuments ? carbonSourceReference(claim) : undefined,
        evidence: canViewEvidenceDocuments ? linkedEvidence.map((link) => {
          const evidenceDocumentId = link.documentId.toString();
          const evidenceDocument = evidenceDocumentById.get(evidenceDocumentId);
          const dataRequestId = evidenceDocument?.dataRequestId?.toString();
          return {
            documentId: evidenceDocumentId,
            documentName: evidenceDocument?.filename || 'Evidence document',
            page: link.page,
            section: link.section,
            sourceText: link.sourceText,
            relationshipType: link.relationshipType,
            downloadPath: documentDownloadPath(evidenceDocumentId, dataRequestId),
          };
        }) : [],
        evidenceCount: linkedEvidence.length,
        evidenceDocumentsShared: canViewEvidenceDocuments,
        estimatedEmissions: emissions,
        carbonCalculation: emissions === undefined || !supported || carbon?.value === undefined
          ? undefined
          : {
            quantity: candidateQuantity ?? quantity,
            quantityUnit: candidate.unit,
            intensity: carbon.value,
            intensityUnit: carbon.unit,
            emissions: emissions,
            emissionsUnit: 'kgCO2e',
          },
        eligibleForCarbonCalculation: emissions !== undefined && supported,
        emissionsUnit: 'kgCO2e',
        evidenceStatus,
        corroborationStatus,
        verificationStatus: verificationRun?.overallStatus || 'NOT_AVAILABLE',
        verification: verificationRun ? {
          overallStatus: verificationRun.overallStatus,
          verifiedAt: verificationRun.verifiedAt,
          checks: verificationRun.checks.map((check) => ({
            checkType: check.checkType,
            result: check.result,
            explanation: check.explanation,
            expected: check.expected,
            observed: check.observed,
            sourcePage: check.sourcePage,
          })),
          issues: verificationRun.issues || [],
          anomalies: claimAnomalies.map((anomaly) => ({
            type: anomaly.type,
            severity: anomaly.severity,
            status: anomaly.status,
            description: anomaly.description,
            recommendedAction: anomaly.recommendedAction,
            detectedAt: anomaly.detectedAt,
            resolvedAt: anomaly.resolvedAt,
            resolutionNote: anomaly.resolutionNote,
          })),
        } : undefined,
        certificates: supplierCertificates.map((certificate) => ({
          documentId: canViewEvidenceDocuments ? certificate.documentId?.toString() : undefined,
          downloadPath: certificate.documentId
            ? documentDownloadPath(certificate.documentId.toString())
            : undefined,
          type: certificate.type,
          certificateNumber: certificate.certificateNumber,
          issuingBody: certificate.issuingBody,
          issueDate: certificate.issueDate,
          expiryDate: certificate.expiryDate,
          status: certificate.status,
          externallyVerified: certificate.externalVerification?.checked === true
            && certificate.externalVerification.status === 'VERIFIED',
        })),
        certificateEvidenceCount: certificatesShared ? currentCertificates.length : undefined,
        procurementHistory: {
          purchaseCount: purchaseHistory.length,
          completedPurchaseCount: purchaseHistory.filter((entry) => entry.status === PurchaseStatus.COMPLETED).length,
          lastPurchaseDate: purchaseHistory[0]?.purchaseDate,
        },
        dataCompleteness,
        dataFreshness: {
          productUpdatedAt: candidate.updatedAt,
          carbonUpdatedAt,
          productPriceIsOlderThanOneYear: isOlderThanOneYear(candidate.updatedAt),
          carbonClaimIsOlderThanOneYear: isOlderThanOneYear(carbonUpdatedAt),
        },
        comparisonStatus,
        productCompatibility: 'CONFIRMED' as const,
        availability: 'NOT_AVAILABLE' as const,
        warnings,
      };
    });
    const rows = options.filter((option): option is NonNullable<typeof option> => !!option);
    const ranked = recommendScenarioSuppliers(rows, priorities, requestedCurrency);

    const tradeOffs = [];
    for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
        const left = rows[leftIndex];
        const right = rows[rightIndex];
        tradeOffs.push(calculateDecisionTradeOff({
          supplierId: left.supplierId,
          supplierName: left.supplierName,
          pricePerUnit: left.pricePerUnit,
          totalCost: left.totalCost,
          currency: left.currency,
          emissions: left.estimatedEmissions,
          intensity: left.carbonIntensity,
          intensityUnit: left.carbonIntensityUnit,
          functionalUnit: left.functionalUnit,
          boundary: left.lifecycleBoundary,
          reportingPeriod: left.reportingPeriod,
          methodology: left.methodology,
          evidenceStatus: left.evidenceStatus,
        }, {
          supplierId: right.supplierId,
          supplierName: right.supplierName,
          pricePerUnit: right.pricePerUnit,
          totalCost: right.totalCost,
          currency: right.currency,
          emissions: right.estimatedEmissions,
          intensity: right.carbonIntensity,
          intensityUnit: right.carbonIntensityUnit,
          functionalUnit: right.functionalUnit,
          boundary: right.lifecycleBoundary,
          reportingPeriod: right.reportingPeriod,
          methodology: right.methodology,
          evidenceStatus: right.evidenceStatus,
        }));
      }
    }

    const scenario = {
      product: {
        _id: baseProduct._id.toString(),
        name: baseProduct.name,
        productCode: baseProduct.productCode,
        category: baseProduct.category,
        unit: baseProduct.unit,
      },
      quantity,
      unit: baseProduct.unit,
      requestedCurrency,
      priorities,
      options: ranked.options,
      tradeOffs,
      recommendation: ranked.recommendation,
      decisionNotice: ranked.recommendation.methodology,
    };

    if (recordAudit) {
      const scenarioId = new mongoose.Types.ObjectId().toString();
      await Promise.all([
        this.writeAudit(user, 'SCENARIO_CREATED', scenarioId, {
          productId: baseProduct._id.toString(),
          quantity,
        }),
        this.writeAudit(user, 'SUPPLIERS_COMPARED', scenarioId, {
          productId: baseProduct._id.toString(),
          optionCount: rows.length,
          currency: requestedCurrency,
          priorities,
          recommendationStatus: ranked.recommendation.status,
          recommendedSupplierId: ranked.recommendation.recommendedSupplierId,
        }),
      ]);
    }
    return scenario;
  }

  async list(user: AuthUser) {
    return ProcurementDecisionModel.find({ organizationId: user.organizationId })
      .populate('productId', 'name productCode category unit')
      .populate({
        path: 'selectedSupplierId',
        select: 'organizationId',
        populate: { path: 'organizationId', select: 'name' },
      })
      .populate('selectedProductId', 'name productCode')
      .populate('decisionOwnerId', 'name email')
      .sort({ updatedAt: -1 });
  }

  async getById(id: string, user: AuthUser) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    const decision = await ProcurementDecisionModel.findOne({ _id: id, organizationId: user.organizationId })
      .populate('productId', 'name productCode category unit')
      .populate('selectedSupplierId', 'organizationId')
      .populate('selectedProductId', 'name productCode')
      .populate('decisionOwnerId', 'name email')
      .populate('history.actorId', 'name email');
    if (!decision) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    return decision;
  }

  private async assertSelectedOption(productId: string, supplierId: string, selectedProductId: string, user: AuthUser) {
    const scenario = await this.createScenario(productId, 1, user, false);
    const option = scenario.options.find((item) => item.supplierId === supplierId && item.productId === selectedProductId);
    if (!option) throw new AppError('Selected supplier/product is not a compatible active option', 400, 'INVALID_SELECTION');
    return option;
  }

  async create(data: {
    productId: string;
    quantity: number;
    currency?: string;
    priorities?: IProcurementDecisionPriorities;
    selectedSupplierId?: string;
    selectedProductId?: string;
    decisionReason?: string;
  }, user: AuthUser) {
    const scenario = await this.createScenario(
      data.productId,
      data.quantity,
      user,
      false,
      data.currency,
      data.priorities
    );
    if (!!data.selectedSupplierId !== !!data.selectedProductId) {
      throw new AppError('Select both a supplier and product, or neither', 400, 'INVALID_SELECTION');
    }
    if (data.selectedSupplierId && data.selectedProductId) {
      await this.assertSelectedOption(data.productId, data.selectedSupplierId, data.selectedProductId, user);
    }

    const decision = await ProcurementDecisionModel.create({
      organizationId: user.organizationId,
      createdBy: user.userId,
      productId: data.productId,
      quantity: data.quantity,
      unit: scenario.unit,
      requestedCurrency: scenario.requestedCurrency,
      decisionPriorities: scenario.priorities,
      recommendationSnapshot: scenario.recommendation,
      status: ProcurementDecisionStatus.DRAFT,
      selectedSupplierId: data.selectedSupplierId,
      selectedProductId: data.selectedProductId,
      decisionReason: data.decisionReason,
      scenarioSnapshot: snapshotScenarioOptions(scenario.options),
      history: [{ action: 'DECISION_CREATED', actorId: user.userId, details: { status: ProcurementDecisionStatus.DRAFT } }],
    });
    await this.writeAudit(user, 'DECISION_CREATED', decision._id.toString(), {
      productId: data.productId,
      quantity: data.quantity,
      currency: scenario.requestedCurrency,
      priorities: scenario.priorities,
      recommendationStatus: scenario.recommendation.status,
      recommendedSupplierId: scenario.recommendation.recommendedSupplierId,
      status: ProcurementDecisionStatus.DRAFT,
    });
    return decision;
  }

  async update(id: string, data: {
    productId?: string;
    quantity?: number;
    currency?: string;
    priorities?: IProcurementDecisionPriorities;
    selectedSupplierId?: string;
    selectedProductId?: string;
    decisionReason?: string;
    status?: ProcurementDecisionStatus.DRAFT | ProcurementDecisionStatus.UNDER_REVIEW | ProcurementDecisionStatus.CANCELLED;
  }, user: AuthUser) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    const decision = await ProcurementDecisionModel.findOne({ _id: id, organizationId: user.organizationId });
    if (!decision) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    if (![ProcurementDecisionStatus.DRAFT, ProcurementDecisionStatus.UNDER_REVIEW].includes(decision.status)) {
      throw new AppError('Finalized or cancelled decisions cannot be changed', 409, 'DECISION_LOCKED');
    }

    const productId = data.productId || decision.productId.toString();
    const quantity = data.quantity ?? decision.quantity;
    const currency = data.currency ?? decision.requestedCurrency;
    const priorities = data.priorities || decision.decisionPriorities || DEFAULT_DECISION_PRIORITIES;
    const selectedSupplierId = data.selectedSupplierId ?? decision.selectedSupplierId?.toString();
    const selectedProductId = data.selectedProductId ?? decision.selectedProductId?.toString();
    if (!!selectedSupplierId !== !!selectedProductId) {
      throw new AppError('Select both a supplier and product, or neither', 400, 'INVALID_SELECTION');
    }
    if (selectedSupplierId && selectedProductId) {
      await this.assertSelectedOption(productId, selectedSupplierId, selectedProductId, user);
    }

    const scenario = await this.createScenario(productId, quantity, user, false, currency, priorities);
    const oldStatus = decision.status;
    decision.productId = productId;
    decision.quantity = quantity;
    decision.unit = scenario.unit;
    decision.requestedCurrency = scenario.requestedCurrency;
    decision.decisionPriorities = scenario.priorities;
    decision.recommendationSnapshot = scenario.recommendation;
    decision.selectedSupplierId = selectedSupplierId;
    decision.selectedProductId = selectedProductId;
    if (data.decisionReason !== undefined) decision.decisionReason = data.decisionReason;
    if (data.status) decision.status = data.status;
    decision.scenarioSnapshot = snapshotScenarioOptions(scenario.options);
    const action = decision.status === ProcurementDecisionStatus.CANCELLED
      ? 'DECISION_CANCELLED'
      : 'DECISION_UPDATED';
    decision.history.push({
      action,
      actorId: user.userId,
      changedAt: new Date(),
      details: {
        previousStatus: oldStatus,
        status: decision.status,
        requestedCurrency: scenario.requestedCurrency,
        priorities: scenario.priorities,
        recommendationStatus: scenario.recommendation.status,
        recommendedSupplierId: scenario.recommendation.recommendedSupplierId,
      },
    });
    await decision.save();
    await this.writeAudit(user, action, decision._id.toString(), {
      previousStatus: oldStatus,
      status: decision.status,
      requestedCurrency: scenario.requestedCurrency,
      priorities: scenario.priorities,
      recommendationStatus: scenario.recommendation.status,
      recommendedSupplierId: scenario.recommendation.recommendedSupplierId,
    });
    return decision;
  }

  async finalize(id: string, data: {
    selectedSupplierId: string;
    selectedProductId: string;
    decisionReason?: string;
  }, user: AuthUser) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    const decision = await ProcurementDecisionModel.findOne({ _id: id, organizationId: user.organizationId });
    if (!decision) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    if (decision.status !== ProcurementDecisionStatus.UNDER_REVIEW) {
      throw new AppError('Move the decision to UNDER_REVIEW before finalizing it', 409, 'INVALID_TRANSITION');
    }
    await this.assertSelectedOption(
      decision.productId.toString(),
      data.selectedSupplierId,
      data.selectedProductId,
      user
    );
    const priorities = decision.decisionPriorities || DEFAULT_DECISION_PRIORITIES;
    const scenario = await this.createScenario(
      decision.productId.toString(),
      decision.quantity,
      user,
      false,
      decision.requestedCurrency,
      priorities
    );

    decision.selectedSupplierId = data.selectedSupplierId;
    decision.selectedProductId = data.selectedProductId;
    if (data.decisionReason !== undefined) decision.decisionReason = data.decisionReason;
    decision.status = ProcurementDecisionStatus.DECIDED;
    decision.decisionOwnerId = user.userId;
    decision.decisionDate = new Date();
    decision.requestedCurrency = scenario.requestedCurrency;
    decision.decisionPriorities = scenario.priorities;
    decision.recommendationSnapshot = scenario.recommendation;
    decision.scenarioSnapshot = snapshotScenarioOptions(scenario.options);
    decision.history.push({
      action: 'DECISION_FINALIZED',
      actorId: user.userId,
      changedAt: decision.decisionDate,
      details: {
        status: ProcurementDecisionStatus.DECIDED,
        selectedSupplierId: data.selectedSupplierId,
        recommendationStatus: scenario.recommendation.status,
        recommendedSupplierId: scenario.recommendation.recommendedSupplierId,
      },
    });
    await decision.save();
    await this.writeAudit(user, 'DECISION_FINALIZED', decision._id.toString(), {
      status: decision.status,
      selectedSupplierId: data.selectedSupplierId,
      decisionDate: decision.decisionDate.toISOString(),
      recommendationStatus: scenario.recommendation.status,
      recommendedSupplierId: scenario.recommendation.recommendedSupplierId,
    });
    return decision;
  }

  async getHistory(id: string, user: AuthUser) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    const decision = await ProcurementDecisionModel.findOne({
      _id: id,
      organizationId: user.organizationId,
    }).populate('history.actorId', 'name email');
    if (!decision) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    return decision.history;
  }
}

export const procurementDecisionService = new ProcurementDecisionService();

export class ProcurementDecisionController {
  async scenario(req: Request, res: Response, next: NextFunction) {
    try {
      const scenario = await procurementDecisionService.createScenario(
        req.body.productId,
        req.body.quantity,
        req.user!,
        true,
        req.body.currency,
        req.body.priorities
      );
      return sendSuccess(res, scenario);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.list(req.user!));
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.create(req.body, req.user!), 201);
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.getById(req.params.id, req.user!));
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.update(req.params.id, req.body, req.user!));
    } catch (error) {
      next(error);
    }
  }

  async finalize(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.finalize(req.params.id, req.body, req.user!));
    } catch (error) {
      next(error);
    }
  }

  async history(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.getHistory(req.params.id, req.user!));
    } catch (error) {
      next(error);
    }
  }
}

export const procurementDecisionController = new ProcurementDecisionController();
export const procurementDecisionRoutes = Router();
procurementDecisionRoutes.use(authenticate, requireOrganizationType(OrganizationType.CUSTOMER));
procurementDecisionRoutes.post('/scenarios/compare', validate(procurementScenarioSchema), (req, res, next) =>
  procurementDecisionController.scenario(req, res, next)
);
procurementDecisionRoutes.post('/scenarios', validate(procurementScenarioSchema), (req, res, next) =>
  procurementDecisionController.scenario(req, res, next)
);
procurementDecisionRoutes.get('/', (req, res, next) => procurementDecisionController.list(req, res, next));
procurementDecisionRoutes.post('/', validate(createProcurementDecisionSchema), (req, res, next) =>
  procurementDecisionController.create(req, res, next)
);
procurementDecisionRoutes.get('/:id/history', (req, res, next) =>
  procurementDecisionController.history(req, res, next)
);
procurementDecisionRoutes.post('/:id/decision', validate(finalizeProcurementDecisionSchema), (req, res, next) =>
  procurementDecisionController.finalize(req, res, next)
);
procurementDecisionRoutes.get('/:id', (req, res, next) => procurementDecisionController.get(req, res, next));
procurementDecisionRoutes.patch('/:id', validate(updateProcurementDecisionSchema), (req, res, next) =>
  procurementDecisionController.update(req, res, next)
);
