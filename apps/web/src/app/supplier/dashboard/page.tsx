'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getDataRequestSummary, type DataRequestSummary } from '@/lib/data-requests';

export default function SupplierDashboardPage() {
  const [dataRequestSummary, setDataRequestSummary] = useState<DataRequestSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDataRequestSummary()
      .then(setDataRequestSummary)
      .catch(() => setDataRequestSummary(null))
      .finally(() => setLoading(false));
  }, []);

  const pending = dataRequestSummary
    ? (dataRequestSummary.counts.SENT ?? 0) + (dataRequestSummary.counts.NEEDS_CLARIFICATION ?? 0)
    : loading ? 'Loading…' : 'Not available';

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-medium text-teal-600 dark:text-teal-400">Supplier workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Supplier Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review persisted customer requests and manage your document evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/supplier/documents">
            <Button variant="outline" size="sm">Documents</Button>
          </Link>
          <Link href="/supplier/data-requests">
            <Button size="sm">Data Requests</Button>
          </Link>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">My Data Requests</h2>
        <p className="mt-1 text-sm text-slate-500">Counts come from requests associated with your organization.</p>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Count label="Total" value={dataRequestSummary ? String(dataRequestSummary.total) : loading ? 'Loading…' : 'Not available'} />
          <Count label="Awaiting response" value={String(pending)} />
          <Count label="In progress" value={count(dataRequestSummary, 'IN_PROGRESS', loading)} />
          <Count label="Submitted" value={count(dataRequestSummary, 'SUBMITTED', loading)} />
          <Count label="Needs clarification" value={count(dataRequestSummary, 'NEEDS_CLARIFICATION', loading)} />
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Feature title="Documents and evidence" href="/supplier/documents">
          Upload supporting files and review extraction and verification results when available.
        </Feature>
        <Feature title="Verification feedback" href="/supplier/verification-issues">
          Review feedback linked to your data requests. No aggregate verification status is available here.
        </Feature>
      </div>

      <p className="text-sm text-slate-500">
        Customer counts, evidence coverage, carbon-record totals, company readiness, and recent activity are not available as persisted dashboard summaries.
      </p>
    </div>
  );
}

function count(summary: DataRequestSummary | null, key: keyof DataRequestSummary['counts'], loading: boolean) {
  if (loading) return 'Loading…';
  return summary ? String(summary.counts[key] ?? 0) : 'Not available';
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function Feature({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">
        <Link href={href} className="hover:underline">{title}</Link>
      </h2>
      <p className="mt-2 text-sm text-slate-500">{children}</p>
    </Card>
  );
}
