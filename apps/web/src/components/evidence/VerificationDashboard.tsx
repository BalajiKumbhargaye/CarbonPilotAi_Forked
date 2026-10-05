'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Download, RotateCw, Send, ShieldAlert } from 'lucide-react';
import { ClaimStatus, IAnomaly, IClaim, IDocumentExtraction, IExtractionField, IVerificationRun } from '@carbonpilot/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  downloadEvidenceDocument,
  correctClaimExtraction,
  getDocumentExtraction,
  getClaimEvidence,
  getVerificationClaims,
  getVerificationHistory,
  getVerificationIssues,
  requestClaimClarification,
  reviewVerificationIssue,
  runClaimVerification,
} from '@/lib/evidence';

interface EvidenceDocumentReference {
  _id: string;
  filename: string;
}

interface ClaimEvidence {
  _id: string;
  documentId: string | EvidenceDocumentReference;
  page?: number;
  section?: string;
  sourceText?: string;
}

interface LoadedExtraction {
  documentId: string;
  filename: string;
  extraction: IDocumentExtraction;
}

function statusLabel(status: ClaimStatus) {
  return status.replaceAll('_', ' ');
}

export function VerificationDashboard() {
  const [claims, setClaims] = useState<IClaim[]>([]);
  const [issues, setIssues] = useState<IAnomaly[]>([]);
  const [evidence, setEvidence] = useState<Record<string, ClaimEvidence[]>>({});
  const [extractions, setExtractions] = useState<Record<string, LoadedExtraction[]>>({});
  const [runs, setRuns] = useState<Record<string, IVerificationRun>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [loadedClaims, loadedIssues] = await Promise.all([
        getVerificationClaims(),
        getVerificationIssues(),
      ]);
      setClaims(loadedClaims);
      setIssues(loadedIssues);
      const claimDetails = await Promise.all(loadedClaims.map(async (claim) => {
        const [detail, history] = await Promise.all([
          getClaimEvidence(claim._id),
          getVerificationHistory(claim._id),
        ]);
        return {
          id: claim._id,
          evidenceLinks: detail.evidenceLinks as ClaimEvidence[],
          run: history[0],
        };
      }));
      const extractedByClaim = await Promise.all(claimDetails.map(async (detail) => {
        const documents = await Promise.all(detail.evidenceLinks.map(async (link) => {
          const document = typeof link.documentId === 'string' ? undefined : link.documentId;
          const documentId = typeof link.documentId === 'string' ? link.documentId : document?._id;
          if (!documentId) return undefined;
          const extraction = await getDocumentExtraction(documentId);
          return extraction ? { documentId, filename: document?.filename || 'Evidence document', extraction } : undefined;
        }));
        return [detail.id, documents.filter((item): item is LoadedExtraction => Boolean(item))] as const;
      }));
      setEvidence(Object.fromEntries(claimDetails.map((item) => [item.id, item.evidenceLinks])));
      setRuns(Object.fromEntries(claimDetails.filter((item) => item.run).map((item) => [item.id, item.run!])));
      setExtractions(Object.fromEntries(extractedByClaim));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load verification data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function runChecks(claimId: string) {
    setBusy(claimId);
    setError(null);
    setNotice(null);
    try {
      const run = await runClaimVerification(claimId);
      setRuns((current) => ({ ...current, [claimId]: run }));
      setClaims((current) => current.map((claim) => claim._id === claimId ? { ...claim, status: run.overallStatus } : claim));
      setNotice(`Checks completed: ${statusLabel(run.overallStatus)}. Results do not establish document authenticity.`);
      const loadedIssues = await getVerificationIssues();
      setIssues(loadedIssues);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Verification could not be run.');
    } finally {
      setBusy(null);
    }
  }

  async function download(documentId: string, filename: string) {
    setBusy(documentId);
    setError(null);
    try {
      const blob = await downloadEvidenceDocument(documentId);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Document download failed.');
    } finally {
      setBusy(null);
    }
  }

  async function correctField(claimId: string, correction: {
    documentId: string;
    field: string;
    correctedValue: string | number | boolean;
    reason: string;
  }) {
    const correctionKey = `${correction.documentId}:${correction.field}`;
    setBusy(correctionKey);
    setError(null);
    setNotice(null);
    try {
      const result = await correctClaimExtraction(claimId, correction);
      setExtractions((current) => ({
        ...current,
        [claimId]: (current[claimId] ?? []).map((item) => item.documentId === correction.documentId
          ? { ...item, extraction: result.extraction }
          : item),
      }));
      setRuns((current) => ({ ...current, [claimId]: result.verificationRun }));
      setNotice('Correction recorded separately from the original extraction; checks were rerun.');
    } catch (correctionError) {
      setError(correctionError instanceof Error ? correctionError.message : 'Correction could not be saved.');
    } finally {
      setBusy(null);
    }
  }

  async function reviewIssue(issueId: string) {
    setBusy(issueId);
    setError(null);
    try {
      const reviewed = await reviewVerificationIssue(issueId);
      setIssues((current) => current.map((issue) => issue._id === issueId ? reviewed : issue));
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Issue could not be reviewed.');
    } finally {
      setBusy(null);
    }
  }

  async function requestClarification(claimId: string) {
    const message = messages[claimId]?.trim();
    if (!message) {
      setError('Enter a clarification request.');
      return;
    }
    setBusy(claimId);
    setError(null);
    setNotice(null);
    try {
      await requestClaimClarification(claimId, message);
      setNotice('Clarification request sent through the linked Data Request.');
      setMessages((current) => ({ ...current, [claimId]: '' }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Clarification could not be sent.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Card className="text-sm text-slate-500">Loading supplier claims and verification history…</Card>;

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void load()} isLoading={loading}>
          <RotateCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {claims.length === 0 ? (
        <Card className="text-sm text-slate-600">No supplier claims are available for your connected organizations.</Card>
      ) : claims.map((claim) => {
        const run = runs[claim._id];
        const claimIssues = issues.filter((issue) => issue.claimId === claim._id);
        const verificationChecks = run?.checks ?? [];
        return (
          <Card key={claim._id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-emerald-700">{claim.type.replaceAll('_', ' ')}</p>
                <h2 className="mt-1 font-semibold text-slate-950">{claim.claimText || `${claim.value} ${claim.unit}`}</h2>
                <p className="mt-1 text-sm text-slate-600">Submitted value: {String(claim.value)} {claim.unit} · {claim.reportingPeriod}</p>
              </div>
              <span className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {statusLabel(claim.status)}
              </span>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Supporting evidence</h3>
              {(evidence[claim._id] ?? []).length ? (
                <ul className="mt-2 space-y-2">
                  {(evidence[claim._id] ?? []).map((link) => {
                    const document = typeof link.documentId === 'string' ? undefined : link.documentId;
                    const documentId = typeof link.documentId === 'string' ? link.documentId : document?._id;
                    return (
                      <li key={link._id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                        <div>
                          <span className="font-medium">{document?.filename || 'Linked document'}</span>
                          <span className="ml-2 text-slate-500">{link.page ? `Page ${link.page}` : ''}{link.section ? ` · ${link.section}` : ''}</span>
                          {link.sourceText && <p className="mt-1 text-xs text-slate-600">“{link.sourceText}”</p>}
                        </div>
                        {documentId && <Button size="sm" variant="outline" onClick={() => void download(documentId, document?.filename || 'evidence')} isLoading={busy === documentId}>
                          <Download className="h-4 w-4" /> Open source
                        </Button>}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="mt-2 text-sm text-amber-700">No supporting document is linked to this claim.</p>}
            </div>

            <div className="space-y-3 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Extracted values and provenance</h3>
              {(extractions[claim._id] ?? []).length ? (extractions[claim._id] ?? []).map(({ documentId, filename, extraction }) => (
                <div key={documentId} className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700">{filename}</p>
                  {extraction.status === 'FAILED' && (
                    <p className="mt-2 text-sm text-rose-700">
                      Extraction failed{extraction.errorMessage ? `: ${extraction.errorMessage}` : '.'}
                    </p>
                  )}
                  {(extraction.fields ?? []).length === 0 && (
                    <p className="mt-2 text-sm text-slate-600">No structured fields were extracted from this document.</p>
                  )}
                  {(extraction.fields ?? []).map((field, index) => (
                    <div key={`${field.field}-${index}`} className="mt-2 border-t border-slate-200 pt-2 text-sm">
                      <p className="font-medium text-slate-900">{field.field}: {String(field.value)}{field.unit ? ` ${field.unit}` : ''}</p>
                      <p className="text-xs text-slate-600">
                        {field.page ? `Page ${field.page}` : 'Page not supplied'}
                        {field.section ? ` · ${field.section}` : ''}
                        {field.tableReference ? ` · ${field.tableReference}` : ''}
                        {field.confidence !== undefined ? ` · Provider confidence ${field.confidence}` : ' · Confidence not supplied'}
                      </p>
                      {field.sourceText && <p className="mt-1 text-xs text-slate-600">Source text: “{field.sourceText}”</p>}
                      <FieldCorrectionForm
                        documentId={documentId}
                        field={field}
                        busy={busy === `${documentId}:${field.field}`}
                        onSubmit={(correction) => void correctField(claim._id, correction)}
                      />
                    </div>
                  ))}
                  {extraction.corrections?.map((correction, index) => (
                    <p key={`${correction.field}-${index}`} className="mt-2 text-xs text-amber-800">
                      Manual correction: {correction.field}, original {String(correction.originalValue)}, corrected to {String(correction.correctedValue)}. Reason: {correction.reason}
                    </p>
                  ))}
                </div>
              )) : <p className="text-sm text-slate-600">No structured extraction is available. Uploaded documents remain the source for manual review.</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-sm text-slate-600">
                Independent corroboration: {run?.corroborationResults?.some((item) => item.result === 'CORROBORATED')
                  ? 'Corroborated by a recorded source'
                  : 'Not independently corroborated'}
              </p>
              <Button size="sm" onClick={() => void runChecks(claim._id)} isLoading={busy === claim._id}>
                <RotateCw className="h-4 w-4" /> Run checks
              </Button>
            </div>

            {run && (
              <div className="space-y-3 rounded-md bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Latest result: {statusLabel(run.overallStatus)}</p>
                {verificationChecks.length === 0 && (
                  <p className="text-sm text-slate-600">No verification checks were recorded for this run.</p>
                )}
                {verificationChecks.map((check, index) => (
                  <p key={`${check.checkType}-${index}`} className="text-sm text-slate-700">
                    <span className="font-medium">{check.result}: {check.checkType.replaceAll('_', ' ')}</span> · {check.explanation}
                    {check.sourcePage ? ` (page ${check.sourcePage})` : ''}
                  </p>
                ))}
                {run.corroborationResults?.map((result, index) => (
                  <p key={`${result.source}-${index}`} className="text-xs text-slate-500">
                    External check: {result.result.replaceAll('_', ' ')} · {result.source}
                  </p>
                ))}
              </div>
            )}

            {claimIssues.length > 0 && (
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-800"><ShieldAlert className="h-4 w-4" /> Issues</h3>
                {claimIssues.map((issue) => (
                  <div key={issue._id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                    <div className="text-sm">
                      <p className="font-medium text-slate-900">{issue.description}</p>
                      <p className="mt-1 text-slate-600">Next: {issue.recommendedAction || 'Review the supporting information.'}</p>
                    </div>
                    {issue.status === 'OPEN' && <Button size="sm" variant="outline" onClick={() => void reviewIssue(issue._id)} isLoading={busy === issue._id}>Mark reviewed</Button>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row">
              <textarea
                aria-label={`Clarification request for ${claim.type}`}
                value={messages[claim._id] ?? ''}
                onChange={(event) => setMessages((current) => ({ ...current, [claim._id]: event.target.value }))}
                placeholder="Request supplier clarification"
                rows={2}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <Button size="sm" onClick={() => void requestClarification(claim._id)} isLoading={busy === claim._id}>
                <Send className="h-4 w-4" /> Request clarification
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function FieldCorrectionForm({
  documentId,
  field,
  busy,
  onSubmit,
}: {
  documentId: string;
  field: IExtractionField;
  busy: boolean;
  onSubmit: (correction: { documentId: string; field: string; correctedValue: string | number | boolean; reason: string }) => void;
}) {
  const [value, setValue] = useState(String(field.value));
  const [reason, setReason] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let correctedValue: string | number | boolean = value;
    if (typeof field.value === 'number') {
      correctedValue = Number(value);
      if (!Number.isFinite(correctedValue)) return;
    } else if (typeof field.value === 'boolean') {
      if (value !== 'true' && value !== 'false') return;
      correctedValue = value === 'true';
    }
    onSubmit({ documentId, field: field.field, correctedValue, reason });
  }

  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
      <input value={value} onChange={(event) => setValue(event.target.value)} aria-label={`Corrected ${field.field}`} className="min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
      <input value={reason} onChange={(event) => setReason(event.target.value)} aria-label={`Correction reason for ${field.field}`} placeholder="Correction reason" minLength={5} required className="min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
      <Button type="submit" size="sm" variant="outline" disabled={reason.trim().length < 5} isLoading={busy}>Save correction</Button>
    </form>
  );
}