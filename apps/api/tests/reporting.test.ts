import { describe, expect, it } from 'vitest';
import { buildProcurementCarbonReport, matchesReportingPeriod } from '../src/modules/reports';

describe('procurement reporting', () => {
  it('filters purchases by year and quarter reporting periods', () => {
    expect(matchesReportingPeriod({ reportingPeriod: '2026', purchaseDate: '2026-03-15T00:00:00.000Z' }, '2026')).toBe(true);
    expect(matchesReportingPeriod({ reportingPeriod: 'Q1 2026', purchaseDate: '2026-03-15T00:00:00.000Z' }, 'Q1 2026')).toBe(true);
    expect(matchesReportingPeriod({ reportingPeriod: 'Q2 2026', purchaseDate: '2026-03-15T00:00:00.000Z' }, 'Q1 2026')).toBe(true);
  });

  it('builds summary metrics without inventing missing carbon data', () => {
    const report = buildProcurementCarbonReport([
      {
        _id: '1',
        quantity: 100,
        currency: 'USD',
        supplierId: 'supplier-a',
        productId: 'product-a',
        totalAmount: 1200,
        expected: { emissions: 100, evidenceStatus: 'SUPPORTED' },
        actual: { emissions: 90, evidenceStatus: 'CORROBORATED' },
        status: 'COMPLETE',
        variance: -10,
      },
      {
        _id: '2',
        quantity: 50,
        currency: 'INR',
        supplierId: 'supplier-b',
        productId: 'product-b',
        totalAmount: 500,
        expected: { emissions: 20, evidenceStatus: 'SUPPORTED' },
        actual: {},
        status: 'EXPECTED_ONLY',
      },
      {
        _id: '3',
        quantity: 75,
        currency: 'INR',
        supplierId: 'supplier-c',
        productId: 'product-c',
        totalAmount: 750,
        expected: { emissions: 15, evidenceStatus: 'UNSUPPORTED' },
        actual: { emissions: 12, evidenceStatus: 'INCONSISTENT' },
        status: 'NOT_COMPARABLE',
      },
    ]);

    expect(report.totalPurchases).toBe(3);
    expect(report.totalProcurementQuantity).toBe(225);
    expect(report.totalProcurementValueByCurrency).toEqual([
      { currency: 'USD', amount: 1200 },
      { currency: 'INR', amount: 1250 },
    ]);
    expect(report.totalExpectedEmissions).toBe(135);
    expect(report.totalActualEmissions).toBe(102);
    expect(report.totalVariance).toBe(-10);
    expect(report.purchasesWithCarbonData).toBe(3);
    expect(report.purchasesWithoutCarbonData).toBe(0);
    expect(report.dataQuality.supported).toBe(2);
    expect(report.dataQuality.corroborated).toBe(1);
    expect(report.dataQuality.unsupported).toBe(1);
    expect(report.dataQuality.notAvailable).toBe(0);
  });
});
