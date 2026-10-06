'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { DocumentType, IDocument, IClaim, IDocumentExtraction } from '@carbonpilot/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DocumentExtractionTable } from '@/components/evidence/DocumentExtractionTable';
import {
  extractEvidence,
  getEvidenceClaims,
  getEvidenceDocuments,
  correctEvidenceDocumentClassification,
  downloadEvidenceDocument,
  linkEvidenceToClaim,
  uploadEvidenceDocument,
} from '@/lib/evidence';

const documentTypes = [
  DocumentType.PCF,
  DocumentType.PCF_REPORT,
  DocumentType.EPD,
  DocumentType.LCA_REPORT,
  DocumentType.GHG_INVENTORY,
  DocumentType.ENERGY_BILL,
  DocumentType.FUEL_RECORD,
  DocumentType.ISO_CERTIFICATE,
  DocumentType.RECYCLED_CONTENT_CERTIFICATE,
  DocumentType.ENVIRONMENTAL_POLICY,
  DocumentType.PRODUCT_SPECIFICATION,
  DocumentType.INVOICE,
  DocumentType.PURCHASE_ORDER,
  DocumentType.CERTIFICATE,
  DocumentType.ENERGY_REPORT,
  DocumentType.SUSTAINABILITY_REPORT,
  DocumentType.DECLARATION,
  DocumentType.LAB_REPORT,
  DocumentType.OTHER,
];

export function EvidenceDocumentsWorkspace({ mode }: { mode: 'buyer' | 'supplier' }) {
  const [documents, setDocuments] = useState<IDocument[]>([]);
  const [claims, setClaims] = useState<IClaim[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.PCF);
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [selectedClaims, setSelectedClaims] = useState<Record<string, string>>({});
  const [classificationByDocument, setClassificationByDocument] = useState<Record<string, DocumentType>>({});
  const [extractions, setExtractions] = useState<Record<string, IDocumentExtraction>>({});
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
      setClassificationByDocument(Object.fromEntries(loadedDocuments.map((document) => [document._id, document.type])));
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
      const message = extractError instanceof Error ? extractError.message : 'Document extraction failed.';
      setDocuments((current) => current.map((document) => document._id === documentId
        ? { ...document, status: 'FAILED' as IDocument['status'], processingError: message }
        : document));
      setError(message);
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function handleLinkEvidence(documentId: string) {
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
      setNotice('Evidence linked. Buyer verification checks have not yet been run.');
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Evidence verification failed.');
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function handleClassification(documentId: string) {
    const type = classificationByDocument[documentId];
    if (!type) return;
    setBusyDocumentId(`classify-${documentId}`);
    setError(null);
    setNotice(null);
    try {
      const updated = await correctEvidenceDocumentClassification(documentId, type);
      setDocuments((current) => current.map((document) => document._id === documentId ? updated : document));
      setNotice('Document classification corrected and recorded for audit.');
    } catch (classificationError) {
      setError(classificationError instanceof Error ? classificationError.message : 'Classification could not be updated.');
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function handleOpenDocument(documentId: string, filename: string) {
    setBusyDocumentId(documentId);
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
      setBusyDocumentId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Upload evidence</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Upload a document, review its declared classification, and inspect processing results.
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
            accept=".pdf,.png,.jpg,.jpeg,.webp"
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
          Document reading requires a configured text or OCR provider. If unavailable, the upload is retained and marked for manual review.
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
          return (
            <Card key={document._id} className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{document.filename}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {document.type.replaceAll('_', ' ')} · {document.classificationSource?.replaceAll('_', ' ') || 'classification source unknown'} · {document.status} · {new Date(document.uploadedAt).toLocaleString()}
                    {document.reportingPeriod ? ` · ${document.reportingPeriod}` : ''}
                  </p>
                  {document.processingError && <p className="mt-1 text-xs text-rose-700">{document.processingError}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" isLoading={busyDocumentId === document._id} onClick={() => void handleOpenDocument(document._id, document.filename)}>
                    Open source
                  </Button>
                  <Button type="button" variant="outline" size="sm" isLoading={busyDocumentId === document._id} onClick={() => void handleExtract(document._id)}>
                    Extract fields
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row">
                <select
                  aria-label={`Classification for ${document.filename}`}
                  value={classificationByDocument[document._id] ?? document.type}
                  onChange={(event) => setClassificationByDocument((current) => ({ ...current, [document._id]: event.target.value as DocumentType }))}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {documentTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
                </select>
                <Button type="button" variant="outline" size="sm" disabled={classificationByDocument[document._id] === document.type} isLoading={busyDocumentId === `classify-${document._id}`} onClick={() => void handleClassification(document._id)}>
                  Save classification
                </Button>
              </div>

              {mode === 'supplier' && <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  aria-label={`Claim for ${document.filename}`}
                  value={selectedClaims[document._id] ?? ''}
                  onChange={(event) => setSelectedClaims((current) => ({ ...current, [document._id]: event.target.value }))}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">Select a claim</option>
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
                  onClick={() => void handleLinkEvidence(document._id)}
                >
                  Link to claim
                </Button>
              </div>}

              {extraction && (
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted fields</p>
                  <div className="mt-3">
                    <DocumentExtractionTable fields={extraction.fields} emptyMessage="No fields were returned." />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </section>
    </div>
  );
}
