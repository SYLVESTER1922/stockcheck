import { expect, test } from '@playwright/test';

// T13: "Powered by Netrisyl Insights" with the logo, on the start and Report screens only.
test('the start and Report screens credit Netrisyl Insights in plain text, not in the header', async ({ page }) => {
  await page.goto('/');
  const credit = page.getByTestId('powered-by');
  await expect(credit).toContainText('Powered by Netrisyl Insights');
  await expect(credit.locator('a')).toHaveCount(0);
  await expect(credit.locator('img')).toHaveJSProperty('complete', true);
  expect(await credit.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('header').getByText('Netrisyl')).toHaveCount(0);

  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await expect(page.getByTestId('powered-by')).toHaveCount(0); // not on the Count screen

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByTestId('powered-by')).toContainText('Powered by Netrisyl Insights');
});

test('the logo is small and cached for offline use', async ({ page, context }) => {
  const logo = await page.request.get('/netrisyl-logo.jpg');
  expect(logo.ok()).toBe(true);
  expect((await logo.body()).length).toBeLessThan(20 * 1024);

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  const img = page.getByTestId('powered-by').locator('img');
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});
