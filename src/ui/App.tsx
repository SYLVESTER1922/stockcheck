import { useEffect, useMemo, useState } from 'react';
import { parseBackup } from '../domain/backup';
import { formatUsd } from '../domain/format';
import type { Field } from '../domain/headers';
import { buildReport } from '../domain/report';
import { canReplace, markReported, newSession, type Session } from '../domain/session';
import { BottomNav, type Tab } from './BottomNav';
import { CountScreen } from './CountScreen';
import { ExportPicker } from './ExportPicker';
import { HowToCount } from './HowToCount';
import { ReplaceGuard } from './ReplaceGuard';
import { ReportScreen } from './ReportScreen';
import { RestorePicker } from './RestorePicker';
import { loadNames, loadSession, saveSession } from './storage';
import { UpdateBanner } from './UpdateBanner';

export type ImportInfo = { matched: Partial<Record<Field, string>> };
/** Replacing the Session: nothing, the guard (unreported Counts), or the file picker. */
type Replacing = 'no' | 'guard' | 'pick';

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [importInfo, setImportInfo] = useState<ImportInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('count');
  const [replacing, setReplacing] = useState<Replacing>('no');
  /** A restored Session waiting for the guard (unreported Counts) to be resolved. */
  const [pendingRestore, setPendingRestore] = useState<Session | null>(null);

  useEffect(() => saveSession(session), [session]);

  async function onFile(file: File) {
    const { loadExport } = await import('../domain/workbook');
    const result = loadExport(await file.arrayBuffer());
    if (!result.ok) return setError(result.message);
    setError(null);
    setImportInfo({ matched: result.matched });
    setSession(newSession(file.name, new Date().toISOString(), result.items));
    setReplacing('no');
    setTab('count');
  }

  /** Restoring replaces the Session, so it passes the same guard as a new Export (spec §4.10). */
  async function onRestore(file: File) {
    const result = parseBackup(await file.text());
    if (!result.ok) return setError(result.message);
    setError(null);
    if (session && !canReplace(session)) {
      setPendingRestore(result.session);
      setReplacing('guard');
      return;
    }
    replaceWith(result.session);
  }

  function replaceWith(next: Session | null) {
    setSession(next);
    setPendingRestore(null);
    setImportInfo(null);
    setReplacing('no');
    setTab('count');
  }

  const showPicker = !session || replacing === 'pick';

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      <Header session={session} />

      <main className="mx-auto max-w-xl px-4">
        <UpdateBanner />

        {tab === 'help' && <HowToCount onBack={() => setTab('count')} />}
        {tab !== 'help' && (
          <>
            {showPicker && (
              <section className="mt-4 space-y-1 rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="text-base font-semibold">{session ? 'Load a new Export' : 'Start a count'}</h2>
                <ExportPicker onFile={onFile} />
                {!session && <RestorePicker onFile={onRestore} />}
                {session && (
                  <button onClick={() => setReplacing('no')} className="mt-2 h-11 text-sm font-medium text-slate-600 underline">
                    Cancel
                  </button>
                )}
              </section>
            )}

            {error && (
              <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
                {error}
              </p>
            )}

            {session && replacing === 'guard' && (
              <ReplaceGuard
                countedItems={Object.keys(session.tallies).length}
                onReportFirst={() => {
                  setPendingRestore(null);
                  setReplacing('no');
                  setTab('report');
                }}
                onDiscard={() => replaceWith(pendingRestore)}
                onKeepCounting={() => {
                  setPendingRestore(null);
                  setReplacing('no');
                }}
              />
            )}

            {session && replacing === 'no' && tab === 'report' && (
              <ReportScreen
                session={session}
                onReported={() => setSession((s) => s && markReported(s))}
                onRestore={onRestore}
              />
            )}
            {session && replacing === 'no' && tab === 'count' && (
              <CountScreen
                session={session}
                importInfo={importInfo}
                onChange={setSession}
                onNewExport={() => setReplacing(canReplace(session) ? 'pick' : 'guard')}
              />
            )}
          </>
        )}

        <footer className="mt-8 text-center text-xs text-slate-500">Version {__APP_VERSION__}</footer>
      </main>

      <BottomNav
        tab={tab}
        hasSession={!!session && replacing === 'no'}
        uncounted={session ? session.items.length - Object.keys(session.tallies).length : 0}
        onTab={setTab}
      />
    </div>
  );
}

/** Sticky header: app name and branch on the left; net Variance Value and progress on the right. */
function Header({ session }: { session: Session | null }) {
  const branch = useMemo(() => loadNames().branches[0], []);
  const summary = useMemo(
    () => session && buildReport(session, { branch: '', counter: '', generatedAt: '' }).summary,
    [session],
  );
  const progress = summary && summary.items > 0 ? Math.round((summary.finished / summary.items) * 100) : 0;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <div
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white"
          >
            ✓
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-bold">StockCheck</h1>
            <p className="text-xs text-slate-500">{branch || 'No branch set'}</p>
          </div>
        </div>
        {summary && (
          <div className="text-right leading-tight">
            <p
              className={`whitespace-nowrap text-sm font-bold tabular-nums ${summary.netValue < 0 ? 'text-rose-700' : summary.netValue > 0 ? 'text-emerald-700' : 'text-slate-600'}`}
            >
              {formatUsd(summary.netValue)}
            </p>
            <p className="text-xs text-slate-500">{progress}% counted</p>
          </div>
        )}
      </div>
    </header>
  );
}
