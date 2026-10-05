import { useEffect, useState } from 'react';
import type { Field } from '../domain/headers';
import { newSession, type Session } from '../domain/session';
import { CountScreen } from './CountScreen';
import { loadSession, saveSession } from './storage';

export type ImportInfo = { matched: Partial<Record<Field, string>> };

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [importInfo, setImportInfo] = useState<ImportInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => saveSession(session), [session]);

  async function onFile(file: File) {
    const { loadExport } = await import('../domain/workbook');
    const result = loadExport(await file.arrayBuffer());
    if (!result.ok) return setError(result.message);
    setError(null);
    setImportInfo({ matched: result.matched });
    setSession(newSession(file.name, new Date().toISOString(), result.items));
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-lg font-bold">StockCheck</h1>

      {!session && (
        <label className="mt-4 block text-sm font-medium">
          Zobaze Export
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="mt-1 block w-full text-sm"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      {session && (
        <CountScreen
          session={session}
          importInfo={importInfo}
          onChange={setSession}
          // Interim: the reported-Session guard replaces this confirm in T7.
          onNewExport={() => window.confirm('Start again with a new Export? Counts in this Session will be lost.') && setSession(null)}
        />
      )}
    </main>
  );
}
