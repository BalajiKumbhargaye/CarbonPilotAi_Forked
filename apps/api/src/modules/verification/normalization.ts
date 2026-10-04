import { INormalizedCarbonData } from '@carbonpilot/shared';

interface UnitDefinition {
  category: string;
  canonicalUnit: string;
  factor: number;
}

const unitDefinitions: Record<string, UnitDefinition> = {
  kgco2e: { category: 'carbon', canonicalUnit: 'kgCO2e', factor: 1 },
  tco2e: { category: 'carbon', canonicalUnit: 'kgCO2e', factor: 1000 },
  kg: { category: 'mass', canonicalUnit: 'kg', factor: 1 },
  tonne: { category: 'mass', canonicalUnit: 'kg', factor: 1000 },
  ton: { category: 'mass', canonicalUnit: 'kg', factor: 1000 },
  t: { category: 'mass', canonicalUnit: 'kg', factor: 1000 },
  kwh: { category: 'energy', canonicalUnit: 'kWh', factor: 1 },
  mwh: { category: 'energy', canonicalUnit: 'kWh', factor: 1000 },
  l: { category: 'volume', canonicalUnit: 'liter', factor: 1 },
  liter: { category: 'volume', canonicalUnit: 'liter', factor: 1 },
  litre: { category: 'volume', canonicalUnit: 'liter', factor: 1 },
  m2: { category: 'area', canonicalUnit: 'm²', factor: 1 },
  'm²': { category: 'area', canonicalUnit: 'm²', factor: 1 },
  sqm: { category: 'area', canonicalUnit: 'm²', factor: 1 },
  sqm2: { category: 'area', canonicalUnit: 'm²', factor: 1 },
  piece: { category: 'count', canonicalUnit: 'piece', factor: 1 },
  pcs: { category: 'count', canonicalUnit: 'piece', factor: 1 },
  unit: { category: 'count', canonicalUnit: 'piece', factor: 1 },
  units: { category: 'count', canonicalUnit: 'piece', factor: 1 },
  '%': { category: 'percentage', canonicalUnit: '%', factor: 1 },
};

function unitDefinition(unit: string): UnitDefinition | undefined {
  return unitDefinitions[unit.replace(/\s/g, '').toLowerCase()];
}

export function normalizeUnitValue(value: number, unit: string) {
  if (!Number.isFinite(value)) return undefined;

  const separator = unit.indexOf('/');
  if (separator >= 0) {
    const numerator = unitDefinition(unit.slice(0, separator));
    const denominator = unitDefinition(unit.slice(separator + 1));
    if (!numerator || !denominator) return undefined;
    return {
      value: value * numerator.factor / denominator.factor,
      unit: `${numerator.canonicalUnit}/${denominator.canonicalUnit}`,
      conversionMethod: `Converted ${unit} using ${numerator.factor} numerator and ${denominator.factor} denominator factors.`,
    };
  }

  const definition = unitDefinition(unit);
  if (!definition) return undefined;
  return {
    value: value * definition.factor,
    unit: definition.canonicalUnit,
    conversionMethod: definition.factor === 1
      ? `Canonicalized ${unit} without changing its value.`
      : `Converted ${unit} to ${definition.canonicalUnit} using factor ${definition.factor}.`,
  };
}

export function normalizeCarbonData(params: {
  value: number;
  unit: string;
  functionalUnit?: string;
  boundary?: string;
  reportingPeriod?: string;
}): INormalizedCarbonData | undefined {
  const normalized = normalizeUnitValue(params.value, params.unit);
  if (!normalized) return undefined;
  return {
    originalValue: params.value,
    originalUnit: params.unit,
    normalizedValue: normalized.value,
    normalizedUnit: normalized.unit,
    functionalUnit: params.functionalUnit,
    boundary: params.boundary,
    reportingPeriod: params.reportingPeriod,
    conversionMethod: normalized.conversionMethod,
  };
}

export function canApplyCarbonIntensity(quantityUnit: string, carbonIntensityUnit: string) {
  const quantityNormalized = normalizeUnitValue(1, quantityUnit);
  if (!quantityNormalized) return false;

  const separator = carbonIntensityUnit.indexOf('/');
  if (separator < 0) {
    const normalizedIntensity = normalizeUnitValue(1, carbonIntensityUnit);
    return !!normalizedIntensity && normalizedIntensity.unit.startsWith('kgCO2e');
  }

  const denominator = carbonIntensityUnit.slice(separator + 1).trim();
  const denominatorNormalized = normalizeUnitValue(1, denominator);
  if (!denominatorNormalized) return false;
  return quantityNormalized.unit === denominatorNormalized.unit;
}

export function validateClaimValue(value: unknown, unit: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Value must be a finite number.';
  if (value < 0) return 'Value cannot be negative.';
  if (unit.trim() === '%') return value <= 100 ? undefined : 'Percentage cannot exceed 100%.';
  if (!normalizeUnitValue(value, unit)) return `Unit '${unit}' is not recognized or dimensionally incompatible.`;
  return undefined;
}

export function certificateDateIssue(issueDate: string | Date, expiryDate: string | Date, now = new Date()) {
  const issue = new Date(issueDate);
  const expiry = new Date(expiryDate);
  if (Number.isNaN(issue.getTime()) || Number.isNaN(expiry.getTime())) return 'Certificate dates must be valid dates.';
  if (expiry < issue) return 'Certificate expiry date precedes its issue date.';
  if (expiry < now) return 'Certificate validity period has ended.';
  return undefined;
}

export function areComparablePcfValues(left: {
  unit: string;
  functionalUnit?: string;
  boundary?: string;
  reportingPeriod?: string;
}, right: {
  unit: string;
  functionalUnit?: string;
  boundary?: string;
  reportingPeriod?: string;
}) {
  const leftUnit = normalizeUnitValue(1, left.unit);
  const rightUnit = normalizeUnitValue(1, right.unit);
  if (!leftUnit || !rightUnit || leftUnit.unit !== rightUnit.unit) return false;

  const normalizeText = (value?: string) => value?.trim().toLowerCase().replace(/\s+/g, '');
  if (!left.functionalUnit || !right.functionalUnit || normalizeText(left.functionalUnit) !== normalizeText(right.functionalUnit)) return false;
  if (!left.boundary || !right.boundary || normalizeText(left.boundary) !== normalizeText(right.boundary)) return false;
  if (!left.reportingPeriod || !right.reportingPeriod || normalizeText(left.reportingPeriod) !== normalizeText(right.reportingPeriod)) return false;
  return true;
}