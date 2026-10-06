import { describe, expect, it } from 'vitest';
import { ClaimStatus, ComparisonStatus } from '@carbonpilot/shared';
import { calculateDecisionTradeOff, recommendScenarioSuppliers } from '../src/modules/procurement-decisions';
import {
  finalizeProcurementDecisionSchema,
  procurementScenarioSchema,
  updateProcurementDecisionSchema,
} from '@carbonpilot/validation';
import type { IProcurementDecisionPriorities } from '@carbonpilot/shared';

const common = {
  intensityUnit: 'kgCO2e/kg',
  functionalUnit: '1 kg product',
  boundary: 'Cradle-to-gate',
  reportingPeriod: '2026',
  methodology: 'ISO 14067',
  currency: 'INR',
  evidenceStatus: ClaimStatus.SUPPORTED,
};

const equalPriorities: IProcurementDecisionPriorities = {
  price: 'MEDIUM',
  carbon: 'MEDIUM',
  evidenceQuality: 'MEDIUM',
  verificationStatus: 'MEDIUM',
  dataCompleteness: 'MEDIUM',
  sustainabilityEvidence: 'MEDIUM',
  procurementReliability: 'MEDIUM',
};

function supplierOption(overrides: Record<string, unknown> = {}) {
  return {
    supplierId: 'supplier-a',
    productId: 'product-a',
    supplierName: 'Supplier A',
    totalCost: 72,
    pricePerUnit: 72,
    currency: 'INR',
    estimatedEmissions: 180_000,
    carbonIntensity: 1.8,
    carbonIntensityUnit: 'kgCO2e/kg',
    functionalUnit: '1 kg product',
    lifecycleBoundary: 'Cradle-to-gate',
    reportingPeriod: '2026',
    methodology: 'ISO 14067',
    evidenceStatus: ClaimStatus.SUPPORTED,
    verificationStatus: ClaimStatus.SUPPORTED,
    dataCompleteness: { available: 6, total: 6 },
    certificateEvidenceCount: 1,
    procurementHistory: { purchaseCount: 12, completedPurchaseCount: 10 },
    ...overrides,
  };
}

describe('procurement decision trade-off calculations', () => {
  it('calculates cost and emissions differences and estimated cost per tonne avoided', () => {
    const result = calculateDecisionTradeOff({
      ...common,
      supplierId: 'supplier-a',
      supplierName: 'Supplier A',
      totalCost: 7_200_000,
      emissions: 142_000,
      intensity: 1.42,
    }, {
      ...common,
      supplierId: 'supplier-b',
      supplierName: 'Supplier B',
      totalCost: 7_500_000,
      emissions: 98_000,
      intensity: 0.98,
    });

    expect(result.comparisonStatus).toBe(ComparisonStatus.COMPARABLE);
    expect(result.purchaseCostDifference).toBe(-300_000);
    expect(result.emissionsDifference).toBe(44_000);
    expect(result.costPerEstimatedTonneAvoided).toBe(6818.18);
  });

  it('does not calculate carbon trade-offs across lifecycle boundaries', () => {
    const result = calculateDecisionTradeOff({
      ...common,
      supplierId: 'supplier-a',
      supplierName: 'Supplier A',
      totalCost: 100,
      emissions: 10,
      intensity: 1,
    }, {
      ...common,
      supplierId: 'supplier-b',
      supplierName: 'Supplier B',
      totalCost: 120,
      emissions: 8,
      intensity: 0.8,
      boundary: 'Cradle-to-grave',
    });

    expect(result.comparisonStatus).toBe(ComparisonStatus.NOT_DIRECTLY_COMPARABLE);
    expect(result.emissionsDifference).toBeUndefined();
    expect(result.costPerEstimatedTonneAvoided).toBeUndefined();
    expect(result.warnings).toContain('Life-cycle boundaries differ or are missing.');
  });

  it('keeps cost comparison available when one supplier has no valid carbon data', () => {
    const result = calculateDecisionTradeOff({
      ...common,
      supplierId: 'supplier-a',
      supplierName: 'Supplier A',
      totalCost: 100,
      emissions: 10,
      intensity: 1,
    }, {
      ...common,
      supplierId: 'supplier-b',
      supplierName: 'Supplier B',
      totalCost: 120,
    });

    expect(result.purchaseCostDifference).toBe(-20);
    expect(result.comparisonStatus).toBe(ComparisonStatus.NOT_DIRECTLY_COMPARABLE);
    expect(result.emissionsDifference).toBeUndefined();
    expect(result.costPerEstimatedTonneAvoided).toBeUndefined();
  });

  it('does not use unsupported claims in carbon trade-offs', () => {
    const result = calculateDecisionTradeOff({
      ...common,
      supplierId: 'supplier-a',
      supplierName: 'Supplier A',
      totalCost: 100,
      emissions: 10,
      intensity: 1,
      evidenceStatus: ClaimStatus.UNSUPPORTED,
    }, {
      ...common,
      supplierId: 'supplier-b',
      supplierName: 'Supplier B',
      totalCost: 120,
      emissions: 8,
      intensity: 0.8,
    });

    expect(result.comparisonStatus).toBe(ComparisonStatus.NOT_DIRECTLY_COMPARABLE);
    expect(result.emissionsDifference).toBeUndefined();
    expect(result.costPerEstimatedTonneAvoided).toBeUndefined();
  });

  it('does not compare trade-offs using different currencies', () => {
    const result = calculateDecisionTradeOff({
      ...common,
      supplierId: 'supplier-a',
      supplierName: 'Supplier A',
      totalCost: 100,
      emissions: 10,
      intensity: 1,
    }, {
      ...common,
      supplierId: 'supplier-b',
      supplierName: 'Supplier B',
      totalCost: 120,
      emissions: 8,
      intensity: 0.8,
      currency: 'USD',
    });

    expect(result.purchaseCostDifference).toBeUndefined();
    expect(result.comparisonStatus).toBe(ComparisonStatus.COMPARABLE);
    expect(result.emissionsDifference).toBe(2);
    expect(result.warnings).toContain('Purchase cost comparison unavailable because currencies differ.');
  });
});

