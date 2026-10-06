import { useState } from 'react';

type Props = {
  countedItems: number;
  onReportFirst: () => void;
  onDiscard: () => void;
  onKeepCounting: () => void;
};

/** Shown instead of the file picker when the Session has unreported Counts (spec §4.8, ADR 0003). */
export function ReplaceGuard({ countedItems, onReportFirst, onDiscard, onKeepCounting }: Props) {
  const [confirming, setConfirming] = useState(false);
  const items = countedItems === 1 ? '1 counted item' : `${countedItems} counted items`;

  return (
    <section role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      {confirming ? (
        <>
          <p className="font-semibold">Discard {items}? This cannot be undone.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={onDiscard} className="rounded-lg bg-rose-700 px-3 py-2 font-semibold text-white">
              Yes, discard
            </button>
            <button onClick={onKeepCounting} className="rounded-lg border border-amber-300 px-3 py-2">
              Keep counting
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-semibold">This Session has counts that aren't in a downloaded report.</p>
          <p className="mt-1">Loading a new Export or restoring a backup clears them. Download the report first, or discard them.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={onReportFirst} className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white">
              Download the report first
            </button>
            <button onClick={() => setConfirming(true)} className="rounded-lg border border-amber-300 px-3 py-2">
              Discard this Session
            </button>
            <button onClick={onKeepCounting} className="rounded-lg px-3 py-2 underline">
              Keep counting
            </button>
          </div>
        </>
      )}
    </section>
  );
}
