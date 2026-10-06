import { expect, test, type Page } from '@playwright/test';

async function loadAndOpen(page: Page, query: string, name: RegExp) {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill(query);
  await page.getByRole('button', { name }).click();
}

test('count an Item with Done and see the Variance; the Session survives a reload', async ({ page }) => {
  await loadAndOpen(page, 'sug 2kg', /Sample Sugar/);
  await expect(page.getByText('3 items loaded')).toBeVisible();

  // ADR 0004: the Item's Expected is hidden until Done.
  const panel = page.getByTestId('item-panel');
  await expect(panel).not.toContainText('Expected');
  await expect(panel).not.toContainText('10');

  await page.getByLabel('Count').fill('9');
  await page.getByRole('button', { name: 'Done' }).click();

  const line = page.getByTestId('line');
  await expect(line).toContainText('Expected 10');
  await expect(line).toContainText('Count 9');
  await expect(line).toContainText('Variance −1');
  await expect(line).toContainText('−$1.50');

  await page.reload();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await expect(page.getByTestId('line')).toContainText('Count 9');
});

test('Another place keeps Expected hidden and marks the Item in progress', async ({ page }) => {
  await loadAndOpen(page, 'sugar', /Sample Sugar/);
  await page.getByLabel('Count').fill('4');
  await page.getByRole('button', { name: 'Another place' }).click();

  const panel = page.getByTestId('item-panel');
  await expect(panel).toContainText('4 + …');
  await expect(panel).not.toContainText('Expected');
  await expect(page.getByRole('button', { name: /Sample Sugar.*in progress/ })).toBeVisible();

  await page.getByLabel('Count').fill('6');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('line')).toContainText('Count 10 (4 + 6)');
  await expect(page.getByTestId('line')).toContainText('Variance 0');
});

test('Look Again appears inline for a large shortage and clears after looking again', async ({ page }) => {
  await loadAndOpen(page, 'sugar', /Sample Sugar/);
  await page.getByLabel('Count').fill('4');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Check every place this item could be stored.')).toBeVisible();

  await page.getByLabel('Count').fill('6');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('line')).toContainText('Count 10');
  await expect(page.getByText('Check every place this item could be stored.')).toHaveCount(0);
});

test('a Tally can be removed', async ({ page }) => {
  await loadAndOpen(page, 'sugar', /Sample Sugar/);
  await page.getByLabel('Count').fill('4');
  await page.getByRole('button', { name: 'Another place' }).click();
  await page.getByLabel('Count').fill('6');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Remove 4' }).click();
  await expect(page.getByTestId('line')).toContainText('Count 6');
});

test('a typed comma is a decimal point and is echoed back', async ({ page }) => {
  await loadAndOpen(page, 'oil', /Sample Cooking Oil/);
  await page.getByLabel('Count').fill('2,5');
  await expect(page.getByText('= 2.5')).toBeVisible();
});