describe('procurement decision validation', () => {
  it('accepts a buyer-selected currency and explicit factor priorities', () => {
    expect(procurementScenarioSchema.safeParse({
      productId: '507f1f77bcf86cd799439011',
      quantity: 1000,
      currency: 'INR',
      priorities: { ...equalPriorities, carbon: 'HIGH' },
    }).success).toBe(true);
  });

  it('requires an explicit supplier and product to finalize a decision', () => {
    expect(finalizeProcurementDecisionSchema.safeParse({}).success).toBe(false);
    expect(finalizeProcurementDecisionSchema.safeParse({
      selectedSupplierId: '507f1f77bcf86cd799439011',
      selectedProductId: '507f1f77bcf86cd799439012',
    }).success).toBe(true);
  });

  it('does not allow clients to mark decisions DECIDED through generic updates', () => {
    expect(updateProcurementDecisionSchema.safeParse({ status: 'DECIDED' }).success).toBe(false);
    expect(updateProcurementDecisionSchema.safeParse({ status: 'UNDER_REVIEW' }).success).toBe(true);
  });
});

describe('explainable supplier recommendations', () => {
  const optionA = supplierOption();
  const optionB = supplierOption({
    supplierId: 'supplier-b',
    productId: 'product-b',
    supplierName: 'Supplier B',
    totalCost: 75,
    pricePerUnit: 75,
    estimatedEmissions: 98_000,
    carbonIntensity: 0.98,
  });

  it('changes recommendation when the buyer changes price and carbon priorities', () => {
    const carbonFocused = recommendScenarioSuppliers([
      optionA,
      optionB,
    ], { ...equalPriorities, carbon: 'HIGH', price: 'LOW' }, 'INR');
    const priceFocused = recommendScenarioSuppliers([
      optionA,
      optionB,
    ], { ...equalPriorities, carbon: 'LOW', price: 'HIGH' }, 'INR');

    expect(carbonFocused.recommendation.recommendedSupplierId).toBe('supplier-b');
    expect(priceFocused.recommendation.recommendedSupplierId).toBe('supplier-a');
    expect(carbonFocused.recommendation.methodology).toContain('LOW/MEDIUM/HIGH weights are 1/2/3');
    expect(carbonFocused.options[0].factorResults?.find((factor) => factor.factor === 'carbon')).toMatchObject({
      priority: 'HIGH',
      weight: 3,
      eligibleComparisons: 1,
    });
    expect(carbonFocused.recommendation.whyNotRecommended).toHaveLength(1);
  });

  it('does not recommend when high-priority carbon evidence is not comparable', () => {
    const result = recommendScenarioSuppliers([
      optionA,
      supplierOption({
        supplierId: 'supplier-b',
        productId: 'product-b',
        supplierName: 'Supplier B',
        lifecycleBoundary: 'Cradle-to-grave',
        totalCost: 75,
      }),
    ], { ...equalPriorities, carbon: 'HIGH' }, 'INR');

    expect(result.recommendation.status).toBe('NO_RECOMMENDATION');
    expect(result.options.map((option) => option.eligibilityStatus)).toEqual(['NOT_COMPARABLE', 'NOT_COMPARABLE']);
  });

  it('keeps suppliers eligible when optional certificate information is missing', () => {
    const result = recommendScenarioSuppliers([
      { ...optionA, certificateEvidenceCount: undefined },
      { ...optionB, certificateEvidenceCount: undefined },
    ], { ...equalPriorities, carbon: 'HIGH', sustainabilityEvidence: 'LOW' }, 'INR');

    expect(result.recommendation.status).toBe('RECOMMENDED');
    expect(result.options.every((option) => option.eligibilityStatus !== 'INSUFFICIENT_DATA')).toBe(true);
  });

  it('does not recommend with a missing high-priority current price', () => {
    const result = recommendScenarioSuppliers([
      { ...optionA, totalCost: undefined, pricePerUnit: undefined },
      { ...optionB, totalCost: undefined, pricePerUnit: undefined },
    ], { ...equalPriorities, price: 'HIGH' }, 'INR');

    expect(result.recommendation.status).toBe('NO_RECOMMENDATION');
    expect(result.options.every((option) => option.eligibilityStatus === 'INSUFFICIENT_DATA')).toBe(true);
  });

  it('accepts and compares an actually supported zero carbon intensity', () => {
    const result = recommendScenarioSuppliers([
      { ...optionA, carbonIntensity: 0, estimatedEmissions: 0 },
      optionB,
    ], { ...equalPriorities, carbon: 'HIGH' }, 'INR');

    expect(result.recommendation.recommendedSupplierId).toBe('supplier-a');
    expect(result.options[0].estimatedEmissions).toBe(0);
  });

  it('returns no recommendation for tied options', () => {
    const result = recommendScenarioSuppliers([
      optionA,
      { ...optionA, supplierId: 'supplier-b', productId: 'product-b', supplierName: 'Supplier B' },
    ], equalPriorities, 'INR');

    expect(result.recommendation.status).toBe('NO_RECOMMENDATION');
    expect(result.recommendation.confidence).toBe('NO_RECOMMENDATION');
  });
});
