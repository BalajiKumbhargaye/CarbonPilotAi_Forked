import {
  DocumentType,
  IDocument,
  IDocumentExtraction,
  IClaim,
  IVerificationRun,
  IAnomaly,
  IClaimEvidenceLink,
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

export function getDocumentExtraction(documentId: string) {
  return apiFetch<IDocumentExtraction | null>(
    `/api/extractions/${encodeURIComponent(documentId)}`,
    {},
    getToken()
  );
}

export function correctEvidenceDocumentClassification(documentId: string, type: DocumentType) {
  return apiFetch<IDocument>(`/api/documents/${encodeURIComponent(documentId)}/classification`, {
    method: 'PATCH',
    body: JSON.stringify({ type }),
  }, getToken());
}

export function correctClaimExtraction(claimId: string, correction: {
  documentId: string;
  field: string;
  correctedValue: string | number | boolean;
  reason: string;
}) {
  return apiFetch<{ extraction: IDocumentExtraction; verificationRun: IVerificationRun }>(
    `/api/verifications/claims/${encodeURIComponent(claimId)}/correction`,
    { method: 'PATCH', body: JSON.stringify(correction) },
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

export function getVerificationClaims() {
  return apiFetch<IClaim[]>('/api/verifications/claims', {}, getToken());
}

export function getVerificationIssues() {
  return apiFetch<IAnomaly[]>('/api/verifications/issues', {}, getToken());
}

export function getClaimEvidence(claimId: string) {
  return apiFetch<{ claim: IClaim; evidenceLinks: IClaimEvidenceLink[] }>(
    `/api/claims/${encodeURIComponent(claimId)}`,
    {},
    getToken()
  );
}

export function getVerificationHistory(claimId: string) {
  return apiFetch<IVerificationRun[]>(
    `/api/verifications/claim/${encodeURIComponent(claimId)}`,
    {},
    getToken()
  );
}

export function runClaimVerification(claimId: string) {
  return verifyEvidenceForClaim(claimId);
}

export function reviewVerificationIssue(issueId: string, note?: string) {
  return apiFetch<IAnomaly>(`/api/verifications/issues/${encodeURIComponent(issueId)}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  }, getToken());
}

export function requestClaimClarification(claimId: string, message: string) {
  return apiFetch(`/api/verifications/claims/${encodeURIComponent(claimId)}/clarification`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  }, getToken());
}

export async function downloadEvidenceDocument(documentId: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const response = await fetch(`${base.replace(/\/$/, '')}/api/documents/${encodeURIComponent(documentId)}/file`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || 'Unable to download document');
  }
  return response.blob();
}
