'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { getProcurementCarbonReport, type ProcurementCarbonReportResponse } from '@/lib/reports';

const currentYear = new Date().getFullYear();
const periodOptions = [
  { label: 'All data', value: '' },
  { label: String(currentYear), value: String(currentYear) },
  ...[1, 2, 3, 4].map((quarter) => ({
    label: `Q${quarter} ${currentYear}`,
    value: `Q${quarter} ${currentYear}`,
  })),
];

function formatNumber(value: number | undefined, digits = 0) {
  if (!Number.isFinite(value ?? NaN)) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value ?? 0);
}

function formatEmissions(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) return '—';
  return `${formatNumber(value, 2)} kgCO2e`;
}

function formatProcurementTotals(report: ProcurementCarbonReportResponse | null) {
  const totals = report?.summary.totalProcurementValueByCurrency;
  if (!totals?.length) return '—';
  return totals.map(({ currency, amount }) => {
    if (currency === 'UNKNOWN') return `Currency unavailable ${formatNumber(amount, 2)}`;
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${formatNumber(amount, 2)}`;
    }
  }).join(' · ');
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

export default function CustomerReportsPage() {
  const [period, setPeriod] = useState(String(currentYear));
  const [report, setReport] = useState<ProcurementCarbonReportResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getProcurementCarbonReport(period || undefined)
      .then((data) => {
        if (!active) return;
        setReport(data);
      })
      .catch(() => {
        if (!active) return;
        setReport(null);
        setError('Unable to load the procurement reporting dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [period]);

  const sections = useMemo(() => [
    { label: 'Total purchases', value: formatNumber(report?.summary.totalPurchases) },
    { label: 'Total quantity', value: formatNumber(report?.summary.totalProcurementQuantity) },
    { label: 'Suppliers', value: formatNumber(report?.summary.suppliersCount) },
    { label: 'Products', value: formatNumber(report?.summary.productsCount) },
    { label: 'Procurement value', value: formatProcurementTotals(report) },
    { label: 'Expected emissions', value: formatEmissions(report?.summary.totalExpectedEmissions) },
    { label: 'Actual emissions', value: formatEmissions(report?.summary.totalActualEmissions) },
    { label: 'Variance', value: formatEmissions(report?.summary.totalVariance) },
    { label: 'With carbon data', value: formatNumber(report?.summary.purchasesWithCarbonData) },
    { label: 'Without carbon data', value: formatNumber(report?.summary.purchasesWithoutCarbonData) },
    { label: 'Not comparable', value: formatNumber(report?.summary.purchasesNotComparable) },
  ], [report]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Reporting</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">Procurement Carbon &amp; Sustainability Reporting</h1>
        </div>
        <label className="flex flex-col text-sm font-medium text-slate-700 dark:text-slate-300">
          Reporting period
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {periodOptions.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">Loading report…</div>
      ) : error ? null : report?.purchases.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950">
          No reporting data available for this period.
        </div>
      ) : report ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {sections.slice(0, 8).map((item) => (
              <StatCard key={item.label} label={item.label} value={item.value} />
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Data quality</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {Object.entries(report?.summary.dataQuality ?? {}).map(([key, value]) => (
                  <div key={key} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Certificates</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {Object.entries(report?.summary.certificates ?? {}).map(([key, value]) => (
                  <div key={key} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Purchase detail</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300">
                    <th className="px-3 py-2 font-medium">Purchase</th>
                    <th className="px-3 py-2 font-medium">Supplier</th>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Expected</th>
                    <th className="px-3 py-2 font-medium">Actual</th>
                    <th className="px-3 py-2 font-medium">Variance</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.purchases.length ? (
                    report.purchases.map((purchase) => (
                      <tr key={purchase.purchase._id} className="border-b border-slate-100 align-top dark:border-slate-900">
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{purchase.purchase.referenceNumber || '—'}</div>
                          <div className="text-xs text-slate-500">{new Date(purchase.purchase.purchaseDate).toLocaleDateString()}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{purchase.supplier.name}</td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{purchase.product.name}</td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{purchase.expected.emissions != null ? formatEmissions(purchase.expected.emissions) : 'N/A'}</td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{purchase.actual.emissions != null ? formatEmissions(purchase.actual.emissions) : 'N/A'}</td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{purchase.variance != null ? formatEmissions(purchase.variance) : 'N/A'}</td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{purchase.status}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-500">No purchase records match the selected reporting period.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
