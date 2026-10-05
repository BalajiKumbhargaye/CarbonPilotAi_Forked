import { describe, expect, it } from 'vitest';
import { buildProcurementCarbonReport, matchesReportingPeriod } from '../src/modules/reports';

describe('procurement reporting', () => {
  it('filters purchases by year and quarter reporting periods', () => {
    expect(matchesReportingPeriod({ reportingPeriod: '2026', purchaseDate: '2026-03-15T00:00:00.000Z' }, '2026')).toBe(true);
    expect(matchesReportingPeriod({ reportingPeriod: 'Q1 2026', purchaseDate: '2026-03-15T00:00:00.000Z' }, 'Q1 2026')).toBe(true);
    expect(matchesReportingPeriod({ reportingPeriod: 'Q2 2026', purchaseDate: '2026-03-15T00:00:00.000Z' }, 'Q1 2026')).toBe(false);
  });

  it('builds summary metrics without inventing missing carbon data', () => {
    const report = buildProcurementCarbonReport([
      {
        _id: '1',
        quantity: 100,
        unit: 'kg',
        currency: 'USD',
        supplierId: 'supplier-a',
        productId: 'product-a',
        totalAmount: 1200,
        expected: {
          emissions: 100,
          evidenceStatus: 'SUPPORTED',
          carbonIntensityUnit: 'kgCO2e/kg',
          functionalUnit: '1 kg product',
          lifecycleBoundary: 'Cradle-to-Gate',
          reportingPeriod: '2026',
          methodology: 'ISO 14067',
        },
        actual: {
          emissions: 90,
          evidenceStatus: 'CORROBORATED',
          carbonIntensityUnit: 'kgCO2e/kg',
          functionalUnit: '1 kg product',
          lifecycleBoundary: 'Cradle-to-Gate',
          reportingPeriod: '2026',
          methodology: 'ISO 14067',
        },
        status: 'COMPLETE',
        variance: -10,
      },
      {
        _id: '2',
        quantity: 50,
        unit: 'tonne',
        currency: 'INR',
        supplierId: 'supplier-b',
        productId: 'product-b',
        totalAmount: 500,
        expected: {
          emissions: 20,
          evidenceStatus: 'SUPPORTED',
          carbonIntensityUnit: 'kgCO2e/kg',
          functionalUnit: '1 kg product',
          lifecycleBoundary: 'Cradle-to-Gate',
          reportingPeriod: '2026',
          methodology: 'ISO 14067',
        },
        actual: {},
        status: 'EXPECTED_ONLY',
      },
      {
        _id: '3',
        quantity: 75,
        unit: 'piece',
        currency: 'INR',
        supplierId: 'supplier-c',
        productId: 'product-c',
        expected: {
          emissions: 15,
          evidenceStatus: 'UNSUPPORTED',
          carbonIntensityUnit: 'kgCO2e/kg',
          functionalUnit: '1 kg product',
          lifecycleBoundary: 'Cradle-to-Gate',
          reportingPeriod: '2026',
          methodology: 'ISO 14067',
        },
        actual: {
          emissions: 12,
          evidenceStatus: 'INCONSISTENT',
          carbonIntensityUnit: 'kgCO2e/kg',
          functionalUnit: '1 kg product',
          lifecycleBoundary: 'Cradle-to-Gate',
          reportingPeriod: '2026',
          methodology: 'ISO 14067',
        },
        status: 'NOT_COMPARABLE',
      },
    ]);

    expect(report.totalPurchases).toBe(3);
    expect(report.totalProcurementQuantity).toBeNull();
    expect(report.totalProcurementQuantityByUnit).toEqual([
      { unit: 'kg', quantity: 50100 },
      { unit: 'piece', quantity: 75 },
    ]);
    expect(report.totalProcurementValueByCurrency).toEqual([
      { currency: 'USD', amount: 1200 },
      { currency: 'INR', amount: 500 },
    ]);
    expect(report.unavailableProcurementValueCount).toBe(1);
    expect(report.totalExpectedEmissions).toBe(120);
    expect(report.totalActualEmissions).toBe(90);
    expect(report.totalVariance).toBe(-10);
    expect(report.purchasesWithCarbonData).toBe(2);
    expect(report.purchasesWithoutCarbonData).toBe(1);
    expect(report.dataQuality.supported).toBe(2);
    expect(report.dataQuality.corroborated).toBe(1);
    expect(report.dataQuality.unsupported).toBe(1);
    expect(report.dataQuality.notAvailable).toBe(0);
  });

  it('does not add procurement quantities with missing or incompatible units', () => {
    const report = buildProcurementCarbonReport([
      { _id: '1', quantity: 100, unit: 'kg' },
      { _id: '2', quantity: 10, unit: 'unknown-unit' },
    ]);

    expect(report.totalProcurementQuantity).toBeNull();
    expect(report.totalProcurementQuantityByUnit).toEqual([]);
  });
});
