import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

async function countSugar(page: Page) {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('9');
  await page.getByRole('button', { name: 'Done' }).click();
}

async function saveBackup(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByText('This file contains cost prices and stock values. Send it only to the manager.')).toBeVisible();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save a backup' }).click()]);
  expect(file.suggestedFilename()).toMatch(/^stockcheck-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  return (await file.path())!;
}

test('a backup restores the whole Session on another phone', async ({ page, browser }) => {
  await countSugar(page);
  const backup = await saveBackup(page);

  const otherPhone = await browser.newPage(); // a fresh context: empty storage
  await otherPhone.goto('/');
  await otherPhone.getByLabel('Restore a backup').setInputFiles(backup);
  await otherPhone.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await otherPhone.getByRole('button', { name: /Sample Sugar/ }).click();
  await expect(otherPhone.getByTestId('line')).toContainText('Count 9');
});

test('a file that is not a backup is refused', async ({ page }) => {
  const notBackup = join(tmpdir(), 'not-a-backup.json');
  writeFileSync(notBackup, '{"hello": 1}');
  await page.goto('/');
  await page.getByLabel('Restore a backup').setInputFiles(notBackup);
  await expect(page.getByRole('alert')).toHaveText('That file is not a StockCheck backup.');
});

test('restoring over unreported Counts goes through the same guard', async ({ page }) => {
  await countSugar(page);
  const backup = await saveBackup(page);
  expect(JSON.parse(readFileSync(backup, 'utf8')).app).toBe('stockcheck');

  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('oil');
  await page.getByRole('button', { name: /Sample Cooking Oil/ }).click();
  await page.getByLabel('Count').fill('4');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByLabel('Restore a backup').setInputFiles(backup);
  await expect(page.getByText("This Session has counts that aren't in a downloaded report.")).toBeVisible();
  await page.getByRole('button', { name: 'Discard this Session' }).click();
  await page.getByRole('button', { name: 'Yes, discard' }).click();

  await page.getByRole('searchbox', { name: 'Find an item' }).fill('oil');
  await expect(page.getByRole('button', { name: /Sample Cooking Oil/ })).not.toContainText('✓');
});
