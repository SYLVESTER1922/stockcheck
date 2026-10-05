import { describe, expect, it } from 'vitest';
import { matchHeaders } from '../src/domain/headers';

describe('matchHeaders', () => {
  it('matches the Zobaze header names', () => {
    const result = matchHeaders(['CATEGORY', 'ITEM_NAME', 'VARIANT_NAME', 'COST_PRICE', 'STOCK', 'SKU']);
    expect(result).toEqual({
      ok: true,
      columns: { name: 1, expected: 4, cost: 3, variant: 2, sku: 5, category: 0 },
      matched: { name: 'ITEM_NAME', expected: 'STOCK', cost: 'COST_PRICE', variant: 'VARIANT_NAME', sku: 'SKU', category: 'CATEGORY' },
    });
  });

  it('matches aliases ignoring case, spaces, underscores, dashes and dots', () => {
    const result = matchHeaders(['Item Name', 'qty', 'Buying Price']);
    expect(result).toMatchObject({ ok: true, matched: { name: 'Item Name', expected: 'qty', cost: 'Buying Price' } });
  });

  it('leaves optional fields unmatched without failing', () => {
    const result = matchHeaders(['ITEM_NAME', 'STOCK', 'COST_PRICE']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.columns.variant).toBeUndefined();
      expect(result.columns.sku).toBeUndefined();
      expect(result.columns.category).toBeUndefined();
    }
  });

  it('refuses a missing required field, listing the aliases searched and the headers found', () => {
    const result = matchHeaders(['CATEGORY', 'ITEM_NAME', 'STOCK']);
    expect(result).toEqual({
      ok: false,
      message:
        'No cost price column found. Looked for: COST_PRICE, COST, BUYING PRICE. This file has: CATEGORY, ITEM_NAME, STOCK.',
    });
  });

  it('reports every missing required field', () => {
    const result = matchHeaders(['CATEGORY']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('No item name column found');
      expect(result.message).toContain('No Expected (stock) column found');
      expect(result.message).toContain('No cost price column found');
    }
  });
});
