import React from 'react';
import { cn } from '@/lib/utils';
import { FileSearch, CheckCircle2, XCircle, HelpCircle, ExternalLink } from 'lucide-react';

export interface EvidenceCardProps {
  checkType: string;
  result: 'PASS' | 'FAIL' | 'UNKNOWN';
  expected?: string;
  observed?: string;
  explanation: string;
  sourceDocName?: string;
  sourcePage?: number;
  className?: string;
}

export const EvidenceCard: React.FC<EvidenceCardProps> = ({
  checkType,
  result,
  expected,
  observed,
  explanation,
  sourceDocName,
  sourcePage,
  className,
}) => {
  const resultIcons = {
    PASS: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
    FAIL: <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />,
    UNKNOWN: <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
  };

  const resultStyles = {
    PASS: 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/20',
    FAIL: 'border-rose-200 bg-rose-50/30 dark:border-rose-900 dark:bg-rose-950/20',
    UNKNOWN: 'border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20',
  };

  return (
    <div
      className={cn(
        'rounded-xl border p-4 shadow-sm transition-all',
        resultStyles[result],
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {resultIcons[result]}
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            {checkType.replace(/_/g, ' ')}
          </span>
        </div>
        <span
          className={cn(
            'text-xs font-semibold px-2 py-0.5 rounded-full',
            result === 'PASS'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
              : result === 'FAIL'
              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
          )}
        >
          {result}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{explanation}</p>

      {(expected || observed) && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-white/70 p-2 text-xs dark:bg-slate-900/70 border border-slate-200/50 dark:border-slate-800">
          <div>
            <span className="text-slate-400 block">Expected:</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">{expected || 'N/A'}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Observed:</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">{observed || 'N/A'}</span>
          </div>
        </div>
      )}

      {sourceDocName && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200/40 dark:border-slate-800">
          <span className="truncate flex items-center gap-1">
            <FileSearch className="h-3 w-3" />
            {sourceDocName} {sourcePage ? `(p. ${sourcePage})` : ''}
          </span>
        </div>
      )}
    </div>
  );
};
