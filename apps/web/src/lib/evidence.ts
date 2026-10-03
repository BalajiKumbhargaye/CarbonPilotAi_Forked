import {
  DocumentType,
  IDocument,
  IDocumentExtraction,
  IClaim,
  IVerificationRun,
} from '@carbonpilot/shared';
import { apiFetch, getStoredSession } from './auth';

function getToken() {
  const token = getStoredSession()?.token;
  if (!token) {
    throw new Error('Your session has expired. Sign in again to continue.');
  }
  return token;
}

export function getEvidenceDocuments() {
  return apiFetch<IDocument[]>('/api/documents', {}, getToken());
}

export function getEvidenceClaims() {
  return apiFetch<IClaim[]>('/api/claims', {}, getToken());
}

export function uploadEvidenceDocument(file: File, type: DocumentType, reportingPeriod: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  if (reportingPeriod.trim()) {
    formData.append('reportingPeriod', reportingPeriod.trim());
  }

  return apiFetch<IDocument>(
    '/api/documents/upload',
    { method: 'POST', body: formData },
    getToken()
  );
}

export function extractEvidence(documentId: string) {
  return apiFetch<IDocumentExtraction>(
    `/api/extractions/${encodeURIComponent(documentId)}/run`,
    { method: 'POST' },
    getToken()
  );
}

export function linkEvidenceToClaim(claimId: string, documentId: string) {
  return apiFetch('/api/evidence/link', {
    method: 'POST',
    body: JSON.stringify({ claimId, documentId, relationshipType: 'PRIMARY_SOURCE' }),
  }, getToken());
}

export function verifyEvidenceForClaim(claimId: string) {
  return apiFetch<IVerificationRun>(
    `/api/verifications/run/${encodeURIComponent(claimId)}`,
    { method: 'POST' },
    getToken()
  );
}
