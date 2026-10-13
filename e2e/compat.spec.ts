import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// T19, ADR 0007: Sessions and backups written before Wastage and Adjustments must still open.
const sugar = {
  key: 'name:sample sugar|2kg',
  duplicate: null,
  name: 'Sample Sugar',
  variant: '2kg',
  sku: '',
  category: 'Grocery',
  expected: 12_000,
  cost: 150,
  flags: [],
};
const AT = '2026-10-06T06:45:00.000Z';

/** A Session exactly as the pilot app saved it: no Wastage or Adjustment fields. */
const OLD_SESSION = {
  exportFileName: 'export.xlsx',
  loadedAt: '2026-10-06T06:30:00.000Z',
  lastChangeAt: AT,
  changes: 2,
  reportedChanges: null,
  items: [sugar],
  tallies: { [sugar.key]: [9_000] },
  finished: { [sugar.key]: true },
  countAtDone: { [sugar.key]: 9_000 },
  countAtLookAgain: {},
};

test('a Session that was in progress before the update opens on Count with its Counts intact', async ({ page }) => {
  await page.addInitScript((session) => localStorage.setItem('stockcheck.session.v1', JSON.stringify(session)), OLD_SESSION);
  await page.goto('/');
  await expect(page.getByRole('searchbox', { name: 'Find an item' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await expect(page.getByTestId('line')).toContainText('Count 9');

  // Using the app saves the Session under the same key, with the new fields added and nothing lost.
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stockcheck.session.v1')!));
  expect(saved).toMatchObject({ ...OLD_SESSION, wastage: {}, adjustments: {}, adjustmentChanges: 0, adjustmentsReportedChanges: null });
});

test('a format 1 backup from the pilot app restores', async ({ page }) => {
  const file = join(tmpdir(), 'stockcheck-backup-format-1.json');
  writeFileSync(file, JSON.stringify({ app: 'stockcheck', format: 1, savedAt: AT, session: OLD_SESSION }));
  await page.goto('/');
  await page.getByLabel('Restore a backup').setInputFiles(file);
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await expect(page.getByTestId('line')).toContainText('Count 9');
});

test('a backup from a newer format is refused with the update message', async ({ page }) => {
  const file = join(tmpdir(), 'stockcheck-backup-format-3.json');
  writeFileSync(file, JSON.stringify({ app: 'stockcheck', format: 3, savedAt: AT, session: OLD_SESSION }));
  await page.goto('/');
  await page.getByLabel('Restore a backup').setInputFiles(file);
  await expect(page.getByRole('alert')).toHaveText('That backup was made by a newer version of StockCheck. Update the app, then try again.');
});
