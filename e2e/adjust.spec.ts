import { expect, test, type Page, type Route } from '@playwright/test';

// T23, ADR 0007. tiny.xlsx: Sample Sugar Expected 10 @ $1.50, Cooking Oil 4 @ $3.25, Soap −2 @ $0.45.
async function count(page: Page, query: string, name: RegExp, n: string) {
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill(query);
  await page.getByRole('button', { name }).click();
  await page.getByLabel('Count').fill(n);
  await page.getByRole('button', { name: 'Done' }).click();
}
const adjust = (page: Page) => page.getByRole('button', { name: 'Adjust', exact: true }).click();
const rows = (page: Page) => page.getByTestId('adjustment-row');
const rowFor = (page: Page, text: string) => rows(page).filter({ hasText: text });

async function loadTiny(page: Page) {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await expect(page.getByText('3 items loaded')).toBeVisible();
}

// ---- seeded Sessions (the shape the app saves) ----
type SeedItem = { key: string; name: string; variant?: string; sku?: string; duplicate?: number | null; expected: number; cost: number; count: number; flags?: string[] };
function seed(items: SeedItem[]) {
  const full = items.map((i) => ({
    key: i.key,
    name: i.name,
    variant: i.variant ?? '',
    sku: i.sku ?? '',
    category: '',
    duplicate: i.duplicate ?? null,
    expected: i.expected,
    cost: i.cost,
    flags: i.flags ?? [],
  }));
  return {
    exportFileName: 'seeded-export.xlsx',
    loadedAt: '2026-10-06T06:30:00.000Z',
    lastChangeAt: '2026-10-06T06:45:00.000Z',
    changes: items.length,
    reportedChanges: null,
    items: full,
    tallies: Object.fromEntries(items.map((i) => [i.key, [i.count]])),
    finished: Object.fromEntries(items.map((i) => [i.key, true])),
    countAtDone: Object.fromEntries(items.map((i) => [i.key, i.count])),
    countAtLookAgain: {},
    wastage: {},
    adjustments: {},
    adjustmentChanges: 0,
    adjustmentsReportedChanges: null,
  };
}
async function open(page: Page, session: unknown) {
  await page.addInitScript((s) => localStorage.setItem('stockcheck.session.v1', JSON.stringify(s)), session);
  await page.goto('/');
  await adjust(page);
}

const SMALL = seed([
  { key: 'name:rice|#1', name: 'Rice', duplicate: 1, expected: 10_000, cost: 150, count: 9_000 }, // REMOVE 1
  { key: 'name:rice|#2', name: 'Rice', duplicate: 2, expected: 10_000, cost: 175, count: 12_000 }, // ADD 2
  { key: 'name:flour|2kg', name: 'Flour', variant: '2kg', expected: 7_000, cost: 300, count: 6_000 }, // REMOVE 1, no SKU
  { key: 'sku:O1', name: 'Cooking Oil', variant: '2L', sku: 'O1', expected: 5_000, cost: 200, count: 8_000 }, // ADD 3
  { key: 'name:soap|', name: 'Soap', expected: -5_000, cost: 100, count: 0, flags: ['negative-system-stock'] }, // ADD 5
]);

// ---- the fifth tab ----
test('the bottom nav has five tabs in order, only when there is a Session', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Adjust', exact: true })).toHaveCount(0);
  await loadTiny(page);
  await expect(page.locator('nav button')).toHaveCount(5);
  const names = await page.locator('nav button').evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText.split('\n').filter((l) => /[A-Za-z]/.test(l)).join(' ')));
  expect(names).toEqual(['Count', 'Variance', 'Adjust', 'Report', 'Help']);
});

