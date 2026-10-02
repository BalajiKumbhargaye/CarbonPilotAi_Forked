'use client';

import React from 'react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Progress } from '@/components/ui/Progress';
import { Button } from '@/components/ui/Button';

export default function SupplierComparisonPage() {
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Suppliers', href: '/customer/suppliers' },
          { label: 'Supplier Comparison' },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Supplier Comparison</h1>
        <p className="text-sm text-slate-500">Benchmark sustainability metrics, PCF emission intensity, and audit credibility across vendors.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Supplier 1 */}
        <Card className="border-t-4 border-t-emerald-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Titan Alloy &amp; Steel Works</CardTitle>
                <p className="text-xs text-slate-500">Steel &amp; Primary Metallurgy</p>
              </div>
              <StatusBadge status="Verified" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Average PCF</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">1.82 kgCO2e/kg</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Methodology Standard</span>
              <span className="font-medium">ISO 14067 (Third-Party Audited)</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Data Completeness</span>
              <span className="font-medium">85%</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Evidence Support</span>
              <span className="font-medium text-emerald-600">90% Primary</span>
            </div>
            <div className="pt-2">
              <Button size="sm" variant="outline" className="w-full">
                View Full Dossier
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Supplier 2 */}
        <Card className="border-t-4 border-t-amber-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Nexa Polymer Solutions</CardTitle>
                <p className="text-xs text-slate-500">Chemicals &amp; Technical Resins</p>
              </div>
              <StatusBadge status="Warning" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Average PCF</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">3.45 kgCO2e/kg</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Methodology Standard</span>
              <span className="font-medium">GHG Protocol Product Standard</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Data Completeness</span>
              <span className="font-medium">60%</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Evidence Support</span>
              <span className="font-medium text-amber-600">65% (Mixed Sources)</span>
            </div>
            <div className="pt-2">
              <Button size="sm" variant="outline" className="w-full">
                View Full Dossier
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
