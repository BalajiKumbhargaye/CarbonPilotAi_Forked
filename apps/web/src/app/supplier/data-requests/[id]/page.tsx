'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, Download, FileText, LoaderCircle, RefreshCw, UploadCloud } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { extractEvidence } from '@/lib/evidence';
import {
  downloadDataRequestDocument,
  getDataRequest,
  reuseDataRequestDocument,
  saveDataRequestItem,
  submitDataRequest,
  submitDataRequestClaim,
  uploadDataRequestDocument,
  type DataRequestRecord,
  type DataRequestStatus,
} from '@/lib/data-requests';

type DeclaredClaimDraft = {
  type: string;
  customType: string;
  value: string;
  unit: string;
  functionalUnit: string;
  methodology: string;
  reportingPeriod: string;
  boundary: string;
};

const claimTypes = ['PCF_VALUE', 'GWP', 'RECYCLED_CONTENT', 'RENEWABLE_ELECTRICITY', 'ENERGY_CONSUMPTION', 'GHG_SCOPE_1', 'GHG_SCOPE_2', 'GHG_SCOPE_3', 'OTHER'];
const emptyClaimDraft: DeclaredClaimDraft = {
  type: 'PCF_VALUE',
  customType: '',
  value: '',
  unit: '',
  functionalUnit: '',
  methodology: '',
  reportingPeriod: '',
  boundary: '',
};

function isLocked(status: DataRequestStatus) {
  return status === 'SUBMITTED' || status === 'COMPLETED' || status === 'CANCELLED';
}

function responseInputValue(value: unknown) {
  if (Array.isArray(value)) return value.join('\u001f');
  return value === undefined || value === null ? '' : String(value);
}

