'use client';

import Link from 'next/link';
import { ArrowLeft, GitCompare } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';

export default function SupplierComparisonPage() {
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Suppliers', href: '/customer/suppliers' }, { label: 'Supplier Comparison' }]} />
      <div className="border-y border-slate-200 py-14 text-center dark:border-slate-800">
        <GitCompare className="mx-auto h-8 w-8 text-slate-400" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">Supplier comparison is not available yet</h1>
        <p className="mt-1 text-sm text-slate-500">Supplier profiles are available in your directory.</p>
        <Link href="/customer/suppliers">
          <Button variant="outline" size="sm" className="mt-4"><ArrowLeft className="h-4 w-4" /> Back to suppliers</Button>
        </Link>
      </div>
    </div>
  );
}
