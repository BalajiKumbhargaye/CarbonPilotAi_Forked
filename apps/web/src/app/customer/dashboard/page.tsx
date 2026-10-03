'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  DollarSign,
  Leaf,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  TrendingDown,
  Building2,
  FileCheck,
  ClipboardList,
} from 'lucide-react';
import { MetricCard } from '@/components/ui/MetricCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Progress } from '@/components/ui/Progress';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { getPurchaseSummary, type PurchaseSummary } from '@/lib/procurement';
import { getDataRequestSummary, type DataRequestSummary } from '@/lib/data-requests';

export default function CustomerDashboardPage() {
  const [procurementSummary, setProcurementSummary] = useState<PurchaseSummary | null>(null);
  const [dataRequestSummary, setDataRequestSummary] = useState<DataRequestSummary | null>(null);

  useEffect(() => {
    getPurchaseSummary().then(setProcurementSummary).catch(() => setProcurementSummary(null));
    getDataRequestSummary().then(setDataRequestSummary).catch(() => setDataRequestSummary(null));
  }, []);

  const purchaseValue = procurementSummary?.totalPurchaseValueByCurrency.length
    ? procurementSummary.totalPurchaseValueByCurrency.map(({ amount, currency }) => {
      try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount)); }
      catch { return `${currency} ${amount}`; }
    }).join(' · ')
    : '—';

  return (
    <div className="space-y-8">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Supplier Sustainability Overview
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time verification metrics and Scope 3 supplier carbon intelligence for Apex Mobility Corp.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/customer/data-requests">
            <Button size="sm" variant="outline" className="gap-1.5">
              + New Data Request
            </Button>
          </Link>
          <Link href="/customer/evidence-packs">
            <Button size="sm" variant="primary" className="gap-1.5">
              Generate Audit Pack
            </Button>
          </Link>
        </div>
      </div>

      {/* 6 Key Foundation Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard
          title="Active Suppliers"
          value={procurementSummary ? String(procurementSummary.activeSuppliers) : '—'}
          change="Active connected suppliers"
          isPositive={true}
          icon={Users}
        />
        <MetricCard
          title="Purchase Value"
          value={procurementSummary ? purchaseValue : '—'}
          change="Grouped by currency"
          isPositive={true}
          icon={DollarSign}
        />
        <MetricCard
          title="Scope 3 Carbon"
          value="28,450 t"
          change="-4.2% YoY"
          isPositive={true}
          icon={Leaf}
          subtitle="tCO2e calculated"
        />
        <MetricCard
          title="Evidence Support"
          value="78%"
          change="+12% verified"
          isPositive={true}
          icon={ShieldCheck}
          subtitle="Backed by primary EPD/PCF"
        />
        <MetricCard
          title="Data Quality"
          value="84 / 100"
          change="High Fidelity"
          isPositive={true}
          icon={FileCheck}
          subtitle="Methodology & Boundary"
        />
        <MetricCard
          title="Attention Required"
          value="7"
          change="3 Inconsistencies"
          isPositive={false}
          icon={AlertTriangle}
          subtitle="Requires clarification"
        />
      </div>

      <section className="border-y border-slate-200 py-4" aria-labelledby="data-request-summary-title">
        <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-emerald-700" /><h2 id="data-request-summary-title" className="text-sm font-semibold text-slate-900">Data Requests</h2></div><Link href="/customer/data-requests" className="text-xs font-semibold text-emerald-800 hover:underline">View requests</Link></div>
        <div className="grid grid-cols-2 gap-y-3 sm:grid-cols-5"><div><p className="text-xs text-slate-500">Total</p><p className="mt-1 text-lg font-semibold tabular-nums">{dataRequestSummary?.total ?? '—'}</p></div><div><p className="text-xs text-slate-500">Sent</p><p className="mt-1 text-lg font-semibold tabular-nums">{dataRequestSummary?.counts.SENT ?? '—'}</p></div><div><p className="text-xs text-slate-500">In progress</p><p className="mt-1 text-lg font-semibold tabular-nums">{dataRequestSummary?.counts.IN_PROGRESS ?? '—'}</p></div><div><p className="text-xs text-slate-500">Submitted</p><p className="mt-1 text-lg font-semibold tabular-nums">{dataRequestSummary?.counts.SUBMITTED ?? '—'}</p></div><div><p className="text-xs text-slate-500">Needs clarification</p><p className="mt-1 text-lg font-semibold tabular-nums">{dataRequestSummary?.counts.NEEDS_CLARIFICATION ?? '—'}</p></div></div>
      </section>

      {/* Verification Health & Data Completeness Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Verification Status Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Supplier Verification Status Breakdown</CardTitle>
                <CardDescription>
                  Audit standing of Tier-1 suppliers based on verified PCF claims &amp; certificates
                </CardDescription>
              </div>
              <Link href="/customer/evidence-center">
                <Button variant="ghost" size="sm" className="text-xs">
                  View Evidence Center →
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Fully Supported (Claims with primary PCF)
                </span>
                <span className="text-slate-900 dark:text-slate-100 font-bold">32 suppliers (66%)</span>
              </div>
              <Progress value={66} indicatorClassName="bg-emerald-500" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Partially Supported (Secondary benchmarks used)
                </span>
                <span className="text-slate-900 dark:text-slate-100 font-bold">11 suppliers (23%)</span>
              </div>
              <Progress value={23} indicatorClassName="bg-amber-500" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> Potential Inconsistencies / Missing Evidence
                </span>
                <span className="text-slate-900 dark:text-slate-100 font-bold">5 suppliers (11%)</span>
              </div>
              <Progress value={11} indicatorClassName="bg-rose-500" />
            </div>
          </CardContent>
        </Card>

        {/* Priority Action Items */}
        <Card>
          <CardHeader>
            <CardTitle>Priority Action Items</CardTitle>
            <CardDescription>Anomalies and missing questionnaires requiring attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200">Titan Steel PCF Renewal</p>
                <p className="text-amber-700/90 dark:text-amber-400 mt-0.5">
                  Reporting period 2023 expiring in 14 days. Request updated 2024 emission figures.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-xs dark:border-rose-900 dark:bg-rose-950/20">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-900 dark:text-rose-200">Quantity Mismatch Detected</p>
                <p className="text-rose-700/90 dark:text-rose-400 mt-0.5">
                  Invoice INV-2024-088 reports 450 MT vs PO-9912 stating 400 MT. Requires supplier clarification.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">
              <Clock className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{dataRequestSummary?.total ?? '—'} Data Requests</p>
                <p className="text-slate-500 mt-0.5">{dataRequestSummary?.counts.IN_PROGRESS ?? 0} in progress · {dataRequestSummary?.counts.SUBMITTED ?? 0} submitted · {dataRequestSummary?.counts.NEEDS_CLARIFICATION ?? 0} need clarification.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Sustainability &amp; Evidence Activity</CardTitle>
              <CardDescription>Live audit trail of uploads, verifications, and calculations</CardDescription>
            </div>
            <Link href="/customer/documents" className="text-xs font-semibold text-emerald-600 hover:underline">
              View All Documents →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <div className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    PCF Verification Pass: Titan Alloy &amp; Steel Works
                  </p>
                  <p className="text-slate-500">
                    Product: Automotive Structural Steel Grade S500MC • PCF: 1.82 kgCO2e/kg
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status="Supported" />
                <span className="text-slate-400">10 mins ago</span>
              </div>
            </div>

            <div className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-sky-100 p-2 text-sky-700 dark:bg-sky-950 dark:text-sky-400">
                  <FileCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    New Invoice Uploaded: PO-2024-819
                  </p>
                  <p className="text-slate-500">
                    Supplier: Nexa Polymer Solutions • Extraction scheduled
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status="Pending" />
                <span className="text-slate-400">1 hour ago</span>
              </div>
            </div>

            <div className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-2 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    Potential Inconsistency Flagged: Facility Mismatch
                  </p>
                  <p className="text-slate-500">
                    Declared plant location in EPD differs from registered purchase order dispatch depot.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status="Warning" />
                <span className="text-slate-400">3 hours ago</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
