import { expect, test } from '@playwright/test';

test('after one online visit, the app works fully offline and talks to no other site', async ({ page, context, baseURL }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'StockCheck' })).toBeVisible();

  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('9');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('line')).toContainText('Variance −1');

  const origin = new URL(baseURL!).origin;
  expect(requests.filter((url) => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([]);
});

test('the app is installable: a manifest with name and icons', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await page.request.get(href!)).json();
  expect(manifest).toMatchObject({ name: 'StockCheck', display: 'standalone', start_url: '/' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
});

test('offline, the Adjust tab works end to end: count, approve, apply, and generate the Adjustment Report', async ({ page, context, baseURL }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();

  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('4');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Adjust', exact: true }).click();
  const sugar = page.getByTestId('adjustment-row').filter({ hasText: 'Sample Sugar' });
  await expect(sugar.getByTestId('action')).toContainText('REMOVE −6');
  await sugar.getByRole('button', { name: 'Approve', exact: true }).click();
  await sugar.getByLabel('Your name').fill('Mary');
  await sugar.getByRole('button', { name: 'Approve', exact: true }).click();
  await sugar.getByRole('button', { name: 'Mark Applied', exact: true }).click();
  await sugar.getByLabel('Your name').fill('Joe');
  await sugar.getByLabel('I checked the current Zobaze balance and intervening movements.').check();
  await sugar.getByRole('button', { name: 'Mark Applied', exact: true }).click();
  await expect(sugar.getByTestId('status')).toHaveText('Applied');

  await page.getByTestId('report-card').locator('summary').click();
  await page.getByTestId('report-card').getByLabel('Branch').fill('Main Street');
  await page.getByTestId('report-card').getByLabel('Counter').fill('Alex');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Generate Adjustment Report' }).click()]);
  expect(file.suggestedFilename()).toMatch(/^stockcheck-adjustments-main-street-alex-/);
  await expect(page.getByTestId('report-status')).toContainText('Downloaded');

  const origin = new URL(baseURL!).origin;
  expect(requests.filter((url) => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([]);
});
