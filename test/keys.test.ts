import { describe, expect, it } from 'vitest';
import { assignKeys } from '../src/domain/keys';

const row = (name: string, variant = '', sku = '', cost = 100) => ({ name, variant, sku, cost });
const keysOf = (rows: ReturnType<typeof row>[]) => assignKeys(rows).map((r) => r.key);

// ADR 0001: SKU when filled in and unique in the Export, otherwise normalised name + variant.
describe('assignKeys', () => {
  it('uses a unique SKU', () => {
    expect(keysOf([row('Sugar', '2kg', 'S-1'), row('Oil', '2L', 'O-1')])).toEqual(['sku:S-1', 'sku:O-1']);
  });

  it('falls back to name + variant when the SKU is blank', () => {
    expect(keysOf([row('Sugar', '2kg')])).toEqual(['name:sugar|2kg']);
  });

  it('falls back to name + variant when the SKU is duplicated', () => {
    expect(keysOf([row('Sugar', '2kg', 'X'), row('Oil', '2L', 'X')])).toEqual(['name:sugar|2kg', 'name:oil|2l']);
  });

  it('mixes both kinds of key in one Export', () => {
    expect(keysOf([row('Sugar', '2kg', 'S-1'), row('Oil', '2L')])).toEqual(['sku:S-1', 'name:oil|2l']);
  });

  it('normalises case, outer spaces and repeated spaces', () => {
    expect(keysOf([row('  Coca  Cola ', ' 2  L')])).toEqual(['name:coca cola|2 l']);
  });

  it('keeps a blank variant as part of the key', () => {
    expect(keysOf([row('Soap', ''), row('Soap', 'Bar')])).toEqual(['name:soap|', 'name:soap|bar']);
  });

  it('never lets a SKU key collide with a name key', () => {
    const keys = keysOf([row('Sugar', '', 'sugar|'), row('Sugar', '')]);
    expect(new Set(keys).size).toBe(2);
  });

  it('numbers Duplicate Items #1, #2 in Export order, with unique keys', () => {
    const keyed = assignKeys([row('Sugar', '2kg', '', 150), row('Oil'), row('sugar ', '2KG', '', 175)]);
    expect(keyed.map(({ key, duplicate }) => ({ key, duplicate }))).toEqual([
      { key: 'name:sugar|2kg#1', duplicate: 1 },
      { key: 'name:oil|', duplicate: null },
      { key: 'name:sugar|2kg#2', duplicate: 2 },
    ]);
  });

  it('applies #1/#2 when a duplicated SKU falls back to a name that also collides', () => {
    const keyed = assignKeys([row('Sugar', '2kg', 'X'), row('Sugar', '2kg', 'X')]);
    expect(keyed.map((r) => r.key)).toEqual(['name:sugar|2kg#1', 'name:sugar|2kg#2']);
  });

  it('keeps every other field of the row', () => {
    expect(assignKeys([row('Sugar', '2kg', '', 150)])[0]).toMatchObject({ name: 'Sugar', variant: '2kg', cost: 150 });
  });
});
