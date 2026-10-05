'use client';

import Link from 'next/link';
import { ArrowLeft, GitCompare, Loader2, ShieldAlert, TrendingDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { getProducts, type ProductItem } from '@/lib/products';
import { compareSuppliersForProduct, getSuppliers, type SupplierComparisonResult, type SupplierDirectoryItem } from '@/lib/suppliers';

export default function SupplierComparisonPage() {
  const [suppliers, setSuppliers] = useState<SupplierDirectoryItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [result, setResult] = useState<SupplierComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      getSuppliers(),
      getProducts(),
    ]).then(([supplierList, productList]) => {
      if (!active) return;
      setSuppliers(supplierList);
      setProducts(productList);
      if (productList[0]) {
        setSelectedProductId(productList[0]._id);
      }
      if (supplierList.length >= 2) {
        setSelectedSupplierIds(supplierList.slice(0, 2).map((supplier) => supplier._id));
      }
    }).catch(() => {
      if (active) setError('Unable to load supplier comparison data.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const selectedProduct = useMemo(() => products.find((product) => product._id === selectedProductId) ?? null, [products, selectedProductId]);
  const availableSupplierOptions = useMemo(() => suppliers.filter((supplier) => supplier.productsCount > 0), [suppliers]);

  useEffect(() => {
    if (!selectedProductId || selectedSupplierIds.length < 2) {
      setResult(null);
      return;
    }

    setSubmitting(true);
    setError('');
    compareSuppliersForProduct(selectedProductId, selectedSupplierIds, quantity)
      .then((data) => setResult(data))
      .catch((loadError) => {
        setResult(null);
        setError(loadError instanceof Error ? loadError.message : 'Unable to compare suppliers.');
      })
      .finally(() => setSubmitting(false));
  }, [selectedProductId, selectedSupplierIds, quantity]);

  const toggleSupplier = (supplierId: string) => {
    setSelectedSupplierIds((current) => {
      if (current.includes(supplierId)) {
        return current.filter((id) => id !== supplierId);
      }
      if (current.length >= 4) {
        return [...current.slice(1), supplierId];
      }
      return [...current, supplierId];
    });
  };

  if (loading) return <LoadingState message="Loading suppliers and products…" />;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Suppliers', href: '/customer/suppliers' }, { label: 'Supplier Comparison' }]} />
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Supplier comparison</h1>
          <p className="mt-1 text-sm text-slate-500">Review price, carbon evidence, and comparability side by side. This is a transparent comparison of actual data only.</p>
        </div>
        <Link href="/customer/procurement-decisions">
          <Button variant="outline" size="sm">Open decision support <ArrowLeft className="h-4 w-4 rotate-180" /></Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitCompare className="h-4 w-4" /> Selection</CardTitle>
          <CardDescription>Choose the product and up to four connected suppliers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Product</span>
            <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              <option value="">Select a product</option>
              {products.map((product) => <option key={product._id} value={product._id}>{product.name} ({product.unit})</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Quantity</span>
            <input type="number" min="1" step="0.01" value={quantity} onChange={(event) => setQuantity(Number(event.target.value) || 1)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <div className="space-y-2 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Suppliers</span>
            <div className="flex flex-wrap gap-2">
              {availableSupplierOptions.map((supplier) => {
                const active = selectedSupplierIds.includes(supplier._id);
                return (
                  <button key={supplier._id} type="button" onClick={() => toggleSupplier(supplier._id)} className={`rounded-full border px-2 py-1 text-xs ${active ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>
                    {supplier.companyName}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {submitting && (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" /> Comparing suppliers…
        </div>
      )}

      {result && selectedProduct && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedProduct.name}</h2>
            <p className="text-sm text-slate-500">{selectedProduct.productCode || 'No code'} · {selectedProduct.category} · {selectedProduct.unit}</p>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-medium">Supplier</th>
                    <th className="px-4 py-3 font-medium">Price / unit</th>
                    <th className="px-4 py-3 font-medium">Carbon intensity</th>
                    <th className="px-4 py-3 font-medium">Evidence</th>
                    <th className="px-4 py-3 font-medium">Data completeness</th>
                    <th className="px-4 py-3 font-medium">Warnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
                  {result.suppliers.map((supplier) => (
                    <tr key={supplier.supplierId}>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{supplier.supplierName}</div>
                        <div className="text-xs text-slate-500">{supplier.productName}</div>
                      </td>
                      <td className="px-4 py-3 align-top">{supplier.pricePerUnit != null ? `${supplier.currency || 'USD'} ${supplier.pricePerUnit.toFixed(2)}` : 'No price'} </td>
                      <td className="px-4 py-3 align-top">{supplier.carbonIntensity != null ? `${supplier.carbonIntensity.toFixed(2)} ${supplier.carbonUnit || 'Unit unavailable'}` : 'No carbon data'}</td>
                      <td className="px-4 py-3 align-top text-xs">
                        <div className="font-medium">{supplier.evidenceStatus || 'NOT_AVAILABLE'}</div>
                        <div className="text-slate-500">{supplier.corroborationStatus || 'Not available'}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {supplier.dataCompleteness.percentage}%
                        <div className="text-xs text-slate-500">{supplier.dataCompleteness.completed}/{supplier.dataCompleteness.requested}</div>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-slate-600 dark:text-slate-300">
                        {supplier.warnings.length ? supplier.warnings.map((warning) => <div key={`${supplier.supplierId}-${warning}`} className="mb-1 flex items-start gap-1"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {warning}</div>) : <span className="inline-flex items-center gap-1 text-emerald-600"><TrendingDown className="h-3.5 w-3.5" /> No major concerns</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.tradeOff && (
            <Card>
              <CardHeader>
                <CardTitle>Trade-off summary</CardTitle>
                <CardDescription>Cost vs. estimated emissions for the selected quantity.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div><div className="text-xs uppercase tracking-wide text-slate-500">Lowest cost</div><div className="mt-1 font-medium">{result.tradeOff.cheapestSupplier}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-slate-500">Cost difference</div><div className="mt-1 font-medium">{result.tradeOff.costDifference.toFixed(2)}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-slate-500">Emissions difference</div><div className="mt-1 font-medium">{result.tradeOff.emissionDifference.toFixed(2)} kgCO2e</div></div>
              </CardContent>
            </Card>
          )}

          {result.warnings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Comparison warnings</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
