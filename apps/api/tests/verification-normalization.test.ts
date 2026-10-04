import { describe, expect, it } from 'vitest';
import {
  areComparablePcfValues,
  certificateDateIssue,
  normalizeCarbonData,
  normalizeUnitValue,
  validateClaimValue,
} from '../src/modules/verification/normalization';

describe('verification data normalization', () => {
  it('normalizes compatible PCF intensity units and preserves the submitted value', () => {
    const normalized = normalizeCarbonData({ value: 1.42, unit: 'tCO2e/tonne', functionalUnit: '1 tonne', boundary: 'cradle-to-gate', reportingPeriod: '2025' });
    expect(normalized).toMatchObject({
      originalValue: 1.42,
      originalUnit: 'tCO2e/tonne',
      normalizedValue: 1.42,
      normalizedUnit: 'kgCO2e/kg',
      functionalUnit: '1 tonne',
      boundary: 'cradle-to-gate',
      reportingPeriod: '2025',
    });
  });

  it('converts compatible absolute carbon and energy units', () => {
    expect(normalizeUnitValue(1, 'tCO2e')?.value).toBe(1000);
    expect(normalizeUnitValue(1, 'MWh')).toMatchObject({ value: 1000, unit: 'kWh' });
    expect(normalizeUnitValue(58, '%')?.unit).toBe('%');
  });

  it('rejects unknown units and invalid quantities', () => {
    expect(normalizeUnitValue(4, 'widgets')).toBeUndefined();
    expect(validateClaimValue(-1, 'kgCO2e')).toBe('Value cannot be negative.');
    expect(validateClaimValue(125, '%')).toBe('Percentage cannot exceed 100%.');
    expect(validateClaimValue(2, 'mystery')).toContain('not recognized');
  });

  it('does not compare PCF values with incompatible functional units, boundaries, or periods', () => {
    const report = { unit: 'tCO2e/tonne', functionalUnit: '1 tonne', boundary: 'cradle-to-gate', reportingPeriod: '2025' };
    expect(areComparablePcfValues(report, { ...report, unit: 'kgCO2e/tonne' })).toBe(true);
    expect(areComparablePcfValues(report, { ...report, functionalUnit: '1 kg' })).toBe(false);
    expect(areComparablePcfValues(report, { ...report, boundary: 'cradle-to-grave' })).toBe(false);
    expect(areComparablePcfValues(report, { ...report, reportingPeriod: '2024' })).toBe(false);
  });

  it('reports expired and invalid certificate dates deterministically', () => {
    const now = new Date('2026-10-04T00:00:00.000Z');
    expect(certificateDateIssue('2024-01-01', '2025-03-31', now)).toContain('ended');
    expect(certificateDateIssue('2025-01-01', '2024-01-01', now)).toContain('precedes');
    expect(certificateDateIssue('invalid', '2027-01-01', now)).toContain('valid dates');
  });
});