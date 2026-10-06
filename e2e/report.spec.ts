import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { expect, test } from '@playwright/test';

test('count, then download the Session Report once branch and Counter are filled in', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  for (const [query, name, count] of [
    ['sugar', /Sample Sugar/, '9'],
    ['oil', /Sample Cooking Oil/, '4'],
  ] as const) {
    await page.getByRole('searchbox', { name: 'Find an item' }).fill(query);
    await page.getByRole('button', { name }).click();
    await page.getByLabel('Count').fill(count);
    await page.getByRole('button', { name: 'Done' }).click();
  }

  await page.getByRole('button', { name: 'Report' }).click();
  await expect(page.getByTestId('net-value')).toHaveText('−$1.50');

  const download = page.getByRole('button', { name: 'Download report' });
  await expect(download).toBeDisabled();
  await page.getByLabel('Branch').fill('Main Street');
  await page.getByLabel('Counter').fill('Alex');
  await expect(download).toBeEnabled();

  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(file.suggestedFilename()).toMatch(/^stockcheck-main-street-alex-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/);

  const book = XLSX.read(readFileSync(await file.path()), { type: 'buffer' });
  expect(book.SheetNames).toEqual(['Summary', 'Variance Detail', 'Recount List']);
  const detail = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['Variance Detail']!);
  expect(detail.map((r) => r.Status)).toEqual(['SHORT', 'MATCH', 'NOT COUNTED']);
});

test('names typed before are suggested next time', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('button', { name: 'Report' }).click();
  await page.getByLabel('Branch').fill('Main Street');
  await page.getByLabel('Counter').fill('Alex');
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);

  await page.reload();
  await page.getByRole('button', { name: 'Report' }).click();
  await expect(page.locator('datalist#branches option[value="Main Street"]')).toHaveCount(1);
  await expect(page.locator('datalist#counters option[value="Alex"]')).toHaveCount(1);
});
