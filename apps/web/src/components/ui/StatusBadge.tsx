import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, Clock, ShieldCheck, HelpCircle, XCircle } from 'lucide-react';

export type VerificationStatusType =
  | 'Supported'
  | 'Partially Supported'
  | 'Unsupported'
  | 'Pending'
  | 'Verified'
  | 'Warning'
  | 'Anomaly'
  | 'Expired';

interface StatusBadgeProps {
  status: VerificationStatusType | string;
  className?: string;
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className,
  showIcon = true,
}) => {
  const normalized = status.toUpperCase().replace(/\s+/g, '_');

  switch (normalized) {
    case 'SUPPORTED':
    case 'VERIFIED':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
            className
          )}
        >
          {showIcon && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
          {status}
        </span>
      );

    case 'PARTIALLY_SUPPORTED':
    case 'WARNING':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
            className
          )}
        >
          {showIcon && <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
          {status}
        </span>
      );

    case 'UNSUPPORTED':
    case 'ANOMALY':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
            className
          )}
        >
          {showIcon && <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}
          {status}
        </span>
      );

    case 'EXPIRED':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
            className
          )}
        >
          {showIcon && <Clock className="w-3.5 h-3.5 text-slate-500" />}
          {status}
        </span>
      );

    case 'PENDING':
    default:
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
            className
          )}
        >
          {showIcon && <HelpCircle className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
          {status}
        </span>
      );
  }
};
