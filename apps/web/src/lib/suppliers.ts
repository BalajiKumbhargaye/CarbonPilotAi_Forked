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

export function updateSupplierProfile(payload: Partial<SupplierProfile>) {
  return apiFetch<SupplierProfile>('/api/suppliers/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, getToken());
}
