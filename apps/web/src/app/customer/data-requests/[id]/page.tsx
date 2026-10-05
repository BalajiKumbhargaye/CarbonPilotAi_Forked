'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, Download, FileText, LoaderCircle, MessageSquareWarning, RefreshCw } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import {
  completeDataRequest,
  downloadDataRequestDocument,
  getDataRequest,
  requestDataClarification,
  type DataRequestRecord,
  type DataRequestStatus,
} from '@/lib/data-requests';

function fieldLabel(field: string) {
  return field.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: DataRequestStatus) {
  if (status === 'COMPLETED' || status === 'SUBMITTED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'NEEDS_CLARIFICATION') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (status === 'IN_PROGRESS') return 'border-cyan-200 bg-cyan-50 text-cyan-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

export default function BuyerDataRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params.id;
  const [request, setRequest] = useState<DataRequestRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => setRequest(await getDataRequest(requestId));

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
    getDataRequest(requestId).then((data) => { if (active) setRequest(data); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load data request.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestId]);

  const clarify = async () => {
    if (!request || !message.trim()) {
      setError('Enter a clarification message.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await requestDataClarification(requestId, message, selectedItems);
      setRequest(updated);
      setMessage('');
      setSelectedItems([]);
      setNotice('Clarification request sent to the supplier.');
    } catch (clarificationError) {
      setError(clarificationError instanceof Error ? clarificationError.message : 'Unable to request clarification.');
    } finally { setSaving(false); }
  };

  const complete = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await completeDataRequest(requestId);
      setRequest(updated);
      setNotice('Data request marked complete.');
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : 'Unable to complete request.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-500">Loading data request...</div>;
  if (!request) return <div className="space-y-4"><p role="alert" className="text-sm text-rose-800">{error || 'Data request not found.'}</p><Link href="/customer/data-requests" className="text-sm font-semibold text-emerald-800">Back to data requests</Link></div>;

  return <div className="space-y-6">
    <Breadcrumb items={[{ label: 'Data Collection', href: '/customer/data-requests' }, { label: 'Data Requests', href: '/customer/data-requests' }, { label: request.title }]} />
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div><Link href="/customer/data-requests" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"><ArrowLeft className="h-3.5 w-3.5" />All data requests</Link><h1 className="text-2xl font-bold text-slate-950">{request.title}</h1><p className="mt-1 text-sm text-slate-600">Supplier: {request.supplierOrganization?.name || 'Supplier'}{request.product?.name ? ` · ${request.product.name}` : ''}{request.deadline ? ` · Due ${new Date(request.deadline).toLocaleDateString()}` : ''}</p></div>
      <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" disabled={refreshing} onClick={refresh}>{refreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{refreshing ? 'Refreshing...' : 'Refresh results'}</Button><span className={`inline-flex border px-2.5 py-1.5 text-xs font-semibold ${statusClass(request.status)}`}>{request.status.replaceAll('_', ' ')}</span><span className="text-sm tabular-nums text-slate-600">{request.completion.completed}/{request.completion.total}</span></div>
    </header>
    {error && <p role="alert" className="border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
    {notice && <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
    {request.description && <p className="max-w-3xl whitespace-pre-wrap text-sm text-slate-700">{request.description}</p>}

    {request.completion.missingRequiredItems.length > 0 && <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3"><h2 className="text-sm font-semibold text-amber-950">Missing required information</h2><p className="mt-1 text-sm text-amber-900">{request.completion.missingRequiredItems.map((item) => item.label).join(', ')}</p></div>}

    <section aria-labelledby="review-title">
      <div className="mb-3"><h2 id="review-title" className="text-base font-semibold text-slate-900">Supplier submission</h2><p className="mt-1 text-xs text-slate-500">Automated checks compare extracted claims with available linked records. They do not establish independent document authenticity.</p></div>
      <div className="divide-y divide-slate-200 border-y border-slate-200">
        {request.requestedItems.map((item) => <article key={item._id} className={`grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(260px,1fr)] ${!item.visible ? 'opacity-60' : ''}`}>
          <div className="flex items-start gap-3"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${item.completed ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 text-transparent'}`}><Check className="h-3.5 w-3.5" /></span><div><h3 className="text-sm font-semibold text-slate-900">{item.label}<span className="ml-2 text-xs font-normal text-slate-500">{item.required ? 'Required' : 'Optional'} · {item.category.replaceAll('_', ' ')}</span></h3>{item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}</div></div>
          <div className="space-y-2 text-sm text-slate-700">
            {!item.visible ? <span className="text-xs text-slate-500">Not applicable based on the supplier response</span> : item.response ? <>
              <p className="whitespace-pre-wrap">{Array.isArray(item.response.value) ? item.response.value.join(', ') : String(item.response.value ?? item.response.answer ?? 'Response submitted')}{item.response.unit ? ` ${item.response.unit}` : ''}</p>
              {item.response.evidenceDocuments.length === 0 && <p className="text-xs text-slate-500">No documents attached to this response.</p>}
              {item.response.evidenceDocuments.map((document) => <article key={document._id} className="space-y-3 border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={async () => { try { const blob = await downloadDataRequestDocument(document, requestId); const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = document.filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : 'Unable to download evidence.'); } }} className="flex items-center gap-2 text-xs font-semibold text-emerald-800 hover:underline"><FileText className="h-4 w-4" />{document.filename}<Download className="h-3.5 w-3.5" /></button>
                  <span className="text-xs text-slate-600">{document.documentType || 'Document type unavailable'}{document.uploadedAt ? ` · Uploaded ${new Date(document.uploadedAt).toLocaleString()}` : ''}</span>
                </div>
                <p className="text-xs text-slate-600">Processing status: <strong>{document.status || 'UPLOADED'}</strong>{document.processingError ? ` — ${document.processingError}` : ''}</p>
                {document.extraction ? <div className="space-y-2 text-xs text-slate-700">
                  <p>Extraction status: <strong>{document.extraction.status || 'PROCESSING'}</strong> · Method: <strong>{document.extraction.method || 'Not available'}</strong></p>
                  {document.extraction.errorMessage && <p role="alert" className="text-rose-800">Extraction issue: {document.extraction.errorMessage}</p>}
                  {document.extraction.fields?.length ? <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
                    {document.extraction.fields.filter((field) => field.field !== 'DOCUMENT_TEXT' && field.field !== 'PAGE_TEXT').map((field, index) => <div key={`${field.field}-${field.page ?? 'na'}-${index}`}>
                      <dt className="inline font-semibold">{fieldLabel(field.field)}: </dt>
                      <dd className="inline">{field.value === null || field.value === undefined ? 'Not available' : String(field.value)}{field.unit ? ` ${field.unit}` : ''}{field.confidence !== undefined ? ` · ${Math.round(field.confidence <= 1 ? field.confidence * 100 : field.confidence)}% confidence` : ''}{field.page ? ` · Page ${field.page}` : ''}{field.sourceText ? ` · Source: “${field.sourceText}”` : ''}</dd>
                    </div>)}
                  </dl> : <p>No structured fields are available.</p>}
                  {document.extraction.text ? <details className="pt-1"><summary className="cursor-pointer font-semibold text-slate-700">View extracted text</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap border border-slate-200 bg-slate-50 p-2 text-[11px]">{document.extraction.text}</pre></details> : <p>Extracted text: Not available.</p>}
                  {!!document.extraction.pages?.length && <details className="pt-1"><summary className="cursor-pointer font-semibold text-slate-700">View page-level extraction</summary><div className="mt-2 space-y-2">{document.extraction.pages.map((page) => <section key={page.pageNumber} className="border border-slate-200 bg-slate-50 p-2"><p className="font-semibold">Page {page.pageNumber} · {page.method}{page.confidence !== undefined ? ` · ${Math.round(page.confidence <= 1 ? page.confidence * 100 : page.confidence)}% confidence` : ''}</p><pre className="mt-1 whitespace-pre-wrap">{page.text || 'No text extracted from this page.'}</pre></section>)}</div></details>}
                </div> : <p className="text-xs text-amber-800">{document.status === 'PROCESSING' ? 'Extraction is processing.' : document.status === 'FAILED' ? 'Extraction failed; see the document error above.' : 'No extraction result is available.'}</p>}
                {document.claims?.length ? <div className="space-y-3 border-t border-slate-100 pt-2">
                  <h4 className="text-xs font-semibold text-slate-900">Claims and evidence</h4>
                  {document.claims.map((claim) => <div key={claim._id} className="space-y-1 border-l-2 border-slate-200 pl-3 text-xs">
                    <p className="font-medium text-slate-800">{fieldLabel(claim.type)}: {String(claim.value)}{claim.unit ? ` ${claim.unit}` : ''} · Claim status: {claim.status}</p>
                    <p>Evidence: Linked · {claim.evidence?.relationshipType ? fieldLabel(claim.evidence.relationshipType) : 'Relationship unavailable'} · {document.filename}{claim.evidence?.page ? ` · Page ${claim.evidence.page}` : ''}</p>
                    {claim.sourceReference?.sourceType && <p>Provenance: {fieldLabel(claim.sourceReference.sourceType)}{claim.sourceReference.extractionMethod ? ` · ${claim.sourceReference.extractionMethod}` : ''}</p>}
                    {claim.evidence?.sourceText && <p className="text-slate-600">Source text: “{claim.evidence.sourceText}”</p>}
                    {claim.type === 'PCF_VALUE' && <>
                      <p>Carbon intensity: {String(claim.value)}{claim.unit ? ` ${claim.unit}` : ''}</p>
                      <p>Boundary: {claim.boundary || 'Not available'} · Reporting period: {claim.reportingPeriod || 'Not available'}</p>
                      <p>Eligible as a carbon calculation source: <strong>{claim.eligibleForCarbonCalculation ? 'Yes; purchase-unit compatibility is checked during calculation' : 'No'}</strong></p>
                    </>}
                    {claim.verification ? <div className="space-y-1">
                      <p>Verification status: <strong>{claim.verification.overallStatus}</strong></p>
                      {claim.verification.checks?.length ? claim.verification.checks.map((check, index) => <p key={`${check.checkType}-${index}`} className={check.result === 'FAIL' ? 'text-rose-800' : undefined}>
                        {fieldLabel(check.checkType)}: {check.result}{check.sourcePage ? ` · Page ${check.sourcePage}` : ''} — {check.explanation}{check.expected ? ` Expected: ${check.expected}.` : ''}{check.observed ? ` Observed: ${check.observed}.` : ''}
                      </p>) : <p>No verification checks were returned.</p>}
                      {claim.verification.issues?.map((issue, index) => <p key={`issue-${index}`} className="text-rose-800">Anomaly/issue{issue.type ? ` (${fieldLabel(issue.type)})` : ''}{issue.severity ? ` · ${issue.severity}` : ''}: {issue.description}{issue.recommendedAction ? ` ${issue.recommendedAction}` : ''}</p>)}
                      {!claim.verification.issues?.length && <p>No anomalies were reported by this verification run.</p>}
                      {claim.verification.corroborationResults?.map((result, index) => <p key={`corroboration-${index}`}>External corroboration: {result.result}{result.source ? ` · ${result.source}` : ''}</p>)}
                    </div> : <p className="text-amber-800">Verification: Not available; no verification run was returned.</p>}
                  </div>)}
                </div> : <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">No linked claims detected for this document.</p>}
              </article>)}
            </> : <span className="text-xs text-slate-500">Not submitted</span>}
          </div>
        </article>)}
        {!request.requestedItems.length && <p className="py-6 text-sm text-slate-500">This Data Request has no requested items.</p>}
      </div>
    </section>

    {request.status === 'SUBMITTED' && <section aria-labelledby="clarification-title" className="border-t border-slate-200 pt-5">
      <div className="flex items-start gap-3"><MessageSquareWarning className="mt-0.5 h-5 w-5 text-rose-700" /><div><h2 id="clarification-title" className="text-base font-semibold text-slate-900">Request clarification</h2><p className="mt-1 text-xs text-slate-600">Select items to reopen, or leave all unchecked to request updates across the submission.</p></div></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{request.requestedItems.map((item) => <label key={item._id} className="flex items-center gap-2 border border-slate-200 px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={selectedItems.includes(item._id)} onChange={(event) => setSelectedItems((current) => event.target.checked ? [...current, item._id] : current.filter((id) => id !== item._id))} />{item.label}</label>)}</div>
      <label className="mt-4 flex flex-col gap-2 text-xs font-semibold text-slate-700">Message to supplier<textarea rows={3} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} className="w-full border border-slate-300 p-3 text-sm font-normal text-slate-900 outline-none focus:border-emerald-700" placeholder="Describe the information that needs clarification" /></label>
      <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={saving || !message.trim()} onClick={clarify}><MessageSquareWarning className="h-4 w-4" />{saving ? 'Sending...' : 'Request clarification'}</Button><Button disabled={saving} onClick={complete}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Mark complete</Button></div>
    </section>}
    {request.status === 'COMPLETED' && <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">This request is complete.</p>}
  </div>;
}