'use client';

import React, { useEffect, useState } from 'react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { getPurchaseOrders, type PurchaseOrderRecord } from '@/lib/procurement';

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function supplierName(supplier: PurchaseOrderRecord['supplierOrganizationId']) {
  return typeof supplier === 'string' ? 'Not available' : supplier.name || 'Not available';
}

export default function CustomerPurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPurchaseOrders()
      .then(setPurchaseOrders)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load purchase orders.'));
  }, []);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Procurement', href: '/customer/purchases' }, { label: 'Purchase Orders' }]} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Purchase Orders</h1>
        <p className="text-sm text-slate-500">Persisted purchase-order records. Creation is not available in this workflow.</p>
      </div>

      {purchaseOrders === null && !error && <p role="status" className="text-sm text-slate-500">Loading purchase orders…</p>}
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {purchaseOrders?.length === 0 && !error && <EmptyState>No purchase orders available.</EmptyState>}
      {purchaseOrders && purchaseOrders.length > 0 && !error && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3">PO number</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Order date</th>
                <th className="px-4 py-3">Total value</th>
                <th className="px-4 py-3">Line items</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {purchaseOrders.map((order) => (
                <tr key={order._id} className="text-slate-700 dark:text-slate-200">
                  <td className="px-4 py-3 font-mono">{order.orderNumber}</td>
                  <td className="px-4 py-3">{supplierName(order.supplierOrganizationId)}</td>
                  <td className="px-4 py-3">{new Date(order.orderDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium">{formatAmount(order.totalAmount, order.currency)}</td>
                  <td className="px-4 py-3">{order.items.length}</td>
                  <td className="px-4 py-3">{order.status}</td>
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
