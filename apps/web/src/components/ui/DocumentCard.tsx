import React from 'react';
import { cn } from '@/lib/utils';
import { FileText, Download, CheckCircle, Clock } from 'lucide-react';
import { Badge } from './Badge';

export interface DocumentCardProps {
  filename: string;
  type: string;
  fileSize: number;
  uploadedAt: string;
  status: string;
  onDownload?: () => void;
  className?: string;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  filename,
  type,
  fileSize,
  uploadedAt,
  status,
  onDownload,
  className,
}) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900',
        className
      )}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <FileText className="h-5 w-5" />
        </div>
        <div className="truncate">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{filename}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Badge variant="outline">{type}</Badge>
            <span>•</span>
            <span>{formatBytes(fileSize)}</span>
            <span>•</span>
            <span>{new Date(uploadedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-4">
        {status === 'EXTRACTED' ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="h-3.5 w-3.5" /> Extracted
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Clock className="h-3.5 w-3.5" /> {status}
          </span>
        )}
        {onDownload && (
          <button
            onClick={onDownload}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
