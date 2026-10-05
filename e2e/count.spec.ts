import { expect, test } from '@playwright/test';

test('load an Export, find an Item, count it and see the Variance', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await expect(page.getByText('3 items loaded')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sug 2kg');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();

  // ADR 0004: the Item's Expected is hidden until the Tally is committed.
  const panel = page.getByTestId('item-panel');
  await expect(panel).toBeVisible();
  await expect(panel).not.toContainText('Expected');
  await expect(panel).not.toContainText('10');

  await page.getByLabel('Count').fill('8');
  await page.getByRole('button', { name: 'Add' }).click();

  const row = page.getByTestId('line');
  await expect(row).toContainText('Expected 10');
  await expect(row).toContainText('Count 8');
  await expect(row).toContainText('Variance −2');
  await expect(row).toContainText('−$3.00');

  // The Session survives a page reload.
  await page.reload();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await expect(page.getByTestId('line')).toContainText('Count 8');
});

test('a typed comma is a decimal point and is echoed back', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('oil');
  await page.getByRole('button', { name: /Sample Cooking Oil/ }).click();
  await page.getByLabel('Count').fill('2,5');
  await expect(page.getByText('= 2.5')).toBeVisible();
});
