'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Inbox } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { getDataRequestSummary, getIncomingDataRequests, type DataRequestRecord, type DataRequestStatus, type DataRequestSummary } from '@/lib/data-requests';

function statusClasses(status: DataRequestStatus) {
  if (status === 'SUBMITTED' || status === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'NEEDS_CLARIFICATION') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (status === 'IN_PROGRESS') return 'border-cyan-200 bg-cyan-50 text-cyan-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function label(status: DataRequestStatus) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function SupplierDataRequestsPage() {
  const [requests, setRequests] = useState<DataRequestRecord[]>([]);
  const [summary, setSummary] = useState<DataRequestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getIncomingDataRequests(), getDataRequestSummary()]).then(([items, totals]) => {
      if (!active) return;
      setRequests(items);
      setSummary(totals);
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load incoming requests.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const summaryItems: Array<[string, number | undefined]> = [
    ['Pending', summary?.counts.SENT],
    ['In progress', summary?.counts.IN_PROGRESS],
    ['Submitted', summary?.counts.SUBMITTED],
    ['Clarification required', summary?.counts.NEEDS_CLARIFICATION],
  ];

  return <div className="space-y-6">
    <Breadcrumb items={[{ label: 'Data', href: '/supplier/data-requests' }, { label: 'Data Requests' }]} />
    <header className="border-b border-slate-200 pb-5"><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Customer collaboration</p><h1 className="mt-1 text-2xl font-bold text-slate-950">Incoming Data Requests</h1><p className="mt-1 text-sm text-slate-600">Review requirements, save responses as you go, and submit them to the buyer.</p></header>
    {error && <p role="alert" className="border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
    <div className="grid grid-cols-2 border-y border-slate-200 sm:grid-cols-4">{summaryItems.map(([name, value]) => <div key={name} className="border-r border-slate-200 px-4 py-3 last:border-r-0"><p className="text-xs text-slate-500">{name}</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value ?? '—'}</p></div>)}</div>
    <section aria-label="Incoming requests" className="divide-y divide-slate-200 border-y border-slate-200">
      {requests.map((request) => <article key={request._id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div><div className="flex flex-wrap items-center gap-2"><Link href={`/supplier/data-requests/${request._id}`} className="font-semibold text-slate-900 hover:text-teal-800">{request.title}</Link><span className={`inline-flex border px-2 py-1 text-xs font-semibold ${statusClasses(request.status)}`}>{label(request.status)}</span></div><p className="mt-1 text-xs text-slate-600">From {request.customerOrganization?.name || 'Buyer'}{request.product?.name ? ` · ${request.product.name}` : ''}{request.deadline ? ` · Due ${new Date(request.deadline).toLocaleDateString()}` : ''}</p><p className="mt-1 text-xs text-slate-500">{request.completion.completed} of {request.completion.total} items complete</p></div>
        <Link href={`/supplier/data-requests/${request._id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:underline">Open request <ArrowRight className="h-4 w-4" /></Link>
      </article>)}
      {!loading && !requests.length && <div className="py-14 text-center"><Inbox className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 text-base font-semibold text-slate-900">No incoming requests</h2><p className="mt-1 text-sm text-slate-500">Requests from connected buyers will appear here.</p></div>}
      {loading && <p className="py-12 text-center text-sm text-slate-500">Loading incoming requests...</p>}
    </section>
  </div>;
}