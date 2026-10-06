import { describe, expect, it } from 'vitest';
import { backupFileName, parseBackup, toBackup } from '../src/domain/backup';
import type { Item } from '../src/domain/export';
import { addTally, finishItem, markReported, newSession, type Session } from '../src/domain/session';

const AT = '2026-10-06T06:45:00.000Z';
const makeItem = (n: number): Item => ({
  key: `name:sample item ${n}|1kg`,
  duplicate: null,
  name: `Sample Item ${n}`,
  variant: '1kg',
  sku: '',
  category: 'Grocery',
  expected: 12_000,
  cost: 199,
  flags: [],
});

function counted(items: Item[]): Session {
  let s = newSession('export.xlsx', '2026-10-06T06:30:00.000Z', items);
  for (const it of items) s = finishItem(addTally(s, it, 11_500, AT), it, AT);
  return s;
}

// Spec §4.10
describe('Backup', () => {
  it('round-trips a whole Session exactly', () => {
    const session = markReported(counted([makeItem(1), makeItem(2)]));
    const result = parseBackup(toBackup(session, { savedAt: AT }));
    expect(result).toEqual({ ok: true, session });
  });

  it('marks the file as a StockCheck backup with a format version', () => {
    expect(JSON.parse(toBackup(counted([makeItem(1)]), { savedAt: AT }))).toMatchObject({
      app: 'stockcheck',
      format: 1,
      savedAt: AT,
    });
  });

  it.each([
    ['not JSON', 'hello', 'That file is not a StockCheck backup.'],
    ['another app', JSON.stringify({ app: 'other', format: 1, session: {} }), 'That file is not a StockCheck backup.'],
    [
      'a newer format',
      JSON.stringify({ app: 'stockcheck', format: 2, session: {} }),
      'That backup was made by a newer version of StockCheck. Update the app, then try again.',
    ],
    [
      'a damaged Session',
      JSON.stringify({ app: 'stockcheck', format: 1, session: { items: 'oops' } }),
      'That backup is damaged and cannot be restored.',
    ],
  ])('refuses %s', (_label, text, message) => {
    expect(parseBackup(text)).toEqual({ ok: false, message });
  });

  it('names the file with the date and time', () => {
    expect(backupFileName(new Date(2026, 9, 6, 7, 5))).toBe('stockcheck-backup-2026-10-06-0705.json');
  });

  it('stays small: a counted 1,000-Item Session', () => {
    const items = Array.from({ length: 1000 }, (_, i) => makeItem(i));
    const bytes = new TextEncoder().encode(toBackup(counted(items), { savedAt: AT })).length;
    console.log(`[size] 1,000-Item backup: ${(bytes / 1024).toFixed(0)} KB`);
    expect(bytes).toBeLessThan(1024 * 1024); // far under localStorage's ~5 MB
  });
});
