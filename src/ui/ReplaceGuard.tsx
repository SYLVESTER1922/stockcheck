import { useState } from 'react';
import { adjustmentsLine, type AdjustmentsGuard } from '../domain/replaceGuard';

type Props = {
  /** Items with Counts that are not in a downloaded report; null when the Counts are reported (or there are none). */
  countedItems: number | null;
  /** Recorded Adjustments that are not yet reported (ADR 0007, T26). */
  adjustments: AdjustmentsGuard;
  onReportFirst: () => void;
  onGoToAdjust: () => void;
  onDiscard: () => void;
  onKeepCounting: () => void;
  /** Offered once the Adjustment Report exists (T27); until then the button is not shown. */
  onAdjustmentReport?: () => void;
};

const BUTTON = 'min-h-12 rounded-2xl border-2 border-amber-300 bg-white px-4 py-2 font-medium';
const PRIMARY = 'min-h-12 rounded-2xl bg-brand-blue px-4 py-2 font-semibold text-white';

/**
 * Shown instead of the file picker when the Session has unreported Counts (spec §4.8, ADR 0003) or
 * recorded Adjustments that are not yet reported (ADR 0007). Discarding always takes a second tap.
 */
export function ReplaceGuard({ countedItems, adjustments, onReportFirst, onGoToAdjust, onDiscard, onKeepCounting, onAdjustmentReport }: Props) {
  const [confirming, setConfirming] = useState(false);
  const items = countedItems === null ? null : countedItems === 1 ? '1 counted item' : `${countedItems} counted items`;
  const line = adjustmentsLine(adjustments);
  const keep = items === null ? 'Keep working' : 'Keep counting';
  const what = items !== null && line ? `${items} and ${line}` : (items ?? line);

  return (
    <section role="alert" className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      {confirming ? (
        <>
          <p className="font-semibold">Discard {what}? This cannot be undone.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={onDiscard} className="min-h-12 rounded-2xl bg-rose-700 px-4 py-2 font-semibold text-white">
              Yes, discard
            </button>
            <button onClick={onKeepCounting} className={BUTTON}>
              {keep}
            </button>
          </div>
        </>
      ) : (
        <>
          {items !== null ? (
            <>
              <p className="font-semibold">This Session has counts that aren't in a downloaded report.</p>
              <p className="mt-1">Loading a new Export or restoring a backup clears them. Download the report first, or discard them.</p>
              {line && (
                <p data-testid="guard-adjustments" className="mt-2">
                  It also has {line}. They are cleared too.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="font-semibold">
                {adjustments.level === 'block'
                  ? 'This Session has Approved Adjustments that are not yet Applied.'
                  : 'This Session has Adjustments with decisions recorded.'}
              </p>
              <p data-testid="guard-adjustments" className="mt-1">
                It has {line}. Loading a new Export or restoring a backup clears them.{' '}
                {onAdjustmentReport ? 'Download the Adjustment Report first, or discard them.' : 'Finish them in the Adjust tab first, or discard them.'}
              </p>
            </>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {items !== null && (
              <button onClick={onReportFirst} className={PRIMARY}>
                Download the report first
              </button>
            )}
            {line && onAdjustmentReport && (
              <button onClick={onAdjustmentReport} className={items === null ? PRIMARY : BUTTON}>
                Download the Adjustment Report first
              </button>
            )}
            {line && (
              <button onClick={onGoToAdjust} className={items === null && !onAdjustmentReport ? PRIMARY : BUTTON}>
                Go to Adjust
              </button>
            )}
            <button onClick={() => setConfirming(true)} className={BUTTON}>
              Discard this Session
            </button>
            <button onClick={onKeepCounting} className="min-h-12 px-3 font-medium underline">
              {keep}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
