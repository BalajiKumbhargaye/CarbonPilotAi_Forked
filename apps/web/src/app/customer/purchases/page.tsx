'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Edit2, Search, ShoppingCart, Plus } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { MetricCard } from '@/components/ui/MetricCard';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { PurchaseForm } from '@/components/procurement/PurchaseForm';
import { getSuppliers, type SupplierDirectoryItem } from '@/lib/suppliers';
import { getProducts, type ProductItem } from '@/lib/products';
import {
  createPurchase,
  getPurchaseSummary,
  getPurchases,
  updatePurchase,
  updatePurchaseStatus,
  type PurchaseFilters,
  type PurchaseInput,
  type PurchaseItem,
  type PurchaseStatus,
  type PurchaseSummary,
} from '@/lib/procurement';

const statusOptions = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

function formatMoney(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${currency} ${amount}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function StatusLabel({ status }: { status: PurchaseStatus }) {
  const className = status === 'COMPLETED' || status === 'CONFIRMED' || status === 'DELIVERED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === 'CANCELLED'
      ? 'border-slate-300 bg-slate-100 text-slate-600'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${className}`}>{status}</span>;
}

export default function CustomerPurchasesPage() {
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [summary, setSummary] = useState<PurchaseSummary | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierDirectoryItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [filters, setFilters] = useState<PurchaseFilters>({ search: '', supplierId: '', productId: '', status: '', startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<PurchaseItem | 'new' | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getSuppliers(), getProducts()]).then(([supplierItems, productItems]) => {
      if (!active) return;
      setSuppliers(supplierItems);
      setProducts(productItems);
    }).catch(() => {
      if (active) setError('Unable to load procurement filters. Please try again.');
    });
    return () => { active = false; };
  }, [retryCount]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([getPurchases(filters), getPurchaseSummary()]).then(([items, totals]) => {
      if (!active) return;
      setPurchases(items);
      setSummary(totals);
    }).catch(() => {
      if (active) setError('Unable to load procurement records. Please try again.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, retryCount]);

  const setFilter = (key: keyof PurchaseFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const refresh = async () => {
    const [items, totals] = await Promise.all([getPurchases(filters), getPurchaseSummary()]);
    setPurchases(items);
    setSummary(totals);
  };
  const save = async (payload: PurchaseInput) => {
    setSaving(true);
    setError('');
    try {
      if (editor && editor !== 'new') {
        await updatePurchase(editor._id, payload);
        setNotice('Purchase updated successfully.');
      } else {
        await createPurchase(payload);
        setNotice('Purchase created successfully.');
      }
      setEditor(null);
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save purchase. Please try again.');
    } finally { setSaving(false); }
  };
  const changeStatus = async (purchase: PurchaseItem, status: PurchaseStatus) => {
    try {
      const updated = await updatePurchaseStatus(purchase._id, status);
      setPurchases((current) => current.map((item) => item._id === purchase._id ? updated : item));
      setNotice('Purchase status updated.');
      setSummary(await getPurchaseSummary());
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to update purchase status. Please try again.');
    }
  };

  const purchaseValue = summary?.totalPurchaseValueByCurrency.length
    ? summary.totalPurchaseValueByCurrency.map((item) => formatMoney(item.amount, item.currency)).join(' · ')
    : '—';
  const quantityValue = summary?.totalQuantityByUnit.length
    ? summary.totalQuantityByUnit.map((item) => `${Number(item.quantity).toLocaleString()} ${item.unit}`).join(' · ')
    : '—';

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Procurement', href: '/customer/purchases' }, { label: 'Purchases' }]} />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Procurement</h1><p className="mt-1 text-sm text-slate-500">Record and manage purchases from connected suppliers.</p></div><Button size="sm" className="self-start" onClick={() => { setError(''); setEditor('new'); }}><Plus className="h-4 w-4" /> Create purchase</Button></header>
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total Purchase Value" value={summary ? purchaseValue : '—'} change="Grouped by currency; no conversion" isPositive icon={ShoppingCart} />
        <MetricCard title="Purchases" value={summary ? String(summary.totalPurchases) : '—'} change="Excludes cancelled records" isPositive icon={ShoppingCart} />
        <MetricCard title="Total Quantity" value={summary ? quantityValue : '—'} change="Grouped by product unit" isPositive icon={ShoppingCart} />
        <MetricCard title="Active Suppliers" value={summary ? String(summary.activeSuppliers) : '—'} change="Connected to this organization" isPositive icon={ShoppingCart} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="relative"><Input aria-label="Search purchases" placeholder="Search supplier, product, reference" value={filters.search || ''} onChange={(event) => setFilter('search', event.target.value)} className="pl-9" /><Search className="pointer-events-none -mt-7 ml-3 h-4 w-4 text-slate-400" /></div>
        <Select aria-label="Filter by supplier" value={filters.supplierId || ''} onChange={(event) => { setFilter('supplierId', event.target.value); setFilter('productId', ''); }} options={[{ label: 'All suppliers', value: '' }, ...suppliers.map((supplier) => ({ label: supplier.companyName, value: supplier._id }))]} />
        <Select aria-label="Filter by product" value={filters.productId || ''} onChange={(event) => setFilter('productId', event.target.value)} options={[{ label: 'All products', value: '' }, ...products.filter((product) => !filters.supplierId || product.supplierId === filters.supplierId).map((product) => ({ label: product.name, value: product._id }))]} />
        <Select aria-label="Filter by purchase status" value={filters.status || ''} onChange={(event) => setFilter('status', event.target.value)} options={[{ label: 'All statuses', value: '' }, ...statusOptions]} />
        <Input aria-label="Start date" type="date" value={filters.startDate || ''} onChange={(event) => setFilter('startDate', event.target.value)} />
        <Input aria-label="End date" type="date" value={filters.endDate || ''} onChange={(event) => setFilter('endDate', event.target.value)} />
      </div>

      {loading ? <LoadingState message="Loading procurement records..." /> : error && !purchases.length ? (
        <div className="py-8 text-center"><p className="text-sm text-slate-600">Unable to load procurement records. Please try again.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => setRetryCount((value) => value + 1)}>Try again</Button></div>
      ) : purchases.length ? (
        <div className="overflow-x-auto border-y border-slate-200 dark:border-slate-800"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60"><tr><th className="px-4 py-3">Date / Reference</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Unit price</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{purchases.map((purchase) => <tr key={purchase._id}><td className="px-4 py-4"><Link href={`/customer/purchases/${purchase._id}`} className="font-semibold text-slate-900 hover:text-emerald-700 dark:text-slate-100">{purchase.referenceNumber || 'Purchase'}</Link><span className="mt-1 block text-xs text-slate-500">{formatDate(purchase.purchaseDate)}</span></td><td className="px-4 py-4 text-slate-700 dark:text-slate-300">{purchase.supplierOrganization?.name || '—'}</td><td className="px-4 py-4 text-slate-700 dark:text-slate-300">{purchase.product?.name || '—'}</td><td className="px-4 py-4">{Number(purchase.quantity).toLocaleString()} {purchase.unit}</td><td className="px-4 py-4">{formatMoney(purchase.unitPrice, purchase.currency)} / {purchase.unit}</td><td className="px-4 py-4 font-semibold">{formatMoney(purchase.totalAmount, purchase.currency)}</td><td className="px-4 py-4"><div className="space-y-2"><StatusLabel status={purchase.status} /><Select aria-label={`Change ${purchase.referenceNumber || 'purchase'} status`} className="h-8 min-w-32 text-xs" value={purchase.status} options={statusOptions} disabled={!['DRAFT', 'CONFIRMED', 'PENDING'].includes(purchase.status)} onChange={(event) => changeStatus(purchase, event.target.value as PurchaseStatus)} /></div></td><td className="px-4 py-4">{['DRAFT', 'CONFIRMED', 'PENDING'].includes(purchase.status) && <Button variant="ghost" size="sm" aria-label={`Edit ${purchase.referenceNumber || 'purchase'}`} onClick={() => setEditor(purchase)}><Edit2 className="h-4 w-4" /></Button>}</td></tr>)}</tbody></table></div>
      ) : (
        <div className="border-y border-slate-200 py-14 text-center dark:border-slate-800"><ShoppingCart className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">No purchases found.</h2><p className="mt-1 text-sm text-slate-500">Create your first procurement record.</p><Button size="sm" className="mt-4" onClick={() => setEditor('new')}><Plus className="h-4 w-4" /> Create purchase</Button></div>
      )}

      <Modal isOpen={Boolean(editor)} onClose={() => setEditor(null)} title={editor === 'new' ? 'Create purchase' : 'Edit purchase'} description="Purchase amount is calculated by the server from quantity and unit price." className="max-h-[90vh] overflow-y-auto"><PurchaseForm key={editor === 'new' ? 'new-purchase' : editor?._id} purchase={editor && editor !== 'new' ? editor : null} suppliers={suppliers} isSubmitting={saving} submitLabel={editor === 'new' ? 'Create purchase' : 'Save changes'} onSubmit={save} /></Modal>
    </div>
  );
}
