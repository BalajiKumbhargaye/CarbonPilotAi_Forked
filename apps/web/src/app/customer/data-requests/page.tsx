'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUp, Plus, Send, Trash2 } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import {
  createDataRequest,
  getDataRequestProducts,
  getDataRequests,
  getDataRequestSummary,
  getDataRequestSuppliers,
  getQuestionnaireTemplates,
  sendDataRequest,
  updateDataRequest,
  type CreateDataRequestInput,
  type DataRequestCondition,
  type DataRequestProduct,
  type DataRequestRecord,
  type DataRequestRequirementInput,
  type DataRequestStatus,
  type DataRequestSummary,
  type DataRequestSupplier,
  type QuestionnaireCategory,
  type QuestionnaireTemplate,
} from '@/lib/data-requests';

const requirementTypes = [
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'TEXT', label: 'Text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DECIMAL', label: 'Decimal' },
  { value: 'DATE', label: 'Date' },
  { value: 'YES_NO', label: 'Yes / No' },
  { value: 'BOOLEAN', label: 'Boolean' },
  { value: 'SINGLE_SELECT', label: 'Single select' },
  { value: 'MULTI_SELECT', label: 'Multi select' },
] as const;

const categories: Array<{ value: QuestionnaireCategory; label: string }> = [
  { value: 'PRODUCT', label: 'Product' }, { value: 'CARBON', label: 'Carbon' },
  { value: 'ENERGY', label: 'Energy' }, { value: 'MATERIAL', label: 'Material' },
  { value: 'WASTE', label: 'Waste' }, { value: 'WATER', label: 'Water' },
  { value: 'CERTIFICATION', label: 'Certification' }, { value: 'RENEWABLE_ENERGY', label: 'Renewable energy' },
  { value: 'SUPPLY_CHAIN', label: 'Supply chain' }, { value: 'GENERAL_SUSTAINABILITY', label: 'General sustainability' },
];

const blankRequirement: DataRequestRequirementInput = {
  key: '', label: '', responseType: 'DOCUMENT', category: 'GENERAL_SUSTAINABILITY', required: true, requiresEvidence: false, order: 0,
};

function makeKey(label: string, index: number) {
  return `${label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'question'}_${index + 1}`;
}

