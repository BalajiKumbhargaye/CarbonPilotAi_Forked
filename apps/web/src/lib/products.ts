import { apiFetch, getStoredSession } from './auth';

export type ProductStatus = 'ACTIVE' | 'INACTIVE';

export interface ProductCategory {
  _id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface ProductSupplier {
  _id: string;
  organizationId: string;
  name: string;
}

export interface ProductItem {
  _id: string;
  supplierId: string;
  supplier: ProductSupplier;
  name: string;
  productCode?: string;
  category: string;
  categoryId?: string;
  unit: string;
  sellingPrice?: number;
  currency?: string;
  description?: string;
  status: ProductStatus;
  createdAt?: string;
}

export interface ProductInput {
  supplierId?: string;
  name: string;
  productCode?: string;
  categoryId: string;
  unit: string;
  sellingPrice?: number;
  currency?: string;
  description?: string;
  status?: ProductStatus;
}

export interface ProductFilters {
  search?: string;
  supplierId?: string;
  categoryId?: string;
  status?: ProductStatus | '';
  catalog?: boolean;
}

function getToken() {
  const token = getStoredSession()?.token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return token;
}

export function getProductCategories() {
  return apiFetch<ProductCategory[]>('/api/products/categories', {}, getToken());
}

export function createProductCategory(name: string) {
  return apiFetch<ProductCategory>('/api/products/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }, getToken());
}

export function getProducts(filters: ProductFilters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, String(value));
  }
  const queryString = query.toString();
  return apiFetch<ProductItem[]>(`/api/products${queryString ? `?${queryString}` : ''}`, {}, getToken());
}

export function getProduct(id: string) {
  return apiFetch<ProductItem>(`/api/products/${encodeURIComponent(id)}`, {}, getToken());
}

export function createProduct(payload: ProductInput) {
  return apiFetch<ProductItem>('/api/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, getToken());
}

export function updateProduct(id: string, payload: Partial<ProductInput>) {
  return apiFetch<ProductItem>(`/api/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, getToken());
}
