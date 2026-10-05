import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadExport } from '../src/domain/export';

const fixture = (name: string) => {
  const buf = readFileSync(`test/fixtures/${name}`);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

describe('loadExport', () => {
  it('reads every row of the first sheet', () => {
    const items = loadExport(fixture('tiny.xlsx'));

    expect(items).toEqual([
      { name: 'Sample Sugar', variant: '2kg', expected: 10, cost: 1.5 },
      { name: 'Sample Cooking Oil', variant: '2L', expected: 4, cost: 3.25 },
      { name: 'Sample Soap', variant: '', expected: -2, cost: 0.45 },
    ]);
  });
});
