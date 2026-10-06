import type { Session } from './session';

/** Backup and restore (spec §4.10): the whole Session as JSON, with an app tag and a format version. */
const APP = 'stockcheck';
const FORMAT = 1;

export type BackupResult = { ok: true; session: Session } | { ok: false; message: string };

export function toBackup(session: Session, meta: { savedAt: string }): string {
  return JSON.stringify({ app: APP, format: FORMAT, savedAt: meta.savedAt, session });
}

export function parseBackup(text: string): BackupResult {
  let file: { app?: unknown; format?: unknown; session?: unknown };
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, message: 'That file is not a StockCheck backup.' };
  }
  if (file?.app !== APP) return { ok: false, message: 'That file is not a StockCheck backup.' };
  if (typeof file.format !== 'number' || file.format > FORMAT) {
    return { ok: false, message: 'That backup was made by a newer version of StockCheck. Update the app, then try again.' };
  }
  if (!looksLikeSession(file.session)) return { ok: false, message: 'That backup is damaged and cannot be restored.' };
  return { ok: true, session: file.session };
}

function looksLikeSession(value: unknown): value is Session {
  const s = value as Partial<Session> | null;
  const isRecord = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
  return (
    isRecord(s) &&
    typeof s!.exportFileName === 'string' &&
    typeof s!.loadedAt === 'string' &&
    typeof s!.changes === 'number' &&
    Array.isArray(s!.items) &&
    s!.items.every((i) => typeof i?.key === 'string' && typeof i?.name === 'string') &&
    isRecord(s!.tallies) &&
    isRecord(s!.finished) &&
    isRecord(s!.countAtDone) &&
    isRecord(s!.countAtLookAgain)
  );
}

export function backupFileName(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `stockcheck-backup-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.json`;
}
