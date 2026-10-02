import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

export interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  className,
}) => {
  const icons = {
    info: <Info className="h-5 w-5 text-sky-600 dark:text-sky-400" />,
    success: <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
    danger: <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />,
  };

  const variants = {
    info: 'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800',
    success: 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
    warning: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
    danger: 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800',
  };

  return (
    <div
      role="alert"
      className={cn('flex gap-3 rounded-lg border p-4 text-sm', variants[variant], className)}
    >
      <div className="shrink-0">{icons[variant]}</div>
      <div className="space-y-1">
        {title && <h5 className="font-semibold leading-none">{title}</h5>}
        <div className="opacity-90">{children}</div>
      </div>
    </div>
  );
};
