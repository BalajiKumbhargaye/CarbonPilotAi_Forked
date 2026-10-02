'use client';

import React from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Progress } from '@/components/ui/Progress';
import { DataTable } from '@/components/ui/DataTable';
import { Plus, GitCompare, Building2 } from 'lucide-react';

const mockSuppliers = [
  {
    _id: 'supp-titan-01',
    name: 'Titan Alloy & Steel Works',
    industry: 'Steel & Metallurgy',
    verificationStatus: 'Verified',
    dataCompleteness: 85,
    evidenceSupport: 90,
    productsCount: 6,
  },
  {
    _id: 'supp-nexa-02',
    name: 'Nexa Polymer Solutions',
    industry: 'Chemicals & Resins',
    verificationStatus: 'Warning',
    dataCompleteness: 60,
    evidenceSupport: 65,
    productsCount: 4,
  },
  {
    _id: 'supp-ecocast-03',
    name: 'EcoCast Aluminum Corp',
    industry: 'Lightweight Alloys',
    verificationStatus: 'Pending',
    dataCompleteness: 40,
    evidenceSupport: 50,
    productsCount: 3,
  },
];

export default function AllSuppliersPage() {
  const columns = [
    {
      header: 'Supplier Organization',
      cell: (row: typeof mockSuppliers[0]) => (
        <Link href={`/customer/suppliers/${row._id}`} className="font-semibold text-slate-900 hover:text-emerald-600 dark:text-slate-100 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-emerald-600" />
          {row.name}
        </Link>
      ),
    },
    { header: 'Industry', accessorKey: 'industry' as const },
    {
      header: 'Verification Status',
      cell: (row: typeof mockSuppliers[0]) => <StatusBadge status={row.verificationStatus} />,
    },
    {
      header: 'Data Completeness',
      cell: (row: typeof mockSuppliers[0]) => (
        <div className="w-28 space-y-1">
          <div className="flex justify-between text-[11px] font-medium text-slate-500">
            <span>{row.dataCompleteness}%</span>
          </div>
          <Progress value={row.dataCompleteness} />
        </div>
      ),
    },
    {
      header: 'Evidence Support',
      cell: (row: typeof mockSuppliers[0]) => (
        <div className="w-28 space-y-1">
          <div className="flex justify-between text-[11px] font-medium text-slate-500">
            <span>{row.evidenceSupport}%</span>
          </div>
          <Progress value={row.evidenceSupport} indicatorClassName="bg-sky-500" />
        </div>
      ),
    },
    {
      header: 'Actions',
      cell: (row: typeof mockSuppliers[0]) => (
        <Link href={`/customer/suppliers/${row._id}`}>
          <Button variant="ghost" size="sm">
            View Profile →
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Suppliers', href: '/customer/suppliers' }, { label: 'All Suppliers' }]} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Supplier Directory</h1>
          <p className="text-sm text-slate-500">Monitor primary supplier profiles, data completeness, and audited evidence scores.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/customer/suppliers/comparison">
            <Button variant="outline" size="sm" className="gap-1.5">
              <GitCompare className="h-4 w-4" /> Compare Suppliers
            </Button>
          </Link>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Supplier
          </Button>
        </div>
      </div>

      <DataTable columns={columns} data={mockSuppliers} />
    </div>
  );
}
