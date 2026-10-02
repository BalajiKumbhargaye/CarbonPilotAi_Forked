import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { UploadCloud, File, X } from 'lucide-react';
import { Button } from './Button';

export interface FileUploadProps {
  onFileSelect?: (file: File) => void;
  accept?: string;
  maxSizeBytes?: number;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  accept = '.pdf,.xlsx,.csv,.png,.jpg',
  maxSizeBytes = 25 * 1024 * 1024,
  className,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError(null);
    if (file.size > maxSizeBytes) {
      setError(`File size exceeds limit of ${Math.round(maxSizeBytes / (1024 * 1024))}MB`);
      return;
    }
    setSelectedFile(file);
    onFileSelect?.(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
          dragOver
            ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
            : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/50'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-slate-800 shadow-sm mb-3">
          <UploadCloud className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>

        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Click or drag and drop to upload document
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Supports PCF, EPD, Invoices, Certificates (PDF, XLSX, CSV up to 25MB)
        </p>
      </div>

      {selectedFile && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5 truncate">
            <File className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
              {selectedFile.name}
            </span>
          </div>
          <button
            onClick={() => setSelectedFile(null)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
    </div>
  );
};
