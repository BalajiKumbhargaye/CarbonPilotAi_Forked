'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Edit2, FileText, Package, Plus, Search, Send } from 'lucide-react';
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
import { createDataRequest, sendDataRequest } from '@/lib/data-requests';

const requestableDocuments = [
  { type: 'PCF_REPORT', label: 'Product Carbon Footprint (PCF) report' },
  { type: 'EPD', label: 'Environmental Product Declaration (EPD)' },
  { type: 'LCA_REPORT', label: 'Life Cycle Assessment (LCA) report' },
  { type: 'GHG_INVENTORY', label: 'GHG inventory' },
  { type: 'ISO_CERTIFICATE', label: 'ISO certificate' },
  { type: 'RECYCLED_CONTENT_CERTIFICATE', label: 'Recycled content certificate' },
  { type: 'PRODUCT_SPECIFICATION', label: 'Product specification' },
  { type: 'SUSTAINABILITY_REPORT', label: 'Sustainability report' },
  { type: 'OTHER', label: 'Other supporting document' },
] as const;
type RequestableDocumentType = (typeof requestableDocuments)[number]['type'];

function StatusLabel({ status }: { status: ProductStatus }) {
  const active = status === 'ACTIVE';
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>{active ? 'Active' : 'Inactive'}</span>;
}

