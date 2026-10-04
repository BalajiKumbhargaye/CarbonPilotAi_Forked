'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Edit2, ShoppingCart } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { PurchaseForm } from '@/components/procurement/PurchaseForm';
import { getSuppliers, type SupplierDirectoryItem } from '@/lib/suppliers';
import { getPurchase, getPurchaseCarbonTracking, updatePurchase, updatePurchaseStatus, type PurchaseCarbonTrackingRecord, type PurchaseInput, type PurchaseItem, type PurchaseStatus } from '@/lib/procurement';

const statuses = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function PurchaseDetailsPage({ params }: { params: { id: string } }) {
  const [purchase, setPurchase] = useState<PurchaseItem | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tracking, setTracking] = useState<PurchaseCarbonTrackingRecord | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([getPurchase(params.id), getSuppliers(), getPurchaseCarbonTracking(params.id)]).then(([record, supplierItems, trackingRecord]) => {
      if (!active) return;
      setPurchase(record);
      setSuppliers(supplierItems);
      setTracking(trackingRecord);
    }).catch(() => { if (active) setError('Unable to load purchase. Please try again.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.id, retry]);

  const save = async (payload: PurchaseInput) => {
    setSaving(true);
    setError('');
    try {
      setPurchase(await updatePurchase(params.id, payload));
      setEditing(false);
      setNotice('Purchase updated successfully.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update purchase. Please try again.');
    } finally { setSaving(false); }
  };

  const changeStatus = async (status: PurchaseStatus) => {
    try {
      setPurchase(await updatePurchaseStatus(params.id, status));
      setNotice('Purchase status updated.');
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to update purchase status. Please try again.');
    }
  };

  if (loading) return <LoadingState message="Loading purchase..." />;
  if (!purchase) return <div className="space-y-4 py-10 text-center"><p role="alert" className="text-sm text-rose-700">{error || 'Purchase not found.'}</p><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Try again</Button></div>;
  const editable = ['DRAFT', 'CONFIRMED', 'PENDING'].includes(purchase.status);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Procurement', href: '/customer/purchases' }, { label: purchase.referenceNumber || 'Purchase' }]} />
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800">
        <div className="flex items-start gap-3"><span className="rounded-md bg-emerald-50 p-2 text-emerald-700"><ShoppingCart className="h-5 w-5" /></span><div><h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{purchase.referenceNumber || 'Purchase'}</h1><p className="mt-1 text-sm text-slate-500">{purchase.product?.name || 'Product'} · {purchase.supplierOrganization?.name || 'Supplier'}</p></div></div>
        <div className="flex items-center gap-2"><Link href="/customer/purchases"><Button size="sm" variant="outline"><ArrowLeft className="h-4 w-4" /> Purchases</Button></Link><Select aria-label="Purchase status" value={purchase.status} options={statuses} disabled={!editable} onChange={(event) => changeStatus(event.target.value as PurchaseStatus)} />{editable && <Button size="sm" onClick={() => setEditing(true)}><Edit2 className="h-4 w-4" /> Edit purchase</Button>}</div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Purchase</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Info label="Reference" value={purchase.referenceNumber || '—'} /><Info label="Date" value={new Date(purchase.purchaseDate).toLocaleDateString()} /><Info label="Status" value={purchase.status} /><Info label="Reporting period" value={purchase.reportingPeriod || '—'} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Supplier</CardTitle></CardHeader><CardContent><Info label="Company" value={purchase.supplierOrganization?.name || '—'} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Product</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Info label="Name" value={purchase.product?.name || '—'} /><Info label="Category" value={purchase.product?.category || '—'} /><Info label="Product code" value={purchase.product?.productCode || '—'} /><Info label="Unit" value={purchase.unit} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Commercial data</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Info label="Quantity" value={`${Number(purchase.quantity).toLocaleString()} ${purchase.unit}`} /><Info label="Unit price" value={`${formatMoney(purchase.unitPrice, purchase.currency)} / ${purchase.unit}`} /><Info label="Total" value={formatMoney(purchase.totalAmount, purchase.currency)} /><Info label="Currency" value={purchase.currency} /></CardContent></Card>
      </div>

      {tracking && (
        <Card>
          <CardHeader>
            <CardTitle>Expected vs Actual Carbon Tracking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Expected Carbon</p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{tracking.expected.emissions != null ? `${tracking.expected.emissions.toLocaleString()} kgCO2e` : 'N/A'}</p>
                <p className="mt-1 text-sm text-slate-500">{tracking.expected.quantity ?? '—'} {purchase.unit} × {tracking.expected.carbonIntensity ?? '—'} {tracking.expected.carbonIntensityUnit || 'kgCO2e/kg'}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Calculated Actual Carbon</p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{tracking.actual.emissions != null ? `${tracking.actual.emissions.toLocaleString()} kgCO2e` : 'N/A'}</p>
                <p className="mt-1 text-sm text-slate-500">{tracking.actual.quantity ?? '—'} {purchase.unit} × {tracking.actual.carbonIntensity ?? '—'} {tracking.actual.carbonIntensityUnit || 'kgCO2e/kg'}</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Info label="Variance" value={tracking.variance != null ? `${tracking.variance > 0 ? '+' : ''}${tracking.variance.toLocaleString()} kgCO2e` : 'N/A'} />
              <Info label="Variance %" value={tracking.variancePercent != null ? `${tracking.variancePercent > 0 ? '+' : ''}${tracking.variancePercent}%` : 'N/A'} />
              <Info label="Status" value={tracking.status} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Lifecycle boundary" value={tracking.expected.lifecycleBoundary || tracking.actual.lifecycleBoundary || '—'} />
              <Info label="Functional unit" value={tracking.expected.functionalUnit || tracking.actual.functionalUnit || '—'} />
              <Info label="Evidence" value={tracking.expected.evidenceStatus || tracking.actual.evidenceStatus || 'NOT_AVAILABLE'} />
              <Info label="Source of variance" value={tracking.sourceOfVariance || 'NONE'} />
            </div>
            {tracking.comparisonReason && <p className="text-sm text-slate-600 dark:text-slate-300">{tracking.comparisonReason}</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3"><EmptySection title="Carbon">No carbon calculation available yet.</EmptySection><EmptySection title="Evidence">No evidence associated yet.</EmptySection><EmptySection title="Procurement Decision">No decision record yet.</EmptySection></div>
      {purchase.notes && <Card><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{purchase.notes}</p></CardContent></Card>}

      <Modal isOpen={editing} onClose={() => setEditing(false)} title="Edit purchase" description="Supplier and product assignments stay fixed after purchase creation." className="max-h-[90vh] overflow-y-auto"><PurchaseForm key={purchase._id} purchase={purchase} suppliers={suppliers} isSubmitting={saving} submitLabel="Save changes" onSubmit={save} /></Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{value}</p></div>; }
function EmptySection({ title, children }: { title: string; children: React.ReactNode }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><p className="py-3 text-sm text-slate-500">{children}</p></CardContent></Card>; }
function formatMoney(amount: string, currency: string) { const value = Number(amount); try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); } catch { return `${currency} ${amount}`; } }
