import { withSessionDefaults, type Session } from './session';

/**
 * Backup and restore (spec §4.10): the whole Session as JSON, with an app tag and a format version.
 * Format 2 (ADR 0007) added Wastage and Adjustments. Both 1 and 2 are read; 2 is always written, so
 * a phone still on the format-1 app refuses the file instead of silently dropping what it can't show.
 */
const APP = 'stockcheck';
const FORMAT = 2;

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
  return { ok: true, session: withSessionDefaults(file.session) };
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
    isRecord(s!.countAtLookAgain) &&
    newFieldsLookRight(s as Record<string, unknown>)
  );
}

/** The fields added by ADR 0007 may be absent, but if present they must have the right shape. */
function newFieldsLookRight(s: Record<string, unknown>): boolean {
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const allRecords = (v: unknown, ok: (entry: Record<string, unknown>) => boolean) =>
    v === undefined || (isRecord(v) && Object.values(v).every((entry) => isRecord(entry) && ok(entry)));
  return (
    allRecords(s.wastage, (w) => typeof w.quantity === 'number') &&
    allRecords(s.adjustments, (a) => typeof a.itemKey === 'string' && typeof a.status === 'string' && Array.isArray(a.log)) &&
    (s.counter === undefined || typeof s.counter === 'string') &&
    (s.adjustmentChanges === undefined || typeof s.adjustmentChanges === 'number') &&
    (s.adjustmentsReportedChanges === undefined ||
      s.adjustmentsReportedChanges === null ||
      typeof s.adjustmentsReportedChanges === 'number')
  );
}

export function backupFileName(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `stockcheck-backup-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.json`;
}
