import { FileButton } from './FileButton';
import { PoweredBy } from './PoweredBy';
import { RestorePicker } from './RestorePicker';
import { SuspendedPanel } from './SuspendedPanel';

type Props = {
  progress: { finished: number; items: number } | null;
  suspension: string | null;
  onExport: (file: File) => void;
  onRestore: (file: File) => void;
  onContinue: () => void;
  onHowTo: () => void;
};

const STEPS = ['Load your Zobaze Export', "Count what's on the shelf", 'Download your report'];

/** Home (T18). Starting a count follows every rule of the old start screen: guard and access switch. */
export function HomeScreen({ progress, suspension, onExport, onRestore, onContinue, onHowTo }: Props) {
  return (
    <section data-testid="home" className="mt-4 space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-brand-deep to-brand-blue p-5 text-white shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-blue-100 uppercase">Stocktake for Zobaze POS</p>
        <h2 className="mt-1 text-2xl leading-tight font-bold">Count your stock. Find the gaps.</h2>
        <ol data-testid="steps" className="mt-4 space-y-2 text-sm">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 font-bold">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {progress ? (
        <button
          onClick={onContinue}
          className="flex min-h-16 w-full flex-col items-center justify-center rounded-2xl bg-brand-blue px-4 py-2 text-white shadow-sm active:bg-brand-deep"
        >
          <span className="text-lg font-bold">Continue count</span>
          <span className="text-sm text-blue-100 tabular-nums">
            {progress.finished} of {progress.items} counted
          </span>
        </button>
      ) : suspension !== null ? (
        <SuspendedPanel message={suspension} />
      ) : (
        <FileButton
          label="Start a count: choose your Zobaze Export"
          text="Start a count"
          accept=".xlsx,.xls,.csv"
          onFile={onExport}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <RestorePicker onFile={onRestore} />
        <button
          onClick={onHowTo}
          className="min-h-14 rounded-2xl border-2 border-slate-300 bg-white px-4 text-base font-semibold text-slate-800"
        >
          How to count
        </button>
      </div>

      <ul className="flex flex-wrap justify-center gap-2 text-xs text-slate-700">
        <li className="rounded-full border border-slate-300 bg-white px-3 py-1">
          <span aria-hidden>📶 </span>Works offline
        </li>
        <li className="rounded-full border border-slate-300 bg-white px-3 py-1">
          <span aria-hidden>🔒 </span>Your counts stay on this phone
        </li>
      </ul>

      <PoweredBy />
    </section>
  );
}
