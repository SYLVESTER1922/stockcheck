import type { homeTileInfo } from '../domain/homeTiles';
import { TAB_ICONS, type Tab } from './BottomNav';
import { FileButton } from './FileButton';
import { PoweredBy } from './PoweredBy';
import { RestorePicker } from './RestorePicker';
import { SuspendedPanel } from './SuspendedPanel';

type Props = {
  progress: { finished: number; items: number } | null;
  tiles: ReturnType<typeof homeTileInfo>;
  suspension: string | null;
  onExport: (file: File) => void;
  onRestore: (file: File) => void;
  onContinue: () => void;
  onOpen: (tab: Tab) => void;
};

const STEPS = ['Load your Zobaze Export', "Count what's on the shelf", 'Download your report'];

/** Home (T18). Starting a count follows every rule of the old start screen: guard and access switch. */
export function HomeScreen({ progress, tiles, suspension, onExport, onRestore, onContinue, onOpen }: Props) {
  return (
    <section data-testid="home" className="mt-4 flex flex-1 flex-col gap-3">
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

      <div data-testid="tiles" className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-3">
        <Tile icon={TAB_ICONS.count} title="Count" info={tiles.count} enabled={!!progress} onClick={() => onOpen('count')} />
        <Tile icon={TAB_ICONS.adjust} title="Adjust" info={tiles.adjust} enabled={!!progress} onClick={() => onOpen('adjust')} />
        <Tile
          icon={TAB_ICONS.variance}
          title="Variance"
          info={tiles.variance}
          infoClass={tiles.varianceSign < 0 ? 'font-bold text-rose-700' : tiles.varianceSign > 0 ? 'font-bold text-emerald-700' : undefined}
          enabled={!!progress}
          onClick={() => onOpen('variance')}
        />
        <Tile icon={TAB_ICONS.help} title="How to count" info="Steps and tips" enabled onClick={() => onOpen('help')} />
      </div>

      <RestorePicker onFile={onRestore} compact />

      <ul className="flex flex-wrap justify-center gap-2 text-xs text-slate-700">
        <li className="rounded-full border border-slate-300 bg-white px-3 py-1">
          <span aria-hidden>📶 </span>Works offline
        </li>
        <li className="rounded-full border border-slate-300 bg-white px-3 py-1">
          <span aria-hidden>🔒 </span>Your counts stay on this phone
        </li>
      </ul>

      <div className="-mt-3">
        <PoweredBy />
      </div>

    </section>
  );
}

type TileProps = { icon: string; title: string; info: string; infoClass?: string; enabled: boolean; onClick: () => void };

/** A Home tile: opens the screen it names, with one live line. Without a Session, three of them just hint. */
function Tile({ icon, title, info, infoClass, enabled, onClick }: TileProps) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      className={`flex min-h-24 flex-col items-start justify-between rounded-2xl border-2 border-slate-300 bg-white p-3.5 text-left text-brand-navy shadow-sm ${
        enabled ? 'active:bg-slate-100' : 'opacity-70'
      }`}
    >
      <span aria-hidden className="text-2xl leading-none">
        {icon}
      </span>
      <span className="block">
        <span className="block text-lg leading-tight font-bold">{title}</span>
        <span className={`mt-0.5 block text-sm tabular-nums ${infoClass ?? 'text-slate-600'}`}>{info}</span>
      </span>
    </button>
  );
}
