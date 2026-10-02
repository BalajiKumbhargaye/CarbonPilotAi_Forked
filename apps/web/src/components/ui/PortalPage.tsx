import React from 'react';
import { ArrowRight, Gauge, LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';

export interface PortalPageProps {
  title: string;
  subtitle: string;
  stats?: Array<{ label: string; value: string; accent?: 'emerald' | 'teal' | 'sky' | 'amber' }>
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}

export function PortalPage({ title, subtitle, stats = [], actionLabel, onAction, children }: PortalPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Foundation status</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>

        {actionLabel && (
          <Button variant="primary" onClick={onAction} className="gap-2">
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {stats.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {stats.map((stat, index) => (
            <Card key={index} className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {stat.label}
                </div>
                <Gauge className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{stat.value}</div>
            </Card>
          ))}
        </div>
      )}

      <div>{children}</div>
    </div>
  );
}
