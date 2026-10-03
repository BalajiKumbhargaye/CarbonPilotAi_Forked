'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, Download, FileText, LoaderCircle, UploadCloud } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import {
  downloadDataRequestDocument,
  getDataRequest,
  reuseDataRequestDocument,
  saveDataRequestItem,
  submitDataRequest,
  uploadDataRequestDocument,
  type DataRequestRecord,
  type DataRequestStatus,
} from '@/lib/data-requests';

function isLocked(status: DataRequestStatus) {
  return status === 'SUBMITTED' || status === 'COMPLETED' || status === 'CANCELLED';
}

function responseInputValue(value: unknown) {
  if (Array.isArray(value)) return value.join('\u001f');
  return value === undefined || value === null ? '' : String(value);
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
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    const data = await getDataRequest(requestId);
    setRequest(data);
    setValues(Object.fromEntries(data.requestedItems.map((item) => [item._id, responseInputValue(item.response?.value ?? item.response?.answer)])));
    setUnits(Object.fromEntries(data.requestedItems.map((item) => [item._id, item.response?.unit || item.unit || ''])));
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

  const uploadEvidence = async (itemId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingItem(itemId);
    setError('');
    setNotice('');
    try {
      await uploadDataRequestDocument(requestId, itemId, file);
      await load();
      setNotice('Evidence uploaded and attached to this requirement.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload evidence.');
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
      <div className="flex items-center gap-3"><span className={`inline-flex border px-2.5 py-1.5 text-xs font-semibold ${statusClass(request.status)}`}>{request.status.replaceAll('_', ' ')}</span><span className="text-sm tabular-nums text-slate-600">{request.completion.completed}/{request.completion.total}</span></div>
    </header>

    {error && <p role="alert" className="border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
    {notice && <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
    {request.description && <p className="max-w-3xl whitespace-pre-wrap text-sm text-slate-700">{request.description}</p>}
    {request.clarificationMessage && <div className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3"><p className="text-xs font-semibold uppercase text-rose-800">Buyer clarification</p><p className="mt-1 whitespace-pre-wrap text-sm text-rose-950">{request.clarificationMessage}</p></div>}
    {request.status === 'SUBMITTED' && <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Your submission is with the buyer. Changes are locked until clarification is requested.</p>}

    <section aria-labelledby="requirements-title">
      <div className="mb-3 flex items-end justify-between"><div><h2 id="requirements-title" className="text-base font-semibold text-slate-900">Required information</h2><p className="mt-1 text-xs text-slate-500">Save individual items; you can return and continue later.</p></div><span className="text-xs font-medium text-slate-600">{request.completion.completed} of {request.completion.total} complete</span></div>
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
            {item.responseType === 'DOCUMENT' && <p className="text-xs text-slate-600">Attach a PDF, PNG, JPG, or JPEG file up to 25 MB.</p>}
            {(item.responseType === 'DOCUMENT' || item.requiresEvidence) && !locked && <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-teal-800 hover:underline"><UploadCloud className="h-4 w-4" />{uploadingItem === item._id ? 'Uploading...' : 'Upload evidence'}<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={uploadingItem === item._id} onChange={(event) => uploadEvidence(item._id, event)} className="sr-only" /></label>}
            {item.response?.evidenceDocuments.map((document) => <button key={document._id} type="button" onClick={async () => { try { const blob = await downloadDataRequestDocument(document, requestId); const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = document.filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : 'Unable to download evidence.'); } }} className="flex items-center gap-2 text-xs font-medium text-slate-700 hover:text-teal-800"><FileText className="h-4 w-4" />{document.filename}<Download className="h-3.5 w-3.5" /></button>)}
            {!locked && item.responseType !== 'DOCUMENT' && <Button size="sm" variant="outline" disabled={savingItem === item._id} onClick={() => saveItem(item._id)}>{savingItem === item._id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{savingItem === item._id ? 'Saving...' : 'Save draft'}</Button>}
          </div>
        </article>)}
      </div>
    </section>

    {!locked && <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-600">{canSubmit ? 'Ready to submit to the buyer.' : `Missing required: ${request.completion.missingRequiredItems.map((item) => item.label).join(', ')}`}</p><Button disabled={!canSubmit || submitting} onClick={submit}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{request.status === 'NEEDS_CLARIFICATION' ? 'Submit correction' : 'Submit response'}</Button></div>}
    <style jsx>{`.response-input{width:100%;min-height:2.5rem;border:1px solid #cbd5e1;background:#fff;padding:0 .7rem;color:#0f172a;font-size:.875rem;outline:none}.response-input:focus{border-color:#0f766e;box-shadow:0 0 0 1px #0f766e}.response-input:disabled{background:#f1f5f9;color:#64748b}`}</style>
  </div>;
}