import { apiFetch, getStoredSession } from './auth';

export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DecisionPriorities {
  price: PriorityLevel;
  carbon: PriorityLevel;
  evidenceQuality: PriorityLevel;
  verificationStatus: PriorityLevel;
  dataCompleteness: PriorityLevel;
  sustainabilityEvidence: PriorityLevel;
  procurementReliability: PriorityLevel;
}

export const defaultDecisionPriorities: DecisionPriorities = {
  price: 'MEDIUM',
  carbon: 'MEDIUM',
  evidenceQuality: 'MEDIUM',
  verificationStatus: 'MEDIUM',
  dataCompleteness: 'MEDIUM',
  sustainabilityEvidence: 'MEDIUM',
  procurementReliability: 'MEDIUM',
};

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
  currentPriceUpdatedAt?: string;
  carbonIntensity?: number;
  carbonIntensityUnit?: string;
  functionalUnit?: string;
  lifecycleBoundary?: string;
  reportingPeriod?: string;
  methodology?: string;
  claimId?: string;
  sourceReference?: { documentId?: string; documentName?: string; page?: number; sourceText?: string; extractionMethod?: string; sourceType?: string };
  evidence: Array<{
    documentId: string;
    documentName: string;
    page?: number;
    section?: string;
    sourceText?: string;
    relationshipType: string;
    downloadPath?: string;
  }>;
  evidenceCount: number;
  evidenceDocumentsShared: boolean;
  estimatedEmissions?: number;
  carbonCalculation?: {
    quantity: number;
    quantityUnit: string;
    intensity: number;
    intensityUnit: string;
    emissions: number;
    emissionsUnit: string;
  };
  eligibleForCarbonCalculation: boolean;
  emissionsUnit: string;
  evidenceStatus: string;
  corroborationStatus: string;
  verificationStatus: string;
  verification?: {
    overallStatus: string;
    verifiedAt: string;
    checks: Array<{
      checkType: string;
      result: string;
      explanation: string;
      expected?: string;
      observed?: string;
      sourcePage?: number;
    }>;
    issues: Array<{
      type: string;
      severity: string;
      description: string;
      recommendedAction: string;
      status: string;
    }>;
    anomalies?: Array<{
      type: string;
      severity: string;
      status: string;
      description: string;
      recommendedAction?: string;
      detectedAt?: string;
      resolvedAt?: string;
      resolutionNote?: string;
    }>;
  };
  certificates: Array<{
    documentId?: string;
    downloadPath?: string;
    type: string;
    certificateNumber: string;
    issuingBody: string;
    issueDate: string;
    expiryDate: string;
    status: string;
    externallyVerified: boolean;
  }>;
  certificateEvidenceCount?: number;
  procurementHistory: {
    purchaseCount: number;
    completedPurchaseCount: number;
    lastPurchaseDate?: string;
  };
  dataFreshness: {
    productUpdatedAt?: string;
    carbonUpdatedAt?: string;
    productPriceIsOlderThanOneYear: boolean;
    carbonClaimIsOlderThanOneYear: boolean;
  };
  comparisonStatus: string;
  productCompatibility: string;
  availability: string;
  dataCompleteness: { available: number; total: number; fields: Array<{ name: string; available: boolean; included?: boolean }> };
  eligibilityStatus: 'ELIGIBLE' | 'PARTIALLY_ELIGIBLE' | 'NOT_COMPARABLE' | 'INSUFFICIENT_DATA';
  recommendationScore?: number;
  recommendationReasons: string[];
  whyNotRecommended: string[];
  factorResults: Array<{
    factor: keyof DecisionPriorities;
    priority: PriorityLevel;
    weight: number;
    eligibleComparisons: number;
    wins: number;
    ties: number;
    losses: number;
    weightedContribution: number;
    maximumContribution: number;
  }>;
  warnings: string[];
}

export interface DecisionScenario {
  product: { _id: string; name: string; productCode?: string; category: string; unit: string };
  quantity: number;
  unit: string;
  requestedCurrency?: string;
  priorities: DecisionPriorities;
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
  recommendation: {
    status: 'RECOMMENDED' | 'NO_RECOMMENDATION';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_RECOMMENDATION';
    recommendedSupplierId?: string;
    recommendedProductId?: string;
    explanation: string;
    reasons: string[];
    whyNotRecommended: Array<{ supplierId: string; productId: string; reasons: string[] }>;
    methodology: string;
    generatedAt: string;
  };
  decisionNotice: string;
}

export interface ProcurementDecisionRecord {
  _id: string;
  productId: { _id: string; name: string; unit: string } | string;
  quantity: number;
  unit: string;
  requestedCurrency?: string;
  decisionPriorities?: DecisionPriorities;
  recommendationSnapshot?: DecisionScenario['recommendation'];
  scenarioSnapshot?: Array<Partial<DecisionScenarioOption> & Pick<DecisionScenarioOption, 'supplierId' | 'productId' | 'supplierName' | 'productName'>>;
  history?: Array<{ action: string; changedAt: string; details?: Record<string, unknown> }>;
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

export function compareDecisionScenario(
  productId: string,
  quantity: number,
  currency?: string,
  priorities?: DecisionPriorities
) {
  return apiFetch<DecisionScenario>('/api/procurement-decisions/scenarios/compare', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity, currency: currency || undefined, priorities }),
  }, getToken());
}

export function getProcurementDecisions() {
  return apiFetch<ProcurementDecisionRecord[]>('/api/procurement-decisions', {}, getToken());
}

export function createProcurementDecision(payload: {
  productId: string;
  quantity: number;
  currency?: string;
  priorities?: DecisionPriorities;
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

export async function downloadDecisionEvidence(path: string, filename: string) {
  const token = getToken();
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to download the source document.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
