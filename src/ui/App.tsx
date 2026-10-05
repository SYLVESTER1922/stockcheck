import { useState } from 'react';
import { warningCounts, warningMessages, type ExportResult } from '../domain/export';
import { formatQuantity, formatUsd } from '../domain/format';

const FIELD_LABELS = {
  name: 'Item name',
  expected: 'Expected',
  cost: 'Cost price',
  variant: 'Variant',
  sku: 'SKU',
  category: 'Category',
} as const;

export function App() {
  const [result, setResult] = useState<ExportResult | null>(null);

  async function onFile(file: File) {
    const { loadExport } = await import('../domain/workbook');
    setResult(loadExport(await file.arrayBuffer()));
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-lg font-bold">StockCheck</h1>
      <label className="mt-4 block text-sm font-medium">
        Zobaze Export
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="mt-1 block w-full text-sm"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>

      {result && !result.ok && (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          {result.message}
        </p>
      )}

      {result?.ok && (
        <>
          <section className="mt-4 rounded-lg bg-white p-3 text-sm shadow-sm">
            <p className="font-semibold">{result.items.length} items loaded</p>
            <ul className="mt-1 text-slate-600">
              {Object.entries(result.matched).map(([field, header]) => (
                <li key={field}>
                  {FIELD_LABELS[field as keyof typeof FIELD_LABELS]} ← {header}
                </li>
              ))}
            </ul>
            {warningMessages(warningCounts(result.items)).map((message) => (
              <p key={message} className="mt-2 text-amber-800">
                ⚠ {message}
              </p>
            ))}
          </section>

          {/* Import preview only; replaced by the count screen in T4 (Expected is hidden there, ADR 0004). */}
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th>Item</th>
                <th>Variant</th>
                <th className="text-right">Expected</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.key} className="border-t border-slate-200">
                  <td>
                    {item.name}
                    {item.duplicate !== null && <span className="ml-1 text-xs text-amber-700">#{item.duplicate}</span>}
                  </td>
                  <td>{item.variant}</td>
                  <td className="text-right tabular-nums">
                    {item.expected === null ? 'unreadable' : formatQuantity(item.expected)}
                    {item.flags.includes('negative-system-stock') && (
                      <span className="ml-1 rounded bg-rose-100 px-1 text-xs text-rose-700">negative</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{formatUsd(item.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
