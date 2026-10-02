'use client';

import React from 'react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Building2, MapPin, Globe, ShieldCheck, FileText, Plus } from 'lucide-react';

export default function SupplierProfilePage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Suppliers', href: '/customer/suppliers' },
          { label: 'Titan Alloy & Steel Works' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Titan Alloy &amp; Steel Works
            </h1>
            <StatusBadge status="Verified" />
          </div>
          <p className="mt-1 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> Gujarat Industrial Belt, India
            </span>
            <span className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" /> https://titansteel.example.com
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            Request Data Update
          </Button>
          <Button size="sm">Download Evidence Dossier</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Catalog Products (2)</CardTitle>
            <CardDescription>Verified product carbon footprints</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <p className="font-semibold text-slate-800 dark:text-slate-200">Automotive Structural Steel S500MC</p>
              <p className="text-slate-500">TITAN-STL-500 • 1.82 kgCO2e/kg</p>
            </div>
            <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <p className="font-semibold text-slate-800 dark:text-slate-200">Hot-Rolled Heavy Plate</p>
              <p className="text-slate-500">TITAN-PLT-300 • 2.05 kgCO2e/kg</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Production Facilities</CardTitle>
            <CardDescription>Operational manufacturing plants</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <p className="font-semibold text-slate-800 dark:text-slate-200">Blast Furnace Complex #4</p>
              <p className="text-slate-500">Capacity: 500,000 MT/yr • Grid Mix Verified</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verified Certificates</CardTitle>
            <CardDescription>Audited management certifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">ISO 14001:2015</p>
                <p className="text-slate-500">Valid until Dec 2025</p>
              </div>
              <StatusBadge status="Verified" />
            </div>
            <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">ISO 50001:2018</p>
                <p className="text-slate-500">Valid until Nov 2026</p>
              </div>
              <StatusBadge status="Verified" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
