'use client';

import React from 'react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { Plus, Inbox } from 'lucide-react';

const mockRequests = [
  {
    _id: 'REQ-2024-01',
    supplier: 'Titan Alloy & Steel Works',
    title: 'FY2024 Product Carbon Footprint Update',
    deadline: '2024-06-30',
    status: 'IN_REVIEW',
    missingFields: '1 remaining',
  },
  {
    _id: 'REQ-2024-02',
    supplier: 'Nexa Polymer Solutions',
    title: 'Scope 1 & 2 Specific Facility Energy Declarations',
    deadline: '2024-07-15',
    status: 'SENT',
    missingFields: '3 remaining',
  },
];

export default function CustomerDataRequestsPage() {
  const columns = [
    { header: 'Request ID', accessorKey: '_id' as const, className: 'font-mono text-xs font-semibold' },
    { header: 'Supplier', accessorKey: 'supplier' as const, className: 'font-medium' },
    { header: 'Campaign / Title', accessorKey: 'title' as const },
    { header: 'Deadline', accessorKey: 'deadline' as const },
    { header: 'Missing Fields', accessorKey: 'missingFields' as const },
    {
      header: 'Status',
      cell: (row: typeof mockRequests[0]) => (
        <Badge variant={row.status === 'IN_REVIEW' ? 'warning' : 'info'}>{row.status}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Data Collection', href: '/customer/data-requests' }, { label: 'Data Requests' }]} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Data Requests</h1>
          <p className="text-sm text-slate-500">Initiate targeted ESG inquiries to fill verified gaps in vendor Scope 3 claims.</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Create Request
        </Button>
      </div>

      <DataTable columns={columns} data={mockRequests} />
    </div>
  );
}
