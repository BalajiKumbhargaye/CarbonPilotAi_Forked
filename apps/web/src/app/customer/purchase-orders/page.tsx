'use client';

import React from 'react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { Plus } from 'lucide-react';

const mockPOs = [
  {
    _id: 'PO-2024-9912',
    supplier: 'Titan Alloy & Steel Works',
    date: '2024-05-01',
    amount: '$480,000',
    status: 'FULFILLED',
  },
  {
    _id: 'PO-2024-8190',
    supplier: 'Nexa Polymer Solutions',
    date: '2024-05-10',
    amount: '$160,000',
    status: 'ISSUED',
  },
];

export default function CustomerPurchaseOrdersPage() {
  const columns = [
    { header: 'PO Number', accessorKey: '_id' as const, className: 'font-mono text-xs font-semibold' },
    { header: 'Supplier', accessorKey: 'supplier' as const, className: 'font-medium' },
    { header: 'Issue Date', accessorKey: 'date' as const },
    { header: 'Total Value', accessorKey: 'amount' as const, className: 'font-semibold' },
    {
      header: 'Fulfillment Status',
      cell: (row: typeof mockPOs[0]) => (
        <Badge variant={row.status === 'FULFILLED' ? 'success' : 'info'}>{row.status}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Procurement', href: '/customer/purchases' }, { label: 'Purchase Orders' }]} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Purchase Orders</h1>
          <p className="text-sm text-slate-500">Cross-reference purchase orders against incoming vendor evidence.</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> New Purchase Order
        </Button>
      </div>

      <DataTable columns={columns} data={mockPOs} />
    </div>
  );
}
