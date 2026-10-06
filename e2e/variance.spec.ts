import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { expect, test, type Page } from '@playwright/test';

async function count(page: Page, query: string, name: RegExp, n: string, done = true) {
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill(query);
  await page.getByRole('button', { name }).click();
  await page.getByLabel('Count').fill(n);
  await page.getByRole('button', { name: done ? 'Done' : 'Another place' }).click();
}

async function start(page: Page) {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await count(page, 'sugar', /Sample Sugar/, '9'); // 10 → 9 at $1.50: −$1.50
  await count(page, 'oil', /Sample Cooking Oil/, '2'); // 4 → 2 at $3.25: −$6.50 (Look Again)
  await count(page, 'soap', /Sample Soap/, '1'); // −2 → 1 at $0.45: +$1.35 (Look Again)
}

const variance = (page: Page) => page.getByRole('button', { name: 'Variance', exact: true }).click();
const cents = (text: string) => Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100) * (/[−-]/.test(text) ? -1 : 1);

test('the Variance tab totals equal the Excel Summary to the cent', async ({ page }) => {
  await start(page);
  await variance(page);
  const screen = {
    net: cents(await page.getByTestId('hero-net').innerText()),
    short: cents(await page.getByTestId('hero-short').innerText()),
    over: cents(await page.getByTestId('hero-over').innerText()),
    expected: cents(await page.getByTestId('hero-expected').innerText()),
  };
  expect(screen).toEqual({ net: -665, short: -800, over: 135, expected: 2_710 });

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByLabel('Branch').fill('Sample Branch');
  await page.getByLabel('Counter').fill('Sample Counter');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
  const rows = XLSX.utils.sheet_to_json<[string, number]>(
    XLSX.read(readFileSync((await file.path())!), { type: 'buffer' }).Sheets.Summary!,
    { header: 1 },
  );
  const sheet = (label: string) => Math.round(rows.find((r) => r[0] === label)![1] * 100);
  expect({
    net: sheet('Net Variance Value (USD)'),
    short: sheet('Shortage value (USD)'),
    over: sheet('Surplus value (USD)'),
    expected: sheet('Expected value of counted Items (USD)'),
  }).toEqual(screen);
});

test('hero wording, signed values, and the four tiles', async ({ page }) => {
  await start(page);
  await variance(page);
  await expect(page.getByTestId('variance-hero')).toContainText('Net variance value');
  await expect(page.getByText(/estimated shrinkage/i)).toHaveCount(0);
  await expect(page.getByText(/line accuracy/i)).toHaveCount(0);
  await expect(page.getByTestId('hero-net')).toHaveText('−$6.65');
  await expect(page.getByTestId('hero-over')).toContainText('+$1.35');
  await expect(page.getByTestId('tile-short')).toContainText('Lines short');
  await expect(page.getByTestId('tile-short')).toContainText('2');
  await expect(page.getByTestId('tile-over')).toContainText('Lines over');
  await expect(page.getByTestId('tile-match')).toContainText('Exact match');
  await expect(page.getByTestId('tile-not-counted')).toContainText('Not counted');
  await expect(page.getByText('A shortage may be stock on the shelf under a different name')).toBeVisible();
});

test('tiles wrap 2×2 at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await start(page);
  await variance(page);
  const boxes = await Promise.all(
    ['tile-short', 'tile-over', 'tile-match', 'tile-not-counted'].map((id) => page.getByTestId(id).boundingBox()),
  );
  const [a, b, c, d] = boxes.map((box) => box!);
  expect(a!.y).toBe(b!.y);
  expect(c!.y).toBe(d!.y);
  expect(c!.y).toBeGreaterThan(a!.y);
});

test('in-progress Items are a separate line and never appear in the gaps', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await count(page, 'sugar', /Sample Sugar/, '4', false); // Another place only
  await count(page, 'oil', /Sample Cooking Oil/, '2');
  await variance(page);
  await expect(page.getByTestId('in-progress-line')).toHaveText('1 in progress (Done not tapped)');
  await expect(page.getByTestId('gaps').getByText('Sample Sugar')).toHaveCount(0);
  await expect(page.getByTestId('gaps').getByText('Sample Cooking Oil')).toBeVisible();
});

test('biggest gaps: by value or by units, and tapping a row shows Count at Done and Look Again', async ({ page }) => {
  await start(page);
  await variance(page);
  const names = () => page.getByTestId('gap-name').allInnerTexts();
  expect(await names()).toEqual(['Sample Cooking Oil 2L', 'Sample Sugar 2kg', 'Sample Soap']);

  await page.getByRole('button', { name: 'by units' }).click();
  await expect(page.getByRole('button', { name: 'by units' })).toHaveAttribute('aria-pressed', 'true');
  expect(await names()).toEqual(['Sample Soap', 'Sample Cooking Oil 2L', 'Sample Sugar 2kg']);

  const oil = page.getByRole('button', { name: /Sample Cooking Oil/ });
  await expect(oil).toContainText('expected 4 · counted 2 · cost $3.25');
  await expect(oil).toContainText('−$6.50');
  await oil.click();
  await expect(page.getByTestId('gap-detail')).toContainText('Count at Done 2');
  await expect(page.getByTestId('gap-detail')).toContainText('Count at Look Again 2');
});

test('the Variance tab fits 320 px with 44 px tap targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await start(page);
  await variance(page);
  await page.getByRole('button', { name: /Sample Cooking Oil/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, input')]
      .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.height < 44 || box.width < 44;
      })
      .map((el) => el.textContent?.trim()),
  );
  expect(small).toEqual([]);
});
