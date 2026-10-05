'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { getInvoices, type InvoiceRecord } from '@/lib/procurement';

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function supplierName(supplier: InvoiceRecord['supplierOrganizationId']) {
  return typeof supplier === 'string' ? 'Not available' : supplier.name || 'Not available';
}

export default function CustomerInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getInvoices()
      .then(setInvoices)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load invoices.'));
  }, []);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Procurement', href: '/customer/purchases' }, { label: 'Invoices' }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Invoices</h1>
        <p className="text-sm text-slate-500">Persisted invoices. Upload and review source documents in the procurement document workflow.</p>
        </div>
        <Link href="/customer/procurement-documents" className="inline-flex h-10 items-center border border-emerald-700 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">Upload and review invoice</Link>
      </div>

      {invoices === null && !error && <p role="status" className="text-sm text-slate-500">Loading invoices…</p>}
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {invoices?.length === 0 && !error && <EmptyState>No invoices available.</EmptyState>}
      {invoices && invoices.length > 0 && !error && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3">Invoice number</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Invoice date</th>
                <th className="px-4 py-3">Total amount</th>
                <th className="px-4 py-3">Line items</th>
                <th className="px-4 py-3">Extraction status</th>
                <th className="px-4 py-3">Source document</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {invoices.map((invoice) => (
                <tr key={invoice._id} className="text-slate-700 dark:text-slate-200">
                  <td className="px-4 py-3 font-mono">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-3">{supplierName(invoice.supplierOrganizationId)}</td>
                  <td className="px-4 py-3">{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium">{formatAmount(invoice.totalAmount, invoice.currency)}</td>
                  <td className="px-4 py-3">{invoice.items.length}</td>
                  <td className="px-4 py-3">{invoice.extractionStatus}</td>
                  <td className="px-4 py-3">{invoice.documentId
                    ? <Link href={`/customer/procurement-documents?documentId=${encodeURIComponent(invoice.documentId)}`} className="font-medium text-emerald-800 underline">View source</Link>
                    : 'Not available'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <Card className="p-6 text-sm text-slate-500">{children}</Card>;
}
