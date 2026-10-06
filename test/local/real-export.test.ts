/**
 * T10: checks a real client Export through the app's own code. Local only (never in CI).
 * Needs STOCKCHECK_REAL_EXPORT=<path to .xlsx> and private-notes/real-export-expectations.json.
 * Prints counts only. No client numbers or item names live in this file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { warningCounts, type Item } from '../../src/domain/export';
import { isLarge, LOOK_AGAIN } from '../../src/domain/large';
import { varianceValue } from '../../src/domain/money';
import { buildReport } from '../../src/domain/report';
import { addTally, finishItem, newSession, type Session } from '../../src/domain/session';
import { loadExport } from '../../src/domain/workbook';

const file = process.env.STOCKCHECK_REAL_EXPORT;
const expectationsPath = 'private-notes/real-export-expectations.json';
const ready = !!file && existsSync(file) && existsSync(expectationsPath);

/** Decimal places in a scaled integer: 2500 thousandths → 1 ("2.5"); 150 cents → 1 ("1.5"). */
const decimals = (value: number, scale: 1000 | 100) => {
  for (let places = 0, unit = scale; unit >= 1; places++, unit /= 10) if (value % unit === 0) return places;
  return Math.log10(scale);
};

/** Deterministic pseudo-random numbers (mulberry32), so every run simulates the same count. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A realistic count (assumption): 72% exact, 18% off by 1, 7% off by 2–3, 3% off by 10–30%. */
function simulatedCount(item: Item, next: () => number): number {
  const expected = Math.max(0, item.expected ?? 0);
  const sign = next() < 0.5 ? -1 : 1;
  const roll = next();
  let delta = 0;
  if (roll >= 0.72 && roll < 0.9) delta = 1_000;
  else if (roll >= 0.9 && roll < 0.97) delta = (2 + Math.floor(next() * 2)) * 1_000;
  else if (roll >= 0.97) delta = Math.max(1_000, Math.round((expected * (10 + next() * 20)) / 100 / 1_000) * 1_000);
  return Math.max(0, expected + sign * delta);
}

describe.skipIf(!ready)('real Export (local only)', () => {
  const expected = ready ? JSON.parse(readFileSync(expectationsPath, 'utf8')) : {};
  const data = ready ? readFileSync(file!) : Buffer.alloc(0);
  const result = loadExport(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

  it('loads with no refused columns and the expected Item and warning counts', () => {
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    if (!result.ok) return;
    const counts = warningCounts(result.items);
    console.log('[real] items', result.items.length, 'warnings', JSON.stringify(counts));
    expect({ items: result.items.length, ...counts }).toEqual(expected);
  });

  it('reports the maximum decimal places actually present', () => {
    if (!result.ok) return;
    const stock = Math.max(...result.items.filter((i) => i.expected !== null).map((i) => decimals(i.expected!, 1000)));
    const cost = Math.max(...result.items.map((i) => decimals(i.cost, 100)));
    console.log('[real] max decimals: STOCK', stock, 'cost', cost);
    expect(stock).toBeLessThanOrEqual(3);
    expect(cost).toBeLessThanOrEqual(2);
  });

  it('simulates a realistic count: headline equals the sum of lines, and how often Look Again fires', () => {
    if (!result.ok) return;
    const next = random(20261005);
    const at = '2026-10-06T06:45:00.000Z';
    let session: Session = newSession('real.xlsx', at, result.items);
    for (const item of result.items) session = finishItem(addTally(session, item, simulatedCount(item, next), at), item, at);

    const report = buildReport(session, { branch: 'local', counter: 'local', generatedAt: at });
    const sumOfLines = report.detail.reduce((total, r) => total + (r.value ?? 0), 0);
    expect(sumOfLines).toBe(report.summary.netValue);

    const band = (cost: number) => (cost < 50 ? '<$0.50' : cost < 200 ? '$0.50-2' : cost < 500 ? '$2-5' : '>=$5');
    const fired: Record<string, [number, number]> = {};
    let byDollars = 0;
    for (const item of result.items) {
      const b = band(item.cost);
      fired[b] ??= [0, 0];
      fired[b][1]++;
      if (item.expected === null) continue;
      const count = session.tallies[item.key]!.reduce((s, t) => s + t, 0);
      const variance = count - item.expected;
      const value = varianceValue(variance, item.cost);
      if (isLarge({ variance, value, expected: item.expected }, LOOK_AGAIN)) {
        fired[b][0]++;
        if (Math.abs(value) >= LOOK_AGAIN.dollars * 100) byDollars++;
      }
    }
    const total = report.summary.promptedItems;
    console.log('[real] Look Again fired on', total, 'of', result.items.length, `(${((total / result.items.length) * 100).toFixed(1)}%)`);
    console.log('[real] of which by the $ test:', byDollars);
    console.log('[real] fired / items by cost band:', JSON.stringify(fired));
    console.log('[real] Recount List:', report.summary.recountItems, '| net (cents):', report.summary.netValue);
  });
});
