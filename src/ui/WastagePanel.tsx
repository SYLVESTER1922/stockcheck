import { useState } from 'react';
import type { Item } from '../domain/export';
import { formatQuantity, signedQuantity } from '../domain/format';
import { removeWastage, setWastage, type Session } from '../domain/session';
import { parseWastage, REASONS, WASTAGE_FLAG_TEXT, wastageFor, type WastageInput } from '../domain/wastage';

type Props = { item: Item; session: Session; onChange: (session: Session) => void };

const EMPTY: WastageInput = { quantity: '', reason: '', note: '', register: '', confirmed: false };
const FIELD = 'mt-1 h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-base outline-none focus:border-brand-blue';

/**
 * Optional Wastage for a Done Item (ADR 0007). Shown beside the Variance, never instead of it.
 * The tick starts empty every time the form opens, so it is always a fresh confirmation.
 */
export function WastagePanel({ item, session, onChange }: Props) {
  const line = wastageFor(session, item);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WastageInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function openForm() {
    const saved = line?.entry;
    setForm(saved ? { quantity: formatQuantity(saved.quantity).replace(/,/g, ''), reason: saved.reason, note: saved.note, register: saved.register, confirmed: false } : EMPTY);
    setError(null);
    setOpen(true);
  }

  function save() {
    const result = parseWastage(form, new Date().toISOString());
    if (!result.ok) return setError(result.message);
    onChange(setWastage(session, item, result.entry));
    setOpen(false);
  }

  const set = (patch: Partial<WastageInput>) => setForm((f) => ({ ...f, ...patch }));

  if (open) {
    return (
      <form
        data-testid="wastage-form"
        className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="text-sm font-semibold">Wastage not yet deducted in Zobaze</p>
        <label className="block text-sm font-medium">
          Wastage quantity
          <input
            inputMode="decimal"
            autoComplete="off"
            value={form.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            className={`${FIELD} tabular-nums`}
          />
        </label>
        <label className="block text-sm font-medium">
          Wastage reason
          <select value={form.reason} onChange={(e) => set({ reason: e.target.value as WastageInput['reason'] })} className={FIELD}>
            <option value="">Choose…</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Wastage note {form.reason === 'Other' ? '(needed)' : '(optional)'}
          <input value={form.note} autoComplete="off" onChange={(e) => set({ note: e.target.value })} className={FIELD} />
        </label>
        <label className="block text-sm font-medium">
          Register reference
          <input value={form.register} autoComplete="off" onChange={(e) => set({ register: e.target.value })} className={FIELD} />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.confirmed}
            onChange={(e) => set({ confirmed: e.target.checked })}
            className="h-11 w-11 shrink-0 accent-brand-blue"
          />
          This is NOT already deducted in Zobaze.
        </label>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="h-12 w-1/3 rounded-xl border-2 border-slate-300 bg-white text-sm font-semibold text-slate-700">
            Cancel
          </button>
          <button type="submit" className="h-12 flex-1 rounded-xl bg-brand-blue text-base font-bold text-white active:bg-brand-deep">
            Save Wastage
          </button>
        </div>
      </form>
    );
  }

  if (!line) {
    return (
      <button type="button" onClick={openForm} className="mt-3 h-12 w-full rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-700">
        <span aria-hidden>+ </span>Record Wastage
      </button>
    );
  }

  return (
    <div data-testid="wastage" className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm tabular-nums">
      <div className="grid grid-cols-3 gap-2">
        <p>
          <span className="block text-xs text-slate-600">Variance</span>
          {signedQuantity(line.total)}
        </p>
        <p>
          <span className="block text-xs text-slate-600">Wastage</span>
          {formatQuantity(line.wastage)}
        </p>
        <p className="font-bold">
          <span className="block text-xs font-normal text-slate-600">Unexplained</span>
          {signedQuantity(line.unexplained)}
        </p>
      </div>
      <p className="text-slate-700">
        {line.entry.reason}
        {line.entry.note && `: ${line.entry.note}`} · Register {line.entry.register}
      </p>
      {line.flags.map((flag) => (
        <p key={flag} className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-amber-900">
          {WASTAGE_FLAG_TEXT[flag]}
        </p>
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={openForm} className="h-11 flex-1 rounded-xl border-2 border-slate-300 bg-white font-semibold text-slate-700">
          Edit Wastage
        </button>
        <button
          type="button"
          onClick={() => onChange(removeWastage(session, item))}
          className="h-11 flex-1 rounded-xl border-2 border-slate-300 bg-white font-semibold text-slate-700"
        >
          Remove Wastage
        </button>
      </div>
    </div>
  );
}
