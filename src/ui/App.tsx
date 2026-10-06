import { useEffect, useState } from 'react';
import type { Field } from '../domain/headers';
import { canReplace, markReported, newSession, type Session } from '../domain/session';
import { CountScreen } from './CountScreen';
import { ExportPicker } from './ExportPicker';
import { ReplaceGuard } from './ReplaceGuard';
import { ReportScreen } from './ReportScreen';
import { loadSession, saveSession } from './storage';

export type ImportInfo = { matched: Partial<Record<Field, string>> };
type Screen = 'count' | 'report';
/** Replacing the Session: nothing, the guard (unreported Counts), or the file picker. */
type Replacing = 'no' | 'guard' | 'pick';

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [importInfo, setImportInfo] = useState<ImportInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('count');
  const [replacing, setReplacing] = useState<Replacing>('no');

  useEffect(() => saveSession(session), [session]);

  async function onFile(file: File) {
    const { loadExport } = await import('../domain/workbook');
    const result = loadExport(await file.arrayBuffer());
    if (!result.ok) return setError(result.message);
    setError(null);
    setImportInfo({ matched: result.matched });
    setSession(newSession(file.name, new Date().toISOString(), result.items));
    setReplacing('no');
    setScreen('count');
  }

  const showPicker = !session || replacing === 'pick';

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-lg font-bold">StockCheck</h1>

      {showPicker && <ExportPicker onFile={onFile} />}
      {session && replacing === 'pick' && (
        <button onClick={() => setReplacing('no')} className="mt-2 text-sm underline">
          Cancel
        </button>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      {session && replacing === 'guard' && (
        <ReplaceGuard
          countedItems={Object.keys(session.tallies).length}
          onReportFirst={() => {
            setReplacing('no');
            setScreen('report');
          }}
          onDiscard={() => {
            setSession(null);
            setReplacing('no');
          }}
          onKeepCounting={() => setReplacing('no')}
        />
      )}

      {session && replacing === 'no' && (
        <>
          <nav className="mt-3 flex gap-2">
            {(['count', 'report'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScreen(s)}
                aria-current={screen === s ? 'page' : undefined}
                className={`rounded-full px-4 py-1 text-sm ${screen === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
              >
                {s === 'count' ? 'Count' : 'Report'}
              </button>
            ))}
          </nav>

          {screen === 'report' && (
            <ReportScreen session={session} onReported={() => setSession((s) => s && markReported(s))} />
          )}
          {screen === 'count' && (
            <CountScreen
              session={session}
              importInfo={importInfo}
              onChange={setSession}
              onNewExport={() => setReplacing(canReplace(session) ? 'pick' : 'guard')}
            />
          )}
        </>
      )}
    </main>
  );
}