function statusClasses(status: DataRequestStatus) {
  if (status === 'COMPLETED' || status === 'SUBMITTED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'NEEDS_CLARIFICATION') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (status === 'IN_PROGRESS') return 'border-cyan-200 bg-cyan-50 text-cyan-800';
  if (status === 'DRAFT') return 'border-slate-300 bg-slate-100 text-slate-600';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function statusLabel(status: DataRequestStatus) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function RequestCounts({ summary }: { summary: DataRequestSummary | null }) {
  const items: Array<[string, number | undefined]> = [
    ['Total', summary?.total],
    ['Sent', summary?.counts.SENT],
    ['In progress', summary?.counts.IN_PROGRESS],
    ['Submitted', summary?.counts.SUBMITTED],
    ['Clarification', summary?.counts.NEEDS_CLARIFICATION],
    ['Completed', summary?.counts.COMPLETED],
  ];
  return <div className="grid grid-cols-2 border-y border-slate-200 sm:grid-cols-3 lg:grid-cols-6">
    {items.map(([label, value]) => <div key={label} className="border-r border-slate-200 px-4 py-3 last:border-r-0">
      <p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value ?? '—'}</p>
    </div>)}
  </div>;
}

export default function CustomerDataRequestsPage() {
  const [requests, setRequests] = useState<DataRequestRecord[]>([]);
  const [summary, setSummary] = useState<DataRequestSummary | null>(null);
  const [suppliers, setSuppliers] = useState<DataRequestSupplier[]>([]);
  const [products, setProducts] = useState<DataRequestProduct[]>([]);
  const [templates, setTemplates] = useState<QuestionnaireTemplate[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [editingRequestId, setEditingRequestId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [allowPartialSubmission, setAllowPartialSubmission] = useState(false);
  const [requirements, setRequirements] = useState<DataRequestRequirementInput[]>([{ ...blankRequirement }]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    const [items, totals] = await Promise.all([getDataRequests(), getDataRequestSummary()]);
    setRequests(items);
    setSummary(totals);
  };

  useEffect(() => {
    let active = true;
    Promise.all([getDataRequests(), getDataRequestSummary(), getDataRequestSuppliers()]).then(([items, totals, supplierItems]) => {
      if (!active) return;
      setRequests(items);
      setSummary(totals);
      setSuppliers(supplierItems);
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load data requests.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setProducts([]);
    setProductId('');
    if (!supplierId) return () => { active = false; };
    getDataRequestProducts(supplierId).then((items) => { if (active) setProducts(items); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load supplier products.'); });
    return () => { active = false; };
  }, [supplierId]);

  useEffect(() => {
    let active = true;
    getQuestionnaireTemplates(productId || undefined).then((items) => { if (active) setTemplates(items); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load questionnaire templates.'); });
    return () => { active = false; };
  }, [productId]);

  const updateRequirement = (index: number, patch: Partial<DataRequestRequirementInput>) => {
    setRequirements((current) => {
      const previousKey = current[index]?.key;
      const nextKey = patch.key || previousKey;
      return current.map((item, itemIndex) => {
        const updated = itemIndex === index ? { ...item, ...patch, key: nextKey } : item;
        if (previousKey && nextKey && previousKey !== nextKey && itemIndex !== index) {
          updated.conditions = updated.conditions?.map((condition) => condition.questionKey === previousKey
            ? { ...condition, questionKey: nextKey }
            : condition);
        }
        return { ...updated, order: itemIndex };
      });
    });
  };

  const reorderRequirement = (index: number, offset: number) => {
    setRequirements((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      const keyIndex = new Map(reordered.map((item, itemIndex) => [item.key, itemIndex]));
      if (reordered.some((item, itemIndex) => item.conditions?.some((condition) => (keyIndex.get(condition.questionKey) ?? itemIndex) >= itemIndex))) {
        return current;
      }
      return reordered.map((item, itemIndex) => ({ ...item, order: itemIndex }));
    });
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((item) => item._id === id);
    if (template) {
      setRequirements(template.questions.map((question, index) => ({ ...question, order: index, conditions: question.conditions || [] })));
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>, sendNow: boolean) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const payload: CreateDataRequestInput = {
      supplierId,
      title,
      description,
      deadline: deadline || undefined,
      productId: productId || undefined,
      templateId: templateId || undefined,
      allowPartialSubmission,
      requestedItems: requirements.map((item) => ({
        ...item,
        key: item.key || makeKey(item.label, item.order || 0),
        order: item.order ?? 0,
        label: item.label.trim(),
        description: item.description?.trim() || undefined,
        unit: item.unit?.trim() || undefined,
      })),
    };
    try {
      const created = editingRequestId
        ? await updateDataRequest(editingRequestId, {
          title: payload.title,
          description: payload.description,
          deadline: payload.deadline,
          productId: payload.productId,
          templateId: payload.templateId,
          allowPartialSubmission: payload.allowPartialSubmission,
          requestedItems: payload.requestedItems,
        })
        : await createDataRequest(payload);
      if (sendNow) {
        await sendDataRequest(created._id);
        setNotice('Data request sent to the supplier.');
      } else {
        setNotice('Draft saved. Send it when you are ready.');
      }
      await refresh();
      setShowForm(false);
      setTitle('');
      setDescription('');
      setDeadline('');
      setSupplierId('');
      setProductId('');
      setTemplateId('');
      setEditingRequestId('');
      setRequirements([{ ...blankRequirement }]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save data request.');
    } finally { setSaving(false); }
  };

  const sendDraft = async (request: DataRequestRecord) => {
    setSaving(true);
    setError('');
    try {
      await sendDataRequest(request._id);
      await refresh();
      setNotice('Data request sent to the supplier.');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Unable to send data request.');
    } finally { setSaving(false); }
  };

  const editDraft = (request: DataRequestRecord) => {
    const supplier = suppliers.find((item) => item.organizationId === request.supplierOrganizationId);
    if (!supplier) {
      setError('The supplier is no longer active in your organization.');
      return;
    }
    setEditingRequestId(request._id);
    setSupplierId(supplier._id);
    setProductId(request.productId || '');
    setTemplateId(request.templateId || '');
    setTitle(request.title);
    setDescription(request.description);
    setDeadline(request.deadline ? new Date(request.deadline).toISOString().slice(0, 10) : '');
    setRequirements(request.requestedItems.map((item, order) => ({
      key: item.key,
      label: item.label,
      description: item.description,
      responseType: item.responseType,
      category: item.category,
      required: item.required,
      requiresEvidence: item.requiresEvidence,
      unit: item.unit,
      options: item.options,
      conditions: item.conditions,
      order,
    })));
    setShowForm(true);
    setError('');
    setNotice('');
  };

  return <div className="space-y-6">
    <Breadcrumb items={[{ label: 'Data Collection', href: '/customer/data-requests' }, { label: 'Data Requests' }]} />
    <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Supplier collaboration</p><h1 className="mt-1 text-2xl font-bold text-slate-950">Data Requests</h1><p className="mt-1 text-sm text-slate-600">Request structured information and documents from connected suppliers.</p></div>
      <Button onClick={() => {
        if (showForm) {
          setShowForm(false);
          setEditingRequestId('');
        } else {
          setShowForm(true);
          setEditingRequestId('');
          setTitle(''); setDescription(''); setDeadline(''); setSupplierId(''); setProductId(''); setTemplateId(''); setRequirements([{ ...blankRequirement }]);
        }
        setError('');
      }}><Plus className="h-4 w-4" />{showForm ? 'Close form' : 'New data request'}</Button>
    </header>

    {error && <p role="alert" className="border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
    {notice && <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
    <RequestCounts summary={summary} />

    {showForm && <form onSubmit={(event) => save(event, true)} className="space-y-5 border-b border-slate-300 pb-7">
      <div className="flex items-baseline justify-between gap-4">
        <div><h2 className="text-base font-semibold text-slate-900">New request</h2><p className="mt-1 text-xs text-slate-500">Choose the supplier, then customize a template or build a question set.</p></div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={allowPartialSubmission} onChange={(event) => setAllowPartialSubmission(event.target.checked)} />Allow partial submission</label>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="form-label">Supplier *<select required disabled={!!editingRequestId} value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="form-input"><option value="">Select connected supplier</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}</select></label>
        <label className="form-label">Product<select value={productId} onChange={(event) => setProductId(event.target.value)} disabled={!supplierId} className="form-input"><option value="">No specific product</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name}{product.productCode ? ` · ${product.productCode}` : ''}</option>)}</select></label>
        <label className="form-label md:col-span-2">Request title *<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="form-input" placeholder="e.g. Steel sustainability data - 2026" /></label>
        <label className="form-label md:col-span-3">Description<textarea maxLength={2000} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className="form-input h-auto py-2" /></label>
        <label className="form-label">Due date<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="form-input" /></label>
      </div>

      <label className="form-label max-w-2xl">Questionnaire template <span className="font-normal text-slate-500">Choose a starting set, then customize it below.</span>
        <select value={templateId} onChange={(event) => applyTemplate(event.target.value)} className="form-input"><option value="">Start with a blank questionnaire</option>{templates.map((template) => <option key={template._id} value={template._id}>{template.name}{template.productCategories.length ? ` · ${template.productCategories.join(', ')}` : ''}</option>)}</select>
      </label>

      <div>
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">Questions</h3><button type="button" onClick={() => setRequirements((current) => [...current, { ...blankRequirement, order: current.length }])} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"><Plus className="h-3.5 w-3.5" />Add question</button></div>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {requirements.map((item, index) => <div key={item.key || index} className="grid gap-3 py-4 lg:grid-cols-[minmax(170px,2fr)_minmax(130px,1fr)_minmax(150px,1fr)_minmax(130px,1fr)_auto] lg:items-end">
            <label className="form-label">Question *<input required maxLength={160} value={item.label} onChange={(event) => updateRequirement(index, { label: event.target.value, key: makeKey(event.target.value, index) })} className="form-input" placeholder="e.g. Product carbon footprint" /><textarea rows={2} maxLength={1000} value={item.description || ''} onChange={(event) => updateRequirement(index, { description: event.target.value })} className="form-input h-auto py-2" placeholder="Instructions (optional)" /></label>
            <label className="form-label">Response type<select value={item.responseType} onChange={(event) => updateRequirement(index, { responseType: event.target.value as DataRequestRequirementInput['responseType'] })} className="form-input">{requirementTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            <label className="form-label">Category<select value={item.category || 'GENERAL_SUSTAINABILITY'} onChange={(event) => updateRequirement(index, { category: event.target.value as QuestionnaireCategory })} className="form-input">{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
            <label className="form-label">Unit / options<input maxLength={200} value={item.options?.join(', ') || item.unit || ''} onChange={(event) => {
              if (item.responseType === 'SINGLE_SELECT' || item.responseType === 'MULTI_SELECT') updateRequirement(index, { options: event.target.value.split(',').map((option) => option.trim()).filter(Boolean) });
              else updateRequirement(index, { unit: event.target.value });
            }} className="form-input" placeholder={item.responseType.includes('SELECT') ? 'Separate options with commas' : 'e.g. % or kg'} /></label>
            <div className="flex min-h-10 flex-wrap items-center gap-2"><label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-700"><input type="checkbox" checked={item.required} onChange={(event) => updateRequirement(index, { required: event.target.checked })} />Required</label>{item.responseType !== 'DOCUMENT' && <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-700"><input type="checkbox" checked={!!item.requiresEvidence} onChange={(event) => updateRequirement(index, { requiresEvidence: event.target.checked })} />Evidence</label>}<button type="button" disabled={index === 0} onClick={() => reorderRequirement(index, -1)} aria-label="Move question up" className="p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button type="button" disabled={index === requirements.length - 1} onClick={() => reorderRequirement(index, 1)} aria-label="Move question down" className="p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button><button type="button" disabled={requirements.length === 1} onClick={() => setRequirements((current) => current.filter((_, itemIndex) => itemIndex !== index).map((question, order) => ({ ...question, order })))} aria-label="Remove question" className="p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>
            {index > 0 && <label className="form-label lg:col-span-2">Show only when
              <select value={item.conditions?.[0]?.questionKey || ''} onChange={(event) => {
                const parent = requirements.find((question) => question.key === event.target.value);
                const defaultValue = parent?.responseType === 'SINGLE_SELECT'
                  ? parent.options?.[0] || ''
                  : parent?.responseType === 'BOOLEAN' ? true : 'YES';
                updateRequirement(index, { conditions: event.target.value ? [{ questionKey: event.target.value, operator: 'EQUALS', value: defaultValue }] : [] });
              }} className="form-input"><option value="">Always ask</option>{requirements.slice(0, index).filter((parent) => ['YES_NO', 'BOOLEAN', 'SINGLE_SELECT'].includes(parent.responseType)).map((parent) => <option key={parent.key} value={parent.key}>{parent.label}</option>)}</select>
            </label>}
            {item.conditions?.[0] && <label className="form-label">Answer must be
              <select value={String(item.conditions[0].value)} onChange={(event) => {
                const parent = requirements.find((question) => question.key === item.conditions?.[0].questionKey);
                const value = parent?.responseType === 'BOOLEAN' ? event.target.value === 'true' : event.target.value;
                updateRequirement(index, { conditions: [{ ...item.conditions![0], value }] });
              }} className="form-input">{(requirements.find((question) => question.key === item.conditions?.[0].questionKey)?.options?.length ? requirements.find((question) => question.key === item.conditions?.[0].questionKey)?.options : requirements.find((question) => question.key === item.conditions?.[0].questionKey)?.responseType === 'BOOLEAN' ? ['true', 'false'] : ['YES', 'NO'])?.map((option) => <option key={option} value={option}>{option === 'true' ? 'Yes' : option === 'false' ? 'No' : option}</option>)}</select>
            </label>}
          </div>)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving || !suppliers.length}><Send className="h-4 w-4" />{saving ? 'Saving...' : editingRequestId ? 'Save changes and send' : 'Create and send'}</Button><Button type="button" variant="outline" disabled={saving || !suppliers.length} onClick={(event) => save(event as any, false)}>Save draft</Button></div>
      {!suppliers.length && <p className="text-xs text-amber-800">Connect an active supplier before creating a request.</p>}
    </form>}
    <section aria-labelledby="request-list-title">
      <div className="mb-3 flex items-end justify-between"><div><h2 id="request-list-title" className="text-base font-semibold text-slate-900">Your requests</h2><p className="mt-1 text-xs text-slate-500">Status and completion are calculated from saved supplier responses.</p></div><span className="text-xs tabular-nums text-slate-500">{requests.length} requests</span></div>
      <div className="overflow-x-auto border-y border-slate-200"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-3">Supplier / title</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">Due</th><th className="px-3 py-3">Completion</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-slate-200">
        {requests.map((request) => <tr key={request._id} className="bg-white hover:bg-slate-50"><td className="px-3 py-3"><Link href={`/customer/data-requests/${request._id}`} className="font-semibold text-slate-900 hover:text-emerald-800">{request.title}</Link><span className="mt-1 block text-xs text-slate-500">{request.supplierOrganization?.name || 'Supplier'}</span></td><td className="px-3 py-3 text-slate-600">{request.product?.name || 'All products'}</td><td className="px-3 py-3 text-slate-600">{request.deadline ? new Date(request.deadline).toLocaleDateString() : '—'}</td><td className="px-3 py-3 tabular-nums">{request.completion.completed} / {request.completion.total}</td><td className="px-3 py-3"><span className={`inline-flex border px-2 py-1 text-xs font-semibold ${statusClasses(request.status)}`}>{statusLabel(request.status)}</span></td><td className="px-3 py-3 text-right">{request.status === 'DRAFT' ? <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={saving} onClick={() => editDraft(request)}>Edit</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => sendDraft(request)}><Send className="h-3.5 w-3.5" />Send</Button></div> : <Link href={`/customer/data-requests/${request._id}`} aria-label="Open request" className="inline-flex p-2 text-slate-500 hover:bg-slate-100"><ArrowRight className="h-4 w-4" /></Link>}</td></tr>)}
        {!loading && requests.length === 0 && <tr><td colSpan={6} className="px-3 py-12 text-center text-sm text-slate-500">No data requests yet.</td></tr>}{loading && <tr><td colSpan={6} className="px-3 py-12 text-center text-sm text-slate-500">Loading requests...</td></tr>}
      </tbody></table></div>
    </section>
    <style jsx>{`.form-label{display:flex;flex-direction:column;gap:.4rem;color:#334155;font-size:.75rem;font-weight:600}.form-input{width:100%;height:2.5rem;border:1px solid #cbd5e1;background:#fff;padding:0 .7rem;color:#0f172a;font-size:.875rem;font-weight:400;outline:none}.form-input:focus{border-color:#047857;box-shadow:0 0 0 1px #047857}.form-input:disabled{background:#f1f5f9;color:#64748b}`}</style>
  </div>;
}