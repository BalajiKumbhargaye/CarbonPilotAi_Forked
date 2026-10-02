import React from 'react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T extends { id?: string | number; _id?: string | number }>({
  columns,
  data,
  emptyMessage = 'No records found',
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900', className)}>
      <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
        <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500 border-b border-slate-200 dark:bg-slate-800/50 dark:border-slate-800">
          <tr>
            {columns.map((col, index) => (
              <th key={index} className={cn('px-4 py-3', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.length > 0 ? (
            data.map((row, rIdx) => (
              <tr
                key={String(row.id || row._id || rIdx)}
                className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
              >
                {columns.map((col, cIdx) => (
                  <td key={cIdx} className={cn('px-4 py-3.5', col.className)}>
                    {col.cell
                      ? col.cell(row)
                      : col.accessorKey
                      ? String(row[col.accessorKey] ?? '')
                      : null}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const Table = DataTable;
