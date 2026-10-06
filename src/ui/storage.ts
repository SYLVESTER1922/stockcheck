import type { Session } from '../domain/session';

// One JSON document in this origin's localStorage (ADR 0002). Bump the version if the shape changes.
const KEY = 'stockcheck.session.v1';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    // Sessions saved before a field existed get its empty default.
    return { lastChangeAt: null, finished: {}, countAtLookAgain: {}, ...(JSON.parse(raw) as Partial<Session>) } as Session;
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
