import React from 'react';
import { cn } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import { Shield, FileCheck, Layers } from 'lucide-react';

export interface ClaimCardProps {
  type: string;
  value: string | number;
  unit: string;
  methodology: string;
  boundary: string;
  reportingPeriod: string;
  status: string;
  confidence?: number;
  evidenceCount?: number;
  className?: string;
  onVerify?: () => void;
}

export const ClaimCard: React.FC<ClaimCardProps> = ({
  type,
  value,
  unit,
  methodology,
  boundary,
  reportingPeriod,
  status,
  confidence,
  evidenceCount = 1,
  className,
  onVerify,
}) => {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {type.replace(/_/g, ' ')}
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</span>
            <span className="text-sm font-medium text-slate-500">{unit}</span>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
        <div>
          <span className="text-slate-400">Methodology:</span> <span className="font-medium">{methodology}</span>
        </div>
        <div>
          <span className="text-slate-400">Boundary:</span> <span className="font-medium">{boundary}</span>
        </div>
        <div>
          <span className="text-slate-400">Period:</span> <span className="font-medium">{reportingPeriod}</span>
        </div>
        <div>
          <span className="text-slate-400">Confidence:</span>{' '}
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {confidence ? `${Math.round(confidence * 100)}%` : '100%'}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 text-xs">
        <span className="inline-flex items-center gap-1 text-slate-500">
          <FileCheck className="h-3.5 w-3.5 text-slate-400" />
          {evidenceCount} linked document{evidenceCount > 1 ? 's' : ''}
        </span>
        {onVerify && (
          <button
            onClick={onVerify}
            className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            Verify Claim →
          </button>
        )}
      </div>
    </div>
  );
};
