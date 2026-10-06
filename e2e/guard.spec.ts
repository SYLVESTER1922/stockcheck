import { expect, test, type Page } from '@playwright/test';

async function countSugar(page: Page) {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('9');
  await page.getByRole('button', { name: 'Done' }).click();
}

async function downloadReport(page: Page) {
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByLabel('Branch').fill('Main Street');
  await page.getByLabel('Counter').fill('Alex');
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
}

test('an unreported Session cannot be replaced until it is reported or discarded twice', async ({ page }) => {
  await countSugar(page);
  await page.getByRole('button', { name: 'Load a new Export' }).click();

  await expect(page.getByText("This Session has counts that aren't in a downloaded report.")).toBeVisible();
  await expect(page.getByLabel('Zobaze Export')).toHaveCount(0);

  await page.getByRole('button', { name: 'Discard this Session' }).click();
  await expect(page.getByText('Discard 1 counted item? This cannot be undone.')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, discard' }).click();
  await expect(page.getByLabel('Zobaze Export')).toBeVisible();
});

test('"Download the report first" goes to the Report screen', async ({ page }) => {
  await countSugar(page);
  await page.getByRole('button', { name: 'Load a new Export' }).click();
  await page.getByRole('button', { name: 'Download the report first' }).click();
  await expect(page.getByRole('button', { name: 'Download report' })).toBeVisible();
});

test('a reported Session is replaced without asking, until a Count changes', async ({ page }) => {
  await countSugar(page);
  await downloadReport(page);
  await expect(page.getByText('Reported: the latest counts are in your downloaded report.')).toBeVisible();

  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByRole('button', { name: 'Remove 9' }).click();
  await page.getByLabel('Count').fill('8');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Load a new Export' }).click();
  await expect(page.getByText("This Session has counts that aren't in a downloaded report.")).toBeVisible();

  await page.getByRole('button', { name: 'Keep counting' }).click();
  await downloadReport(page);
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('button', { name: 'Load a new Export' }).click();
  await expect(page.getByLabel('Zobaze Export')).toBeVisible();
});