for (const width of [360, 320]) {
  test(`all five tabs fit ${width} px: nothing clipped, 44 px tap targets`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await loadTiny(page);
    await expect(page.locator('nav button')).toHaveCount(5); // not vacuous: the tabs are really there
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('page scrolls sideways');
      for (const button of document.querySelectorAll<HTMLElement>('nav button')) {
        const box = button.getBoundingClientRect();
        const name = button.innerText.replace(/\n/g, ' ');
        if (box.width < 44 || box.height < 44) out.push(`${name}: ${Math.round(box.width)}×${Math.round(box.height)}`);
        if (box.left < 0 || box.right > window.innerWidth + 0.5) out.push(`${name}: off screen`);
        if (button.scrollWidth > button.clientWidth) out.push(`${name}: text wider than its button`);
        // every word must sit inside the button
        const range = document.createRange();
        for (const child of button.children) {
          if (child.getAttribute('aria-hidden') === 'true') continue;
          range.selectNodeContents(child);
        }
        const text = [...button.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
        for (const node of text) {
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) if (r.left < box.left - 0.5 || r.right > box.right + 0.5) out.push(`${name}: label clipped`);
        }
      }
      return out;
    });
    expect(problems).toEqual([]);
  });
}

// ---- the list ----
test('shows the Export date, the left-out line, and each Adjustment with its split', async ({ page }) => {
  await loadTiny(page);
  await count(page, 'sugar', /Sample Sugar/, '4'); // −6: REMOVE 6, −$9.00
  await count(page, 'oil', /Sample Cooking Oil/, '6'); // +2: ADD 2, +$6.50 (an ADD: Held)
  await adjust(page);

  await expect(page.getByTestId('export-date')).toContainText(/Export loaded\s*\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  await expect(page.getByTestId('export-date')).toContainText('tiny.xlsx');
  await expect(page.getByTestId('left-out')).toHaveText('1 Item is not here yet: 1 not counted.');
  await expect(rows(page)).toHaveCount(2);

  const sugar = rowFor(page, 'Sample Sugar');
  await expect(sugar.getByTestId('action')).toContainText('REMOVE −6');
  await expect(sugar.getByTestId('action')).toContainText('−$9.00');
  await expect(sugar.getByTestId('status')).toHaveText('Pending');
  await expect(sugar).toContainText('Expected10');
  await expect(sugar).toContainText('Count4');
  await expect(sugar).toContainText('Total Variance−6');
  await expect(sugar).toContainText('Wastage—');
  await expect(sugar).toContainText('Unexplained Variance−6');

  const oil = rowFor(page, 'Sample Cooking Oil');
  await expect(oil.getByTestId('action')).toContainText('ADD +2');
  await expect(oil.getByTestId('status')).toHaveText('Held');
  await expect(oil).toContainText('an ADD needs a Supplier Document');
});

test('Wastage shows as the split and its flag, and never changes the quantity', async ({ page }) => {
  await loadTiny(page);
  await count(page, 'sugar', /Sample Sugar/, '4'); // short by 6
  await page.getByRole('button', { name: 'Record Wastage' }).click();
  await page.getByLabel('Wastage quantity').fill('8');
  await page.getByLabel('Wastage reason').selectOption('Expired');
  await page.getByLabel('Register reference').fill('R-1');
  await page.getByLabel('This is NOT already deducted in Zobaze.').check();
  await page.getByRole('button', { name: 'Save Wastage' }).click();
  await adjust(page);

  const sugar = rowFor(page, 'Sample Sugar');
  await expect(sugar.getByTestId('action')).toContainText('REMOVE −6');
  await expect(sugar).toContainText('Total Variance−6');
  await expect(sugar).toContainText('Wastage8');
  await expect(sugar).toContainText('Unexplained Variance+2');
  await expect(sugar).toContainText('Wastage is more than the shortage');
});

test('Duplicate Items show #n and cost; Items without a SKU show name plus Variant; flags are carried', async ({ page }) => {
  await open(page, SMALL);
  await expect(rows(page)).toHaveCount(5);
  await expect(rowFor(page, '#1')).toContainText('Rice');
  await expect(rowFor(page, '#1')).toContainText('#1 · $1.50');
  await expect(rowFor(page, '#2')).toContainText('#2 · $1.75');
  await expect(rowFor(page, 'Flour')).toContainText('Flour 2kg');
  await expect(rowFor(page, 'Flour')).toContainText('No SKU');
  await expect(rowFor(page, 'Cooking Oil')).toContainText('SKU O1');
  await expect(rowFor(page, 'Soap').getByTestId('action')).toContainText('ADD +5');
  await expect(rowFor(page, 'Soap')).toContainText('Negative System Stock');
});

test('the status filter and the search work, together and apart', async ({ page }) => {
  await open(page, SMALL);
  // ADDs (#2, Oil, Soap) are Held for want of a Supplier Document; the REMOVEs are Pending.
  await expect(page.getByRole('button', { name: /^Held 3$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pending 2$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^All 5$/ })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: /^Held/ }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByTestId('shown')).toHaveText('Showing 3 of 3 (5 in all)');
  await page.getByRole('button', { name: /^Applied/ }).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText('No Adjustments match.')).toBeVisible();

  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByLabel('Find an adjustment').fill('2kg');
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel('Find an adjustment').fill('o1');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Cooking Oil');
  await page.getByRole('button', { name: /^Pending/ }).click();
  await expect(rows(page)).toHaveCount(0);
});

