'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Download, FileText, LoaderCircle, RefreshCw, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { getProducts, type ProductItem } from '@/lib/products';
import {
  downloadProcurementDocument,
  getProcurementDocument,
  getProcurementDocumentSuppliers,
  getProcurementDocuments,
  importProcurementDocument,
  processProcurementDocument,
  saveProcurementDocumentReview,
  uploadProcurementDocument,
  type ProcurementDocumentRecord,
  type ProcurementDocumentStatus,
  type ProcurementDocumentSupplier,
  type ProcurementDocumentType,
  type ProcurementReviewLineItem,
  type ProcurementReviewData,
} from '@/lib/procurement-documents';

const emptyReview: ProcurementReviewData = {
  supplierId: '',
  productId: '',
  documentNumber: '',
  documentDate: '',
  quantity: '',
  unit: '',
  unitPrice: '',
  totalAmount: '',
  currency: '',
  purchaseOrderNumber: '',
  expectedDeliveryDate: '',
};

function dateInput(value?: string | Date) {
  if (!value) return '';
  if (value instanceof Date && Number.isNaN(value.getTime())) return '';
  const dateText = value instanceof Date ? value.toISOString() : value;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(dateText);
  if (!match) return '';
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${yearText}-${monthText}-${dayText}`
    : '';
}

function reviewFrom(document: ProcurementDocumentRecord): ProcurementReviewData {
  const saved = document.reviewData;
  const extracted = document.extractedData;
  const extractedItems = extracted?.items.map((item) => ({
    productId: item.matchedProductId || '',
    description: item.description || '',
    productCode: item.productCode,
    quantity: item.quantity || '',
    unit: item.unit || '',
    unitPrice: item.unitPrice || '',
    totalAmount: item.totalAmount || '',
  }));
  const items = saved?.items || extractedItems || [{
    productId: saved?.productId || '',
    description: '',
    quantity: saved?.quantity || '',
    unit: saved?.unit || '',
    unitPrice: saved?.unitPrice || '',
    totalAmount: saved?.totalAmount || '',
  }];
  const first = items[0];
  return saved ? {
    ...emptyReview,
    ...saved,
    items,
    documentDate: dateInput(saved.documentDate),
    expectedDeliveryDate: dateInput(saved.expectedDeliveryDate),
  } : {
    ...emptyReview,
    supplierId: extracted?.matchedSupplierId || document.supplierId || '',
    productId: first?.productId || '',
    documentNumber: extracted?.documentNumber || '',
    documentDate: dateInput(extracted?.documentDate),
    quantity: first?.quantity || '',
    unit: first?.unit || '',
    unitPrice: first?.unitPrice || '',
    totalAmount: extracted?.totalAmount || first?.totalAmount || '',
    currency: extracted?.currency || '',
    purchaseOrderNumber: extracted?.purchaseOrderNumber || '',
    expectedDeliveryDate: dateInput(extracted?.expectedDeliveryDate),
    source: extracted ? 'EXTRACTED' : 'MANUAL',
    items,
  };
}

function statusStyle(status: ProcurementDocumentStatus) {
  if (status === 'IMPORTED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'NEEDS_REVIEW' || status === 'FAILED') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (status === 'PROCESSING') return 'border-cyan-200 bg-cyan-50 text-cyan-900';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ProcurementDocumentsPage() {
  const [documents, setDocuments] = useState<ProcurementDocumentRecord[]>([]);
  const [suppliers, setSuppliers] = useState<ProcurementDocumentSupplier[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selected, setSelected] = useState<ProcurementDocumentRecord | null>(null);
  const [review, setReview] = useState<ProcurementReviewData>(emptyReview);
  const [documentType, setDocumentType] = useState<ProcurementDocumentType>('INVOICE');
  const [supplierId, setSupplierId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [requestedDocumentId, setRequestedDocumentId] = useState('');
  const uploadForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setRequestedDocumentId(new URLSearchParams(window.location.search).get('documentId') || '');
  }, []);

  useEffect(() => {
    let current = true;
    Promise.all([getProcurementDocuments(), getProcurementDocumentSuppliers()]).then(([items, supplierItems]) => {
      if (!current) return;
      setDocuments(items);
      setSuppliers(supplierItems);
    }).catch((loadError) => {
      if (current) setError(loadError instanceof Error ? loadError.message : 'Unable to load procurement documents.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!requestedDocumentId || loading) return;
    const document = documents.find((item) => item._id === requestedDocumentId);
    if (document) {
      setSelected(document);
      setReview(reviewFrom(document));
    } else {
      setError('The requested source document is not available to this organization.');
    }
    setRequestedDocumentId('');
  }, [documents, loading, requestedDocumentId]);

  useEffect(() => {
    let current = true;
    if (!review.supplierId) {
      setProducts([]);
      return () => { current = false; };
    }
    getProducts({ supplierId: review.supplierId, status: 'ACTIVE' }).then((items) => {
      if (current) setProducts(items);
    }).catch((loadError) => {
      if (current) setError(loadError instanceof Error ? loadError.message : 'Unable to load supplier products.');
    });
    return () => { current = false; };
  }, [review.supplierId]);

  const refreshHistory = async () => setDocuments(await getProcurementDocuments());

  const selectDocument = (document: ProcurementDocumentRecord) => {
    setSelected(document);
    setReview(reviewFrom(document));
    setError('');
    setNotice('');
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!supplierId || !file) {
      setError('Choose a connected supplier and a document.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('The selected file exceeds the 25 MB limit.');
      return;
    }
    setUploading(true);
    let uploadedDocument: ProcurementDocumentRecord | null = null;
    try {
      const uploaded = await uploadProcurementDocument(file, documentType, supplierId);
      uploadedDocument = uploaded;
      setProcessing(true);
      setSelected({ ...uploaded, status: 'PROCESSING' });
      const processed = await processProcurementDocument(uploaded._id);
      setSelected(processed);
      setReview(reviewFrom(processed));
      await refreshHistory();
      setNotice(processed.status === 'FAILED'
        ? 'Document uploaded. Extraction is unavailable; enter and review the procurement data below.'
        : 'Document uploaded successfully.');
      setFile(null);
      uploadForm.current?.reset();
    } catch (uploadError) {
      let message = uploadError instanceof Error ? uploadError.message : 'Document upload failed.';
      if (uploadedDocument) {
        try {
          const current = await getProcurementDocument(uploadedDocument._id);
          setSelected(current);
          setReview(reviewFrom(current));
        } catch (refreshError) {
          setSelected(uploadedDocument);
          message += ` The upload was saved, but its current processing status could not be loaded: ${refreshError instanceof Error ? refreshError.message : 'refresh failed'}`;
        }
        try {
          await refreshHistory();
        } catch (refreshError) {
          message += ` Document history could not be refreshed: ${refreshError instanceof Error ? refreshError.message : 'refresh failed'}`;
        }
      }
      setError(message);
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  };

  const handleReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setSavingReview(true);
    setError('');
    setNotice('');
    try {
      const payload = updateReviewPayload();
      const saved = await saveProcurementDocumentReview(selected._id, {
        ...payload,
        purchaseOrderNumber: payload.purchaseOrderNumber?.trim() || undefined,
        expectedDeliveryDate: payload.expectedDeliveryDate || undefined,
      });
      setSelected(saved);
      setReview(reviewFrom(saved));
      await refreshHistory();
      setNotice('Review saved. Confirm the values by importing the procurement record.');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Unable to save review.');
    } finally {
      setSavingReview(false);
    }
  };

  const handleImport = async () => {
    if (!selected) return;
    setImporting(true);
    setError('');
    setNotice('');
    try {
      const payload = updateReviewPayload();
      const saved = await saveProcurementDocumentReview(selected._id, {
        ...payload,
        purchaseOrderNumber: payload.purchaseOrderNumber?.trim() || undefined,
        expectedDeliveryDate: payload.expectedDeliveryDate || undefined,
      });
      setSelected(saved);
      const result = await importProcurementDocument(selected._id);
      setSelected(result.document);
      await refreshHistory();
      setNotice(result.warning
        ? `Procurement record imported successfully. ${result.warning}`
        : 'Procurement record imported successfully.');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Unable to import procurement record.');
    } finally {
      setImporting(false);
    }
  };

  const retry = async () => {
    if (!selected) return;
    setProcessing(true);
    setError('');
    try {
      const updated = await processProcurementDocument(selected._id, true);
      setSelected(updated);
      await refreshHistory();
      setNotice(updated.processingError || 'Processing finished.');
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Document processing failed.');
    } finally {
      setProcessing(false);
    }
  };

  const download = async (document: ProcurementDocumentRecord) => {
    try {
      const blob = await downloadProcurementDocument(document);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = document.filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Unable to download document.');
    }
  };

  const setReviewField = (field: keyof ProcurementReviewData, value: string) => {
    setReview((current) => ({ ...current, [field]: value }));
  };

  const setReviewItem = (index: number, field: keyof ProcurementReviewLineItem, value: string) => {
    setReview((current) => {
      const items = [...(current.items || [])];
      let item = { ...items[index], [field]: value };
      if (field === 'productId') {
        const product = products.find((candidate) => candidate._id === value);
        item = {
          ...item,
          unit: item.unit || product?.unit || '',
          description: item.description || product?.name || '',
        };
      }
      items[index] = item;
      const first = items[0];
      return {
        ...current,
        items,
        ...(index === 0 ? {
          productId: first.productId,
          quantity: first.quantity,
          unit: first.unit,
          unitPrice: first.unitPrice,
        } : {}),
      };
    });
  };

  const addReviewItem = () => {
    setReview((current) => ({
      ...current,
      items: [...(current.items || []), {
        productId: '',
        description: '',
        quantity: '',
        unit: '',
        unitPrice: '',
        totalAmount: '',
      }],
    }));
  };

  const removeReviewItem = (index: number) => {
    setReview((current) => {
      const items = (current.items || []).filter((_, itemIndex) => itemIndex !== index);
      const first = items[0];
      return {
        ...current,
        items,
        productId: first?.productId || '',
        quantity: first?.quantity || '',
        unit: first?.unit || '',
        unitPrice: first?.unitPrice || '',
      };
    });
  };

  const updateReviewPayload = (): ProcurementReviewData => {
    const items = (review.items || []).map((item) => ({
      ...item,
      description: item.description || products.find((product) => product._id === item.productId)?.name || '',
    }));
    const first = items[0];
    return {
      ...review,
      productId: first?.productId || review.productId,
      quantity: first?.quantity || review.quantity,
      unit: first?.unit || review.unit,
      unitPrice: first?.unitPrice || review.unitPrice,
      totalAmount: review.totalAmount,
      items,
    };
  };

  return (
    <div className="space-y-7">
      <Breadcrumb items={[{ label: 'Procurement', href: '/customer/purchases' }, { label: 'Procurement Documents' }]} />

      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Buyer workspace</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Procurement Documents</h1>
          <p className="mt-1 text-sm text-slate-600">Import invoices and purchase orders into your procurement records.</p>
        </div>
        <Link href="/customer/purchases" className="text-sm font-semibold text-emerald-800 hover:underline">View purchases</Link>
      </header>

      {error && <p role="alert" className="border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
      {notice && <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}

      <section aria-labelledby="upload-title" className="border-b border-slate-200 pb-7">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center bg-emerald-100 text-emerald-800"><UploadCloud className="h-5 w-5" /></div>
          <div>
            <h2 id="upload-title" className="text-base font-semibold text-slate-900">Upload a procurement document</h2>
            <p className="text-xs text-slate-500">PDF, PNG, JPG, or JPEG. Maximum 25 MB.</p>
          </div>
        </div>
        <form ref={uploadForm} onSubmit={handleUpload} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-semibold text-slate-700">Document type</legend>
            <div className="flex h-10 border border-slate-300 bg-white p-1">
              {(['INVOICE', 'PURCHASE_ORDER'] as const).map((type) => (
                <label key={type} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 text-xs font-medium ${documentType === type ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                  <input className="sr-only" type="radio" name="documentType" value={type} checked={documentType === type} onChange={() => setDocumentType(type)} />
                  {type === 'INVOICE' ? 'Invoice' : 'Purchase order'}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-2 text-xs font-semibold text-slate-700">
            Supplier
            <select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="h-10 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 focus:border-emerald-700 focus:outline-none">
              <option value="">Select connected supplier</option>
              {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold text-slate-700">
            File
            <input required type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} className="h-10 w-full border border-slate-300 bg-white px-2 py-2 text-xs font-normal file:mr-3 file:border-0 file:bg-slate-100 file:px-2 file:py-1" />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={uploading || processing || !suppliers.length} className="h-10 w-full justify-center">
              {uploading || processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {uploading ? 'Uploading document...' : processing ? 'Analyzing document...' : 'Upload document'}
            </Button>
          </div>
        </form>
        {!loading && !suppliers.length && <p className="mt-3 text-sm text-amber-800">No connected suppliers are available. <Link className="font-semibold underline" href="/customer/suppliers">Manage suppliers</Link></p>}
      </section>

      <section aria-labelledby="history-title">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 id="history-title" className="text-base font-semibold text-slate-900">Document history</h2>
            <p className="mt-1 text-xs text-slate-500">Documents uploaded by your organization.</p>
          </div>
          <span className="text-xs tabular-nums text-slate-500">{documents.length} documents</span>
        </div>
        <div className="overflow-x-auto border-y border-slate-200">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr><th className="px-3 py-3 font-semibold">Document</th><th className="px-3 py-3 font-semibold">Type</th><th className="px-3 py-3 font-semibold">Supplier</th><th className="px-3 py-3 font-semibold">Uploaded</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {documents.map((document) => (
                <tr key={document._id} className={selected?._id === document._id ? 'bg-emerald-50/60' : 'bg-white hover:bg-slate-50'}>
                  <td className="px-3 py-3"><button type="button" onClick={() => selectDocument(document)} className="flex items-center gap-2 text-left font-medium text-slate-900 hover:text-emerald-800"><FileText className="h-4 w-4 shrink-0 text-slate-400" /><span className="max-w-64 truncate">{document.reviewData?.documentNumber || document.filename}</span></button></td>
                  <td className="px-3 py-3 text-slate-600">{document.type === 'INVOICE' ? 'Invoice' : 'Purchase order'}</td>
                  <td className="px-3 py-3 text-slate-700">{document.supplier?.name || '—'}</td>
                  <td className="px-3 py-3 text-slate-600">{new Date(document.uploadedAt).toLocaleDateString()}</td>
                  <td className="px-3 py-3"><span className={`inline-flex border px-2 py-1 text-xs font-semibold ${statusStyle(document.status)}`}>{statusLabel(document.status)}</span></td>
                  <td className="px-3 py-3 text-right"><button type="button" onClick={() => download(document)} title="Download document" aria-label={`Download ${document.filename}`} className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Download className="h-4 w-4" /></button></td>
                </tr>
              ))}
              {!loading && documents.length === 0 && <tr><td colSpan={6} className="px-3 py-12 text-center text-sm text-slate-500">No procurement documents have been uploaded.</td></tr>}
              {loading && <tr><td colSpan={6} className="px-3 py-12 text-center text-sm text-slate-500">Loading document history...</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selected && <section aria-labelledby="selected-document" className="border-t-2 border-slate-900 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="selected-document" className="text-lg font-semibold text-slate-950">{selected.filename}</h2>
              <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${statusStyle(selected.status)}`}>{statusLabel(selected.status)}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{selected.type === 'INVOICE' ? 'Invoice' : 'Purchase order'} · {selected.supplier?.name || 'Supplier not selected'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => download(selected)}><Download className="h-4 w-4" /> Download file</Button>
            {(selected.status === 'FAILED' || (selected.status === 'NEEDS_REVIEW' && selected.extraction?.status !== 'SUCCESS')) && <Button variant="outline" size="sm" disabled={processing} onClick={retry}><RefreshCw className={`h-4 w-4 ${processing ? 'animate-spin' : ''}`} /> Retry</Button>}
          </div>
        </div>

        {selected.status === 'FAILED' && <div className="mt-4 flex gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-semibold">Processing failed</p><p className="mt-1">{selected.processingError || 'We could not extract reliable procurement data from this document.'}</p><p className="mt-1">Enter the document values below; nothing will be imported until you confirm.</p></div>
        </div>}

        <section aria-label="Document extraction result" className="mt-5 space-y-4 border-y border-slate-200 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Extraction result</h3>
            <span className="text-xs text-slate-600">
              {selected.extraction?.method?.replaceAll('_', ' ') || 'Method unavailable'}
              {selected.extraction?.status ? ` · ${statusLabel(selected.extraction.status)}` : ''}
              {selected.extraction?.processedAt ? ` · ${new Date(selected.extraction.processedAt).toLocaleString()}` : ''}
            </span>
          </div>
          {!selected.extraction && <p className="text-sm text-slate-500">No extraction result is available for this document.</p>}
          {selected.extraction?.errorMessage && <p role="alert" className="border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-900">{selected.extraction.errorMessage}</p>}
          {selected.extractedData && <>
            <div className="grid gap-3 sm:grid-cols-2">
              <p className="text-sm text-slate-700">Supplier match: <span className="font-medium">{statusLabel(selected.extractedData.supplierMatchStatus)}</span>{selected.extractedData.supplierName ? ` · ${selected.extractedData.supplierName}` : ''}</p>
              <p className="text-sm text-slate-700">Line items: <span className="font-medium">{selected.extractedData.items.length}</span></p>
            </div>
            {selected.extractedData.items.length > 0 && <div className="overflow-x-auto border border-slate-200">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-slate-50 uppercase text-slate-500"><tr><th className="px-3 py-2">Description / code</th><th className="px-3 py-2">Match</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Unit price</th><th className="px-3 py-2">Line total</th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {selected.extractedData.items.map((item, index) => <tr key={`${item.productCode || item.description || 'line'}-${index}`}>
                    <td className="px-3 py-2 text-slate-800">{item.description || 'Description unavailable'}{item.productCode ? ` · ${item.productCode}` : ''}</td>
                    <td className="px-3 py-2">{statusLabel(item.productMatchStatus)}</td>
                    <td className="px-3 py-2">{item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : 'Not available'}</td>
                    <td className="px-3 py-2">{item.unitPrice || 'Not available'}</td>
                    <td className="px-3 py-2">{item.totalAmount || 'Not available'}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>}
            {selected.extractedData.missingFields.length > 0 && <p className="text-sm text-amber-800">Missing: {selected.extractedData.missingFields.join(', ')}</p>}
            {selected.extractedData.validationWarnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">{selected.extractedData.validationWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>}
          </>}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Extracted source fields</h4>
            {(selected.extraction?.fields ?? []).length > 0 ? <div className="overflow-x-auto border border-slate-200">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-slate-50 uppercase text-slate-500"><tr><th className="px-3 py-2">Field</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Confidence</th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {(selected.extraction?.fields ?? []).map((field, index) => <tr key={`${field.field}-${index}`}>
                    <td className="px-3 py-2 font-medium text-slate-800">{field.field.replaceAll('_', ' ')}</td>
                    <td className="px-3 py-2">{String(field.value)}{field.unit ? ` ${field.unit}` : ''}</td>
                    <td className="max-w-md px-3 py-2 text-slate-600">{field.page ? `Page ${field.page}: ` : ''}{field.sourceText || 'Source snippet unavailable'}</td>
                    <td className="px-3 py-2">{typeof field.confidence === 'number' ? `${Math.round(field.confidence * 100)}%` : 'Not available'}</td>
                  </tr>)}
                </tbody>
              </table>
            </div> : <p className="text-sm text-slate-500">No structured fields were extracted from this document.</p>}
          </div>
          {selected.extraction?.text && <details className="text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">View extracted text</summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">{selected.extraction.text}</pre>
          </details>}
        </section>

        {selected.status === 'IMPORTED' ? <div className="mt-5 flex flex-wrap items-center gap-3 border-y border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-950">
          <Check className="h-5 w-5" /><span>Procurement record imported.</span>
          {selected.purchaseId && <Link className="font-semibold underline" href={`/customer/purchases/${selected.purchaseId}`}>View purchase</Link>}
          {selected.purchaseOrderId && !selected.purchaseId && <span>PO record {selected.purchaseOrderId}</span>}
        </div> : <>
          <form onSubmit={handleReview} className="mt-5 space-y-5">
            <div className="flex flex-col gap-1 border-b border-slate-200 pb-3 sm:flex-row sm:items-baseline sm:justify-between">
              <div><h3 className="text-base font-semibold text-slate-900">Review procurement data</h3><p className="text-xs text-slate-500">Confirm supplier and product before saving the review.</p></div>
              {selected.status === 'NEEDS_REVIEW' && <span className="text-xs font-medium text-amber-800">Review required before importing.</span>}
            </div>

            <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="field-label">Supplier
                <select required value={review.supplierId} onChange={(event) => setReview((current) => ({
                  ...current,
                  supplierId: event.target.value,
                  productId: '',
                  items: (current.items || []).map((item) => ({ ...item, productId: '', unit: '' })),
                }))} className="field-input">
                  <option value="">Select connected supplier</option>
                  {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
                </select>
              </label>
              <label className="field-label">{selected.type === 'INVOICE' ? 'Invoice number' : 'PO number'}
                <input required maxLength={100} value={review.documentNumber} onChange={(event) => setReviewField('documentNumber', event.target.value)} className="field-input" />
              </label>
              <label className="field-label">{selected.type === 'INVOICE' ? 'Invoice date' : 'PO date'}
                <input required type="date" value={review.documentDate} onChange={(event) => setReviewField('documentDate', event.target.value)} className="field-input" />
              </label>
              <label className="field-label">Document total
                <input required type="number" min="0" step="0.01" value={review.totalAmount} onChange={(event) => setReviewField('totalAmount', event.target.value)} className="field-input" />
              </label>
              <label className="field-label">Currency
                <input required minLength={3} maxLength={3} placeholder="USD" value={review.currency} onChange={(event) => setReviewField('currency', event.target.value.toUpperCase())} className="field-input" />
              </label>
              {selected.type === 'INVOICE' ? <label className="field-label">Purchase order number <span className="font-normal text-slate-400">Optional</span>
                <input maxLength={100} value={review.purchaseOrderNumber || ''} onChange={(event) => setReviewField('purchaseOrderNumber', event.target.value)} className="field-input" />
              </label> : <label className="field-label">Expected delivery date <span className="font-normal text-slate-400">Optional</span>
                <input type="date" value={review.expectedDeliveryDate || ''} onChange={(event) => setReviewField('expectedDeliveryDate', event.target.value)} className="field-input" />
              </label>}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h4 className="text-sm font-semibold text-slate-900">Line items</h4><p className="text-xs text-slate-500">Match each line to an active product. Imported transaction prices are kept from this reviewed document.</p></div>
                <Button type="button" variant="outline" size="sm" onClick={addReviewItem}>Add line item</Button>
              </div>
              {(review.items || []).map((item, index) => <fieldset key={`review-line-${index}`} className="grid gap-3 border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <legend className="px-1 text-xs font-semibold text-slate-700">Line {index + 1}</legend>
                <label className="field-label">Product
                  <select required value={item.productId} onChange={(event) => setReviewItem(index, 'productId', event.target.value)} className="field-input" disabled={!review.supplierId}>
                    <option value="">Select supplier product</option>
                    {products.map((product) => <option key={product._id} value={product._id}>{product.name}{product.productCode ? ` · ${product.productCode}` : ''}</option>)}
                  </select>
                  {review.supplierId && !products.length && <span className="text-xs font-normal text-amber-800">No active products. <Link className="underline" href="/customer/products">Open product management</Link></span>}
                </label>
                <label className="field-label">Description
                  <input required maxLength={500} value={item.description} onChange={(event) => setReviewItem(index, 'description', event.target.value)} className="field-input" />
                </label>
                <label className="field-label">Product code <span className="font-normal text-slate-400">Optional</span>
                  <input maxLength={100} value={item.productCode || ''} onChange={(event) => setReviewItem(index, 'productCode', event.target.value)} className="field-input" />
                </label>
                <label className="field-label">Quantity
                  <input required type="number" min="0.00000001" step="any" value={item.quantity} onChange={(event) => setReviewItem(index, 'quantity', event.target.value)} className="field-input" />
                </label>
                <label className="field-label">Unit (verify against product)
                  <input required maxLength={40} value={item.unit} onChange={(event) => setReviewItem(index, 'unit', event.target.value)} className="field-input" />
                  <span className="text-xs font-normal text-slate-500">Must match the selected product. No unit or quantity conversion is applied automatically.</span>
                </label>
                <label className="field-label">Historical unit price
                  <input required type="number" min="0" step="any" value={item.unitPrice} onChange={(event) => setReviewItem(index, 'unitPrice', event.target.value)} className="field-input" />
                </label>
                <label className="field-label">Line total
                  <input required type="number" min="0" step="0.01" value={item.totalAmount} onChange={(event) => setReviewItem(index, 'totalAmount', event.target.value)} className="field-input" />
                </label>
                {review.items && review.items.length > 1 && <div className="flex items-end"><Button type="button" variant="outline" size="sm" onClick={() => removeReviewItem(index)}>Remove line</Button></div>}
              </fieldset>)}
              {!products.length && review.supplierId && <p className="text-sm text-amber-800">No active supplier products are available to match these lines.</p>}
            </div>
            {(selected.extractedData?.validationWarnings || review.validationWarnings || []).length > 0 && <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold">Review extraction warnings before importing</p>
              <ul className="mt-1 list-disc pl-5">{[...(selected.extractedData?.validationWarnings || []), ...(review.validationWarnings || [])].filter((warning, index, warnings) => warnings.indexOf(warning) === index).map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>}

            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <Button type="submit" variant="outline" disabled={savingReview || importing}>
                {savingReview ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {savingReview ? 'Saving review...' : 'Save review'}
              </Button>
              <Button type="button" disabled={selected.status !== 'NEEDS_REVIEW' || savingReview || importing} onClick={handleImport}>
                {importing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {importing ? 'Importing...' : 'Import procurement record'}
              </Button>
            </div>
          </form>
        </>}
      </section>}

      <style jsx>{`
        .field-label { display: flex; flex-direction: column; gap: 0.45rem; color: #334155; font-size: 0.75rem; font-weight: 600; }
        .field-input { width: 100%; height: 2.5rem; border: 1px solid #cbd5e1; background: white; padding: 0 0.7rem; color: #0f172a; font-size: 0.875rem; font-weight: 400; outline: none; }
        .field-input:focus { border-color: #047857; box-shadow: 0 0 0 1px #047857; }
        .field-input:disabled { background: #f1f5f9; color: #64748b; }
      `}</style>
    </div>
  );
}