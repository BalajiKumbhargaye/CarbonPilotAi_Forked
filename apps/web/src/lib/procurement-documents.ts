import { apiFetch, getStoredSession } from './auth';

export type ProcurementDocumentType = 'INVOICE' | 'PURCHASE_ORDER';
export type ProcurementDocumentStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'EXTRACTED'
  | 'NEEDS_REVIEW'
  | 'IMPORTED'
  | 'FAILED';

export interface ProcurementDocumentSupplier {
  _id: string;
  organizationId: string;
  name: string;
}

export interface ProcurementReviewData {
  supplierId: string;
  productId: string;
  documentNumber: string;
  documentDate: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  totalAmount: string;
  currency: string;
  purchaseOrderNumber?: string;
  expectedDeliveryDate?: string;
  source?: 'MANUAL' | 'EXTRACTED';
}

export interface ProcurementDocumentRecord {
  _id: string;
  filename: string;
  type: ProcurementDocumentType;
  status: ProcurementDocumentStatus;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  processingError?: string;
  reviewData?: ProcurementReviewData;
  supplierId?: string;
  supplier?: { _id: string; name: string } | null;
  invoiceId?: string;
  purchaseOrderId?: string;
  purchaseId?: string;
  downloadPath: string;
}

export interface ProcurementDocumentImportResult {
  document: ProcurementDocumentRecord;
  purchase: { _id: string } | null;
  purchaseOrder: { _id: string } | null;
  warning: string | null;
}

function getToken() {
  const token = getStoredSession()?.token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return token;
}

export function getProcurementDocumentSuppliers() {
  return apiFetch<ProcurementDocumentSupplier[]>('/api/procurement-documents/suppliers', {}, getToken());
}

export function getProcurementDocuments() {
  return apiFetch<ProcurementDocumentRecord[]>('/api/procurement-documents', {}, getToken());
}

export function getProcurementDocument(id: string) {
  return apiFetch<ProcurementDocumentRecord>(`/api/procurement-documents/${encodeURIComponent(id)}`, {}, getToken());
}

export function uploadProcurementDocument(file: File, type: ProcurementDocumentType, supplierId: string) {
  const form = new FormData();
  form.set('file', file);
  form.set('type', type);
  form.set('supplierId', supplierId);
  return apiFetch<ProcurementDocumentRecord>('/api/procurement-documents/upload', {
    method: 'POST',
    body: form,
  }, getToken());
}

export function processProcurementDocument(id: string, retry = false) {
  const action = retry ? 'retry' : 'process';
  return apiFetch<ProcurementDocumentRecord>(`/api/procurement-documents/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
  }, getToken());
}

export function saveProcurementDocumentReview(id: string, review: ProcurementReviewData) {
  return apiFetch<ProcurementDocumentRecord>(`/api/procurement-documents/${encodeURIComponent(id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify(review),
  }, getToken());
}

export function importProcurementDocument(id: string) {
  return apiFetch<ProcurementDocumentImportResult>(`/api/procurement-documents/${encodeURIComponent(id)}/import`, {
    method: 'POST',
  }, getToken());
}

export async function downloadProcurementDocument(document: ProcurementDocumentRecord) {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const response = await fetch(`${base.replace(/\/$/, '')}${document.downloadPath}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || 'Unable to download document');
  }
  return response.blob();
}