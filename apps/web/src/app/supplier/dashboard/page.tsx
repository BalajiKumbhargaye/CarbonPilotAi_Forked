'use client';

import React from 'react';
import { ArrowRight, Building2, CheckCircle2, Factory, Leaf, PackageCheck, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { MetricCard } from '@/components/ui/MetricCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';

export default function SupplierDashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-600 dark:text-teal-400">Supplier workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Supplier Operations Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage company profile, document evidence, and customer requests as the foundation for later business automation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/supplier/documents">
            <Button variant="outline" size="sm" className="gap-1.5">
              Upload Evidence
            </Button>
          </Link>
          <Link href="/supplier/evidence-packs">
            <Button size="sm" className="gap-1.5">
              Review Audit Pack
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Active Customers" value="14" change="+2 this quarter" isPositive icon={Building2} />
        <MetricCard title="Pending Requests" value="6" change="2 due this week" isPositive={false} icon={PackageCheck} />
        <MetricCard title="Evidence Coverage" value="81%" change="+7% in 30 days" isPositive icon={ShieldCheck} />
        <MetricCard title="Carbon Data" value="42" change="records updated" isPositive icon={Leaf} />
        <MetricCard title="Verification Status" value="Healthy" change="No critical issues" isPositive icon={CheckCircle2} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Operational readiness</CardTitle>
            <CardDescription>Foundation modules are active and routed for future business workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4 dark:border-teal-900 dark:bg-teal-950/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Company profile</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">Supplier verification metadata and facility data are linked and staged.</p>
                </div>
                <StatusBadge status="Healthy" />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow modules</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">Facilities</div>
                <div className="rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">Products</div>
                <div className="rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">Questionnaires</div>
                <div className="rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">Evidence packs</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Priority actions</CardTitle>
            <CardDescription>Actions to continue after the foundation is complete.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              Refresh product carbon data for the next reporting cycle.
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
              Confirm outstanding customer questionnaire replies.
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
              Review verification issues before sending evidence packs.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent supplier activity</CardTitle>
              <CardDescription>Latest updates across documents, questionnaires, and requests.</CardDescription>
            </div>
            <Link href="/supplier/documents" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400">
              Open documents <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            'Customer request for facility emissions data was created and routed to the supplier team.',
            'EPD and certificate documents were uploaded and marked for future verification review.',
            'Questionnaire response workflow remains in the scaffolded foundation state.',
          ].map((item, index) => (
            <div key={index} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
              <div className="mt-0.5 rounded-md bg-teal-100 p-1.5 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                <Factory className="h-3.5 w-3.5" />
              </div>
              <p className="text-slate-600 dark:text-slate-300">{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
