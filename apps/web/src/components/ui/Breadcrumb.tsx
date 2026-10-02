import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className }) => {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center text-xs text-slate-500', className)}>
      <ol className="flex items-center space-x-1.5">
        <li>
          <Link href="/" className="hover:text-slate-700 dark:hover:text-slate-300">
            <Home className="h-3.5 w-3.5" />
          </Link>
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center space-x-1.5">
              <ChevronRight className="h-3 w-3 text-slate-400" />
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-slate-700 dark:hover:text-slate-300">
                  {item.label}
                </Link>
              ) : (
                <span className="font-semibold text-slate-900 dark:text-slate-100">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