export default function BuyerProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDirectoryItem[]>([]);
  const [catalogSuppliers, setCatalogSuppliers] = useState<Array<{ _id: string; companyName: string }>>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [filters, setFilters] = useState<ProductFilters>({ search: '', supplierId: '', categoryId: '', status: '', catalog: true });
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<ProductItem | 'new' | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<ProductItem[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<RequestableDocumentType[]>(['PCF_REPORT', 'EPD']);
  const [requestDescription, setRequestDescription] = useState('');
  const [requestDeadline, setRequestDeadline] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getSuppliers(), getProductCategories(), getProducts({ catalog: true })]).then(([supplierItems, categoryItems, catalogProducts]) => {
      if (!active) return;
      setSuppliers(supplierItems);
      setCategories(categoryItems);
      const uniqueSuppliers = new Map<string, string>();
      catalogProducts.forEach((product) => {
        if (product.supplier?._id && product.supplier.name) uniqueSuppliers.set(product.supplier._id, product.supplier.name);
      });
      setCatalogSuppliers(Array.from(uniqueSuppliers, ([_id, companyName]) => ({ _id, companyName })));
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

  const toggleProductSelection = (product: ProductItem) => {
    setSelectedProducts((current) => current.some((item) => item._id === product._id)
      ? current.filter((item) => item._id !== product._id)
      : [...current, product]);
  };

  const toggleDocument = (documentType: RequestableDocumentType) => {
    setSelectedDocuments((current) => current.includes(documentType)
      ? current.filter((item) => item !== documentType)
      : [...current, documentType]);
  };

  const sendDocumentRequests = async () => {
    if (!selectedProducts.length) {
      setError('Select at least one supplier product.');
      return;
    }
    if (!selectedDocuments.length) {
      setError('Select at least one document to request.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    const sentIds: string[] = [];
    const failures: string[] = [];
    const documentLabels = new Map(requestableDocuments.map((document) => [document.type, document.label]));
    const requestGroupId = crypto.randomUUID();

    for (const product of selectedProducts) {
      try {
        const draft = await createDataRequest({
          supplierId: product.supplierId,
          productId: product._id,
          requestGroupId,
          title: `${product.name} supporting documents`,
          description: requestDescription.trim(),
          deadline: requestDeadline || undefined,
          allowPartialSubmission: false,
          requestedItems: selectedDocuments.map((documentType, index) => ({
            key: `document_${documentType.toLowerCase()}`,
            label: documentLabels.get(documentType) || documentType,
            description: 'Upload the requested document for this product.',
            responseType: 'DOCUMENT',
            category: 'GENERAL_SUSTAINABILITY',
            required: true,
            requiresEvidence: true,
            acceptedDocumentTypes: [documentType],
            order: index,
          })),
        });
        await sendDataRequest(draft._id);
        sentIds.push(product._id);
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : 'Request could not be sent';
        failures.push(`${product.supplier?.name || 'Supplier'} (${product.name}): ${message}`);
      }
    }

    if (sentIds.length) {
      setNotice(`Sent document requests to ${sentIds.length} of ${selectedProducts.length} selected supplier${selectedProducts.length === 1 ? '' : 's'}. Track replies in Data Requests.`);
      setSelectedProducts((current) => current.filter((product) => !sentIds.includes(product._id)));
    }
    if (failures.length) setError(`Some requests could not be sent: ${failures.join('; ')}`);
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Products' }]} />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Products</h1><p className="mt-1 text-sm text-slate-500">Search active products listed by any supplier on CarbonPilot. Supplier connection is not required to browse.</p></div>
        <Button size="sm" className="self-start" onClick={() => { setError(''); setEditor('new'); }}><Plus className="h-4 w-4" /> Add product</Button>
      </header>
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative"><Input aria-label="Search products" placeholder="Search products, code, supplier" value={filters.search || ''} onChange={(event) => setFilter('search', event.target.value)} className="pl-9" /><Search className="pointer-events-none -mt-7 ml-3 h-4 w-4 text-slate-400" /></div>
        <Select aria-label="Filter by supplier" value={filters.supplierId || ''} onChange={(event) => setFilter('supplierId', event.target.value)} options={[{ label: 'All suppliers', value: '' }, ...catalogSuppliers.map((supplier) => ({ label: supplier.companyName, value: supplier._id }))]} />
        <Select aria-label="Filter by category" value={filters.categoryId || ''} onChange={(event) => setFilter('categoryId', event.target.value)} options={[{ label: 'All categories', value: '' }, ...categories.map((category) => ({ label: category.name, value: category._id }))]} />
        <Select aria-label="Filter by status" value={filters.status || ''} onChange={(event) => setFilter('status', event.target.value)} options={[{ label: 'All statuses', value: '' }, { label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }]} />
      </div>

      {loading ? <LoadingState message="Loading products..." /> : error && !products.length ? (
        <div className="py-8 text-center"><p className="text-sm text-slate-600">Unable to load products. Please try again.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => setRetryCount((value) => value + 1)}>Try again</Button></div>
      ) : products.length ? (
        <div className="overflow-x-auto border-y border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60"><tr><th className="px-4 py-3">Request</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3">Price / unit</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {products.map((product) => <tr key={product._id}>
                <td className="px-4 py-4"><input aria-label={`Select ${product.supplier?.name || 'supplier'} ${product.name} for a document request`} type="checkbox" checked={selectedProducts.some((item) => item._id === product._id)} onChange={() => toggleProductSelection(product)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" /></td>
                <td className="px-4 py-4"><Link href={`/customer/products/${product._id}`} className="flex items-center gap-2 font-semibold text-slate-900 hover:text-emerald-700 dark:text-slate-100"><Package className="h-4 w-4 text-emerald-700" />{product.name}</Link><span className="mt-1 block pl-6 text-xs text-slate-500">{product.productCode || 'No product code'}</span></td>
                <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{product.supplier?.name || '—'}</td>
                <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{product.category}</td>
                <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{product.unit}</td>
                <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{product.sellingPrice !== undefined && product.currency ? formatProductPrice(product.sellingPrice, product.currency) : 'Not set'}</td>
                <td className="px-4 py-4"><div className="space-y-2"><StatusLabel status={product.status} />{suppliers.some((supplier) => supplier._id === product.supplierId) && <Select aria-label={`Change ${product.name} status`} className="h-8 min-w-28 text-xs" value={product.status} options={[{ label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }]} onChange={(event) => changeStatus(product, event.target.value as ProductStatus)} />}</div></td>
                <td className="px-4 py-4">{suppliers.some((supplier) => supplier._id === product.supplierId) && <Button variant="ghost" size="sm" aria-label={`Edit ${product.name}`} onClick={() => setEditor(product)}><Edit2 className="h-4 w-4" /></Button>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-y border-slate-200 py-14 text-center dark:border-slate-800"><Package className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">No products found.</h2><p className="mt-1 text-sm text-slate-500">Add a product to start building your procurement catalog.</p><Button size="sm" className="mt-4" onClick={() => setEditor('new')}><Plus className="h-4 w-4" /> Add product</Button></div>
      )}

      {selectedProducts.length > 0 && <section className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100"><FileText className="h-4 w-4 text-emerald-700" /> Request documents from selected suppliers</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{selectedProducts.length} product{selectedProducts.length === 1 ? '' : 's'} selected. CarbonPilot will send a separate request for each product to its supplier, including suppliers not yet connected to you.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">Required documents</legend>
            {requestableDocuments.map((document) => <label key={document.type} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={selectedDocuments.includes(document.type)} onChange={() => toggleDocument(document.type)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              <span>{document.label}</span>
            </label>)}
          </fieldset>
          <div className="space-y-3">
            <label className="form-label">Message to suppliers<textarea value={requestDescription} onChange={(event) => setRequestDescription(event.target.value)} maxLength={2000} rows={4} className="form-input h-auto py-2" placeholder="Add instructions or context for the requested documents." /></label>
            <label className="form-label">Due date (optional)<input type="date" value={requestDeadline} onChange={(event) => setRequestDeadline(event.target.value)} className="form-input" /></label>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={sendDocumentRequests} isLoading={saving} disabled={saving}><Send className="h-4 w-4" /> Send to {selectedProducts.length} supplier{selectedProducts.length === 1 ? '' : 's'}</Button>
              <Link href="/customer/data-requests" className="text-sm font-medium text-emerald-800 underline hover:text-emerald-900">View Data Requests</Link>
            </div>
          </div>
        </div>
        <ul className="flex flex-wrap gap-2">
          {selectedProducts.map((product) => <li key={product._id} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs text-slate-700 dark:border-emerald-900 dark:bg-slate-950 dark:text-slate-300">{product.supplier?.name || 'Supplier'} · {product.name}</li>)}
        </ul>
      </section>}

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
