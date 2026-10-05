import { useMemo, useState } from 'react';
import { warningCounts, warningMessages, type Item } from '../domain/export';
import { formatQuantity, formatUsd } from '../domain/format';
import { searchItems } from '../domain/search';
import { addTally, lineFor, type Session } from '../domain/session';
import { parseTally } from '../domain/tally';
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
          onAdd={(value) => onChange(addTally(session, selected.key, value))}
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
                {line.counted && (
                  <span className="float-right text-xs text-emerald-700">
                    ✓ {line.tallies.map(formatQuantity).join(' + ')}
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

function ItemPanel({
  item,
  session,
  onAdd,
  onClose,
}: {
  item: Item;
  session: Session;
  onAdd: (thousandths: number) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const parsed = parseTally(text);
  const echo = parsed.ok && formatQuantity(parsed.value) !== text.trim() ? `= ${formatQuantity(parsed.value)}` : null;
  const line = lineFor(session, item);

  function commit() {
    if (!parsed.ok) return setError(parsed.message);
    setError(null);
    setText('');
    onAdd(parsed.value);
  }

  return (
    <section data-testid="item-panel" className="mt-3 rounded-lg bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="font-semibold">
          {item.name} <span className="font-normal text-slate-500">{item.variant}</span>
          {item.duplicate !== null && <span className="ml-1 text-xs text-amber-700">#{item.duplicate}</span>}
        </p>
        <button onClick={onClose} aria-label="Close" className="px-2 text-slate-400">
          ✕
        </button>
      </div>

      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          aria-label="Count"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-32 rounded-lg border border-slate-300 p-2 text-lg tabular-nums"
        />
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">
          Add
        </button>
        {echo && <span className="text-sm text-slate-600">{echo}</span>}
      </form>
      {error && <p className="mt-1 text-sm text-rose-700">{error}</p>}

      {line.counted && (
        <p data-testid="line" className="mt-3 text-sm tabular-nums">
          {item.expected === null ? 'Expected unreadable' : `Expected ${formatQuantity(item.expected)}`} · Count{' '}
          {formatQuantity(line.count)}
          {line.variance !== null && line.value !== null && (
            <>
              {' '}
              · Variance {signed(line.variance)} · <b>{formatUsd(line.value)}</b>
            </>
          )}
        </p>
      )}
    </section>
  );
}

const signed = (thousandths: number) => (thousandths > 0 ? `+${formatQuantity(thousandths)}` : formatQuantity(thousandths));
