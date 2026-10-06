import * as XLSX from 'xlsx';
import { expect, test, type Page } from '@playwright/test';

const home = (page: Page) => page.getByTestId('home');
const homeArrow = (page: Page) => page.getByRole('button', { name: 'Home', exact: true });

async function loadAndCount(page: Page) {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('9');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('oil');
  await page.getByRole('button', { name: /Sample Cooking Oil/ }).click();
  await page.getByLabel('Count').fill('2');
  await page.getByRole('button', { name: 'Another place' }).click(); // in progress, not counted yet
}

test('Home with no Session: brand, steps, Start a count, secondary actions, chips and footer', async ({ page }) => {
  await page.goto('/');
  await expect(home(page)).toContainText('Count your stock. Find the gaps.');
  const steps = home(page).getByTestId('steps');
  await expect(steps).toContainText('Load your Zobaze Export');
  await expect(steps).toContainText("Count what's on the shelf");
  await expect(steps).toContainText('Download your report');
  await expect(page.getByLabel('Zobaze Export')).toBeVisible();
  await expect(home(page)).toContainText('Start a count');
  await expect(page.getByLabel('Restore a backup')).toBeVisible();
  await expect(page.getByRole('button', { name: 'How to count' })).toBeVisible();
  await expect(home(page)).toContainText('Works offline');
  await expect(home(page)).toContainText('Your counts stay on this phone');
  await expect(page.getByTestId('powered-by')).toContainText('Powered by Netrisyl Insights');
  await expect(page.getByText(/^Version /)).toBeVisible();
  await expect(homeArrow(page)).toHaveCount(0); // no back arrow on Home
});

test('the styled pickers show the chosen file name', async ({ page }) => {
  await page.goto('/');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ITEM_NAME', 'STOCK'], ['A', 1]]), 'S');
  const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  await page.getByLabel('Zobaze Export').setInputFiles({ name: 'missing-cost.xlsx', mimeType: 'application/octet-stream', buffer });
  await expect(page.getByRole('alert')).toContainText('No cost price column found');
  await expect(home(page)).toContainText('missing-cost.xlsx');
  await expect(page.getByText(/no file (chosen|selected)/i)).toHaveCount(0);
});

test('Continue count shows how many Items are counted (Done), and goes to Count', async ({ page }) => {
  await loadAndCount(page);
  await homeArrow(page).click();
  await expect(home(page)).toContainText('1 of 3 counted');
  await page.getByRole('button', { name: /Continue count/ }).click();
  await expect(page.getByRole('searchbox', { name: 'Find an item' })).toBeVisible();
});

for (const [screen, open] of [
  ['Count', async (page: Page) => page.getByRole('button', { name: 'Count', exact: true }).click()],
  ['Variance', async (page: Page) => page.getByRole('button', { name: 'Variance', exact: true }).click()],
  ['Report', async (page: Page) => page.getByRole('button', { name: 'Report', exact: true }).click()],
  ['How to count', async (page: Page) => page.getByRole('button', { name: 'How to count' }).click()],
] as const) {
  test(`Home is reachable from ${screen}, and the Session is untouched`, async ({ page }) => {
    await loadAndCount(page);
    await open(page);
    const arrow = homeArrow(page);
    await expect(arrow).toBeVisible();
    expect((await arrow.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await arrow.click();
    await expect(home(page)).toBeVisible();
    await expect(home(page)).toContainText('1 of 3 counted');

    // The Session is unchanged and still guarded.
    await page.getByRole('button', { name: /Continue count/ }).click();
    await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
    await expect(page.getByRole('button', { name: /Sample Sugar.*✓ 9/ })).toBeVisible();
    await page.getByRole('button', { name: 'Load a new Export' }).click();
    await expect(page.getByText("This Session has counts that aren't in a downloaded report.")).toBeVisible();
  });
}

test('How to count from Home (no Session) also has the Home arrow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to count' }).click();
  await homeArrow(page).click();
  await expect(home(page)).toBeVisible();
});

test("the browser's back button (Android back) goes to Home", async ({ page }) => {
  await loadAndCount(page);
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.goBack();
  await expect(home(page)).toBeVisible();
  await expect(home(page)).toContainText('1 of 3 counted');
});

test('the back button also works after reopening the app mid-count', async ({ page }) => {
  await loadAndCount(page);
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Find an item' })).toBeVisible(); // reopens on Count
  await page.goBack();
  await expect(home(page)).toBeVisible();
});

test('Home fits 320 px with 44 px tap targets, with and without a Session', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const check = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, input, a[href]')]
        .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.height < 44 || b.width < 44;
        })
        .map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim()),
    );
    expect(small).toEqual([]);
  };
  await page.goto('/');
  await check();
  await loadAndCount(page);
  await homeArrow(page).click();
  await check();
});
