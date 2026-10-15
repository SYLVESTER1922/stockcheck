import { expect, test, type Page } from '@playwright/test';

// T29 Part A: progress, lists, recently counted, empty state and the branch chip on the Count screen.
const search = (page: Page) => page.getByRole('searchbox', { name: 'Find an item' });

async function countSugar(page: Page) {
  await search(page).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('9');
  await page.getByRole('button', { name: 'Done' }).click();
  await search(page).fill('');
}

test('progress, lists, recently counted and the empty state', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');

  await expect(page.getByTestId('progress')).toContainText('0% counted · 3 left');
  await expect(page.getByTestId('count-empty')).toHaveText('Search for an item, or pick a list above.');
  await expect(page.getByTestId('recent')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'To count (3)' })).toBeVisible();

  await countSugar(page);
  await expect(page.getByTestId('progress')).toContainText('33% counted · 2 left');
  await expect(page.getByRole('button', { name: 'To count (2)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Counted (1)' })).toBeVisible();

  const recent = page.getByTestId('recent');
  await expect(recent).toContainText('Sample Sugar');
  await expect(recent).toContainText('✓ 9');

  await page.getByRole('button', { name: 'Counted (1)' }).click();
  await expect(page.getByRole('list').last()).toContainText('Sample Sugar');
  await expect(page.getByTestId('recent')).toHaveCount(0);
  await search(page).fill('oil'); // search works inside the tab
  await expect(page.getByTestId('count-empty')).toHaveText('No items match that search.');
  await page.getByRole('button', { name: 'Counted (1)' }).click(); // tap again to clear the tab
  await search(page).fill('');

  await recent.getByRole('button', { name: /Sample Sugar/ }).click(); // tap to edit
  await expect(page.getByLabel('Count')).toBeVisible();
});

test('the branch chip opens the Report screen where the branch is set', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No branch set')).toBeVisible(); // plain text with no Session
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('button', { name: /No branch set/ }).click();
  await expect(page.getByLabel('Branch')).toBeVisible();
});

test('the Count screen fits 320 px with 44 px tap targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await countSugar(page);
  const problems = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    small: [...document.querySelectorAll<HTMLElement>('button, input')]
      .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => el.textContent?.trim() || el.getAttribute('aria-label')),
  }));
  expect(problems).toEqual({ overflow: 0, small: [] });
});
