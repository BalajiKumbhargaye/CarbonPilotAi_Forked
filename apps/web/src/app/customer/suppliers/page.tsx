'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Edit2, Plus, Search } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { SupplierForm } from '@/components/suppliers/SupplierForm';
import {
  createSupplier,
  getSuppliers,
  updateSupplier,
  updateSupplierStatus,
  type SupplierDirectoryItem,
  type SupplierInput,
  type SupplierStatus,
} from '@/lib/suppliers';

const statusOptions = [
  { label: 'Invited', value: 'INVITED' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Inactive', value: 'INACTIVE' },
];

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

export default function AllSuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierDirectoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<SupplierDirectoryItem | 'new' | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      getSuppliers(search).then((items) => {
        if (active) setSuppliers(items);
      }).catch(() => {
        if (active) setError('Unable to load suppliers. Please try again.');
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, retryCount]);

  const refresh = async () => {
    const items = await getSuppliers(search);
    setSuppliers(items);
  };

  const saveSupplier = async (values: SupplierInput) => {
    setSaving(true);
    setError('');
    try {
      if (editor && editor !== 'new') {
        await updateSupplier(editor._id, values);
        setNotice('Supplier updated successfully.');
      } else {
        await createSupplier(values);
        setNotice('Supplier added successfully.');
      }
      setEditor(null);
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save supplier. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (supplier: SupplierDirectoryItem, status: SupplierStatus) => {
    setNotice('');
    try {
      const updated = await updateSupplierStatus(supplier._id, status);
      setSuppliers((current) => current.map((item) => item._id === updated._id ? updated : item));
      setNotice('Supplier status updated.');
    } catch {
      setError('Unable to update supplier status. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Suppliers', href: '/customer/suppliers' }, { label: 'Directory' }]} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Supplier Directory</h1>
          <p className="mt-1 text-sm text-slate-500">Suppliers connected to your organization.</p>
        </div>
        <Button size="sm" className="gap-1.5 self-start" onClick={() => { setError(''); setEditor('new'); }}>
          <Plus className="h-4 w-4" /> Add Supplier
        </Button>
      </div>

      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <div className="max-w-md">
        <Input
          aria-label="Search suppliers"
          placeholder="Search company, industry, or location"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
        <Search className="pointer-events-none -mt-7 ml-3 h-4 w-4 text-slate-400" />
      </div>

      {loading ? <LoadingState message="Loading suppliers..." /> : error && suppliers.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-600">Unable to load suppliers.</p>
          <Button className="mt-3" variant="outline" size="sm" onClick={() => setRetryCount((value) => value + 1)}>Try again</Button>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="border-y border-slate-200 py-14 text-center dark:border-slate-800">
          <Building2 className="mx-auto h-8 w-8 text-slate-400" />
          <h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
            {search ? 'No suppliers match your search.' : 'No suppliers found.'}
          </h2>
          {!search && <p className="mt-1 text-sm text-slate-500">Add your first supplier to start managing your supply chain.</p>}
          {!search && <Button size="sm" className="mt-4" onClick={() => setEditor('new')}><Plus className="h-4 w-4" /> Add Supplier</Button>}
        </div>
      ) : (
        <div className="overflow-x-auto border-y border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60">
              <tr>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Products</th>
                <th className="px-4 py-3 font-semibold">Connected</th>
                <th className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {suppliers.map((supplier) => (
                <tr key={supplier._id} className="align-top">
                  <td className="px-4 py-4">
                    <Link href={`/customer/suppliers/${supplier._id}`} className="flex items-start gap-2 font-semibold text-slate-900 hover:text-emerald-700 dark:text-slate-100">
                      <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      <span>{supplier.companyName}<span className="mt-1 block text-xs font-normal text-slate-500">{supplier.category || supplier.industry}</span></span>
                    </Link>
                    <p className="mt-1 pl-6 text-xs text-slate-500">{supplier.industry}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{[supplier.city, supplier.country].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-4 py-4">
                    <p className="text-slate-800 dark:text-slate-200">{supplier.contactPerson || '—'}</p>
                    {supplier.contactEmail && <a className="text-xs text-emerald-700 hover:underline" href={`mailto:${supplier.contactEmail}`}>{supplier.contactEmail}</a>}
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      <StatusBadge status={supplier.status} />
                      <Select
                        aria-label={`Change status for ${supplier.companyName}`}
                        className="h-8 min-w-28 text-xs"
                        value={supplier.status === 'TERMINATED' ? 'INACTIVE' : supplier.status}
                        options={statusOptions}
                        onChange={(event) => changeStatus(supplier, event.target.value as SupplierStatus)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{supplier.productsCount}</td>
                  <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{formatDate(supplier.connectedAt || supplier.createdAt)}</td>
                  <td className="px-4 py-4">
                    <Button variant="ghost" size="sm" aria-label={`Edit ${supplier.companyName}`} onClick={() => { setError(''); setEditor(supplier); }}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor === 'new' ? 'Add supplier' : 'Edit supplier'}
        description="Company details are saved to the supplier organization and connected to your organization."
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
      >
        <SupplierForm
          key={editor === 'new' ? 'new' : editor?._id}
          supplier={editor && editor !== 'new' ? editor : null}
          onSubmit={saveSupplier}
          isSubmitting={saving}
          submitLabel={editor === 'new' ? 'Add supplier' : 'Save changes'}
        />
      </Modal>
    </div>
  );
}
