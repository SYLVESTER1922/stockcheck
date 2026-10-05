import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadExport, warningCounts, warningMessages } from '../src/domain/export';
import { makeExport } from './helpers/workbook';

const fixture = (name: string) => {
  const buf = readFileSync(`test/fixtures/${name}`);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

const loaded = (data: ArrayBuffer) => {
  const result = loadExport(data);
  if (!result.ok) throw new Error(`expected a loaded Export, got: ${result.message}`);
  return result;
};

describe('loadExport', () => {
  it('reads every row of the first sheet, as integers', () => {
    const { items } = loaded(fixture('tiny.xlsx'));

    expect(items.map(({ name, variant, expected, cost }) => ({ name, variant, expected, cost }))).toEqual([
      { name: 'Sample Sugar', variant: '2kg', expected: 10_000, cost: 150 },
      { name: 'Sample Cooking Oil', variant: '2L', expected: 4_000, cost: 325 },
      { name: 'Sample Soap', variant: '', expected: -2_000, cost: 45 },
    ]);
  });

  it('reports which header matched each field', () => {
    const result = loaded(makeExport([['Item Name', 'QTY', 'BUYING PRICE'], ['A', 1, 1]]));
    expect(result.matched).toMatchObject({ name: 'Item Name', expected: 'QTY', cost: 'BUYING PRICE' });
  });

  it('refuses a file with a missing required column', () => {
    const result = loadExport(makeExport([['ITEM_NAME', 'STOCK'], ['A', 1]]));
    expect(result).toEqual({
      ok: false,
      message: 'No cost price column found. Looked for: COST_PRICE, COST, BUYING PRICE. This file has: ITEM_NAME, STOCK.',
    });
  });

  it('skips rows with a blank item name', () => {
    const { items } = loaded(makeExport([['ITEM_NAME', 'STOCK', 'COST_PRICE'], ['A', 1, 1], ['  ', 2, 2], ['B', 3, 3]]));
    expect(items.map((i) => i.name)).toEqual(['A', 'B']);
  });

  it('refuses a file with no usable rows', () => {
    const result = loadExport(makeExport([['ITEM_NAME', 'STOCK', 'COST_PRICE'], ['', 1, 1]]));
    expect(result).toEqual({ ok: false, message: 'No items found: every row has a blank item name.' });
  });

  it('treats blank Expected as 0, unreadable Expected as unknown, and flags Negative System Stock', () => {
    const { items } = loaded(
      makeExport([
        ['ITEM_NAME', 'STOCK', 'COST_PRICE'],
        ['Blank', '', 1],
        ['Unreadable', 'N/A', 1],
        ['Negative', -3, 1],
      ]),
    );
    expect(items.map(({ name, expected, flags }) => ({ name, expected, flags }))).toEqual([
      { name: 'Blank', expected: 0, flags: ['blank-expected'] },
      { name: 'Unreadable', expected: null, flags: ['unreadable-expected'] },
      { name: 'Negative', expected: -3000, flags: ['negative-system-stock'] },
    ]);
  });

  it('treats blank, zero and unreadable cost as $0 with no cost', () => {
    const { items } = loaded(
      makeExport([
        ['ITEM_NAME', 'STOCK', 'COST_PRICE'],
        ['Blank', 1, ''],
        ['Zero', 1, 0],
        ['Unreadable', 1, '$1.50'],
      ]),
    );
    expect(items.map(({ name, cost, flags }) => ({ name, cost, flags }))).toEqual([
      { name: 'Blank', cost: 0, flags: ['no-cost'] },
      { name: 'Zero', cost: 0, flags: ['no-cost'] },
      { name: 'Unreadable', cost: 0, flags: ['no-cost', 'unreadable-cost'] },
    ]);
  });
});

describe('warningCounts', () => {
  it('counts each warning across the Items', () => {
    const { items } = loaded(
      makeExport([
        ['ITEM_NAME', 'STOCK', 'COST_PRICE'],
        ['A', '', 0],
        ['B', 'N/A', 1],
        ['C', -1, 'x'],
        ['D', -2, 2],
        ['E', 5, 5],
      ]),
    );
    expect(warningCounts(items)).toEqual({
      noCost: 2,
      unreadableCost: 1,
      blankExpected: 1,
      unreadableExpected: 1,
      negativeSystemStock: 2,
    });
  });
});

describe('warningMessages', () => {
  it('lists only non-zero warnings, in plain words', () => {
    expect(
      warningMessages({ noCost: 7, unreadableCost: 0, blankExpected: 1, unreadableExpected: 0, negativeSystemStock: 12 }),
    ).toEqual([
      '7 items have no cost, so their dollar Variance counts as $0.',
      '1 item has a blank Expected, treated as 0.',
      '12 items have Negative System Stock.',
    ]);
  });
});
