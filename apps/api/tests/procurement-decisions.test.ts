import { describe, expect, it } from 'vitest';
import { ClaimStatus, ComparisonStatus } from '@carbonpilot/shared';
import { calculateDecisionTradeOff } from '../src/modules/procurement-decisions';
import {
  finalizeProcurementDecisionSchema,
  updateProcurementDecisionSchema,
} from '@carbonpilot/validation';

const common = {
  intensityUnit: 'kgCO2e/kg',
  functionalUnit: '1 kg product',
  boundary: 'Cradle-to-gate',
  reportingPeriod: '2026',
  currency: 'INR',
  evidenceStatus: ClaimStatus.SUPPORTED,
};

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
});

describe('procurement decision validation', () => {
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
