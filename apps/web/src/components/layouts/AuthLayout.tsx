import React from 'react';
import Link from 'next/link';

export const AuthLayout: React.FC<{ children: React.ReactNode; title: string; subtitle: string }> = ({
  children,
  title,
  subtitle,
}) => {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
      {/* Left Branding Panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-slate-900 p-12 text-white relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 font-black text-lg">
              CP
            </div>
            <span className="text-2xl font-bold tracking-tight">CarbonPilot</span>
          </div>
          <div className="mt-2 inline-block rounded-full bg-emerald-950 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-800">
            Enterprise ESG Evidence Verification
          </div>
        </div>

        <div className="relative z-10 max-w-md space-y-4">
          <blockquote className="text-xl font-medium leading-relaxed text-slate-200">
            "Transforming unverified supplier declarations into auditable, claim-backed Scope 3 intelligence."
          </blockquote>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>• Cross-document consistency checks</span>
            <span>• Automated PCF claim validation</span>
            <span>• Real-time audit packs</span>
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-500">
          © 2026 CarbonPilot Inc. All rights reserved.
        </div>

        {/* Ambient background glow */}
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-emerald-600/20 blur-3xl" />
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-teal-600/10 blur-3xl" />
      </div>

      {/* Right Form Panel */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-sm">
              CP
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">CarbonPilot</span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
};
