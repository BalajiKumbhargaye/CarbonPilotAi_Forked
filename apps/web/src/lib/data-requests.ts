import { apiFetch, getStoredSession } from './auth';

export type DataRequestStatus =
  | 'DRAFT'
  | 'SENT'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'NEEDS_CLARIFICATION'
  | 'IN_REVIEW'
  | 'COMPLETED'
  | 'CANCELLED';
export type DataRequestResponseType = 'DOCUMENT' | 'TEXT' | 'NUMBER' | 'DECIMAL' | 'DATE' | 'YES_NO' | 'BOOLEAN' | 'SINGLE_SELECT' | 'MULTI_SELECT';

export type QuestionnaireCategory =
  | 'PRODUCT'
  | 'CARBON'
  | 'ENERGY'
  | 'MATERIAL'
  | 'WASTE'
  | 'WATER'
  | 'CERTIFICATION'
  | 'RENEWABLE_ENERGY'
  | 'SUPPLY_CHAIN'
  | 'GENERAL_SUSTAINABILITY';

export interface DataRequestCondition {
  questionKey: string;
  operator: 'EQUALS' | 'NOT_EQUALS';
  value: string | number | boolean;
}

export interface DataRequestRequirementInput {
  key?: string;
  label: string;
  description?: string;
  responseType: DataRequestResponseType;
  category?: QuestionnaireCategory;
  required: boolean;
  requiresEvidence?: boolean;
  unit?: string;
  options?: string[];
  conditions?: DataRequestCondition[];
  order?: number;
  metadata?: Record<string, unknown>;
}

export interface DataRequestDocumentLink {
  _id: string;
  filename: string;
  downloadPath: string;
}

export interface DataRequestResponse {
  _id: string;
  value?: string | number | boolean | string[];
  answer?: string;
  unit?: string;
  status: string;
  submittedAt?: string;
  evidenceDocuments: DataRequestDocumentLink[];
  previouslySubmitted?: {
    value?: string | number | boolean | string[];
    answer?: string;
    unit?: string;
    evidenceDocuments: DataRequestDocumentLink[];
  };
}

export interface DataRequestItem {
  _id: string;
  key: string;
  label: string;
  description?: string;
  responseType: DataRequestResponseType;
  category: QuestionnaireCategory;
  required: boolean;
  requiresEvidence?: boolean;
  unit?: string;
  options?: string[];
  conditions?: DataRequestCondition[];
  order: number;
  visible: boolean;
  completed: boolean;
  previouslySubmitted?: {
    value?: string | number | boolean | string[];
    answer?: string;
    unit?: string;
    evidenceDocuments: DataRequestDocumentLink[];
  };
  response: DataRequestResponse | null;
}

export interface DataRequestRecord {
  _id: string;
  customerOrganizationId: string;
  supplierOrganizationId: string;
  title: string;
  description: string;
  deadline?: string;
  status: DataRequestStatus;
  productId?: string;
  templateId?: string;
  product?: { _id: string; name: string; productCode?: string } | null;
  customerOrganization?: { _id: string; name: string } | null;
  supplierOrganization?: { _id: string; name: string } | null;
  requestedItems: DataRequestItem[];
  allowPartialSubmission: boolean;
  clarificationMessage?: string;
  clarificationItemIds?: string[];
  completion: {
    completed: number;
    total: number;
    missingRequiredItems: Array<{ _id: string; label: string }>;
  };
  updatedAt: string;
}

export interface DataRequestSupplier {
  _id: string;
  organizationId: string;
  name: string;
}

export interface DataRequestProduct {
  _id: string;
  name: string;
  productCode?: string;
}

export interface QuestionnaireTemplate {
  _id: string;
  name: string;
  description: string;
  category: QuestionnaireCategory;
  productCategories: string[];
  supplierIndustries: string[];
  questions: DataRequestRequirementInput[];
}

