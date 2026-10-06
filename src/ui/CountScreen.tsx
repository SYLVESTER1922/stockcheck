import { useMemo, useState } from 'react';
import { warningCounts, warningMessages } from '../domain/export';
import { formatQuantity, formatUsd } from '../domain/format';
import { searchItems } from '../domain/search';
import { lineFor, type Session } from '../domain/session';
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

  return (
    <>
      <section className="mt-4 rounded-lg bg-white p-3 text-sm shadow-sm">
        <p className="font-semibold">{session.items.length} items loaded</p>
        <p className="text-slate-500">{session.exportFileName}</p>
        {importInfo && (
          <ul className="mt-1 text-slate-600">
            {Object.entries(importInfo.matched).map(([field, header]) => (
              <li key={field}>
                {FIELD_LABELS[field]} ← {header}
              </li>
            ))}
          </ul>
        )}
        {warnings.map((message) => (
          <p key={message} className="mt-2 text-amber-800">
            ⚠ {message}
          </p>
        ))}
        <button onClick={onNewExport} className="mt-2 text-xs text-slate-500 underline">
          Load a new Export
        </button>
      </section>

      <input
        type="search"
        aria-label="Find an item"
        placeholder="Find an item, e.g. sugar 2kg"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-4 w-full rounded-lg border border-slate-300 bg-white p-3 text-base"
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

      <ul className="mt-2">
        {results.map((item) => {
          const line = lineFor(session, item);
          return (
            <li key={item.key}>
              <button
                onClick={() => setSelectedKey(item.key)}
                className="w-full border-b border-slate-200 py-2 text-left text-sm"
              >
                <span className="font-medium">{item.name}</span> <span className="text-slate-500">{item.variant}</span>
                {item.duplicate !== null && (
                  <span className="ml-1 text-xs text-amber-700">
                    #{item.duplicate} · {formatUsd(item.cost)}
                  </span>
                )}
                {line.status === 'in-progress' && (
                  <span className="float-right text-xs text-amber-700">in progress</span>
                )}
                {line.status === 'finished' && (
                  <span className="float-right text-xs text-emerald-700">✓ {formatQuantity(line.count)}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
