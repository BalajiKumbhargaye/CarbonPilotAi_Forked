'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { DocumentType, IDocument, IClaim, IDocumentExtraction, IVerificationRun } from '@carbonpilot/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  extractEvidence,
  getEvidenceClaims,
  getEvidenceDocuments,
  linkEvidenceToClaim,
  uploadEvidenceDocument,
  verifyEvidenceForClaim,
} from '@/lib/evidence';

const documentTypes = [
  DocumentType.PCF,
  DocumentType.EPD,
  DocumentType.INVOICE,
  DocumentType.PURCHASE_ORDER,
  DocumentType.CERTIFICATE,
  DocumentType.ENERGY_REPORT,
  DocumentType.SUSTAINABILITY_REPORT,
  DocumentType.DECLARATION,
  DocumentType.LAB_REPORT,
  DocumentType.OTHER,
];

export function EvidenceDocumentsWorkspace() {
  const [documents, setDocuments] = useState<IDocument[]>([]);
  const [claims, setClaims] = useState<IClaim[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.PCF);
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [selectedClaims, setSelectedClaims] = useState<Record<string, string>>({});
  const [extractions, setExtractions] = useState<Record<string, IDocumentExtraction>>({});
  const [verificationRuns, setVerificationRuns] = useState<Record<string, IVerificationRun>>({});
  const [loading, setLoading] = useState(true);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedDocuments, loadedClaims] = await Promise.all([
        getEvidenceDocuments(),
        getEvidenceClaims(),
      ]);
      setDocuments(loadedDocuments);
      setClaims(loadedClaims);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load evidence data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedFile) {
      setError('Choose a document before uploading.');
      return;
    }

    setBusyDocumentId('upload');
    setError(null);
    setNotice(null);
    try {
      const uploaded = await uploadEvidenceDocument(selectedFile, documentType, reportingPeriod);
      setDocuments((current) => [uploaded, ...current]);
      setSelectedFile(null);
      setReportingPeriod('');
      form.reset();
      setNotice(`${uploaded.filename} uploaded and saved.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Document upload failed.');
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function handleExtract(documentId: string) {
    setBusyDocumentId(documentId);
    setError(null);
    setNotice(null);
    try {
      const extraction = await extractEvidence(documentId);
      setExtractions((current) => ({ ...current, [documentId]: extraction }));
      setDocuments((current) =>
        current.map((document) =>
          document._id === documentId ? { ...document, status: 'EXTRACTED' as IDocument['status'] } : document
        )
      );
      setNotice('Extraction completed. Review the extracted fields below.');
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'Document extraction failed.');
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function handleVerify(documentId: string) {
    const claimId = selectedClaims[documentId];
    if (!claimId) {
      setError('Select a claim before linking this evidence.');
      return;
    }

    setBusyDocumentId(documentId);
    setError(null);
    setNotice(null);
    try {
      await linkEvidenceToClaim(claimId, documentId);
      const run = await verifyEvidenceForClaim(claimId);
      setVerificationRuns((current) => ({ ...current, [documentId]: run }));
      setNotice(`Evidence linked. Verification result: ${run.overallStatus} (${run.score}%).`);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Evidence verification failed.');
    } finally {
      setBusyDocumentId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Upload evidence</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Upload a real file to the API, then extract its fields and link it to a claim for verification.
        </p>
        <form onSubmit={handleUpload} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Evidence type
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value as DocumentType)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            >
              {documentTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Reporting period (optional)
            <input
              value={reportingPeriod}
              onChange={(event) => setReportingPeriod(event.target.value)}
              placeholder="e.g. FY2025 or 2025"
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">
            File (up to 25 MB)
            <input
              type="file"
              accept=".pdf,.xlsx,.csv,.png,.jpg,.jpeg"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700"
            />
          </label>
          {selectedFile && (
            <p className="text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
              Selected: {selectedFile.name} ({Math.ceil(selectedFile.size / 1024)} KB)
            </p>
          )}
          <div className="md:col-span-2">
            <Button type="submit" isLoading={busyDocumentId === 'upload'} disabled={!selectedFile}>
              Upload document
            </Button>
          </div>
        </form>
        <p className="mt-4 text-xs text-amber-700 dark:text-amber-300">
          Note: the configured extraction provider is currently a mock. Uploads are saved, but automated document
          reading requires a real extraction provider.
        </p>
      </Card>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</p>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Uploaded evidence</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadWorkspace()} isLoading={loading}>
            Refresh
          </Button>
        </div>
        {loading ? (
          <Card className="p-6 text-sm text-slate-500">Loading documents from the API…</Card>
        ) : documents.length === 0 ? (
          <Card className="p-6 text-sm text-slate-500 dark:text-slate-400">No uploaded documents found for this organization.</Card>
        ) : documents.map((document) => {
          const extraction = extractions[document._id];
          const run = verificationRuns[document._id];
          return (
            <Card key={document._id} className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{document.filename}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {document.type.replaceAll('_', ' ')} · {document.status} · {new Date(document.uploadedAt).toLocaleString()}
                    {document.reportingPeriod ? ` · ${document.reportingPeriod}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={busyDocumentId === document._id}
                  onClick={() => void handleExtract(document._id)}
                >
                  Extract fields
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  aria-label={`Claim for ${document.filename}`}
                  value={selectedClaims[document._id] ?? ''}
                  onChange={(event) => setSelectedClaims((current) => ({ ...current, [document._id]: event.target.value }))}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">Select a claim to verify</option>
                  {claims.map((claim) => (
                    <option key={claim._id} value={claim._id}>
                      {claim.type} — {claim.value} {claim.unit} ({claim.reportingPeriod})
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  disabled={!selectedClaims[document._id]}
                  isLoading={busyDocumentId === document._id}
                  onClick={() => void handleVerify(document._id)}
                >
                  Link &amp; verify
                </Button>
              </div>

              {extraction && (
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted fields</p>
                  {extraction.fields.length ? (
                    <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                      {extraction.fields.map((field, index) => (
                        <li key={`${field.field}-${index}`}>
                          {field.field}: {String(field.value)}{field.unit ? ` ${field.unit}` : ''}
                          {field.page ? ` · page ${field.page}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-sm text-slate-500">No fields were returned.</p>}
                </div>
              )}
              {run && (
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Verification: {run.overallStatus} · {run.score}%
                  </p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {run.checks.map((check, index) => (
                      <li key={`${check.checkType}-${index}`} className="text-slate-600 dark:text-slate-300">
                        <span className="font-medium">{check.result}: {check.checkType.replaceAll('_', ' ')}</span>
                        {' — '}{check.explanation}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </section>
    </div>
  );
}