export interface DataRequestSummary {
  total: number;
  counts: Partial<Record<DataRequestStatus, number>>;
}

export interface CreateDataRequestInput {
  supplierId: string;
  title: string;
  description: string;
  deadline?: string;
  productId?: string;
  templateId?: string;
  allowPartialSubmission: boolean;
  requestedItems: DataRequestRequirementInput[];
}

function getToken() {
  const token = getStoredSession()?.token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return token;
}

export function getDataRequestSuppliers() {
  return apiFetch<DataRequestSupplier[]>('/api/data-requests/suppliers', {}, getToken());
}

export function getDataRequestProducts(supplierId: string) {
  return apiFetch<DataRequestProduct[]>(`/api/data-requests/suppliers/${encodeURIComponent(supplierId)}/products`, {}, getToken());
}

export function getQuestionnaireTemplates(productId?: string) {
  const query = productId ? `?productId=${encodeURIComponent(productId)}` : '';
  return apiFetch<QuestionnaireTemplate[]>(`/api/questionnaires/templates${query}`, {}, getToken());
}

export function getDataRequests() {
  return apiFetch<DataRequestRecord[]>('/api/data-requests', {}, getToken());
}

export function getIncomingDataRequests() {
  return apiFetch<DataRequestRecord[]>('/api/data-requests/incoming', {}, getToken());
}

export function getDataRequestSummary() {
  return apiFetch<DataRequestSummary>('/api/data-requests/summary', {}, getToken());
}

export function getDataRequest(id: string) {
  return apiFetch<DataRequestRecord>(`/api/data-requests/${encodeURIComponent(id)}/responses`, {}, getToken());
}

export function createDataRequest(payload: CreateDataRequestInput) {
  return apiFetch<DataRequestRecord>('/api/data-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, getToken());
}

export function sendDataRequest(id: string) {
  return apiFetch<DataRequestRecord>(`/api/data-requests/${encodeURIComponent(id)}/send`, { method: 'POST' }, getToken());
}

export function saveDataRequestItem(id: string, itemId: string, value: string | number | boolean | string[], unit?: string) {
  return apiFetch<DataRequestResponse>(`/api/data-requests/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ value, unit }),
  }, getToken());
}

export function uploadDataRequestDocument(id: string, itemId: string, file: File) {
  const form = new FormData();
  form.set('file', file);
  return apiFetch<DataRequestDocumentLink>(`/api/data-requests/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/document`, {
    method: 'POST',
    body: form,
  }, getToken());
}

export function submitDataRequest(id: string) {
  return apiFetch<DataRequestRecord>(`/api/data-requests/${encodeURIComponent(id)}/submit`, { method: 'POST' }, getToken());
}

export function requestDataClarification(id: string, message: string, itemIds: string[]) {
  return apiFetch<DataRequestRecord>(`/api/data-requests/${encodeURIComponent(id)}/clarification`, {
    method: 'POST',
    body: JSON.stringify({ message, itemIds }),
  }, getToken());
}

export function completeDataRequest(id: string) {
  return apiFetch<DataRequestRecord>(`/api/data-requests/${encodeURIComponent(id)}/complete`, { method: 'POST' }, getToken());
}

export async function downloadDataRequestDocument(document: DataRequestDocumentLink, requestId: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const response = await fetch(`${base.replace(/\/$/, '')}${document.downloadPath}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) throw new Error('Unable to download document');
  return response.blob();
}

export function reuseDataRequestDocument(id: string, itemId: string, documentId: string) {
  return apiFetch<DataRequestDocumentLink>(`/api/data-requests/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/reuse-document`, {
    method: 'POST',
    body: JSON.stringify({ documentId }),
  }, getToken());
}

export function updateDataRequest(id: string, payload: Partial<Omit<CreateDataRequestInput, 'supplierId'>>) {
  return apiFetch<DataRequestRecord>(`/api/data-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, getToken());
}