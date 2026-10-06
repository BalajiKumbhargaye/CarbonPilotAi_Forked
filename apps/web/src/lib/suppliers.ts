import { apiFetch, getStoredSession } from './auth';

export type SupplierStatus = 'INVITED' | 'ACTIVE' | 'PENDING' | 'INACTIVE' | 'TERMINATED';

export interface SupplierDirectoryItem {
  _id: string;
  organizationId: string;
  companyName: string;
  legalName?: string;
  industry: string;
  country?: string;
  city?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  category?: string;
  notes?: string;
  status: SupplierStatus;
  productsCount: number;
  createdAt: string;
  connectedAt: string;
}

export interface SupplierInput {
  companyName: string;
  legalName?: string;
  industry: string;
  country: string;
  city: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  website?: string;
  category: string;
  notes?: string;
}

export interface SupplierProfile {
  _id: string;
  supplierId: string;
  name: string;
  legalName?: string;
  industry?: string;
  country?: string;
  city?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  description?: string;
  category?: string;
}

function getToken() {
  const token = getStoredSession()?.token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return token;
}

export function getSuppliers(search = '') {
  const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  return apiFetch<SupplierDirectoryItem[]>(`/api/suppliers${query}`, {}, getToken());
}

export function getSupplier(id: string) {
  return apiFetch<SupplierDirectoryItem & { products: Array<{ _id: string; name: string; productCode: string; category: string }> }>(
    `/api/suppliers/${encodeURIComponent(id)}`,
    {},
    getToken()
  );
}

export function createSupplier(payload: SupplierInput) {
  return apiFetch<SupplierDirectoryItem>('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, getToken());
}

export function updateSupplier(id: string, payload: Partial<SupplierInput>) {
  return apiFetch<SupplierDirectoryItem>(`/api/suppliers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, getToken());
}

export function updateSupplierStatus(id: string, status: SupplierStatus) {
  return apiFetch<SupplierDirectoryItem>(`/api/suppliers/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }, getToken());
}

export function getSupplierProfile() {
  return apiFetch<SupplierProfile>('/api/suppliers/profile', {}, getToken());
}

export interface SupplierCarbonSummaryItem {
  product: string;
  unit: string;
  carbonIntensity: number | null;
  functionalUnit: string;
  lifecycleBoundary: string;
  reportingPeriod: string;
  evidenceStatus: string;
  corroborationStatus: string;
  dataQualityStatus: string;
}

export interface SupplierCarbonProfile {
  supplier: Record<string, unknown>;
  products: Array<Record<string, unknown>>;
  claims: Array<Record<string, unknown>>;
  metrics: Record<string, number | string>;
  carbonData: {
    numberOfProductsWithCarbonData: number;
    productsWithMissingCarbonData: number;
    reportedCarbonIntensityValues: number[];
    reportingPeriods: string[];
    lifecycleBoundaries: string[];
    functionalUnits: string[];
  };
  evidenceQuality: Record<string, number>;
  dataQuality: Record<string, number>;
  dataCompleteness: {
    requested: number;
    submitted: number;
    missing: number;
    completeness: number;
    requiredMissing: number;
    optionalMissing: number;
    completedQuestionnaireResponses: number;
    missingRequiredResponses: number;
  };
  questionnaireSummary: Array<{ category: string; status: string; missingRequiredResponses: number; submitted: number; total: number }>;
  certificateSummary: Array<Record<string, unknown>>;
  productSummary: SupplierCarbonSummaryItem[];
  trend: Array<{ productId: string; productName: string; values: Array<Record<string, unknown>> }>;
}

export interface SupplierComparisonRow {
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  productCode?: string;
  category?: string;
  unit?: string;
  pricePerUnit: number | null;
  currency?: string | null;
  priceSource?: string;
  carbonIntensity: number | null;
  carbonUnit?: string | null;
  functionalUnit?: string;
  lifecycleBoundary?: string;
  reportingPeriod?: string;
  methodology?: string;
  sourceReference?: { documentId?: string; documentName?: string; page?: number; sourceText?: string; extractionMethod?: string };
  evidenceStatus?: string;
  corroborationStatus?: string;
  carbonStatus?: string;
  dataCompleteness: { requested: number; completed: number; percentage: number };
  certificate?: { type?: string; issuer?: string; status?: string; issueDate?: string; expiryDate?: string } | null;
  purchaseHistory: { count: number; totalQuantity: number | null; totalQuantityUnit?: string | null; lastPurchaseDate?: string | null; lastPrice?: number | null; currency?: string | null };
  warnings: string[];
  comparableCarbon?: { value: number; unit: string; functionalUnit?: string; boundary?: string; reportingPeriod?: string; methodology?: string } | null;
  rank?: number;
  rankScore?: number;
  rankReasons?: string[];
}

export interface SupplierComparisonResult {
  product: { _id: string; name: string; productCode?: string; category: string; unit: string };
  suppliers: SupplierComparisonRow[];
  warnings: string[];
  tradeOff?: {
    quantity: number;
    unit: string;
    cheapestSupplier: string;
    lowestCost: number;
    comparisonSupplier: string | null;
    costDifference: number;
    currency?: string;
    emissionDifference: number;
    costPerEstimatedTonneAvoided?: number;
  };
  comparability: { directlyComparableCount: number; totalSuppliers: number };
}

export function getSupplierCarbonProfile(id: string) {
  return apiFetch<SupplierCarbonProfile>(`/api/carbon/suppliers/${encodeURIComponent(id)}`, {}, getToken());
}

export function compareSuppliersForProduct(productId: string, supplierIds: string[], quantity = 1) {
  return apiFetch<SupplierComparisonResult>('/api/carbon/suppliers/compare', {
    method: 'POST',
    body: JSON.stringify({ productId, supplierIds, quantity }),
  }, getToken());
}

export function updateSupplierProfile(payload: Partial<SupplierProfile>) {
  return apiFetch<SupplierProfile>('/api/suppliers/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, getToken());
}
