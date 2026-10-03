import { apiFetch, getStoredSession } from './auth';

export type PurchaseStatus = 'DRAFT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'PENDING' | 'DELIVERED';

export interface PurchaseSupplier {
  _id: string;
  name: string;
}

export interface PurchaseProduct {
  _id: string;
  name: string;
  productCode?: string;
  category: string;
  unit: string;
}

export interface PurchaseItem {
  _id: string;
  supplierId: string;
  supplierOrganizationId: string;
  supplierOrganization: PurchaseSupplier | null;
  productId: string;
  product: PurchaseProduct | null;
  quantity: number;
  unit: string;
  unitPrice: string;
  totalAmount: string;
  currency: string;
  purchaseDate: string;
  referenceNumber?: string;
  notes?: string;
  reportingPeriod?: string;
  status: PurchaseStatus;
}

export interface PurchaseFilters {
  supplierId?: string;
  productId?: string;
  status?: PurchaseStatus | '';
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface PurchaseSummary {
  totalPurchases: number;
  activeSuppliers: number;
  totalPurchaseValueByCurrency: Array<{ currency: string; amount: string }>;
  totalQuantityByUnit: Array<{ unit: string; quantity: string }>;
}

export interface PurchaseInput {
  supplierId: string;
  productId: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  currency: string;
  purchaseDate: string;
  referenceNumber?: string;
  notes?: string;
  status?: PurchaseStatus;
}

function getToken() {
  const token = getStoredSession()?.token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return token;
}

function queryString(filters: PurchaseFilters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const value = query.toString();
  return value ? `?${value}` : '';
}

export function getPurchases(filters: PurchaseFilters = {}) {
  return apiFetch<PurchaseItem[]>(`/api/procurement/purchases${queryString(filters)}`, {}, getToken());
}

export function getPurchase(id: string) {
  return apiFetch<PurchaseItem>(`/api/procurement/purchases/${encodeURIComponent(id)}`, {}, getToken());
}

export function getPurchaseSummary() {
  return apiFetch<PurchaseSummary>('/api/procurement/purchases/summary', {}, getToken());
}

export function createPurchase(payload: PurchaseInput) {
  return apiFetch<PurchaseItem>('/api/procurement/purchases', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, getToken());
}

export function updatePurchase(id: string, payload: Partial<PurchaseInput>) {
  return apiFetch<PurchaseItem>(`/api/procurement/purchases/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, getToken());
}

export function updatePurchaseStatus(id: string, status: PurchaseStatus) {
  return apiFetch<PurchaseItem>(`/api/procurement/purchases/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }, getToken());
}