test('with no Adjustments there is a plain message, and matching Items are counted', async ({ page }) => {
  await loadTiny(page);
  await count(page, 'sugar', /Sample Sugar/, '10');
  await adjust(page);
  await expect(page.getByTestId('no-adjustments')).toContainText('No Adjustments yet');
  await expect(page.getByTestId('matching')).toHaveText('1 counted Item matches Expected, so needs no Adjustment.');
  await expect(page.getByTestId('left-out')).toHaveText('2 Items are not here yet: 2 not counted.');
  await expect(rows(page)).toHaveCount(0);
});

test('works while new Sessions are paused by the Access Switch', async ({ page }) => {
  await page.route('**/status.json*', (route: Route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ newSessions: 'disabled', message: 'Paused.' }) }),
  );
  await open(page, SMALL);
  await expect(page.getByText('New counts are paused. You can finish, report and back up this count.')).toBeVisible();
  await expect(rows(page)).toHaveCount(5);
});

test('reading the list changes nothing in the saved Session', async ({ page }) => {
  await open(page, SMALL);
  await page.getByLabel('Find an adjustment').fill('rice');
  await page.getByRole('button', { name: /^Held/ }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stockcheck.session.v1')!));
  expect(saved).toEqual(SMALL);
});

test('the Adjust tab fits 320 px with 44 px tap targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, SMALL);
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('page scrolls sideways');
    for (const el of document.querySelectorAll<HTMLElement>('button, input, select')) {
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      const box = el.getBoundingClientRect();
      if (box.width < 44 || box.height < 44) out.push(`${el.tagName} "${el.getAttribute('aria-label') ?? el.innerText}" ${Math.round(box.width)}×${Math.round(box.height)}`);
      if (el instanceof HTMLInputElement && parseFloat(getComputedStyle(el).fontSize) < 16) out.push('input under 16px text');
    }
    return out;
  });
  expect(problems).toEqual([]);
});

// ---- a big stocktake on a cheap phone ----
test('650 Items: the list is quick, draws 50 rows at a time, and every Adjustment is reachable', async ({ page }) => {
  const items: SeedItem[] = Array.from({ length: 650 }, (_, i) => ({
    key: `name:item ${i}|`,
    name: `Item ${i}`,
    expected: 10_000,
    cost: 100 + (i % 40),
    count: i % 10 === 0 ? 10_000 : 10_000 - 1_000 * (1 + (i % 4)), // every 10th matches
  }));
  const matching = items.filter((_, i) => i % 10 === 0).length;
  await page.addInitScript((s) => localStorage.setItem('stockcheck.session.v1', JSON.stringify(s)), seed(items));
  await page.goto('/');

  const started = Date.now();
  await adjust(page);
  await expect(rows(page).first()).toBeVisible();
  const open = Date.now() - started;
  await expect(rows(page)).toHaveCount(50);
  await expect(page.getByTestId('shown')).toHaveText(`Showing 50 of ${650 - matching}`);

  const searched = Date.now();
  await page.getByLabel('Find an adjustment').fill('item 649');
  await expect(rows(page)).toHaveCount(1);
  const search = Date.now() - searched;

  await page.getByLabel('Find an adjustment').fill('');
  await page.getByRole('button', { name: /^Show 50 more/ }).click();
  await expect(rows(page)).toHaveCount(100);
  console.log(`[T23] 650 Items (${650 - matching} Adjustments): open the tab ${open} ms, search ${search} ms`);
  expect(open).toBeLessThan(2_000);
  expect(search).toBeLessThan(1_500);
});
