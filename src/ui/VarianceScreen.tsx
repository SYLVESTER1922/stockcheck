import { useMemo, useState } from 'react';
import { formatQuantity, formatUsd, signedQuantity, signedUsd } from '../domain/format';
import { buildReport } from '../domain/report';
import type { Session } from '../domain/session';
import { biggestGaps, varianceView, type GapRanking } from '../domain/varianceView';

/** The Variance tab (T17). Every figure comes from buildReport, like the Excel Summary. */
export function VarianceScreen({ session }: { session: Session }) {
  const report = useMemo(() => buildReport(session, { branch: '', counter: '', generatedAt: '' }), [session]);
  const view = varianceView(report);
  const [by, setBy] = useState<GapRanking>('value');
  const [open, setOpen] = useState<string | null>(null);
  const gaps = biggestGaps(report, by);
  const tone = (n: number) => (n < 0 ? 'text-rose-700' : n > 0 ? 'text-emerald-700' : 'text-slate-800');

  return (
    <section className="mt-4 space-y-4">
      <div data-testid="variance-hero" className="rounded-2xl bg-gradient-to-br from-brand-deep to-brand-blue p-4 text-white shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-blue-100 uppercase">Net variance value (at cost)</p>
        <p data-testid="hero-net" className="text-4xl font-bold whitespace-nowrap tabular-nums">
          {signedUsd(view.hero.net)}
        </p>
        <p className="mt-1 text-sm text-blue-100 tabular-nums">
          <span data-testid="hero-short" className="whitespace-nowrap">{signedUsd(view.hero.short)}</span> short ·{' '}
          <span data-testid="hero-over" className="whitespace-nowrap">{signedUsd(view.hero.over)}</span> over
        </p>
        <p className="mt-1 text-sm text-blue-100 tabular-nums">
          against <span data-testid="hero-expected" className="font-semibold text-white">{formatUsd(view.hero.expectedValueCounted)}</span>{' '}
          Expected value of the counted Items
        </p>
      </div>

      {view.inProgress > 0 && (
        <p data-testid="in-progress-line" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {view.inProgress} in progress (Done not tapped)
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Tile id="tile-short" label="Lines short" value={view.tiles.short.lines} valueClass="text-rose-700">
          {signedQuantity(view.tiles.short.units)} units
        </Tile>
        <Tile id="tile-over" label="Lines over" value={view.tiles.over.lines} valueClass="text-emerald-700">
          {signedQuantity(view.tiles.over.units)} units
        </Tile>
        <Tile id="tile-match" label="Exact match" value={view.tiles.match} valueClass="text-slate-900">
          ✓ no difference
        </Tile>
        <Tile id="tile-not-counted" label="Not counted" value={view.tiles.notCounted} valueClass="text-slate-900">
          no Tallies yet
        </Tile>
      </div>

      <div data-testid="gaps" className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Biggest gaps</h2>
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            {(['value', 'units'] as const).map((option) => (
              <button
                key={option}
                aria-pressed={by === option}
                onClick={() => setBy(option)}
                className={`h-11 min-w-11 rounded-lg px-3 ${by === option ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-600'}`}
              >
                by {option}
              </button>
            ))}
          </div>
        </div>

        {gaps.length === 0 && <p className="mt-3 text-sm text-slate-600">No gaps yet: every Done Item matches.</p>}
        <ul className="mt-2">
          {gaps.map((g) => (
            <li key={g.key} className="border-b border-slate-100 last:border-0">
              <button
                onClick={() => setOpen(open === g.key ? null : g.key)}
                aria-expanded={open === g.key}
                className="block min-h-11 w-full py-3 text-left"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span data-testid="gap-name" className="min-w-0 font-medium">
                    {g.name}
                    {g.variant ? ` ${g.variant}` : ''}
                  </span>
                  <span className={`shrink-0 font-bold whitespace-nowrap tabular-nums ${tone(g.variance)}`}>
                    {by === 'units' && `${signedQuantity(g.variance)} units · `}
                    {signedUsd(g.value)}
                  </span>
                </span>
                <span aria-hidden className="mt-1 block h-2 rounded-full bg-slate-100">
                  <span
                    className={`block h-2 rounded-full ${g.direction === 'short' ? 'bg-rose-600' : 'bg-emerald-600'}`}
                    style={{ width: `${Math.max(2, g.fraction * 100)}%` }}
                  />
                </span>
                <span className="mt-1 block text-xs text-slate-600 tabular-nums">
                  expected {formatQuantity(g.expected)} · counted {formatQuantity(g.count)} · cost {formatUsd(g.cost)}
                </span>
              </button>
              {open === g.key && (
                <p data-testid="gap-detail" className="mb-3 rounded-xl bg-slate-50 p-2 text-sm text-slate-800 tabular-nums">
                  Count at Done {g.countAtDone === null ? '—' : formatQuantity(g.countAtDone)} ·{' '}
                  {g.countAtLookAgain === null
                    ? 'Look Again not prompted'
                    : `Count at Look Again ${formatQuantity(g.countAtLookAgain)}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-slate-600">{view.note}</p>
    </section>
  );
}

function Tile({ id, label, value, valueClass, children }: { id: string; label: string; value: number; valueClass: string; children: React.ReactNode }) {
  return (
    <div data-testid={id} className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-xs text-slate-600 tabular-nums">{children}</p>
    </div>
  );
}
