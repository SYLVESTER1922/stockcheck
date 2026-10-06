import type { Session } from '../domain/session';

// One JSON document in this origin's localStorage (ADR 0002). Bump the version if the shape changes.
const KEY = 'stockcheck.session.v1';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    // Sessions saved before a field existed get its empty default.
    return { lastChangeAt: null, changes: 0, reportedChanges: null, finished: {}, countAtDone: {}, countAtLookAgain: {}, ...(JSON.parse(raw) as Partial<Session>) } as Session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage full or blocked: the Session stays in memory. Backup (T11) is the safety net.
  }
}

// Branch and Counter names typed on this phone, offered as <datalist> suggestions (Q14).
const NAMES_KEY = 'stockcheck.names.v1';
export type Names = { branches: string[]; counters: string[] };

export function loadNames(): Names {
  try {
    const raw = localStorage.getItem(NAMES_KEY);
    return raw ? (JSON.parse(raw) as Names) : { branches: [], counters: [] };
  } catch {
    return { branches: [], counters: [] };
  }
}

export function rememberNames(branch: string, counter: string): void {
  const names = loadNames();
  const add = (list: string[], value: string) => [value, ...list.filter((v) => v !== value)].slice(0, 10);
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify({ branches: add(names.branches, branch), counters: add(names.counters, counter) }));
  } catch {
    // Suggestions are a convenience; losing them is harmless.
  }
}
