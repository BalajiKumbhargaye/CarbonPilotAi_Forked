'use client';

import React from 'react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { FileSpreadsheet, Plus, UploadCloud } from 'lucide-react';

const mockInvoices = [
  {
    _id: 'INV-2024-001',
    supplier: 'Titan Alloy & Steel Works',
    date: '2024-05-18',
    amount: '$320,000',
    extraction: 'Extracted',
    itemsCount: 4,
    status: 'Verified',
  },
  {
    _id: 'INV-2024-002',
    supplier: 'Nexa Polymer Solutions',
    date: '2024-05-14',
    amount: '$148,500',
    extraction: 'Extracted',
    itemsCount: 2,
    status: 'Pending',
  },
];

export default function CustomerInvoicesPage() {
  const columns = [
    { header: 'Invoice Number', accessorKey: '_id' as const, className: 'font-mono text-xs font-semibold' },
    { header: 'Supplier Organization', accessorKey: 'supplier' as const, className: 'font-medium' },
    { header: 'Invoice Date', accessorKey: 'date' as const },
    { header: 'Total Amount', accessorKey: 'amount' as const, className: 'font-bold' },
    { header: 'Line Items', accessorKey: 'itemsCount' as const },
    {
      header: 'Extraction Status',
      cell: (row: typeof mockInvoices[0]) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Procurement', href: '/customer/purchases' }, { label: 'Invoices' }]} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Invoices</h1>
          <p className="text-sm text-slate-500">Invoices processed for automated purchase mapping and carbon attribution.</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <UploadCloud className="h-4 w-4" /> Upload Invoices
        </Button>
      </div>

      <DataTable columns={columns} data={mockInvoices} />
    </div>
  );
}
