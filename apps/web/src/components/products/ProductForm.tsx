'use client';

import { useEffect, useState } from 'react';
import { PRODUCT_UNITS } from '@carbonpilot/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { SupplierDirectoryItem } from '@/lib/suppliers';
import {
  createProductCategory,
  type ProductCategory,
  type ProductInput,
  type ProductItem,
  type ProductStatus,
} from '@/lib/products';

type ProductFormValues = Omit<ProductInput, 'sellingPrice'> & { sellingPrice: string };

export function ProductForm({
  product,
  categories,
  setCategories,
  suppliers = [],
  supplierMode,
  isSubmitting,
  submitLabel,
  onSubmit,
}: {
  product?: ProductItem | null;
  categories: ProductCategory[];
  setCategories: (categories: ProductCategory[]) => void;
  suppliers?: SupplierDirectoryItem[];
  supplierMode: boolean;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (payload: ProductInput) => Promise<void>;
}) {
  const [values, setValues] = useState<ProductFormValues>({ name: '', productCode: '', categoryId: '', unit: '', sellingPrice: '', currency: '', description: '', status: 'ACTIVE' });
  const [newCategory, setNewCategory] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  useEffect(() => {
    setValues(product ? {
      name: product.name,
      supplierId: product.supplierId,
      productCode: product.productCode || '',
      categoryId: product.categoryId || '',
      unit: product.unit || '',
      sellingPrice: product.sellingPrice === undefined ? '' : String(product.sellingPrice),
      currency: product.currency || '',
      description: product.description || '',
      status: product.status,
    } : { name: '', productCode: '', categoryId: categories[0]?._id || '', unit: '', sellingPrice: '', currency: '', description: '', status: 'ACTIVE' });
  }, [product]);

  useEffect(() => {
    if (!product && !values.categoryId && categories.length) {
      setValues((current) => ({ ...current, categoryId: categories[0]._id }));
    }
  }, [categories, product, values.categoryId]);

  const update = (field: keyof ProductFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    setAddingCategory(true);
    setCategoryError('');
    try {
      const category = await createProductCategory(newCategory.trim());
      const nextCategories = categories.some((item) => item._id === category._id) ? categories : [...categories, category].sort((a, b) => a.name.localeCompare(b.name));
      setCategories(nextCategories);
      setValues((current) => ({ ...current, categoryId: category._id }));
      setNewCategory('');
    } catch {
      setCategoryError('Unable to add category. Please try again.');
    } finally {
      setAddingCategory(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const { sellingPrice, currency, ...details } = values;
        await onSubmit({
          ...details,
          ...(supplierMode ? {
            sellingPrice: sellingPrice === '' ? undefined : Number(sellingPrice),
            currency: currency || undefined,
          } : {}),
          supplierId: supplierMode ? undefined : values.supplierId,
        });
      }}
    >
      {!supplierMode && !product && (
        <Select
          label="Supplier"
          value={values.supplierId || ''}
          onChange={(event) => update('supplierId', event.target.value)}
          options={[{ label: 'Select a connected supplier', value: '' }, ...suppliers.map((supplier) => ({ label: supplier.companyName, value: supplier._id }))]}
          required
        />
      )}
      {!supplierMode && product && <p className="text-sm text-slate-600 dark:text-slate-300">Supplier: {product.supplier.name}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Product / material name" value={values.name} onChange={(event) => update('name', event.target.value)} required />
        <Input label="Product code / SKU" value={values.productCode} onChange={(event) => update('productCode', event.target.value)} />
        <div className="space-y-2">
          <Select
            label="Category"
            value={values.categoryId || ''}
            onChange={(event) => update('categoryId', event.target.value)}
            options={[{ label: 'Select a category', value: '' }, ...categories.map((category) => ({ label: category.name, value: category._id }))]}
            required
          />
          <div className="flex gap-2">
            <Input aria-label="New product category" placeholder="Add a category" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} />
            <Button type="button" variant="outline" isLoading={addingCategory} onClick={addCategory}>Add</Button>
          </div>
          {categoryError && <p role="alert" className="text-xs text-rose-700">{categoryError}</p>}
        </div>
        <Select
          label="Unit"
          value={values.unit}
          onChange={(event) => update('unit', event.target.value)}
          options={[{ label: 'Select a unit', value: '' }, ...PRODUCT_UNITS.map((unit) => ({ label: unit, value: unit }))]}
          required
        />
        {supplierMode && <>
          <Input
            label="Selling price per unit"
            type="number"
            min="0"
            step="0.00000001"
            value={values.sellingPrice}
            onChange={(event) => update('sellingPrice', event.target.value)}
            required
          />
          <Select
            label="Currency"
            value={values.currency || ''}
            onChange={(event) => update('currency', event.target.value)}
            options={[
              { label: 'Select currency', value: '' },
              { label: 'INR', value: 'INR' },
              { label: 'USD', value: 'USD' },
              { label: 'EUR', value: 'EUR' },
              { label: 'GBP', value: 'GBP' },
            ]}
            required
          />
        </>}
        {product && (
          <Select
            label="Status"
            value={values.status || 'ACTIVE'}
            onChange={(event) => update('status', event.target.value as ProductStatus)}
            options={[{ label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }]}
          />
        )}
      </div>
      <Textarea label="Description" value={values.description || ''} onChange={(event) => update('description', event.target.value)} rows={3} />
      <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
        <Button type="submit" isLoading={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
