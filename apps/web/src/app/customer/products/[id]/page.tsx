'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Edit2, Package } from 'lucide-react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { ProductForm } from '@/components/products/ProductForm';
import { getSuppliers, type SupplierDirectoryItem } from '@/lib/suppliers';
import { getProductCategories, getProduct, updateProduct, type ProductCategory, type ProductInput, type ProductItem } from '@/lib/products';
import { getPurchases, type PurchaseItem } from '@/lib/procurement';

export default function BuyerProductDetailsPage({ params }: { params: { id: string } }) {
  const [product, setProduct] = useState<ProductItem | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([getProduct(params.id), getProductCategories(), getSuppliers()]).then(([item, categoryItems, supplierItems]) => {
      if (!active) return;
      setProduct(item);
      setCategories(categoryItems);
      setSuppliers(supplierItems);
      if (supplierItems.some((supplier) => supplier._id === item.supplierId)) {
        getPurchases({ productId: params.id }).then((items) => {
          if (active) setPurchases(items);
        }).catch(() => {
          if (active) setHistoryError('Unable to load procurement history.');
        });
      }
    }).catch(() => {
      if (active) setError('Unable to load product. Please try again.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [params.id, retryCount]);

  const save = async (payload: ProductInput) => {
    setSaving(true);
    setError('');
    try {
      const updated = await updateProduct(params.id, payload);
      setProduct(updated);
      setEditing(false);
      setNotice('Product updated successfully.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update product. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState message="Loading product..." />;
  if (!product) return <div className="space-y-4 py-10 text-center"><p role="alert" className="text-sm text-rose-700">{error || 'Product not found.'}</p><Button variant="outline" size="sm" onClick={() => setRetryCount((value) => value + 1)}>Try again</Button></div>;
  const canManage = suppliers.some((supplier) => supplier._id === product.supplierId);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Products', href: '/customer/products' }, { label: product.name }]} />
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800">
        <div className="flex items-start gap-3"><span className="rounded-md bg-emerald-50 p-2 text-emerald-700"><Package className="h-5 w-5" /></span><div><h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{product.name}</h1><p className="mt-1 text-sm text-slate-500">{product.supplier.name} · {product.category}</p></div></div>
        <div className="flex gap-2"><Link href="/customer/products"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4" /> Products</Button></Link>{canManage && <Button size="sm" onClick={() => setEditing(true)}><Edit2 className="h-4 w-4" /> Edit product</Button>}</div>
      </header>

      <section className="space-y-3"><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Basic information</h2><Card><CardContent className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3"><Info label="Product" value={product.name} /><Info label="Supplier" value={product.supplier.name} /><Info label="Category" value={product.category} /><Info label="Product code" value={product.productCode || '—'} /><Info label="Unit" value={product.unit} /><Info label="Supplier price per unit" value={product.sellingPrice !== undefined && product.currency ? formatUnitPrice(product.sellingPrice, product.currency) : 'Not set'} /><Info label="Status" value={product.status === 'ACTIVE' ? 'Active' : 'Inactive'} /><Info label="Description" value={product.description || '—'} /></CardContent></Card></section>

      <div className="grid gap-4 sm:grid-cols-2">
        <EmptySection title="Carbon Data">No carbon data available yet.</EmptySection>
        <EmptySection title="Evidence">No evidence available yet.</EmptySection>
        <EmptySection title="Supplier Performance">No performance data available yet.</EmptySection>
      </div>

      {canManage && <section className="space-y-3"><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Procurement History</h2><Card><CardContent className="p-0">{historyError ? <p role="alert" className="p-5 text-sm text-rose-700">{historyError}</p> : purchases.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60"><tr><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Amount</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{purchases.map((purchase) => <tr key={purchase._id}><td className="px-4 py-3">{purchase.supplierOrganization?.name || '—'}</td><td className="px-4 py-3">{new Date(purchase.purchaseDate).toLocaleDateString()}</td><td className="px-4 py-3">{purchase.referenceNumber || '—'}</td><td className="px-4 py-3">{Number(purchase.quantity).toLocaleString()} {purchase.unit}</td><td className="px-4 py-3 font-medium">{formatMoney(purchase.totalAmount, purchase.currency)}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">No procurement records yet.</p>}</CardContent></Card></section>}

      {canManage && <Modal isOpen={editing} onClose={() => setEditing(false)} title="Edit product" description="Update the product information while keeping it assigned to its supplier." className="max-h-[90vh] overflow-y-auto">
        <ProductForm key={product._id} product={product} categories={categories} setCategories={setCategories} suppliers={suppliers} supplierMode={false} isSubmitting={saving} submitLabel="Save changes" onSubmit={save} />
      </Modal>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{value}</p></div>;
}

function EmptySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><p className="py-3 text-sm text-slate-500">{children}</p></CardContent></Card>;
}

function formatMoney(amount: string, currency: string) {
  const value = Number(amount);
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${amount}`; }
}

function formatUnitPrice(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 8 }).format(amount); }
  catch { return `${currency} ${amount}`; }
}
