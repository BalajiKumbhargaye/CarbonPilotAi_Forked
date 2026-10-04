'use client';

import { useEffect, useState } from 'react';
import { Building2, Edit2, Globe, MapPin, Package } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SupplierForm } from '@/components/suppliers/SupplierForm';
import { getPurchases, type PurchaseItem } from '@/lib/procurement';
import {
  getSupplier,
  getSupplierCarbonProfile,
  updateSupplier,
  updateSupplierStatus,
  type SupplierCarbonProfile,
  type SupplierDirectoryItem,
  type SupplierInput,
  type SupplierStatus,
} from '@/lib/suppliers';

interface SupplierDetails extends SupplierDirectoryItem {
  products: Array<{ _id: string; name: string; productCode: string; category: string }>;
}

const statusOptions = [
  { label: 'Invited', value: 'INVITED' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Inactive', value: 'INACTIVE' },
];

export default function SupplierProfilePage({ params }: { params: { id: string } }) {
  const [supplier, setSupplier] = useState<SupplierDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [carbonProfile, setCarbonProfile] = useState<SupplierCarbonProfile | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getSupplier(params.id).then((result) => {
      if (active) setSupplier(result);
    }).catch(() => {
      if (active) setError('Unable to load supplier. Please try again.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    getSupplierCarbonProfile(params.id).then((result) => {
      if (active) setCarbonProfile(result);
    }).catch(() => {
      if (active) setCarbonProfile(null);
    });
    getPurchases({ supplierId: params.id }).then((items) => {
      if (active) setPurchases(items);
    }).catch(() => {
      if (active) setHistoryError('Unable to load purchase history.');
    });
    return () => { active = false; };
  }, [params.id, retryCount]);

  const save = async (values: SupplierInput) => {
    setSaving(true);
    setError('');
    try {
      const updated = await updateSupplier(params.id, values);
      setSupplier((current) => current ? { ...current, ...updated } : null);
      setEditing(false);
      setNotice('Supplier updated successfully.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update supplier. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: SupplierStatus) => {
    if (!supplier) return;
    setError('');
    try {
      setSupplier((current) => current ? { ...current, status } : null);
      const updated = await updateSupplierStatus(supplier._id, status);
      setSupplier((current) => current ? { ...current, ...updated } : null);
      setNotice('Supplier status updated.');
    } catch {
      setError('Unable to update supplier status. Please try again.');
      setSupplier((current) => current ? { ...current, status: supplier.status } : null);
    }
  };

  if (loading) return <LoadingState message="Loading supplier..." />;
  if (!supplier) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p role="alert" className="text-sm text-rose-700">{error || 'Supplier not found.'}</p>
        <Button variant="outline" size="sm" onClick={() => setRetryCount((value) => value + 1)}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Suppliers', href: '/customer/suppliers' }, { label: supplier.companyName }]} />
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Building2 className="h-5 w-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{supplier.companyName}</h1>
              <StatusBadge status={supplier.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{supplier.category || supplier.industry}</p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[supplier.city, supplier.country].filter(Boolean).join(', ') || 'Location not provided'}</span>
              {supplier.website && <a className="inline-flex items-center gap-1 hover:text-emerald-700" href={supplier.website} target="_blank" rel="noreferrer"><Globe className="h-3.5 w-3.5" />Website</a>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Supplier status"
            className="w-36"
            value={supplier.status === 'TERMINATED' ? 'INACTIVE' : supplier.status}
            options={statusOptions}
            onChange={(event) => changeStatus(event.target.value as SupplierStatus)}
          />
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit2 className="h-4 w-4" /> Edit supplier</Button>
        </div>
      </header>

      <section aria-labelledby="supplier-overview" className="space-y-3">
        <h2 id="supplier-overview" className="text-base font-semibold text-slate-900 dark:text-slate-100">Overview</h2>
        <Card>
          <CardContent className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <OverviewField label="Company" value={supplier.legalName ? `${supplier.companyName} (${supplier.legalName})` : supplier.companyName} />
            <OverviewField label="Industry" value={supplier.industry} />
            <OverviewField label="Location" value={[supplier.city, supplier.country].filter(Boolean).join(', ')} />
            <OverviewField label="Contact person" value={supplier.contactPerson} />
            <OverviewField label="Contact email" value={supplier.contactEmail} />
            <OverviewField label="Contact phone" value={supplier.contactPhone} />
            <OverviewField label="Connected" value={supplier.connectedAt ? new Date(supplier.connectedAt).toLocaleDateString() : '—'} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="supplier-products" className="space-y-3">
        <h2 id="supplier-products" className="text-base font-semibold text-slate-900 dark:text-slate-100">Products</h2>
        <Card>
          <CardHeader>
            <CardTitle>Supplier products</CardTitle>
            <CardDescription>{supplier.products.length} products</CardDescription>
          </CardHeader>
          <CardContent>
            {supplier.products.length ? (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {supplier.products.map((product) => <div key={product._id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><Package className="h-4 w-4 text-slate-400" /><div><p className="text-sm font-medium text-slate-800 dark:text-slate-200">{product.name}</p><p className="text-xs text-slate-500">{product.productCode} · {product.category}</p></div></div>)}
              </div>
            ) : <EmptyState>No products added yet.</EmptyState>}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Purchase History</h2>
        <Card>
          <CardContent className="p-0">
            {historyError ? <p role="alert" className="p-5 text-sm text-rose-700">{historyError}</p> : purchases.length ? (
              <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Amount</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{purchases.map((purchase) => <tr key={purchase._id}><td className="px-4 py-3">{new Date(purchase.purchaseDate).toLocaleDateString()}</td><td className="px-4 py-3">{purchase.referenceNumber || '—'}</td><td className="px-4 py-3">{purchase.product?.name || '—'}</td><td className="px-4 py-3">{Number(purchase.quantity).toLocaleString()} {purchase.unit}</td><td className="px-4 py-3 font-medium">{formatMoney(purchase.totalAmount, purchase.currency)}</td></tr>)}</tbody></table></div>
            ) : <EmptyState>No purchase records yet.</EmptyState>}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="carbon-profile" className="space-y-3">
        <h2 id="carbon-profile" className="text-base font-semibold text-slate-900 dark:text-slate-100">Carbon &amp; Sustainability Profile</h2>
        {carbonProfile ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <InfoCard label="Products with carbon data" value={String(carbonProfile.carbonData?.numberOfProductsWithCarbonData ?? 0)} />
              <InfoCard label="Products missing carbon data" value={String(carbonProfile.carbonData?.productsWithMissingCarbonData ?? 0)} />
              <InfoCard label="Completed data requests" value={`${carbonProfile.dataCompleteness?.submitted ?? 0}/${carbonProfile.dataCompleteness?.requested ?? 0}`} />
              <InfoCard label="Completeness" value={`${carbonProfile.dataCompleteness?.completeness ?? 0}%`} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Product-level carbon summary</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {carbonProfile.productSummary?.length ? (
                    <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3">Carbon intensity</th><th className="px-4 py-3">Evidence</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{carbonProfile.productSummary.map((item) => <tr key={item.product}><td className="px-4 py-3 font-medium">{item.product}</td><td className="px-4 py-3">{item.unit}</td><td className="px-4 py-3">{item.carbonIntensity != null ? `${item.carbonIntensity} ${item.functionalUnit}` : 'Not available'}</td><td className="px-4 py-3"><StatusBadge status={item.evidenceStatus === 'NOT_AVAILABLE' ? 'Pending' : item.evidenceStatus} /></td></tr>)}</tbody></table></div>
                  ) : <EmptyState>No carbon data available for this supplier.</EmptyState>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Certificate summary</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {carbonProfile.certificateSummary?.length ? (
                    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60"><tr><th className="px-4 py-3">Certificate</th><th className="px-4 py-3">Issuer</th><th className="px-4 py-3">Expiry</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{carbonProfile.certificateSummary.map((certificate) => <tr key={`${certificate.certificateNumber ?? 'certificate'}-${certificate.issuer ?? 'issuer'}`}><td className="px-4 py-3">{String(certificate.certificate ?? certificate.certificateNumber ?? 'Certificate')}</td><td className="px-4 py-3">{String(certificate.issuer ?? '—')}</td><td className="px-4 py-3">{certificate.expiryDate ? new Date(String(certificate.expiryDate)).toLocaleDateString() : '—'}</td><td className="px-4 py-3"><StatusBadge status={String(certificate.status ?? 'Pending')} /></td></tr>)}</tbody></table></div>
                  ) : <EmptyState>No certificates recorded.</EmptyState>}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Data completeness</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm"><span>Requested</span><span className="font-medium">{carbonProfile.dataCompleteness?.requested ?? 0}</span></div>
                  <div className="flex items-center justify-between text-sm"><span>Submitted</span><span className="font-medium">{carbonProfile.dataCompleteness?.submitted ?? 0}</span></div>
                  <div className="flex items-center justify-between text-sm"><span>Missing</span><span className="font-medium">{carbonProfile.dataCompleteness?.missing ?? 0}</span></div>
                  <div className="flex items-center justify-between text-sm"><span>Completeness</span><span className="font-medium">{carbonProfile.dataCompleteness?.completeness ?? 0}%</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Questionnaire summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {carbonProfile.questionnaireSummary?.length ? carbonProfile.questionnaireSummary.map((item) => <div key={item.category} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"><span className="font-medium">{item.category}</span><span>{item.status === 'COMPLETE' ? '✓ Complete' : item.status === 'MISSING_REQUIRED_RESPONSE' ? '⚠ Missing required response' : item.status === 'EXPIRED_CERTIFICATE' ? '⚠ Expired certificate' : 'Not requested'}</span></div>) : <EmptyState>No questionnaire data available.</EmptyState>}
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <EmptySection title="Carbon & Sustainability Profile">Carbon data will appear here once supplier carbon records are available.</EmptySection>
        )}
      </section>

      <Modal isOpen={editing} onClose={() => setEditing(false)} title="Edit supplier" description="Update supplier details connected to your organization." className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <SupplierForm key={supplier._id} supplier={supplier} onSubmit={save} isSubmitting={saving} submitLabel="Save changes" />
      </Modal>
    </div>
  );
}

function OverviewField({ label, value }: { label: string; value?: string }) {
  return <div><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{value || '—'}</p></div>;
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-5 text-sm text-slate-500">{children}</p>;
}

function EmptySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><EmptyState>{children}</EmptyState></CardContent></Card>;
}

function formatMoney(amount: string, currency: string) {
  const value = Number(amount);
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${amount}`; }
}
