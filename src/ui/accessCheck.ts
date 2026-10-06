import { NO_ANSWER, nextAccess, parseStatus, type Access, type CheckResult } from '../domain/access';

// ADR 0006. The last explicit answer, kept on this phone so a suspension survives going offline.
const KEY = 'stockcheck.access.v1';
const TIMEOUT_MS = 3_000;

export function loadAccess(): Access {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Access) : null;
  } catch {
    return null;
  }
}

function saveAccess(access: Access): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(access));
  } catch {
    // Not saved: the next check asks again. Never blocks anything.
  }
}

/** Fetches the Status File past every cache. Any failure or a reply over 3 s is "no answer". */
async function checkStatus(): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`/status.json?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    return response.ok ? parseStatus(await response.text()) : NO_ANSWER;
  } catch {
    return NO_ANSWER;
  } finally {
    clearTimeout(timer);
  }
}

/** Checks, applies the decision rule to the remembered answer, saves and returns the result. */
export async function refreshAccess(): Promise<Access> {
  const next = nextAccess(loadAccess(), await checkStatus());
  saveAccess(next);
  return next;
}
