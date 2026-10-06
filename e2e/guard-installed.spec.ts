import { expect, test, type Page } from '@playwright/test';

// Bug report: on the installed app, a Session with unreported Counts was replaced by a new Export
// with no guard. Each variant counts an Item, taps Done, does NOT download, then tries to load.

async function countSugarDone(page: Page) {
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('9');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('line')).toContainText('Count 9');
}

async function expectRefusal(page: Page) {
  await page.getByRole('button', { name: 'Load a new Export' }).click();
  await expect(page.getByText("This Session has counts that aren't in a downloaded report.")).toBeVisible();
  await expect(page.getByLabel('Zobaze Export')).toHaveCount(0);
}

async function installed(page: Page) {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('as reported: count, Done, no download, load a new Export → refused', async ({ page }) => {
  await installed(page);
  await countSugarDone(page);
  await expectRefusal(page);
});

test('after reopening the installed app', async ({ page }) => {
  await installed(page);
  await countSugarDone(page);
  await page.reload();
  await expectRefusal(page);
});

test('after visiting the Report screen without downloading', async ({ page }) => {
  await installed(page);
  await countSugarDone(page);
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await expectRefusal(page);
});

test('after going to the background and back (e.g. switching apps)', async ({ page }) => {
  await installed(page);
  await countSugarDone(page);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expectRefusal(page);
});

test('after the How to count screen', async ({ page }) => {
  await installed(page);
  await countSugarDone(page);
  await page.getByRole('button', { name: 'How to count' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expectRefusal(page);
});

test('the guard stays up after choosing Load a new Export twice', async ({ page }) => {
  await installed(page);
  await countSugarDone(page);
  await expectRefusal(page);
  await page.getByRole('button', { name: 'Keep counting' }).click();
  await expectRefusal(page);
});

test('two windows (installed app + browser tab share storage): a stale window cannot replace unreported counts', async ({ context }) => {
  const stale = await context.newPage(); // opened first, before anything was counted
  await stale.goto('/');
  await expect(stale.getByLabel('Zobaze Export')).toBeVisible();

  const counting = await context.newPage();
  await counting.goto('/');
  await countSugarDone(counting);

  // Back in the window that was opened earlier: it must not offer a guard-free load.
  await stale.bringToFront();
  await stale.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(stale.getByText('3 items loaded')).toBeVisible();
  await expectRefusal(stale);

  // And the counted window's Session is still intact.
  await counting.reload();
  await counting.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await expect(counting.getByRole('button', { name: /Sample Sugar.*✓ 9/ })).toBeVisible();
});

test('even if the cross-window update never arrives, loading re-checks the saved Session first', async ({ context }) => {
  const stale = await context.newPage();
  // Simulate a browser that doesn't deliver the "storage" event to this window.
  await stale.addInitScript(() => window.addEventListener('storage', (e) => e.stopImmediatePropagation(), true));
  await stale.goto('/');

  const counting = await context.newPage();
  await counting.goto('/');
  await countSugarDone(counting);

  await stale.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await expect(stale.getByText("This Session has counts that aren't in a downloaded report.")).toBeVisible();

  await counting.reload();
  await counting.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await expect(counting.getByRole('button', { name: /Sample Sugar.*✓ 9/ })).toBeVisible();
});

test('two windows counting different Items: neither loses the other\'s count', async ({ context }) => {
  const first = await context.newPage();
  await first.goto('/');
  await countSugarDone(first);

  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('searchbox', { name: 'Find an item' }).fill('oil');
  await second.getByRole('button', { name: /Sample Cooking Oil/ }).click();
  await second.getByLabel('Count').fill('4');
  await second.getByRole('button', { name: 'Done' }).click();

  // The first window counts another Item after the second window's change.
  await first.getByRole('searchbox', { name: 'Find an item' }).fill('soap');
  await first.getByRole('button', { name: /Sample Soap/ }).click();
  await first.getByLabel('Count').fill('1');
  await first.getByRole('button', { name: 'Done' }).click();

  const tallies = await first.evaluate(() => JSON.parse(localStorage.getItem('stockcheck.session.v1')!).tallies);
  expect(Object.keys(tallies).sort()).toEqual(['name:sample cooking oil|2l', 'name:sample soap|', 'name:sample sugar|2kg']);
});
