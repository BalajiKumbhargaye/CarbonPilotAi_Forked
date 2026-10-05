'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getDataRequestSummary, type DataRequestSummary } from '@/lib/data-requests';
import {
  getCarbonTrackingDashboard,
  getPurchaseSummary,
  type PurchaseSummary,
} from '@/lib/procurement';

function formatCurrencyTotals(summary: PurchaseSummary | null, loading: boolean) {
  if (loading) return 'Loading…';
  if (!summary) return 'Not available';
  if (summary.totalPurchaseValueByCurrency.length === 0) return 'No purchase value';
  return summary.totalPurchaseValueByCurrency.map(({ amount, currency }) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(Number(amount));
    } catch {
      return `${currency} ${amount}`;
    }
  }).join(' · ');
}

function displayCount(summary: DataRequestSummary | null, key: keyof DataRequestSummary['counts'], loading: boolean) {
  if (loading) return 'Loading…';
  return summary ? String(summary.counts[key] ?? 0) : 'Not available';
}

export default function CustomerDashboardPage() {
  const [procurementSummary, setProcurementSummary] = useState<PurchaseSummary | null>(null);
  const [dataRequestSummary, setDataRequestSummary] = useState<DataRequestSummary | null>(null);
  const [calculatedEmissions, setCalculatedEmissions] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getPurchaseSummary().then(setProcurementSummary).catch(() => setProcurementSummary(null)),
      getDataRequestSummary().then(setDataRequestSummary).catch(() => setDataRequestSummary(null)),
      getCarbonTrackingDashboard()
        .then(({ purchases }) => {
        const available = purchases
          .map(({ actual }) => actual.emissions)
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
        setCalculatedEmissions(available.length ? available.reduce((sum, value) => sum + value, 0) : null);
        })
        .catch(() => setCalculatedEmissions(null)),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Sustainability Overview
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Summary values below are retrieved from your organization&apos;s persisted records.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/customer/data-requests">
            <Button size="sm" variant="outline">New Data Request</Button>
          </Link>
          <Link href="/customer/evidence-packs">
            <Button size="sm" variant="primary">Evidence Packs</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Active suppliers" value={loading ? 'Loading…' : procurementSummary ? String(procurementSummary.activeSuppliers) : 'Not available'} detail="From persisted purchases" />
        <Metric label="Purchase value" value={formatCurrencyTotals(procurementSummary, loading)} detail="Totals are kept separate by currency" />
        <Metric
          label="Calculated emissions"
          value={loading ? 'Loading…' : calculatedEmissions === null ? 'Not available' : `${calculatedEmissions.toLocaleString()} kg CO2e`}
          detail="Only persisted actual carbon calculations"
        />
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Data Requests</h2>
            <p className="mt-1 text-sm text-slate-500">Current persisted request counts.</p>
          </div>
          <Link href="/customer/data-requests" className="text-sm font-semibold text-emerald-800 hover:underline">
            View requests
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Count label="Total" value={loading ? 'Loading…' : dataRequestSummary ? String(dataRequestSummary.total) : 'Not available'} />
          <Count label="Sent" value={displayCount(dataRequestSummary, 'SENT', loading)} />
          <Count label="In progress" value={displayCount(dataRequestSummary, 'IN_PROGRESS', loading)} />
          <Count label="Submitted" value={displayCount(dataRequestSummary, 'SUBMITTED', loading)} />
          <Count label="Needs clarification" value={displayCount(dataRequestSummary, 'NEEDS_CLARIFICATION', loading)} />
        </div>
      </Card>

      <p className="text-sm text-slate-500">
        Evidence coverage, verification rollups, and activity feeds are not available as dashboard summaries.
      </p>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </Card>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}
