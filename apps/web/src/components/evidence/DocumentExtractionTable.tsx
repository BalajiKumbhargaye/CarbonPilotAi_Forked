import { IExtractionField } from '@carbonpilot/shared';

type DocumentExtractionTableProps = {
  fields: IExtractionField[];
  emptyMessage?: string;
};

function formatValue(value: IExtractionField['value']) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined) return '—';
  return String(value);
}

function formatConfidence(confidence?: number) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return '—';
  const normalized = confidence > 1 ? confidence : confidence * 100;
  return `${Math.round(normalized)}%`;
}

export function DocumentExtractionTable({ fields, emptyMessage = 'No extraction data available.' }: DocumentExtractionTableProps) {
  if (!fields.length) {
    return <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm text-slate-700 dark:text-slate-200">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <th className="px-2 py-1 font-semibold">Field</th>
            <th className="px-2 py-1 font-semibold">Value</th>
            <th className="px-2 py-1 font-semibold">Unit</th>
            <th className="px-2 py-1 font-semibold">Page</th>
            <th className="px-2 py-1 font-semibold">Confidence</th>
            <th className="px-2 py-1 font-semibold">Source</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => (
            <tr key={`${field.field}-${field.page ?? 'page'}-${index}`} className="rounded-lg bg-white shadow-sm dark:bg-slate-950/50">
              <td className="rounded-l-lg border border-slate-200 px-2 py-2 dark:border-slate-700">{field.field}</td>
              <td className="border border-slate-200 px-2 py-2 dark:border-slate-700">{formatValue(field.value)}</td>
              <td className="border border-slate-200 px-2 py-2 dark:border-slate-700">{field.unit || '—'}</td>
              <td className="border border-slate-200 px-2 py-2 dark:border-slate-700">{field.page ?? '—'}</td>
              <td className="border border-slate-200 px-2 py-2 dark:border-slate-700">{formatConfidence(field.confidence)}</td>
              <td className="rounded-r-lg border border-slate-200 px-2 py-2 dark:border-slate-700">{field.source || field.sourceText || 'Document'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