function fieldLabel(field: string) {
  return field.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: DataRequestStatus) {
  if (status === 'SUBMITTED' || status === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'NEEDS_CLARIFICATION') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (status === 'IN_PROGRESS') return 'border-cyan-200 bg-cyan-50 text-cyan-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

export default function SupplierDataRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params.id;
  const [request, setRequest] = useState<DataRequestRecord | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, string>>({});
  const [savingItem, setSavingItem] = useState('');
  const [uploadingItem, setUploadingItem] = useState('');
  const [reusingItem, setReusingItem] = useState('');
  const [retryingDocument, setRetryingDocument] = useState('');
  const [claimDrafts, setClaimDrafts] = useState<Record<string, DeclaredClaimDraft>>({});
  const [savingClaim, setSavingClaim] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const updateClaimDraft = (documentId: string, update: Partial<DeclaredClaimDraft>) => {
    setClaimDrafts((current) => ({
      ...current,
      [documentId]: {
        ...emptyClaimDraft,
        ...current[documentId],
        ...update,
      },
    }));
  };

  const load = async () => {
    const data = await getDataRequest(requestId);
    setRequest(data);
    setValues(Object.fromEntries(data.requestedItems.map((item) => [item._id, responseInputValue(item.response?.value ?? item.response?.answer)])));
    setUnits(Object.fromEntries(data.requestedItems.map((item) => [item._id, item.response?.unit || item.unit || ''])));
  };

  const refresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      await load();
      setNotice('Latest persisted Data Request results loaded.');
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh the Data Request.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    getDataRequest(requestId).then((data) => {
      if (!active) return;
      setRequest(data);
      setValues(Object.fromEntries(data.requestedItems.map((item) => [item._id, responseInputValue(item.response?.value ?? item.response?.answer)])));
      setUnits(Object.fromEntries(data.requestedItems.map((item) => [item._id, item.response?.unit || item.unit || ''])));
    }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load request.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestId]);

  const saveItem = async (itemId: string) => {
    const item = request?.requestedItems.find((candidate) => candidate._id === itemId);
    if (!item) return;
    const raw = values[itemId] || '';
    const value = item.responseType === 'NUMBER' || item.responseType === 'DECIMAL'
      ? raw.trim() ? Number(raw) : ''
      : item.responseType === 'MULTI_SELECT'
        ? raw.split('\u001f').filter(Boolean)
        : raw;
    setSavingItem(itemId);
    setError('');
    setNotice('');
    try {
      await saveDataRequestItem(requestId, itemId, value, units[itemId]);
      await load();
      setNotice(`${item.label} saved as a draft.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save response.');
    } finally { setSavingItem(''); }
  };

  const uploadEvidence = async (itemId: string, event: ChangeEvent<HTMLInputElement>, replacesDocumentId?: string) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploadingItem(itemId);
    setError('');
    setNotice('');
    try {
      const results: Array<{ filename: string; issue?: string }> = [];
      for (const file of files) {
        try {
          const uploaded = await uploadDataRequestDocument(requestId, itemId, file, replacesDocumentId);
          if (uploaded.status === 'FAILED' || uploaded.status === 'NEEDS_REVIEW') {
            results.push({ filename: file.name, issue: uploaded.processingError || uploaded.status.replaceAll('_', ' ').toLowerCase() });
          } else {
            results.push({ filename: file.name });
          }
        } catch (uploadError) {
          results.push({
            filename: file.name,
            issue: uploadError instanceof Error ? uploadError.message : 'Upload failed.',
          });
        }
      }
      await load();
      const issues = results.filter((result) => result.issue);
      const completed = results.length - issues.length;
      if (issues.length) {
        setError(`${completed} of ${results.length} document(s) uploaded; review these results: ${issues.map((result) => `${result.filename}: ${result.issue}`).join('; ')}`);
      } else {
        setNotice(`${results.length} document(s) uploaded and processed independently. The buyer can review claims and verification results.`);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to refresh uploaded documents.');
    } finally {
      setUploadingItem('');
      event.target.value = '';
    }
  };

  const useExisting = async (itemId: string) => {
    const item = request?.requestedItems.find((candidate) => candidate._id === itemId);
    if (!item?.previouslySubmitted) return;
    setReusingItem(itemId);
    setError('');
    setNotice('');
    try {
      const prior = item.previouslySubmitted;
      if (prior.value !== undefined && item.responseType !== 'DOCUMENT') {
        await saveDataRequestItem(requestId, itemId, prior.value, prior.unit || item.unit);
      }
      for (const document of prior.evidenceDocuments) {
        await reuseDataRequestDocument(requestId, itemId, document._id);
      }
      await load();
      setNotice('Previously submitted information attached to this request.');
    } catch (reuseError) {
      setError(reuseError instanceof Error ? reuseError.message : 'Unable to reuse previous information.');
    } finally { setReusingItem(''); }
  };

  const retryDocument = async (documentId: string) => {
    setRetryingDocument(documentId);
    setError('');
    setNotice('');
    try {
      await extractEvidence(documentId);
      await load();
      setNotice('Extraction retry completed. Review the updated processing status and extracted claims.');
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Unable to retry document extraction.');
    } finally {
      setRetryingDocument('');
    }
  };

  const submitClaim = async (itemId: string, documentId: string) => {
    const draft = claimDrafts[documentId] || {
      type: 'PCF_VALUE',
      value: '',
      unit: '',
      methodology: '',
      reportingPeriod: '',
      boundary: '',
    };
    const value = Number(draft.value);
    if (!draft.value.trim() || !Number.isFinite(value) || value < 0 || !draft.unit.trim()) {
      setError('Enter a non-negative numeric claim value and its unit.');
      return;
    }
    if (!draft.reportingPeriod.trim()) {
      setError('Enter the reporting period covered by this claim.');
      return;
    }
    if (draft.type === 'PCF_VALUE' && (!draft.functionalUnit.trim() || !draft.boundary.trim())) {
      setError('Product carbon footprint claims need a functional unit and lifecycle boundary for comparison.');
      return;
    }
    if (draft.type === 'OTHER' && !draft.customType.trim()) {
      setError('Enter a name for the other claim type.');
      return;
    }
    setSavingClaim(documentId);
    setError('');
    setNotice('');
    try {
      await submitDataRequestClaim(requestId, itemId, {
        documentId,
        type: draft.type,
        customType: draft.type === 'OTHER' ? draft.customType.trim() : undefined,
        value,
        unit: draft.unit.trim(),
        functionalUnit: draft.functionalUnit.trim() || undefined,
        methodology: draft.methodology.trim() || undefined,
        reportingPeriod: draft.reportingPeriod.trim() || undefined,
        boundary: draft.boundary.trim() || undefined,
      });
      await load();
      setNotice('Your claim is linked to this document. Buyer verification runs when you submit the request.');
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Unable to submit the claim.');
    } finally {
      setSavingClaim('');
    }
  };

  const submit = async () => {
    if (!request || !window.confirm('Submit this data request? The buyer will receive your current responses.')) return;
    setSubmitting(true);
    setError('');
    try {
      const updated = await submitDataRequest(requestId);
      setRequest(updated);
      setNotice('Your responses were submitted to the buyer.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit responses.');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-500">Loading request...</div>;
  if (!request) return <div className="space-y-4"><p role="alert" className="text-sm text-rose-800">{error || 'Data request not found.'}</p><Link href="/supplier/data-requests" className="text-sm font-semibold text-teal-800">Back to requests</Link></div>;
  const locked = isLocked(request.status);
  const canSubmit = request.allowPartialSubmission || request.completion.missingRequiredItems.length === 0;
  const visibleItems = request.requestedItems.filter((item) => item.visible);

  return <div className="space-y-6">
    <Breadcrumb items={[{ label: 'Data', href: '/supplier/data-requests' }, { label: 'Data Requests', href: '/supplier/data-requests' }, { label: request.title }]} />
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div><Link href="/supplier/data-requests" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Incoming requests</Link><h1 className="text-2xl font-bold text-slate-950">{request.title}</h1><p className="mt-1 text-sm text-slate-600">Requested by {request.customerOrganization?.name || 'Buyer'}{request.product?.name ? ` · ${request.product.name}` : ''}{request.deadline ? ` · Due ${new Date(request.deadline).toLocaleDateString()}` : ''}</p></div>
      <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" disabled={refreshing} onClick={refresh}>{refreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{refreshing ? 'Refreshing...' : 'Refresh results'}</Button><span className={`inline-flex border px-2.5 py-1.5 text-xs font-semibold ${statusClass(request.status)}`}>{request.status.replaceAll('_', ' ')}</span><span className="text-sm tabular-nums text-slate-600">Required {request.completion.required.completed}/{request.completion.required.total}{request.completion.optional.total ? ` · Optional ${request.completion.optional.completed}/${request.completion.optional.total}` : ''}</span></div>
    </header>

    {error && <p role="alert" className="border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
    {notice && <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
    {uploadingItem && <p role="status" aria-live="polite" className="border-l-4 border-cyan-600 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">Uploading document. OCR and structured extraction run automatically after the upload is stored.</p>}
    {request.description && <p className="max-w-3xl whitespace-pre-wrap text-sm text-slate-700">{request.description}</p>}
    {request.clarificationMessage && <div className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3"><p className="text-xs font-semibold uppercase text-rose-800">Buyer clarification</p><p className="mt-1 whitespace-pre-wrap text-sm text-rose-950">{request.clarificationMessage}</p></div>}
    {request.status === 'SUBMITTED' && <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Your submission is with the buyer. Changes are locked until clarification is requested.</p>}

    <section aria-labelledby="requirements-title">
      <div className="mb-3 flex items-end justify-between"><div><h2 id="requirements-title" className="text-base font-semibold text-slate-900">Requirements and questions</h2><p className="mt-1 text-xs text-slate-500">Upload multiple documents per requirement. Each file is stored and processed separately, and you can return to continue later.</p></div><span className="text-xs font-medium text-slate-600">Required {request.completion.required.completed}/{request.completion.required.total}{request.completion.optional.total ? ` · Optional ${request.completion.optional.completed}/${request.completion.optional.total}` : ''}</span></div>
      <div className="divide-y divide-slate-200 border-y border-slate-200">
        {visibleItems.map((item) => <article key={item._id} className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)]">
          <div><div className="flex items-start gap-2"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${item.completed ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 text-transparent'}`}><Check className="h-3.5 w-3.5" /></span><div><h3 className="text-sm font-semibold text-slate-900">{item.label}<span className="ml-2 text-xs font-normal text-slate-500">{item.required ? 'Required' : 'Optional'}</span></h3>{item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}<p className="mt-1 text-xs text-slate-500">{item.responseType.replace('_', ' ')}{item.requiresEvidence || item.responseType === 'DOCUMENT' ? ' + evidence' : ''}{item.unit ? ` · ${item.unit}` : ''}</p></div></div>
            {request.clarificationItemIds?.includes(item._id) && <p className="ml-7 mt-2 text-xs font-semibold text-rose-800">Buyer requested an update for this item.</p>}
            {item.previouslySubmitted && <div className="ml-7 mt-3 border-l-2 border-teal-500 bg-teal-50 px-3 py-2 text-xs text-teal-950"><p className="font-semibold">Existing information found</p><p className="mt-1">Previously submitted{item.previouslySubmitted.value !== undefined ? `: ${String(item.previouslySubmitted.value)}${item.previouslySubmitted.unit ? ` ${item.previouslySubmitted.unit}` : ''}` : '.'}</p>{!locked && <Button size="sm" variant="outline" disabled={reusingItem === item._id} onClick={() => useExisting(item._id)} className="mt-2">{reusingItem === item._id ? 'Attaching...' : 'Use existing'}</Button>}</div>}
          </div>
          <div className="space-y-3">
            {item.responseType === 'TEXT' && <textarea rows={3} disabled={locked} value={values[item._id] || ''} onChange={(event) => setValues((current) => ({ ...current, [item._id]: event.target.value }))} placeholder="Enter your response" className="response-input h-auto py-2" />}
            {item.responseType === 'NUMBER' && <div className="flex gap-2"><input type="number" step="any" disabled={locked} value={values[item._id] || ''} onChange={(event) => setValues((current) => ({ ...current, [item._id]: event.target.value }))} placeholder="Enter value" className="response-input" />{(item.unit || units[item._id]) && <input disabled={locked} value={units[item._id] || ''} onChange={(event) => setUnits((current) => ({ ...current, [item._id]: event.target.value }))} aria-label={`${item.label} unit`} className="response-input max-w-28" />}</div>}
              {(item.responseType === 'NUMBER' || item.responseType === 'DECIMAL') && <div className="flex gap-2"><input type="number" step="any" disabled={locked} value={values[item._id] || ''} onChange={(event) => setValues((current) => ({ ...current, [item._id]: event.target.value }))} placeholder="Enter value" className="response-input" />{(item.unit || units[item._id]) && <input disabled={locked} value={units[item._id] || ''} onChange={(event) => setUnits((current) => ({ ...current, [item._id]: event.target.value }))} aria-label={`${item.label} unit`} className="response-input max-w-28" />}</div>}
            {item.responseType === 'DATE' && <input type="date" disabled={locked} value={values[item._id] || ''} onChange={(event) => setValues((current) => ({ ...current, [item._id]: event.target.value }))} className="response-input" />}
            {item.responseType === 'YES_NO' && <select disabled={locked} value={values[item._id] || ''} onChange={(event) => setValues((current) => ({ ...current, [item._id]: event.target.value }))} className="response-input"><option value="">Choose yes or no</option><option value="YES">Yes</option><option value="NO">No</option></select>}
            {item.responseType === 'BOOLEAN' && <select disabled={locked} value={values[item._id] || ''} onChange={(event) => setValues((current) => ({ ...current, [item._id]: event.target.value }))} className="response-input"><option value="">Choose yes or no</option><option value="true">Yes</option><option value="false">No</option></select>}
            {item.responseType === 'SINGLE_SELECT' && <select disabled={locked} value={values[item._id] || ''} onChange={(event) => setValues((current) => ({ ...current, [item._id]: event.target.value }))} className="response-input"><option value="">Choose an option</option>{item.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
            {item.responseType === 'MULTI_SELECT' && <select multiple disabled={locked} value={(values[item._id] || '').split('\u001f').filter(Boolean)} onChange={(event) => setValues((current) => ({ ...current, [item._id]: Array.from(event.target.selectedOptions).map((option) => option.value).join('\u001f') }))} className="response-input h-24 py-2">{item.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
            {item.responseType === 'DOCUMENT' && <p className="text-xs text-slate-600">Attach one or more PDF, PNG, JPG, or JPEG files (up to 25 MB each).{item.acceptedDocumentTypes?.length ? ` Accepted types: ${item.acceptedDocumentTypes.join(', ')}.` : ''}</p>}
            {(item.responseType === 'DOCUMENT' || item.requiresEvidence) && !locked && <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-teal-800 hover:underline"><UploadCloud className="h-4 w-4" />{uploadingItem === item._id ? 'Uploading documents...' : 'Upload evidence'}            <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" disabled={uploadingItem === item._id} onChange={(event) => uploadEvidence(item._id, event)} className="sr-only" /></label>}            {item.response?.evidenceDocuments.map((document) => <div key={document._id} className={`space-y-2 border border-slate-200 bg-white p-3 ${document.status === 'ARCHIVED' ? 'opacity-70' : ''}`}>
              <button type="button" onClick={async () => { try { const blob = await downloadDataRequestDocument(document, requestId); const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = document.filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : 'Unable to download evidence.'); } }} className="flex items-center gap-2 text-xs font-medium text-slate-700 hover:text-teal-800"><FileText className="h-4 w-4" />{document.filename}<Download className="h-3.5 w-3.5" /></button>
              <p className="text-xs text-slate-600">{document.documentType || 'Document type unavailable'}{document.documentType === 'OTHER' && ' · Document type could not be confidently matched.'}{document.status === 'ARCHIVED' && ' · Replaced; historical record retained.'}{document.uploadedAt ? ` · Uploaded ${new Date(document.uploadedAt).toLocaleString()}` : ''}</p>
              {!locked && document.status !== 'ARCHIVED' && <label className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-amber-800 hover:underline"><RefreshCw className="h-3.5 w-3.5" />Replace and retain history              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" disabled={uploadingItem === item._id} onChange={(event) => uploadEvidence(item._id, event, document._id)} className="sr-only" /></label>}              <ol aria-label="Document processing lifecycle" className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                <li className="border-l-2 border-emerald-500 pl-2"><strong>Uploaded</strong><br />Document is stored with this request.</li>
                <li className={`border-l-2 pl-2 ${document.status === 'PROCESSING' ? 'border-cyan-500 text-cyan-800' : document.extraction?.status === 'SUCCESS' ? 'border-emerald-500' : document.status === 'FAILED' ? 'border-rose-500 text-rose-800' : 'border-slate-300'}`}><strong>{document.status === 'PROCESSING' ? 'Processing' : 'Extraction'}</strong><br />{document.status === 'PROCESSING' ? 'OCR/extraction is in progress.' : document.extraction?.status === 'SUCCESS' ? `${document.extraction.method || 'Extraction'} completed.` : document.status === 'FAILED' ? 'Extraction failed.' : 'Waiting for extraction result.'}</li>
                <li className={`border-l-2 pl-2 ${document.status === 'EXTRACTED' ? 'border-emerald-500' : document.status === 'NEEDS_REVIEW' ? 'border-amber-500 text-amber-800' : document.status === 'FAILED' ? 'border-rose-500 text-rose-800' : 'border-slate-300'}`}><strong>{document.status === 'EXTRACTED' ? 'Ready for buyer review' : document.status === 'NEEDS_REVIEW' ? 'Needs review' : document.status === 'FAILED' ? 'Failed' : 'Result pending'}</strong><br />Buyer-only claim verification details are shown to the buyer.</li>
              </ol>
              {document.processingError && <p className="text-xs text-rose-800">{document.processingError}</p>}
              {document.extraction?.errorMessage && <p className="text-xs text-rose-800">{document.extraction.errorMessage}</p>}
              {document.extraction?.fields?.filter((field) => field.field !== 'DOCUMENT_TEXT' && field.field !== 'PAGE_TEXT').map((field, index) => <p key={`${field.field}-${field.page ?? 'na'}-${index}`} className="text-xs text-slate-700">{fieldLabel(field.field)}: {field.value === null || field.value === undefined ? 'Not available' : String(field.value)}{field.unit ? ` ${field.unit}` : ''}{field.confidence !== undefined ? ` · ${Math.round(field.confidence <= 1 ? field.confidence * 100 : field.confidence)}% confidence` : ''}{field.page ? ` · Page ${field.page}` : ''}{field.sourceText ? ` · Source: “${field.sourceText}”` : ''}</p>)}
              {document.extraction && !document.extraction.fields?.length && <p className="text-xs text-slate-500">No structured fields are available.</p>}
              {document.extraction?.text && <details><summary className="cursor-pointer text-xs font-semibold text-slate-700">View extracted text</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap border border-slate-200 bg-slate-50 p-2 text-[11px]">{document.extraction.text}</pre></details>}
              {!document.extraction && document.status !== 'FAILED' && <p className="text-xs text-slate-500">{document.status === 'PROCESSING' ? 'Extraction is processing.' : 'No extraction result is available yet.'}</p>}
              {document.status === 'FAILED' && <Button size="sm" variant="outline" disabled={retryingDocument === document._id} onClick={() => retryDocument(document._id)}>{retryingDocument === document._id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}{retryingDocument === document._id ? 'Retrying extraction...' : 'Retry extraction'}</Button>}
              {document.claims?.filter((claim) => claim.supplierDeclared).map((claim) => <p key={claim._id} className="text-xs text-emerald-800">Claim provided: {fieldLabel(claim.type)} — {claim.value}{claim.unit ? ` ${claim.unit}` : ''}</p>)}
              {!locked && document.status !== 'ARCHIVED' && !document.claims?.some((claim) => claim.supplierDeclared) && <div className="space-y-2 border-t border-slate-200 pt-3">
                <p className="text-xs font-semibold text-slate-800">Add a claim for this document</p>
                <p className="text-xs text-slate-600">Reporting period is required. Product carbon footprint claims also need a functional unit and lifecycle boundary so the buyer can compare the value against the document.</p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <select aria-label="Claim type" disabled={savingClaim === document._id} value={claimDrafts[document._id]?.type || 'PCF_VALUE'} onChange={(event) => updateClaimDraft(document._id, { type: event.target.value })} className="response-input">
                    {claimTypes.map((type) => <option key={type} value={type}>{type === 'GWP' ? 'GWP' : fieldLabel(type)}</option>)}
                  </select>
                  {(claimDrafts[document._id]?.type || 'PCF_VALUE') === 'OTHER' && <input aria-label="Other claim type" placeholder="Enter claim type" disabled={savingClaim === document._id} value={claimDrafts[document._id]?.customType || ''} onChange={(event) => updateClaimDraft(document._id, { customType: event.target.value })} className="response-input" />}
                  <input type="number" min="0" step="any" aria-label="Claim value" placeholder="Claim value" disabled={savingClaim === document._id} value={claimDrafts[document._id]?.value || ''} onChange={(event) => updateClaimDraft(document._id, { value: event.target.value })} className="response-input" />
                  <input aria-label="Claim unit" placeholder="Unit (e.g. kg CO2e/unit)" disabled={savingClaim === document._id} value={claimDrafts[document._id]?.unit || ''} onChange={(event) => updateClaimDraft(document._id, { unit: event.target.value })} className="response-input" />
                  <input aria-label="Reporting period" placeholder="Reporting period (e.g. 2025)" disabled={savingClaim === document._id} value={claimDrafts[document._id]?.reportingPeriod || ''} onChange={(event) => updateClaimDraft(document._id, { reportingPeriod: event.target.value })} className="response-input" />
                </div>
                <details className="text-xs text-slate-600"><summary className="cursor-pointer font-medium">Optional claim context</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {(['functionalUnit', 'boundary', 'methodology'] as const).map((field) => <input key={field} aria-label={fieldLabel(field)} placeholder={`${fieldLabel(field)}${field !== 'methodology' && (claimDrafts[document._id]?.type || 'PCF_VALUE') === 'PCF_VALUE' ? ' (required for PCF)' : ''}`} disabled={savingClaim === document._id} value={claimDrafts[document._id]?.[field] || ''} onChange={(event) => updateClaimDraft(document._id, { [field]: event.target.value })} className="response-input" />)}
                  </div>
                </details>
                <Button size="sm" variant="outline" disabled={savingClaim === document._id || document.status === 'ARCHIVED'} onClick={() => submitClaim(item._id, document._id)}>{savingClaim === document._id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{savingClaim === document._id ? 'Saving claim...' : 'Save claim'}</Button>
              </div>}
            </div>)}
            {item.response && item.response.evidenceDocuments.length === 0 && <p className="text-xs text-slate-500">No documents uploaded for this response.</p>}
            {!locked && item.responseType !== 'DOCUMENT' && <Button size="sm" variant="outline" disabled={savingItem === item._id} onClick={() => saveItem(item._id)}>{savingItem === item._id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{savingItem === item._id ? 'Saving...' : 'Save draft'}</Button>}
          </div>
        </article>)}
        {!visibleItems.length && <p className="py-6 text-sm text-slate-500">No requirements are currently applicable to your responses.</p>}
      </div>
    </section>

    {!locked && <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-600">{canSubmit ? 'Ready to submit to the buyer.' : `Missing required: ${request.completion.missingRequiredItems.map((item) => item.label).join(', ')}`}</p><Button disabled={!canSubmit || submitting} onClick={submit}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{request.status === 'NEEDS_CLARIFICATION' ? 'Submit correction' : 'Submit response'}</Button></div>}
    <style jsx>{`.response-input{width:100%;min-height:2.5rem;border:1px solid #cbd5e1;background:#fff;padding:0 .7rem;color:#0f172a;font-size:.875rem;outline:none}.response-input:focus{border-color:#0f766e;box-shadow:0 0 0 1px #0f766e}.response-input:disabled{background:#f1f5f9;color:#64748b}`}</style>
  </div>;
}