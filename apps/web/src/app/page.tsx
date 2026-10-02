import Link from 'next/link';
import { ArrowRight, ShieldCheck, Factory, Building2, FileCheck, Layers, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col justify-between">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 font-black text-lg">
            CP
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight">CarbonPilot</span>
            <span className="block text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
              Verification Engine
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-slate-300 hover:text-white">
            Log in
          </Link>
          <Link href="/register">
            <Button size="sm" variant="primary">
              Register Organization
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-400 mb-6">
          <Sparkles className="h-3.5 w-3.5" />
          Technical Foundation Ready • Feature Implementation Phase Pending
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight">
          B2B Supplier Sustainability Intelligence &amp; Evidence Verification
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Move beyond unverified invoice estimates. CarbonPilot pairs document extraction with deterministic cross-document consistency checks and trusted PCF evidence packs.
        </p>

        {/* Portals Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto text-left">
          {/* Customer Portal Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 backdrop-blur hover:border-emerald-500/50 transition-all group">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 mb-4 group-hover:scale-105 transition-transform">
              <Building2 className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-white">Customer / Buyer Portal</h2>
            <p className="mt-2 text-sm text-slate-400">
              Manage suppliers, create purchase data requests, verify PCF claims, analyze Scope 3 emissions, and generate audited evidence packs.
            </p>
            <div className="mt-6">
              <Link href="/customer/dashboard">
                <Button className="w-full gap-2">
                  Enter Buyer Dashboard <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Supplier Portal Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 backdrop-blur hover:border-teal-500/50 transition-all group">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400 mb-4 group-hover:scale-105 transition-transform">
              <Factory className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-white">Supplier / Vendor Portal</h2>
            <p className="mt-2 text-sm text-slate-400">
              Maintain facilities, upload PCF/EPD documents, respond to missing data requests, resolve verification inconsistencies, and share evidence.
            </p>
            <div className="mt-6">
              <Link href="/supplier/dashboard">
                <Button variant="secondary" className="w-full gap-2 bg-slate-700 hover:bg-slate-600 text-white">
                  Enter Supplier Dashboard <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Workflow Diagram Banner */}
        <div className="mt-16 rounded-xl border border-slate-800 bg-slate-950/60 p-6 max-w-4xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Core 10-Stage Verification Data Flow
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-slate-300">
            <span className="rounded bg-slate-800 px-2.5 py-1">Documents</span>
            <span className="text-slate-600">→</span>
            <span className="rounded bg-slate-800 px-2.5 py-1">Extraction</span>
            <span className="text-slate-600">→</span>
            <span className="rounded bg-slate-800 px-2.5 py-1">Claims</span>
            <span className="text-slate-600">→</span>
            <span className="rounded bg-slate-800 px-2.5 py-1">Evidence</span>
            <span className="text-slate-600">→</span>
            <span className="rounded bg-slate-800 px-2.5 py-1">Verification</span>
            <span className="text-slate-600">→</span>
            <span className="rounded bg-emerald-950 text-emerald-400 border border-emerald-800 px-2.5 py-1">Trusted Data</span>
            <span className="text-slate-600">→</span>
            <span className="rounded bg-slate-800 px-2.5 py-1">Carbon Calc</span>
            <span className="text-slate-600">→</span>
            <span className="rounded bg-slate-800 px-2.5 py-1">Intelligence</span>
            <span className="text-slate-600">→</span>
            <span className="rounded bg-slate-800 px-2.5 py-1">Evidence Pack</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        CarbonPilot Technical Architecture Foundation • Ready for feature rollout
      </footer>
    </div>
  );
}
