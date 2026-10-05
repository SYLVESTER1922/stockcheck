import type { Session } from '../domain/session';

// One JSON document in this origin's localStorage (ADR 0002). Bump the version if the shape changes.
const KEY = 'stockcheck.session.v1';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
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
