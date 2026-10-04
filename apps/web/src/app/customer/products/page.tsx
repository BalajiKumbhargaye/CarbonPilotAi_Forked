'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Edit2, Package, Plus, Search } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ProductForm } from '@/components/products/ProductForm';
import { getSuppliers, type SupplierDirectoryItem } from '@/lib/suppliers';
import {
  createProduct,
  getProductCategories,
  getProducts,
  updateProduct,
  type ProductCategory,
  type ProductFilters,
  type ProductInput,
  type ProductItem,
  type ProductStatus,
} from '@/lib/products';

function StatusLabel({ status }: { status: ProductStatus }) {
  const active = status === 'ACTIVE';
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>{active ? 'Active' : 'Inactive'}</span>;
}

export default function BuyerProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDirectoryItem[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [filters, setFilters] = useState<ProductFilters>({ search: '', supplierId: '', categoryId: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<ProductItem | 'new' | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getSuppliers(), getProductCategories()]).then(([supplierItems, categoryItems]) => {
      if (!active) return;
      setSuppliers(supplierItems);
      setCategories(categoryItems);
    }).catch(() => {
      if (active) setError('Unable to load product filters. Please try again.');
    });
    return () => { active = false; };
  }, [retryCount]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      getProducts(filters).then((items) => {
        if (active) setProducts(items);
      }).catch(() => {
        if (active) setError('Unable to load products. Please try again.');
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, filters.search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [filters, retryCount]);

  const setFilter = (key: keyof ProductFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const refresh = async () => setProducts(await getProducts(filters));

  const save = async (payload: ProductInput) => {
    setSaving(true);
    setError('');
    try {
      if (editor && editor !== 'new') {
        await updateProduct(editor._id, payload);
        setNotice('Product updated successfully.');
      } else {
        await createProduct(payload);
        setNotice('Product added successfully.');
      }
      setEditor(null);
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save product. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (product: ProductItem, status: ProductStatus) => {
    try {
      const updated = await updateProduct(product._id, { status });
      setProducts((current) => current.map((item) => item._id === product._id ? updated : item));
      setNotice('Product status updated.');
    } catch {
      setError('Unable to update product status. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Products' }]} />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Products</h1><p className="mt-1 text-sm text-slate-500">Materials listed by suppliers connected to your organization.</p></div>
        <Button size="sm" className="self-start" onClick={() => { setError(''); setEditor('new'); }}><Plus className="h-4 w-4" /> Add product</Button>
      </header>
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative"><Input aria-label="Search products" placeholder="Search products, code, supplier" value={filters.search || ''} onChange={(event) => setFilter('search', event.target.value)} className="pl-9" /><Search className="pointer-events-none -mt-7 ml-3 h-4 w-4 text-slate-400" /></div>
        <Select aria-label="Filter by supplier" value={filters.supplierId || ''} onChange={(event) => setFilter('supplierId', event.target.value)} options={[{ label: 'All suppliers', value: '' }, ...suppliers.map((supplier) => ({ label: supplier.companyName, value: supplier._id }))]} />
        <Select aria-label="Filter by category" value={filters.categoryId || ''} onChange={(event) => setFilter('categoryId', event.target.value)} options={[{ label: 'All categories', value: '' }, ...categories.map((category) => ({ label: category.name, value: category._id }))]} />
        <Select aria-label="Filter by status" value={filters.status || ''} onChange={(event) => setFilter('status', event.target.value)} options={[{ label: 'All statuses', value: '' }, { label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }]} />
      </div>

      {loading ? <LoadingState message="Loading products..." /> : error && !products.length ? (
        <div className="py-8 text-center"><p className="text-sm text-slate-600">Unable to load products. Please try again.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => setRetryCount((value) => value + 1)}>Try again</Button></div>
      ) : products.length ? (
        <div className="overflow-x-auto border-y border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3">Price / unit</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {products.map((product) => <tr key={product._id}>
                <td className="px-4 py-4"><Link href={`/customer/products/${product._id}`} className="flex items-center gap-2 font-semibold text-slate-900 hover:text-emerald-700 dark:text-slate-100"><Package className="h-4 w-4 text-emerald-700" />{product.name}</Link><span className="mt-1 block pl-6 text-xs text-slate-500">{product.productCode || 'No product code'}</span></td>
                <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{product.supplier?.name || '—'}</td>
                <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{product.category}</td>
                <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{product.unit}</td>
                <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{product.sellingPrice !== undefined && product.currency ? formatProductPrice(product.sellingPrice, product.currency) : 'Not set'}</td>
                <td className="px-4 py-4"><div className="space-y-2"><StatusLabel status={product.status} /><Select aria-label={`Change ${product.name} status`} className="h-8 min-w-28 text-xs" value={product.status} options={[{ label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }]} onChange={(event) => changeStatus(product, event.target.value as ProductStatus)} /></div></td>
                <td className="px-4 py-4"><Button variant="ghost" size="sm" aria-label={`Edit ${product.name}`} onClick={() => setEditor(product)}><Edit2 className="h-4 w-4" /></Button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-y border-slate-200 py-14 text-center dark:border-slate-800"><Package className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">No products found.</h2><p className="mt-1 text-sm text-slate-500">Add a product to start building your procurement catalog.</p><Button size="sm" className="mt-4" onClick={() => setEditor('new')}><Plus className="h-4 w-4" /> Add product</Button></div>
      )}

      <Modal isOpen={Boolean(editor)} onClose={() => setEditor(null)} title={editor === 'new' ? 'Add product' : 'Edit product'} description="Product details are associated with a supplier connected to your organization." className="max-h-[90vh] overflow-y-auto">
        <ProductForm key={editor === 'new' ? 'new-product' : editor?._id} product={editor && editor !== 'new' ? editor : null} categories={categories} setCategories={setCategories} suppliers={suppliers} supplierMode={false} isSubmitting={saving} submitLabel={editor === 'new' ? 'Add product' : 'Save changes'} onSubmit={save} />
      </Modal>
    </div>
  );
}

function formatProductPrice(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 8 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}
