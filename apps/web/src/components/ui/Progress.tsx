import React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressProps {
  value: number; // 0 to 100
  max?: number;
  className?: string;
  indicatorClassName?: string;
  showLabel?: boolean;
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  className,
  indicatorClassName,
  showLabel = false,
}) => {
  const percentage = Math.min(Math.max(0, (value / max) * 100), 100);

  return (
    <div className="w-full space-y-1">
      {showLabel && (
        <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
          <span>Progress</span>
          <span>{Math.round(percentage)}%</span>
        </div>
      )}
      <div
        className={cn(
          'h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800',
          className
        )}
      >
        <div
          className={cn('h-full bg-emerald-500 transition-all duration-300 rounded-full', indicatorClassName)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
