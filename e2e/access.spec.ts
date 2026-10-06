import { expect, test, type Page, type Route } from '@playwright/test';

// T14 / ADR 0006. Playwright stands in for the server's status.json.
type Answer = 'enabled' | 'disabled' | 'unreachable' | 'slow';
let answer: Answer = 'enabled';
const REASON = 'Paused for non-payment. Please contact us.';

async function serveStatus(route: Route) {
  if (answer === 'unreachable') return route.abort('internetdisconnected');
  if (answer === 'slow') await new Promise((r) => setTimeout(r, 5_000));
  const body = JSON.stringify({ newSessions: answer === 'disabled' ? 'disabled' : 'enabled', message: REASON });
  return route.fulfill({ contentType: 'application/json', body }).catch(() => {});
}

test.beforeEach(async ({ page }) => {
  answer = 'enabled';
  await page.route('**/status.json*', serveStatus);
});

const loadExport = (page: Page) => page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
const foreground = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const suspension = (page: Page) => page.getByTestId('suspended');

test('enabled: loading an Export works as before', async ({ page }) => {
  await page.goto('/');
  await loadExport(page);
  await expect(page.getByText('3 items loaded')).toBeVisible();
});

test('disabled: the reason and contact block replace the picker; restoring a backup still works', async ({ page }) => {
  answer = 'disabled';
  await page.goto('/');
  await expect(suspension(page)).toContainText(REASON);
  await expect(suspension(page)).toContainText('netrisyl.support@netrisyl.com');
  await expect(suspension(page).locator('a')).toHaveCount(0);
  await expect(page.getByLabel('Zobaze Export')).toHaveCount(0);
  await expect(page.getByLabel('Restore a backup')).toBeVisible();
});

test('unreachable or slow: loading an Export still works, within 4 seconds', async ({ page }) => {
  answer = 'unreachable';
  await page.goto('/');
  await loadExport(page);
  await expect(page.getByText('3 items loaded')).toBeVisible();

  await page.getByRole('button', { name: 'Load a new Export' }).click(); // empty Session: no guard
  answer = 'slow';
  const started = Date.now();
  await loadExport(page);
  await expect(page.getByText('3 items loaded')).toBeVisible({ timeout: 6_000 });
  expect(Date.now() - started).toBeLessThan(4_000);
});

test('mid-count: a suspension leaves the open Session fully usable', async ({ page }) => {
  await page.goto('/');
  await loadExport(page);
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('4');
  await page.getByRole('button', { name: 'Another place' }).click();

  answer = 'disabled';
  await foreground(page);
  await expect(page.getByText('New counts are paused. You can finish, report and back up this count.')).toBeVisible();

  await page.getByLabel('Count').fill('5');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('line')).toContainText('Count 9 (4 + 5)');

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByLabel('Branch').fill('Main Street');
  await page.getByLabel('Counter').fill('Alex');
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save a backup' }).click()]);

  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('button', { name: 'Load a new Export' }).click();
  await expect(suspension(page)).toContainText(REASON);
  await expect(page.getByLabel('Zobaze Export')).toHaveCount(0);
});

test('lifted: disabled, then enabled, then loading works', async ({ page }) => {
  answer = 'disabled';
  await page.goto('/');
  await expect(suspension(page)).toBeVisible();
  answer = 'enabled';
  await foreground(page);
  await expect(suspension(page)).toHaveCount(0);
  await loadExport(page);
  await expect(page.getByText('3 items loaded')).toBeVisible();
});

test('sticky: once disabled, an unreachable check keeps the suspension', async ({ page }) => {
  answer = 'disabled';
  await page.goto('/');
  await expect(suspension(page)).toBeVisible();
  answer = 'unreachable';
  await page.reload();
  await expect(suspension(page)).toContainText(REASON);
});

test('status.json is never served from the offline cache', async ({ page, context }) => {
  await page.unroute('**/status.json*'); // the real file, as deployed
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect(await page.evaluate(() => fetch('/status.json').then((r) => r.ok))).toBe(true);

  await context.setOffline(true);
  const offline = await page.evaluate(() => fetch('/status.json').then(() => 'served', () => 'failed'));
  expect(offline).toBe('failed');
});

test('About tells the Counter about the switch, with the contact block', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to count' }).click();
  const about = page.getByTestId('about');
  await expect(about).toContainText('About StockCheck');
  await expect(about).toContainText('for breach of the agreement');
  await expect(about).toContainText('netrisyl.support@netrisyl.com');
  await expect(about.locator('a')).toHaveCount(0);
});
