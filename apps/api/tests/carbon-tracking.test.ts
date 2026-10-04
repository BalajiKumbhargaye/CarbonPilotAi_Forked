import { describe, expect, it } from 'vitest';
import { calculateExpectedActualTracking } from '../src/modules/carbon';

describe('expected vs actual carbon tracking', () => {
  it('calculates a normal expected-versus-actual variance', () => {
    const result = calculateExpectedActualTracking({
      expectedQuantity: 100_000,
      expectedCarbonIntensity: 0.98,
      expectedCarbonIntensityUnit: 'kgCO2e/kg',
      expectedFunctionalUnit: '1 kg product',
      expectedBoundary: 'Cradle-to-Gate',
      expectedReportingPeriod: '2026',
      actualQuantity: 105_000,
      actualCarbonIntensity: 1.02,
      actualCarbonIntensityUnit: 'kgCO2e/kg',
      actualFunctionalUnit: '1 kg product',
      actualBoundary: 'Cradle-to-Gate',
      actualReportingPeriod: '2026',
    });

    expect(result.expectedEmissions).toBe(98_000);
    expect(result.actualEmissions).toBe(107_100);
    expect(result.variance).toBe(9_100);
    expect(result.variancePercent).toBeCloseTo(9.2857, 3);
    expect(result.status).toBe('COMPLETE');
  });

  it('returns a zero variance when expected and actual values are equal', () => {
    const result = calculateExpectedActualTracking({
      expectedQuantity: 100,
      expectedCarbonIntensity: 0.98,
      expectedCarbonIntensityUnit: 'kgCO2e/kg',
      expectedFunctionalUnit: '1 kg product',
      expectedBoundary: 'Cradle-to-Gate',
      expectedReportingPeriod: '2026',
      actualQuantity: 100,
      actualCarbonIntensity: 0.98,
      actualCarbonIntensityUnit: 'kgCO2e/kg',
      actualFunctionalUnit: '1 kg product',
      actualBoundary: 'Cradle-to-Gate',
      actualReportingPeriod: '2026',
    });

    expect(result.variance).toBe(0);
    expect(result.variancePercent).toBe(0);
    expect(result.status).toBe('COMPLETE');
  });

  it('returns a negative variance when actual emissions are lower than expected', () => {
    const result = calculateExpectedActualTracking({
      expectedQuantity: 100,
      expectedCarbonIntensity: 1,
      expectedCarbonIntensityUnit: 'kgCO2e/kg',
      expectedFunctionalUnit: '1 kg product',
      expectedBoundary: 'Cradle-to-Gate',
      expectedReportingPeriod: '2026',
      actualQuantity: 90,
      actualCarbonIntensity: 1,
      actualCarbonIntensityUnit: 'kgCO2e/kg',
      actualFunctionalUnit: '1 kg product',
      actualBoundary: 'Cradle-to-Gate',
      actualReportingPeriod: '2026',
    });

    expect(result.variance).toBe(-10);
    expect(result.variancePercent).toBe(-10);
    expect(result.status).toBe('COMPLETE');
  });

  it('keeps expected-only records from becoming zero-valued actuals', () => {
    const result = calculateExpectedActualTracking({
      expectedQuantity: 100_000,
      expectedCarbonIntensity: 0.98,
      expectedCarbonIntensityUnit: 'kgCO2e/kg',
      expectedFunctionalUnit: '1 kg product',
      expectedBoundary: 'Cradle-to-Gate',
      expectedReportingPeriod: '2026',
      actualQuantity: undefined,
      actualCarbonIntensity: undefined,
    });

    expect(result.status).toBe('EXPECTED_ONLY');
    expect(result.actualEmissions).toBeUndefined();
    expect(result.variance).toBeUndefined();
  });

  it('marks mismatched lifecycle boundaries as not comparable', () => {
    const result = calculateExpectedActualTracking({
      expectedQuantity: 100_000,
      expectedCarbonIntensity: 0.98,
      expectedCarbonIntensityUnit: 'kgCO2e/kg',
      expectedFunctionalUnit: '1 kg product',
      expectedBoundary: 'Cradle-to-Gate',
      expectedReportingPeriod: '2026',
      actualQuantity: 105_000,
      actualCarbonIntensity: 1.02,
      actualCarbonIntensityUnit: 'kgCO2e/kg',
      actualFunctionalUnit: '1 kg product',
      actualBoundary: 'Cradle-to-Grave',
      actualReportingPeriod: '2026',
    });

    expect(result.status).toBe('NOT_COMPARABLE');
    expect(result.variance).toBeUndefined();
    expect(result.comparisonReason).toContain('lifecycle boundaries');
  });

  it('preserves historical expected values and tracks actual-only records without inventing zeros', () => {
    const historical = calculateExpectedActualTracking({
      expectedQuantity: 100_000,
      expectedCarbonIntensity: 0.98,
      expectedCarbonIntensityUnit: 'kgCO2e/kg',
      expectedFunctionalUnit: '1 kg product',
      expectedBoundary: 'Cradle-to-Gate',
      expectedReportingPeriod: '2026',
      actualQuantity: 105_000,
      actualCarbonIntensity: 1.02,
      actualCarbonIntensityUnit: 'kgCO2e/kg',
      actualFunctionalUnit: '1 kg product',
      actualBoundary: 'Cradle-to-Gate',
      actualReportingPeriod: '2026',
    });

    const actualOnly = calculateExpectedActualTracking({
      expectedQuantity: undefined,
      expectedCarbonIntensity: undefined,
      actualQuantity: 100,
      actualCarbonIntensity: 1.2,
      actualCarbonIntensityUnit: 'kgCO2e/kg',
      actualFunctionalUnit: '1 kg product',
      actualBoundary: 'Cradle-to-Gate',
      actualReportingPeriod: '2026',
    });

    expect(historical.expectedEmissions).toBe(98_000);
    expect(actualOnly.status).toBe('ACTUAL_ONLY');
    expect(actualOnly.actualEmissions).toBe(120);
  });

  it('tags variance source as BOTH when both quantity and intensity differ', () => {
    const result = calculateExpectedActualTracking({
      expectedQuantity: 100_000,
      expectedCarbonIntensity: 0.98,
      expectedCarbonIntensityUnit: 'kgCO2e/kg',
      expectedFunctionalUnit: '1 kg product',
      expectedBoundary: 'Cradle-to-Gate',
      expectedReportingPeriod: '2026',
      actualQuantity: 105_000,
      actualCarbonIntensity: 1.02,
      actualCarbonIntensityUnit: 'kgCO2e/kg',
      actualFunctionalUnit: '1 kg product',
      actualBoundary: 'Cradle-to-Gate',
      actualReportingPeriod: '2026',
    });

    expect(result.sourceOfVariance).toBe('BOTH');
    expect(result.status).toBe('COMPLETE');
  });
});
