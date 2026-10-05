import { apiFetch, getStoredSession } from './auth';

export interface DecisionScenarioOption {
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  productCode?: string;
  productUnit: string;
  scenarioQuantity: number;
  scenarioUnit: string;
  pricePerUnit?: number;
  priceUnit: string;
  totalCost?: number;
  currency?: string;
  priceSource?: 'CURRENT_PRODUCT_PRICE' | 'NOT_AVAILABLE';
  lastRecordedPrice?: number;
  lastRecordedPriceCurrency?: string;
  lastRecordedPriceUnit?: string;
  lastRecordedPriceDate?: string;
  carbonIntensity?: number;
  carbonIntensityUnit?: string;
  functionalUnit?: string;
  lifecycleBoundary?: string;
  reportingPeriod?: string;
  methodology?: string;
  claimId?: string;
  sourceReference?: { documentId?: string; documentName?: string; page?: number; sourceText?: string; extractionMethod?: string };
  estimatedEmissions?: number;
  emissionsUnit: string;
  evidenceStatus: string;
  corroborationStatus: string;
  comparisonStatus: string;
  productCompatibility: string;
  availability: string;
  dataCompleteness: { available: number; total: number };
  warnings: string[];
}

export interface DecisionScenario {
  product: { _id: string; name: string; productCode?: string; category: string; unit: string };
  quantity: number;
  unit: string;
  options: DecisionScenarioOption[];
  tradeOffs: Array<{
    leftSupplierId: string;
    rightSupplierId: string;
    leftSupplierName: string;
    rightSupplierName: string;
    comparisonStatus: string;
    currency?: string;
    purchaseCostDifference?: number;
    emissionsDifference?: number;
    emissionsDifferencePercent?: number;
    costPerEstimatedTonneAvoided?: number;
    warnings: string[];
  }>;
  decisionNotice: string;
}

export interface ProcurementDecisionRecord {
  _id: string;
  productId: { _id: string; name: string; unit: string } | string;
  quantity: number;
  unit: string;
  status: 'DRAFT' | 'UNDER_REVIEW' | 'DECIDED' | 'CANCELLED';
  selectedSupplierId?: { _id: string; organizationId?: { name: string } | string } | string;
  selectedProductId?: { _id: string; name: string } | string;
  decisionReason?: string;
  decisionDate?: string;
  createdAt: string;
}

function getToken() {
  const token = getStoredSession()?.token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return token;
}

export function compareDecisionScenario(productId: string, quantity: number) {
  return apiFetch<DecisionScenario>('/api/procurement-decisions/scenarios/compare', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity }),
  }, getToken());
}

export function getProcurementDecisions() {
  return apiFetch<ProcurementDecisionRecord[]>('/api/procurement-decisions', {}, getToken());
}

export function createProcurementDecision(payload: {
  productId: string;
  quantity: number;
  selectedSupplierId?: string;
  selectedProductId?: string;
  decisionReason?: string;
}) {
  return apiFetch<ProcurementDecisionRecord>('/api/procurement-decisions', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, getToken());
}

export function updateProcurementDecision(
  id: string,
  payload: {
    selectedSupplierId?: string;
    selectedProductId?: string;
    decisionReason?: string;
    status?: 'DRAFT' | 'UNDER_REVIEW' | 'CANCELLED';
  }
) {
  return apiFetch<ProcurementDecisionRecord>(`/api/procurement-decisions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, getToken());
}

export function finalizeProcurementDecision(id: string, payload: {
  selectedSupplierId: string;
  selectedProductId: string;
  decisionReason?: string;
}) {
  return apiFetch<ProcurementDecisionRecord>(`/api/procurement-decisions/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, getToken());
}
