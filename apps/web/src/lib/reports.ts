import { apiFetch, getStoredSession } from './auth';

export interface ProcurementCarbonReportSummary {
  totalPurchases: number;
  totalProcurementQuantity: number;
  suppliersCount: number;
  productsCount: number;
  totalProcurementValueByCurrency: Array<{ currency: string; amount: number }>;
  totalExpectedEmissions: number;
  totalActualEmissions: number;
  totalVariance: number;
  purchasesWithCarbonData: number;
  purchasesWithoutCarbonData: number;
  purchasesNotComparable: number;
  dataQuality: {
    corroborated: number;
    supported: number;
    internallyConsistent: number;
    inconsistent: number;
    unsupported: number;
    notAvailable: number;
  };
  certificates: {
    valid: number;
    expiringSoon: number;
    expired: number;
    invalid: number;
  };
}

export interface ProcurementCarbonReportRecord {
  purchase: {
    _id: string;
    referenceNumber?: string;
    status: string;
    quantity: number;
    unit: string;
    purchaseDate: string;
    currency: string;
  };
  supplier: { _id: string; name: string };
  product: { _id: string; name: string; productCode?: string; category: string; unit: string };
  expected: {
    quantity?: number;
    carbonIntensity?: number;
    carbonIntensityUnit?: string;
    functionalUnit?: string;
    lifecycleBoundary?: string;
    reportingPeriod?: string;
    evidenceStatus?: string;
    emissions?: number;
  };
  actual: {
    quantity?: number;
    carbonIntensity?: number;
    carbonIntensityUnit?: string;
    functionalUnit?: string;
    lifecycleBoundary?: string;
    reportingPeriod?: string;
    evidenceStatus?: string;
    emissions?: number;
  };
  status: 'NOT_AVAILABLE' | 'EXPECTED_ONLY' | 'ACTUAL_ONLY' | 'NOT_COMPARABLE' | 'COMPLETE';
  variance?: number;
  variancePercent?: number;
  comparisonReason?: string;
  sourceOfVariance?: string;
  calculatedAt?: string | null;
}

export interface ProcurementCarbonReportResponse {
  period: string;
  filter: { period?: string; from?: string; to?: string };
  summary: ProcurementCarbonReportSummary;
  purchases: ProcurementCarbonReportRecord[];
}

function getToken() {
  const token = getStoredSession()?.token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return token;
}

export function getProcurementCarbonReport(period?: string, params?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (period) query.set('period', period);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<ProcurementCarbonReportResponse>(`/api/reports/procurement-carbon${suffix}`, {}, getToken());
}
