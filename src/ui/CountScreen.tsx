import { useMemo, useState } from 'react';
import { warningCounts, warningMessages } from '../domain/export';
import { formatQuantity, formatUsd } from '../domain/format';
import { searchItems } from '../domain/search';
import { hasCounts, lineFor, type Session } from '../domain/session';
import { ItemPanel } from './ItemPanel';
import type { ImportInfo } from './App';

const MAX_RESULTS = 30;

const FIELD_LABELS: Record<string, string> = {
  name: 'Item name',
  expected: 'Expected',
  cost: 'Cost price',
  variant: 'Variant',
  sku: 'SKU',
  category: 'Category',
};

type Props = {
  session: Session;
  importInfo: ImportInfo | null;
  onChange: (session: Session) => void;
  onNewExport: () => void;
};

export function CountScreen({ session, importInfo, onChange, onNewExport }: Props) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const results = useMemo(() => searchItems(session.items, query).slice(0, MAX_RESULTS), [session.items, query]);
  const selected = session.items.find((i) => i.key === selectedKey);
  const warnings = warningMessages(warningCounts(session.items));
  /** Once counting starts, the import details shrink to one line to leave room for counting. */
  const counting = hasCounts(session);

  return (
    <>
      <section className="mt-4 rounded-2xl bg-white p-4 text-sm shadow-sm">
        <div className={`flex justify-between gap-2 ${counting ? 'items-center' : 'items-start'}`}>
          <div className="min-w-0">
            <p className="font-semibold">{session.items.length} items loaded</p>
            <p className="truncate text-slate-500">{session.exportFileName}</p>
            {counting && warnings.length > 0 && (
              <details className="mt-1 text-amber-900">
                <summary className="cursor-pointer">⚠ {warnings.length === 1 ? '1 warning' : `${warnings.length} warnings`}</summary>
                {warnings.map((message) => (
                  <p key={message} className="mt-1">
                    {message}
                  </p>
                ))}
              </details>
            )}
          </div>
          <button
            onClick={onNewExport}
            className="h-11 shrink-0 rounded-xl border border-slate-300 px-3 text-xs font-medium text-slate-700"
          >
            Load a new Export
          </button>
        </div>
        {!counting && importInfo && (
          <p className="mt-2 text-xs text-slate-600">
            {Object.entries(importInfo.matched)
              .map(([field, header]) => `${FIELD_LABELS[field]} ← ${header}`)
              .join(' · ')}
          </p>
        )}
        {!counting && warnings.map((message) => (
          <p key={message} className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-amber-900">
            ⚠ {message}
          </p>
        ))}
      </section>

      <input
        type="search"
        aria-label="Find an item"
        placeholder="Find an item, e.g. sugar 2kg"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="sticky top-[57px] z-20 mt-4 h-14 w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-lg shadow-sm outline-none focus:border-indigo-500"
      />

      {selected && (
        <ItemPanel
          key={selected.key}
          item={selected}
          session={session}
          onChange={onChange}
          onClose={() => setSelectedKey(null)}
        />
      )}

      <ul className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
        {results.map((item) => {
          const line = lineFor(session, item);
          return (
            <li key={item.key}>
              <button
                onClick={() => setSelectedKey(item.key)}
                className="flex min-h-14 w-full items-center gap-2 border-b border-slate-100 px-4 py-2 text-left text-base"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{item.name}</span> <span className="text-slate-500">{item.variant}</span>
                  {item.duplicate !== null && (
                    <span className="ml-1 text-xs text-amber-800">
                      #{item.duplicate} · {formatUsd(item.cost)}
                    </span>
                  )}
                </span>
                {line.status === 'in-progress' && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                    in progress
                  </span>
                )}
                {line.status === 'finished' && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    ✓ {formatQuantity(line.count)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
