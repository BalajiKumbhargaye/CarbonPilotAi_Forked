'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { getProducts, type ProductItem } from '@/lib/products';
import type { SupplierDirectoryItem } from '@/lib/suppliers';
import type { PurchaseInput, PurchaseItem, PurchaseStatus } from '@/lib/procurement';

const statusOptions = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

function dateInputValue(value?: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toISOString().slice(0, 10);
}

export function PurchaseForm({
  purchase,
  suppliers,
  isSubmitting,
  submitLabel,
  onSubmit,
}: {
  purchase?: PurchaseItem | null;
  suppliers: SupplierDirectoryItem[];
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (payload: PurchaseInput) => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState(purchase?.supplierId || '');
  const [productId, setProductId] = useState(purchase?.productId || '');
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [quantity, setQuantity] = useState(purchase ? String(purchase.quantity) : '');
  const [unitPrice, setUnitPrice] = useState(purchase?.unitPrice || '');
  const [currency, setCurrency] = useState(purchase?.currency || '');
  const [purchaseDate, setPurchaseDate] = useState(dateInputValue(purchase?.purchaseDate));
  const [referenceNumber, setReferenceNumber] = useState(purchase?.referenceNumber || '');
  const [notes, setNotes] = useState(purchase?.notes || '');
  const [status, setStatus] = useState<PurchaseStatus>(purchase?.status || 'CONFIRMED');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productError, setProductError] = useState('');

  useEffect(() => {
    setSupplierId(purchase?.supplierId || '');
    setProductId(purchase?.productId || '');
    setQuantity(purchase ? String(purchase.quantity) : '');
    setUnitPrice(purchase?.unitPrice || '');
    setCurrency(purchase?.currency || '');
    setPurchaseDate(dateInputValue(purchase?.purchaseDate));
    setReferenceNumber(purchase?.referenceNumber || '');
    setNotes(purchase?.notes || '');
    setStatus(purchase?.status || 'CONFIRMED');
  }, [purchase]);

  useEffect(() => {
    if (!supplierId || purchase) {
      setProducts([]);
      return;
    }
    let active = true;
    setLoadingProducts(true);
    setProductError('');
    getProducts({ supplierId, status: 'ACTIVE' }).then((items) => {
      if (active) setProducts(items);
    }).catch(() => {
      if (active) setProductError('Unable to load products for this supplier. Please try again.');
    }).finally(() => {
      if (active) setLoadingProducts(false);
    });
    return () => { active = false; };
  }, [supplierId, purchase]);

  const selectedProduct = purchase?.product || products.find((item) => item._id === productId) || null;
  const activeSuppliers = suppliers.filter((supplier) => supplier.status === 'ACTIVE');
  const previewAmount = Number(quantity) * Number(unitPrice);
  const preview = Number.isFinite(previewAmount) && quantity && unitPrice
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD', maximumFractionDigits: 2 }).format(previewAmount)
    : '—';
  const editable = !purchase || ['DRAFT', 'CONFIRMED', 'PENDING'].includes(purchase.status);

  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      await onSubmit({
        supplierId,
        productId,
        quantity,
        unit: selectedProduct?.unit || purchase?.unit || '',
        unitPrice,
        currency,
        purchaseDate,
        referenceNumber,
        notes,
        ...(purchase ? { status } : {}),
      });
    }}>
      {!purchase ? <>
        {!activeSuppliers.length && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">No active connected suppliers are available. <Link href="/customer/suppliers" className="font-semibold underline">Manage suppliers</Link> and set a connected supplier to Active first.</p>}
        <Select
          label="Supplier"
          value={supplierId}
          onChange={(event) => { setSupplierId(event.target.value); setProductId(''); }}
          options={[{ label: 'Select a connected supplier', value: '' }, ...activeSuppliers.map((supplier) => ({ label: supplier.companyName, value: supplier._id }))]}
          required
        />
        <Select
          label="Product"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          options={[{ label: loadingProducts ? 'Loading products...' : 'Select a product', value: '' }, ...products.map((product) => ({ label: `${product.name} · ${product.category}`, value: product._id }))]}
          disabled={!supplierId || loadingProducts || !products.length}
          required
        />
        {productError && <p role="alert" className="text-xs text-rose-700">{productError}</p>}
        {supplierId && !loadingProducts && !productError && !products.length && <p className="text-sm text-amber-800">This supplier has no active products. <Link href="/customer/products" className="font-semibold underline">Manage products</Link> before creating a purchase.</p>}
      </> : <div className="grid gap-2 rounded-md border border-slate-200 p-3 text-sm sm:grid-cols-2 dark:border-slate-800">
        <p><span className="text-slate-500">Supplier:</span> {purchase.supplierOrganization?.name || '—'}</p>
        <p><span className="text-slate-500">Product:</span> {purchase.product?.name || '—'}</p>
      </div>}

      {selectedProduct && <p className="text-xs text-slate-500">Purchase unit must match the product unit: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedProduct.unit}</span></p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Quantity" type="number" min="0.00000001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} required disabled={!editable} />
        <Input label="Unit price" type="number" min="0" step="any" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} required disabled={!editable} />
        <div>
          <Input label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="INR, USD, EUR..." list="purchase-currencies" maxLength={3} pattern="[A-Za-z]{3}" required disabled={!editable} />
          <datalist id="purchase-currencies"><option value="INR" /><option value="USD" /><option value="EUR" /><option value="GBP" /></datalist>
        </div>
        <Input label="Purchase date" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required disabled={!editable} />
        <Input label="Reference number" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} disabled={!editable} />
        {purchase && <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value as PurchaseStatus)} options={statusOptions} disabled={!editable} />}
      </div>
      <Textarea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} disabled={!editable} />
      <div className="rounded-md bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900"><span className="text-slate-500">Total preview</span><span className="ml-2 font-semibold text-slate-900 dark:text-slate-100">{preview}</span><p className="mt-1 text-xs text-slate-500">Final total is calculated and rounded by the server.</p></div>
      <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800"><Button type="submit" isLoading={isSubmitting} disabled={!editable || (!purchase && (!supplierId || !productId))}>{submitLabel}</Button></div>
    </form>
  );
}
