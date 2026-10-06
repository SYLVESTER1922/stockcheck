import { useEffect, useMemo, useState } from 'react';
import { isSuspended, type Access } from '../domain/access';
import { parseBackup } from '../domain/backup';
import { formatUsd } from '../domain/format';
import type { Field } from '../domain/headers';
import { buildReport } from '../domain/report';
import { canReplace, markReported, newSession, type Session } from '../domain/session';
import { loadAccess, refreshAccess } from './accessCheck';
import { BottomNav, type Tab } from './BottomNav';
import { CountScreen } from './CountScreen';
import { ExportPicker } from './ExportPicker';
import { HomeScreen } from './HomeScreen';
import { HowToCount } from './HowToCount';
import { ReplaceGuard } from './ReplaceGuard';
import { ReportScreen } from './ReportScreen';
import { SuspendedPanel } from './SuspendedPanel';
import { loadNames, loadSession, saveSession, SESSION_KEY } from './storage';
import { UpdateBanner } from './UpdateBanner';
import { VarianceScreen } from './VarianceScreen';

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

  const [access, setAccess] = useState<Access>(loadAccess);
  const suspended = isSuspended(access);

  useEffect(() => saveSession(session), [session]);

  // Each tab opens at its top, not at the previous tab's scroll position. (Braces matter: an effect
  // must return nothing or a clean-up function, and scrollTo may return a Promise.)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  // Another copy of the app on this device (installed app, tab, window) changed the saved Session:
  // adopt it, so this window never acts on a stale copy.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => (e.key === SESSION_KEY || e.key === null) && setSession(loadSession());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /**
   * The Session a replacement would destroy unreported counts in, checking both this window's copy
   * and the saved one (another window may have counted, or this window's last save may have failed).
   */
  function blockingSession(): Session | null {
    if (session && !canReplace(session)) return session;
    const saved = loadSession();
    return saved && !canReplace(saved) ? saved : null;
  }

  function showGuard(blocking: Session) {
    setSession(blocking);
    setReplacing('guard');
  }

  // ADR 0006: check the Status File on open and whenever the app returns to the foreground.
  useEffect(() => {
    const check = () => void refreshAccess().then(setAccess);
    const onVisible = () => document.visibilityState === 'visible' && check();
    check();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  async function onFile(file: File) {
    const blocking = blockingSession();
    if (blocking) return showGuard(blocking);
    // Check again right before starting a new Session; a slow or failed check never blocks (ADR 0006).
    const latest = await refreshAccess();
    setAccess(latest);
    if (isSuspended(latest)) return;
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
    const blocking = blockingSession();
    if (blocking) {
      setPendingRestore(result.session);
      showGuard(blocking);
      return;
    }
    replaceWith(result.session);
  }

  const summary = useMemo(
    () => session && buildReport(session, { branch: '', counter: '', generatedAt: '' }).summary,
    [session],
  );

  /** Home shows when chosen, or whenever there is no Session (T18). The guard always takes priority. */
  const isHome = replacing !== 'guard' && (tab === 'home' || (!session && tab !== 'help'));

  // Android back (browser history): leaving Home adds one history entry, so "back" returns Home.
  useEffect(() => {
    if (!isHome && history.state?.stockcheck !== 'inner') history.pushState({ stockcheck: 'inner' }, '');
  }, [isHome]);
  useEffect(() => {
    const onPop = () => {
      setTab('home');
      setReplacing('no');
      setPendingRestore(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** Goes Home without touching the Session: only what is on screen changes. */
  function goHome() {
    if (history.state?.stockcheck === 'inner') history.back(); // popstate → Home, keeping history clean
    else {
      setTab('home');
      setReplacing('no');
      setPendingRestore(null);
    }
  }

  function replaceWith(next: Session | null) {
    setSession(next);
    setPendingRestore(null);
    setImportInfo(null);
    setReplacing('no');
    setTab('count');
  }

  const showPicker = !!session && replacing === 'pick';

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      <Header summary={summary} onHome={isHome ? null : goHome} />

      <main className="mx-auto max-w-xl px-4">
        <UpdateBanner />

        {session && suspended && replacing === 'no' && tab !== 'help' && (
          <p role="status" className="mt-3 rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-700">
            New counts are paused. You can finish, report and back up this count.
          </p>
        )}

        {tab === 'help' && <HowToCount onBack={() => setTab('count')} />}
        {tab !== 'help' && (
          <>
            {isHome && (
              <HomeScreen
                progress={summary ? { finished: summary.finished, items: summary.items } : null}
                suspension={suspended && access ? access.message : null}
                onExport={onFile}
                onRestore={onRestore}
                onContinue={() => setTab('count')}
                onHowTo={() => setTab('help')}
              />
            )}

            {!isHome && showPicker && (
              <section className="mt-4 space-y-1 rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="text-base font-semibold">Load a new Export</h2>
                {suspended && access ? <SuspendedPanel message={access.message} /> : <ExportPicker onFile={onFile} />}
                <button onClick={() => setReplacing('no')} className="mt-2 h-11 text-sm font-medium text-slate-600 underline">
                  Cancel
                </button>
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

            {!isHome && session && replacing === 'no' && tab === 'variance' && <VarianceScreen session={session} />}
            {!isHome && session && replacing === 'no' && tab === 'report' && (
              <ReportScreen
                session={session}
                onReported={() => setSession((s) => s && markReported(s))}
                onRestore={onRestore}
              />
            )}
            {!isHome && session && replacing === 'no' && tab === 'count' && (
              <CountScreen
                session={session}
                importInfo={importInfo}
                onChange={setSession}
                onNewExport={() => {
                  const blocking = blockingSession();
                  if (blocking) showGuard(blocking);
                  else setReplacing('pick');
                }}
              />
            )}
          </>
        )}

        <footer className="mt-8 text-center text-xs text-slate-500">Version {__APP_VERSION__}</footer>
      </main>

      {!isHome && (
        <BottomNav
        tab={tab}
        hasSession={!!session && replacing === 'no'}
        uncounted={session ? session.items.length - Object.keys(session.tallies).length : 0}
        onTab={setTab}
        />
      )}
    </div>
  );
}

type Summary = ReturnType<typeof buildReport>['summary'];

/**
 * Sticky header: a Home arrow on every screen except Home (T18), app name and branch, and the net
 * Variance Value and progress when there is a Session.
 */
function Header({ summary, onHome }: { summary: Summary | null; onHome: (() => void) | null }) {
  const branch = useMemo(() => loadNames().branches[0], []);
  const progress = summary && summary.items > 0 ? Math.round((summary.finished / summary.items) * 100) : 0;

  return (
    <header className="sticky top-0 z-30 border-b-[3px] border-brand-orange bg-white">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {onHome ? (
            <button
              onClick={onHome}
              aria-label="Home"
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl text-brand-navy active:bg-slate-100"
            >
              <span aria-hidden>←</span>
            </button>
          ) : (
            <div aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-sm font-bold text-white">
              ✓
            </div>
          )}
          <div className="min-w-0 leading-tight">
            <h1 className="text-sm font-bold text-brand-navy">StockCheck</h1>
            <p className="truncate text-xs text-slate-500">{branch || 'No branch set'}</p>
          </div>
        </div>
        {summary && (
          <div className="shrink-0 text-right leading-tight">
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
