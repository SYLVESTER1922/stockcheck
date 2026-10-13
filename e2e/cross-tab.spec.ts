import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { expect, test, type Page } from '@playwright/test';
import { adjust } from './helpers/adjustSession';

// T28, ADR 0007: every screen and both Excel files show the same figures. tiny.xlsx: Sample Sugar Expected 10 @ $1.50,
// Cooking Oil 4 @ $3.25, Soap −2 @ $0.45.
async function countTiny(page: Page) {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await expect(page.getByText('3 items loaded')).toBeVisible();
  for (const [query, name, count] of [['sugar', /Sample Sugar/, '4'], ['oil', /Sample Cooking Oil/, '6']] as const) {
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Find an item' }).fill(query);
    await page.getByRole('button', { name }).click();
    await page.getByLabel('Count').fill(count);
    await page.getByRole('button', { name: 'Done' }).click();
  }
}
async function recordWastage(page: Page, quantity: string) {
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByRole('button', { name: 'Record Wastage' }).click();
  await page.getByLabel('Wastage quantity').fill(quantity);
  await page.getByLabel('Wastage reason').selectOption('Expired');
  await page.getByLabel('Register reference').fill('R-12');
  await page.getByLabel('This is NOT already deducted in Zobaze.').check();
  await page.getByRole('button', { name: 'Save Wastage' }).click();
}
const summaryRows = (path: string, book?: XLSX.WorkBook) => {
  const wb = book ?? XLSX.read(readFileSync(path), { type: 'buffer' });
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Summary']!, { header: 1, defval: null }).map((r) => r.filter((c) => c !== null));
};

test('Wastage Value and Unexplained Value are on the Variance tab, the Report screen and the Session Report: the same, to the cent', async ({ page }) => {
  await countTiny(page); // Sugar −6 (−$9.00), Oil +2 (+$6.50): net −$2.50

  // no Wastage: nothing new on either screen
  await page.getByRole('button', { name: 'Variance', exact: true }).click();
  await expect(page.getByTestId('wastage-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByTestId('report-wastage-value')).toHaveCount(0);
  await expect(page.getByTestId('net-value')).toHaveText('−$2.50');

  await recordWastage(page, '8'); // Sugar: Wastage 8 × $1.50 = $12.00; Unexplained +2 × $1.50 = +$3.00; Oil +$6.50
  await page.getByRole('button', { name: 'Variance', exact: true }).click();
  await expect(page.getByTestId('hero-net')).toContainText('−$2.50'); // unchanged
  await expect(page.getByTestId('wastage-items')).toHaveText('1');
  await expect(page.getByTestId('wastage-value')).toHaveText('$12.00');
  await expect(page.getByTestId('unexplained-value')).toHaveText('+$9.50');

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByTestId('net-value')).toHaveText('−$2.50');
  await expect(page.getByTestId('report-wastage-value')).toHaveText('Wastage Value $12.00 (1 item)');
  await expect(page.getByTestId('report-unexplained-value')).toHaveText('Unexplained Value +$9.50');

  await page.getByLabel('Branch').fill('Main Street');
  await page.getByLabel('Counter', { exact: true }).fill('Alex');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
  const rows = summaryRows((await file.path())!);
  const line = (label: string) => rows.find((r) => r[0] === label)![1];
  expect(line('Wastage Value (USD)')).toBe(12);
  expect(line('Unexplained Value (USD)')).toBe(9.5);
  expect(line('Net Variance Value (USD)')).toBe(-2.5);
  expect(line('Items with Wastage')).toBe(1);
});

test('the Adjust tab totals equal the Adjustment Report Summary, to the cent', async ({ page }) => {
  await countTiny(page);
  await adjust(page);
  await expect(page.getByTestId('total-add')).toHaveText('ADD: 1 Adjustment · +2 units · +$6.50');
  await expect(page.getByTestId('total-remove')).toHaveText('REMOVE: 1 Adjustment · −6 units · −$9.00');
  await expect(page.getByTestId('total-net')).toHaveText('Net: 2 Adjustments · −4 units · −$2.50');

  await page.getByTestId('report-card').locator('summary').click();
  await page.getByTestId('report-card').getByLabel('Branch').fill('Main Street');
  await page.getByTestId('report-card').getByLabel('Counter').fill('Alex');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Generate Adjustment Report' }).click()]);
  const rows = summaryRows((await file.path())!);
  expect(rows.find((r) => r[0] === 'ADD')).toEqual(['ADD', 1, 2, 6.5]);
  expect(rows.find((r) => r[0] === 'REMOVE')).toEqual(['REMOVE', 1, -6, -9]);
  expect(rows.find((r) => r[0] === 'Net')).toEqual(['Net', 2, -4, -2.5]);
});

test('Rejected Adjustments are left out of the totals on the tab', async ({ page }) => {
  await countTiny(page);
  await adjust(page);
  const sugar = page.getByTestId('adjustment-row').filter({ hasText: 'Sample Sugar' });
  await sugar.getByRole('button', { name: 'Reject', exact: true }).click();
  await sugar.getByLabel('Your name').fill('Mary');
  await sugar.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByTestId('total-remove')).toHaveText('REMOVE: 0 Adjustments · 0 units · $0.00');
  await expect(page.getByTestId('total-net')).toHaveText('Net: 1 Adjustment · +2 units · +$6.50');
});

test('How to count has a short Wastage and Adjustments section, and the numbered instructions are the same ten', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to count' }).click();
  await expect(page.locator('ol > li')).toHaveCount(10);
  const section = page.getByTestId('about-adjustments');
  await expect(section).toContainText('Wastage is optional');
  await expect(section).toContainText('It never changes the Variance');
  await expect(section).toContainText('StockCheck never changes Zobaze');
  await expect(section).toContainText('a record, not security');
  await expect(page.getByTestId('about')).toContainText('About StockCheck'); // the Access Switch text is still there
});
