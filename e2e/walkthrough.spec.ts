import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { expect, test, type Page } from '@playwright/test';
import { act, buttons, form, press, row } from './helpers/adjustActions';

// T28, ADR 0007: the whole flow, on the real screens, from the Export to the replace-guard.
// tiny.xlsx: Sample Sugar Expected 10 @ $1.50, Cooking Oil 4 @ $3.25, Soap −2 @ $0.45.
const adjustTab = (page: Page) => page.getByRole('button', { name: 'Adjust', exact: true }).click();
const gridOf = (path: string, sheet: string) => XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(readFileSync(path), { type: 'buffer' }).Sheets[sheet]!, { header: 1, defval: null });
const rowIn = (grid: unknown[][], column: string, value: string) => grid.find((r) => r[(grid[0] as string[]).indexOf(column)] === value)!;
const cell = (grid: unknown[][], r: unknown[], column: string) => r[(grid[0] as string[]).indexOf(column)];

test('count, Wastage, Adjustment, Approval, Applied, count change, review flag, correction, both reports, backup, replace-guard', async ({ page, browser }) => {
  test.setTimeout(120_000);

  await test.step('load the Export and count three Items', async () => {
    await page.goto('/');
    await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
    await expect(page.getByText('3 items loaded')).toBeVisible();
    for (const [query, name, count] of [['sugar', /Sample Sugar/, '4'], ['oil', /Sample Cooking Oil/, '6'], ['soap', /Sample Soap/, '0']] as const) {
      await page.getByRole('searchbox', { name: 'Find an item' }).fill(query);
      await page.getByRole('button', { name }).click();
      await page.getByLabel('Count').fill(count);
      await page.getByRole('button', { name: 'Done' }).click();
    }
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Adjust', exact: true })).toBeVisible();
  });

  await test.step('record Wastage on the short Item: it sits beside the Variance and changes nothing', async () => {
    await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
    await page.getByRole('button', { name: /Sample Sugar/ }).click();
    await page.getByRole('button', { name: 'Record Wastage' }).click();
    await page.getByLabel('Wastage quantity').fill('2');
    await page.getByLabel('Wastage reason').selectOption('Expired');
    await page.getByLabel('Register reference').fill('R-12');
    await page.getByLabel('This is NOT already deducted in Zobaze.').check();
    await page.getByRole('button', { name: 'Save Wastage' }).click();
    await expect(page.getByTestId('wastage')).toContainText('Unexplained−4');
    await expect(page.getByTestId('line')).toContainText('Variance −6');
    await expect(page.getByTestId('line')).toContainText('−$9.00');
  });

  const sugar = () => row(page, 'Sample Sugar');
  const oil = () => row(page, 'Cooking Oil');
  const soap = () => row(page, 'Sample Soap');

  await test.step('the Adjust tab lists an Adjustment for each, with the split and the totals', async () => {
    await adjustTab(page);
    await expect(sugar().getByTestId('action')).toContainText('REMOVE −6');
    await expect(sugar()).toContainText('Wastage2');
    await expect(sugar()).toContainText('Unexplained Variance−4');
    await expect(sugar().getByTestId('status')).toHaveText('Pending');
    await expect(oil().getByTestId('action')).toContainText('ADD +2');
    await expect(oil().getByTestId('status')).toHaveText('Held'); // an ADD needs a Supplier Document
    await expect(soap().getByTestId('action')).toContainText('ADD +2');
    await expect(page.getByTestId('total-net')).toHaveText('Net: 3 Adjustments · −2 units · −$1.60');
  });

  await test.step('approve (the Counter is asked once), supply a document, apply, and put one on hold', async () => {
    await press(sugar(), 'Approve');
    await form(sugar()).getByLabel('Counter of this count').fill('Alex Moyo');
    await form(sugar()).getByLabel('Your name').fill('Mary');
    await form(sugar()).getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(sugar().getByTestId('approved-by')).toContainText('Approved by Mary');
    await act(sugar(), 'Mark Applied', { name: 'Joe', tick: true });
    await expect(sugar().getByTestId('applied-by')).toContainText('Applied by Joe');

    await act(oil(), 'Add Supplier Document', { name: 'Mary', doc: 'INV-1' });
    await act(oil(), 'Approve', { name: 'Mary' });
    await expect(oil().getByTestId('status')).toHaveText('Approved');
    await act(soap(), 'Put on hold', { name: 'Mary', note: 'Check the storeroom' });
    await expect(soap().getByTestId('status')).toHaveText('Held');
  });

  await test.step('changing the Count of the Applied Item is flagged for review, and the Count tab says so first', async () => {
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
    await page.getByRole('button', { name: /Sample Sugar/ }).click();
    await expect(page.getByTestId('applied-hint')).toHaveText('This Item has an Applied Adjustment. Changing the Count will flag it for review.');
    const panel = page.getByTestId('item-panel');
    await panel.getByRole('button', { name: /^Edit \d/ }).first().click();
    await panel.getByLabel('Edit Tally').fill('5');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('line')).toContainText('Variance −5');

    await adjustTab(page);
    await expect(page.getByTestId('needs-review')).toHaveText('1 Applied Adjustment needs a review: the count changed after it was applied.');
    await expect(page.getByTestId('adjustment-row').first()).toContainText('Count changed after Applied: review'); // listed first
    await expect(sugar().getByTestId('status')).toHaveText('Applied'); // the record itself is as it was
    await expect(sugar().getByTestId('action')).toContainText('REMOVE −6');
  });

  await test.step('raise a correcting Adjustment: the new Total Variance minus what was applied', async () => {
    await press(sugar().first(), 'Raise a correcting Adjustment');
    await expect(form(sugar().first()).getByTestId('correction-preview')).toContainText('ADD +1'); // −5 now, −6 applied
    await form(sugar().first()).getByLabel('Your name').fill('Mary');
    await form(sugar().first()).getByLabel('Note').fill('One more found');
    await form(sugar().first()).getByRole('button', { name: 'Raise a correcting Adjustment' }).click();
    await expect(page.getByTestId('needs-review')).toHaveCount(0);
    await expect(page.getByTestId('adjustment-row').filter({ has: page.getByTestId('corrects') }).getByTestId('action')).toContainText('ADD +1');
  });

  await test.step('the replace-guard stops a new Export: unreported Counts and recorded Adjustments, both said', async () => {
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    await page.getByRole('button', { name: 'Load a new Export' }).click();
    const guard = page.getByRole('alert');
    await expect(guard).toContainText("This Session has counts that aren't in a downloaded report.");
    await expect(page.getByTestId('guard-adjustments')).toContainText('1 Approved Adjustment that is not yet Applied');
    await expect(page.getByLabel('Zobaze Export')).toHaveCount(0);
    await page.getByRole('button', { name: 'Keep counting' }).click();
  });

  let sessionReport = '';
  await test.step('download the Session Report: Wastage is after the existing columns, Net Variance unchanged', async () => {
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await expect(page.getByTestId('report-wastage-value')).toHaveText('Wastage Value $3.00 (1 item)');
    await page.getByLabel('Branch').fill('Main Street');
    await page.getByLabel('Counter', { exact: true }).fill('Alex Moyo');
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
    sessionReport = (await file.path())!;
    const detail = gridOf(sessionReport, 'Variance Detail');
    const header = detail[0] as string[];
    expect(header.slice(-6)).toEqual(['Wastage', 'Wastage reason', 'Wastage note', 'Register reference', 'Unexplained Variance (units)', 'Wastage flags']);
    expect(header.indexOf('SKU')).toBe(17); // the existing columns have not moved
    const sugarRow = rowIn(detail, 'Item', 'Sample Sugar');
    expect([cell(detail, sugarRow, 'Variance (units)'), cell(detail, sugarRow, 'Wastage'), cell(detail, sugarRow, 'Unexplained Variance (units)')]).toEqual([-5, 2, -3]);
  });

  let adjustmentReport = '';
  await test.step('download the Adjustment Report: statuses, names, document, history, the correcting link', async () => {
    await adjustTab(page);
    await page.getByTestId('report-card').locator('summary').click();
    await page.getByTestId('report-card').getByLabel('Branch').fill('Main Street');
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Generate Adjustment Report' }).click()]);
    adjustmentReport = (await file.path())!;
    expect(file.suggestedFilename()).toMatch(/^stockcheck-adjustments-main-street-alex-moyo-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/);
    const rows = gridOf(adjustmentReport, 'Adjustments');
    const applied = rowIn(rows, 'Adjustment ID', 'name:sample sugar|2kg');
    expect([cell(rows, applied, 'Status'), cell(rows, applied, 'Approved by'), cell(rows, applied, 'Applied by'), cell(rows, applied, 'Applied Check')]).toEqual(['Applied', 'Mary', 'Joe', 'Ticked']);
    expect(cell(rows, applied, 'Corrected by')).toBe('name:sample sugar|2kg~2');
    const correcting = rowIn(rows, 'Adjustment ID', 'name:sample sugar|2kg~2');
    expect([cell(rows, correcting, 'Action'), cell(rows, correcting, 'Quantity (units)'), cell(rows, correcting, 'Corrects')]).toEqual(['ADD', 1, 'name:sample sugar|2kg']);
    expect(cell(rows, rowIn(rows, 'Adjustment ID', 'name:sample cooking oil|2l'), 'Supplier Document')).toBe('INV-1');
    expect(cell(rows, rowIn(rows, 'Adjustment ID', 'name:sample soap|'), 'Status')).toBe('Held');
    const events = gridOf(adjustmentReport, 'Adjustment History').slice(1).map((r) => `${r[6]}: ${r[5]}`);
    expect(events).toEqual(expect.arrayContaining(['Mary: Approved', 'Joe: Applied', 'Mary: Put on hold', 'Mary: Correcting Adjustment raised']));
    expect(gridOf(sessionReport, 'Variance Detail')[0]).toHaveLength(24); // the Session Report is a different file, untouched by this
  });

  await test.step('with both reports downloaded, a new Export is allowed; a later change brings the guard back', async () => {
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    await page.getByRole('button', { name: 'Load a new Export' }).click();
    await expect(page.getByLabel('Zobaze Export')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await adjustTab(page);
    await act(row(page, 'Sample Sugar').filter({ has: page.getByTestId('corrects') }), 'Put on hold', { name: 'Mary' });
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    await page.getByRole('button', { name: 'Load a new Export' }).click();
    await expect(page.getByRole('alert')).toContainText('Approved Adjustments that are not yet Applied');
    await page.getByRole('button', { name: 'Keep working' }).click(); // the Counts are reported: only Adjustments are at stake
  });

  await test.step('restore a backup on a second phone: Counts, Wastage, decisions and history all arrive', async () => {
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    const [backup] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save a backup' }).click()]);
    const phone = await browser.newPage();
    await phone.goto('/');
    await phone.getByLabel('Restore a backup').setInputFiles((await backup.path())!);
    await adjustTab(phone);
    await expect(row(phone, 'Sample Sugar').first().getByTestId('applied-by')).toContainText('Applied by Joe');
    await expect(row(phone, 'Cooking Oil').getByTestId('approved-by')).toContainText('Approved by Mary');
    await expect(row(phone, 'Cooking Oil')).toContainText('Supplier Document: INV-1');
    await expect(row(phone, 'Sample Soap').getByTestId('status')).toHaveText('Held');
    await expect(phone.getByTestId('adjust-totals')).toBeVisible();
    await press(row(phone, 'Sample Soap'), 'History');
    await expect(row(phone, 'Sample Soap').getByTestId('history')).toContainText('Put on hold by Mary');
    expect(await buttons(row(phone, 'Sample Sugar').first())).toContain('History');
    await phone.getByRole('button', { name: 'Count', exact: true }).click();
    await phone.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
    await phone.getByRole('button', { name: /Sample Sugar/ }).click();
    await expect(phone.getByTestId('wastage')).toContainText('Unexplained−3'); // the Wastage came across
    await phone.close();
  });

  await test.step('discarding takes two taps, and then a new Export can be loaded', async () => {
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    await page.getByRole('button', { name: 'Load a new Export' }).click();
    await page.getByRole('button', { name: 'Discard this Session' }).click();
    await expect(page.getByRole('alert')).toContainText('Discard 1 Approved Adjustment that is not yet Applied');
    await page.getByRole('button', { name: 'Yes, discard' }).click();
    await expect(page.getByLabel('Zobaze Export')).toBeVisible();
  });
});
