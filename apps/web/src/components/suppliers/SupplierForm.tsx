'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import type { SupplierDirectoryItem, SupplierInput } from '@/lib/suppliers';

const blankSupplier: SupplierInput = {
  companyName: '',
  legalName: '',
  industry: '',
  country: '',
  city: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
  category: '',
  notes: '',
};

export function SupplierForm({
  supplier,
  onSubmit,
  isSubmitting,
  submitLabel,
}: {
  supplier?: SupplierDirectoryItem | null;
  onSubmit: (values: SupplierInput) => Promise<void>;
  isSubmitting: boolean;
  submitLabel: string;
}) {
  const [values, setValues] = useState<SupplierInput>(blankSupplier);

  useEffect(() => {
    setValues(supplier ? {
      companyName: supplier.companyName,
      legalName: supplier.legalName || '',
      industry: supplier.industry || '',
      country: supplier.country || '',
      city: supplier.city || '',
      contactPerson: supplier.contactPerson || '',
      contactEmail: supplier.contactEmail || '',
      contactPhone: supplier.contactPhone || '',
      website: supplier.website || '',
      category: supplier.category || '',
      notes: supplier.notes || '',
    } : blankSupplier);
  }, [supplier]);

  const update = (field: keyof SupplierInput, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };
  const required = !supplier;

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(values);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Company name" value={values.companyName} onChange={(event) => update('companyName', event.target.value)} required={required} />
        <Input label="Legal / business name" value={values.legalName} onChange={(event) => update('legalName', event.target.value)} />
        <Input label="Industry" value={values.industry} onChange={(event) => update('industry', event.target.value)} required={required} />
        <Input label="Supplier category" value={values.category} onChange={(event) => update('category', event.target.value)} required={required} />
        <Input label="Country" value={values.country} onChange={(event) => update('country', event.target.value)} required={required} />
        <Input label="City" value={values.city} onChange={(event) => update('city', event.target.value)} required={required} />
        <Input label="Contact person" value={values.contactPerson} onChange={(event) => update('contactPerson', event.target.value)} required={required} />
        <Input label="Contact email" type="email" value={values.contactEmail} onChange={(event) => update('contactEmail', event.target.value)} required={required} />
        <Input label="Contact phone" type="tel" value={values.contactPhone} onChange={(event) => update('contactPhone', event.target.value)} required={required} />
        <Input label="Website" type="url" value={values.website} onChange={(event) => update('website', event.target.value)} />
      </div>
      <Textarea label="Notes" value={values.notes} onChange={(event) => update('notes', event.target.value)} />
      <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
        <Button type="submit" isLoading={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
