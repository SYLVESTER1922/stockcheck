import { expect, test, type Page } from '@playwright/test';

// T29 Part B: the four Home tiles, with live figures once a Session is loaded.
const tile = (page: Page, title: string) => page.getByTestId('tiles').getByRole('button', { name: new RegExp(`^\\S*\\s?${title}`) });

test('with no Session: hints, and How to count still opens', async ({ page }) => {
  await page.goto('/');
  for (const title of ['Count', 'Adjust', 'Variance']) {
    await expect(tile(page, title)).toContainText('Load your Export to start');
    await expect(tile(page, title)).toBeDisabled();
  }
  await tile(page, 'How to count').click();
  await expect(page.getByRole('heading', { name: 'How to count' })).toBeVisible();
});

test('with a Session: live figures, and each tile opens its screen', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('9');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();

  await expect(tile(page, 'Count')).toContainText('1 of 3 counted');
  await expect(tile(page, 'Variance')).toContainText(/[+−]\$\d/);
  await expect(tile(page, 'Adjust')).toContainText(/\d+ waiting/);

  await tile(page, 'Variance').click();
  await expect(page.getByTestId('variance-hero')).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await tile(page, 'Adjust').click();
  await expect(page.getByRole('button', { name: 'Adjust', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await tile(page, 'Count').click();
  await expect(page.getByRole('searchbox', { name: 'Find an item' })).toBeVisible();
});

test('a tall phone fills the height: the logo sits at the bottom with the version beneath it', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/');
  const logo = await page.getByTestId('powered-by').boundingBox();
  const version = await page.getByText(/^Version /).boundingBox();
  expect(version!.y).toBeGreaterThan(logo!.y);
  expect(version!.y + version!.height).toBeGreaterThan(932 - 60);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(932);
});
