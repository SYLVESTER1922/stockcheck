import { type Page } from '@playwright/test';

// Sessions seeded straight into localStorage, in the shape the app saves.
export const adjust = (page: Page) => page.getByRole('button', { name: 'Adjust', exact: true }).click();

export type SeedItem = { key: string; name: string; variant?: string; sku?: string; duplicate?: number | null; expected: number; cost: number; count: number; flags?: string[] };
export function seed(items: SeedItem[]) {
  const full = items.map((i) => ({
    key: i.key,
    name: i.name,
    variant: i.variant ?? '',
    sku: i.sku ?? '',
    category: '',
    duplicate: i.duplicate ?? null,
    expected: i.expected,
    cost: i.cost,
    flags: i.flags ?? [],
  }));
  return {
    exportFileName: 'seeded-export.xlsx',
    loadedAt: '2026-10-06T06:30:00.000Z',
    lastChangeAt: '2026-10-06T06:45:00.000Z',
    changes: items.length,
    reportedChanges: null,
    items: full,
    tallies: Object.fromEntries(items.map((i) => [i.key, [i.count]])),
    finished: Object.fromEntries(items.map((i) => [i.key, true])),
    countAtDone: Object.fromEntries(items.map((i) => [i.key, i.count])),
    countAtLookAgain: {},
    wastage: {},
    adjustments: {},
    adjustmentChanges: 0,
    adjustmentsReportedChanges: null,
  };
}
export async function open(page: Page, session: unknown) {
  // Only when nothing is saved yet, so a reload keeps what the app saved instead of re-seeding.
  await page.addInitScript((s) => !localStorage.getItem('stockcheck.session.v1') && localStorage.setItem('stockcheck.session.v1', JSON.stringify(s)), session);
  await page.goto('/');
  await adjust(page);
}

export const SMALL = seed([
  { key: 'name:rice|#1', name: 'Rice', duplicate: 1, expected: 10_000, cost: 150, count: 9_000 }, // REMOVE 1
  { key: 'name:rice|#2', name: 'Rice', duplicate: 2, expected: 10_000, cost: 175, count: 12_000 }, // ADD 2
  { key: 'name:flour|2kg', name: 'Flour', variant: '2kg', expected: 7_000, cost: 300, count: 6_000 }, // REMOVE 1, no SKU
  { key: 'sku:O1', name: 'Cooking Oil', variant: '2L', sku: 'O1', expected: 5_000, cost: 200, count: 8_000 }, // ADD 3
  { key: 'name:soap|', name: 'Soap', expected: -5_000, cost: 100, count: 0, flags: ['negative-system-stock'] }, // ADD 5
]);

