'use client';

import React from 'react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { ShoppingCart, Plus, Filter, Download } from 'lucide-react';

const mockPurchases = [
  {
    _id: 'PUR-001',
    supplier: 'Titan Alloy & Steel Works',
    product: 'Automotive Structural Steel Grade S500MC',
    quantity: '250 MT',
    date: '2024-05-15',
    emissions: '455 tCO2e',
    status: 'Supported',
  },
  {
    _id: 'PUR-002',
    supplier: 'Nexa Polymer Solutions',
    product: 'Bio-Polyamide 6.10 Polymer Granules',
    quantity: '80 MT',
    date: '2024-05-12',
    emissions: '276 tCO2e',
    status: 'Partially Supported',
  },
  {
    _id: 'PUR-003',
    supplier: 'EcoCast Aluminum Corp',
    product: 'Secondary Casting Alloy A380',
    quantity: '120 MT',
    date: '2024-04-28',
    emissions: '216 tCO2e',
    status: 'Pending',
  },
];

export default function CustomerPurchasesPage() {
  const columns = [
    { header: 'PO / Purchase Ref', accessorKey: '_id' as const, className: 'font-mono text-xs font-semibold' },
    { header: 'Supplier', accessorKey: 'supplier' as const, className: 'font-medium text-slate-900 dark:text-slate-100' },
    { header: 'Product Item', accessorKey: 'product' as const },
    { header: 'Volume', accessorKey: 'quantity' as const },
    { header: 'Date', accessorKey: 'date' as const },
    { header: 'Emissions', accessorKey: 'emissions' as const, className: 'font-semibold text-emerald-600 dark:text-emerald-400' },
    {
      header: 'Evidence Status',
      cell: (row: typeof mockPurchases[0]) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Procurement', href: '/customer/purchases' }, { label: 'Purchases' }]} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Procurement Purchases</h1>
          <p className="text-sm text-slate-500">Track and link invoice line items to supplier PCF emission profiles.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="h-4 w-4" /> Filter
          </Button>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Purchase
          </Button>
        </div>
      </div>

      <DataTable columns={columns} data={mockPurchases} />
    </div>
  );
}
