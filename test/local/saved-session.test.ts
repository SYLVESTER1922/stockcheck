/**
 * T19: a Session saved by the pilot app on a real phone must load, save and restore unchanged.
 * Local only (never in CI). Needs private-notes/saved-session.json: either the raw value of the
 * `stockcheck.session.v1` localStorage entry, or a StockCheck backup file. Prints counts only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBackup, toBackup } from '../../src/domain/backup';
import { buildReport } from '../../src/domain/report';
import { withSessionDefaults, type Session } from '../../src/domain/session';

const path = 'private-notes/saved-session.json';
const ready = existsSync(path);

function savedSession(): Partial<Session> {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return parsed?.app === 'stockcheck' ? parsed.session : parsed;
}

describe.skipIf(!ready)('a real saved Session', () => {
  const meta = { branch: 'b', counter: 'c', generatedAt: '2026-10-13T00:00:00.000Z' };

  it('loads with every Count intact and gains only the new empty fields', () => {
    const saved = savedSession();
    const loaded = withSessionDefaults(saved);
    for (const field of ['items', 'tallies', 'finished', 'countAtDone', 'countAtLookAgain', 'changes', 'reportedChanges', 'lastChangeAt'] as const) {
      if (field in saved) expect(loaded[field]).toEqual(saved[field]);
    }
    expect(loaded).toMatchObject({ wastage: {}, adjustments: {}, adjustmentChanges: 0, adjustmentsReportedChanges: null });
    console.log(`[T19] items ${loaded.items.length}, counted ${Object.keys(loaded.tallies).length}, done ${Object.keys(loaded.finished).length}`);
  });

  it('gives the same report before and after the new fields exist', () => {
    const saved = withSessionDefaults(savedSession());
    const asSaved = { ...saved } as Partial<Session>;
    for (const f of ['wastage', 'adjustments', 'adjustmentChanges', 'adjustmentsReportedChanges'] as const) delete asSaved[f];
    expect(buildReport(saved, meta)).toEqual(buildReport(withSessionDefaults(asSaved), meta));
  });

  it('survives a format 2 backup and a format 1 backup of itself', () => {
    const loaded = withSessionDefaults(savedSession());
    expect(parseBackup(toBackup(loaded, { savedAt: meta.generatedAt }))).toEqual({ ok: true, session: loaded });
    const v1 = JSON.stringify({ app: 'stockcheck', format: 1, savedAt: meta.generatedAt, session: savedSession() });
    expect(parseBackup(v1)).toEqual({ ok: true, session: loaded });
  });
});
