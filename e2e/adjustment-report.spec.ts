import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { expect, test, type Page, type Route } from '@playwright/test';
import { act, row } from './helpers/adjustActions';
import { adjust, open, SMALL } from './helpers/adjustSession';

// T27, ADR 0007. SMALL: Flour 2kg REMOVE 1, Rice #1 REMOVE 1, Rice #2 ADD 2 (Held), Cooking Oil ADD 3 (Held), Soap ADD 5 (Held).
const SEEDED = { ...SMALL, counter: 'Alex Moyo' };
const card = (page: Page) => page.getByTestId('report-card');
const GENERATE = 'Generate Adjustment Report';

async function openCard(page: Page) {
  if (!(await card(page).evaluate((el) => (el as HTMLDetailsElement).open))) await card(page).locator('summary').click();
}
async function generate(page: Page, branch = 'Main Street', counter?: string) {
  await openCard(page);
  await card(page).getByLabel('Branch').fill(branch);
  if (counter !== undefined) await card(page).getByLabel('Counter').fill(counter);
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: GENERATE }).click()]);
  return file;
}
const read = async (file: Awaited<ReturnType<typeof generate>>) => XLSX.read(readFileSync((await file.path())!), { type: 'buffer', cellNF: true });
const grid = (book: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name]!, { header: 1, defval: null });

test('the card is collapsed, then asks for Branch and Counter, which starts with the Counter on the Session', async ({ page }) => {
  await open(page, SEEDED);
  await expect(card(page)).not.toHaveAttribute('open', '');
  await openCard(page);
  await expect(card(page).getByLabel('Counter')).toHaveValue('Alex Moyo');
  await expect(card(page).getByLabel('Branch')).toHaveValue('');
  await expect(page.getByRole('button', { name: GENERATE })).toBeDisabled();
  await card(page).getByLabel('Branch').fill('Main Street');
  await expect(page.getByRole('button', { name: GENERATE })).toBeEnabled();
  await card(page).getByLabel('Counter').fill('  ');
  await expect(page.getByRole('button', { name: GENERATE })).toBeDisabled();
});

test('downloads stockcheck-adjustments-<branch>-<counter>-<date>-<time>.xlsx with three sheets and the rows as shown', async ({ page }) => {
  await open(page, SEEDED);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await act(row(page, 'Flour'), 'Mark Applied', { name: 'Joe', tick: true });
  await act(row(page, '#1'), 'Put on hold', { name: 'Mary', note: 'Check the storeroom' });
  const file = await generate(page);
  expect(file.suggestedFilename()).toMatch(/^stockcheck-adjustments-main-street-alex-moyo-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/);

  const book = await read(file);
  expect(book.SheetNames).toEqual(['Summary', 'Adjustments', 'Adjustment History']);
  const rows = grid(book, 'Adjustments');
  const header = rows[0] as string[];
  const col = (name: string) => header.indexOf(name);
  const byId = (id: string) => rows.find((r) => r[col('Adjustment ID')] === id)!;

  expect(rows).toHaveLength(6); // header + five Adjustments
  const flour = byId('name:flour|2kg');
  expect(flour[col('Item')]).toBe('Flour');
  expect(flour[col('Variant')]).toBe('2kg');
  expect([flour[col('Action')], flour[col('Quantity (units)')], flour[col('Value ($)')], flour[col('Status')]]).toEqual(['REMOVE', -1, -3, 'Applied']);
  expect([flour[col('Approved by')], flour[col('Applied by')], flour[col('Applied Check')]]).toEqual(['Mary', 'Joe', 'Ticked']);
  expect(flour[col('Approved at')]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  expect(byId('name:rice|#1')[col('Status')]).toBe('Held');
  expect(byId('name:rice|#1')[col('Duplicate #')]).toBe(1);
  expect(byId('name:rice|#2')[col('Status')]).toBe('Held'); // an ADD with no Supplier Document
  expect(byId('name:rice|#2')[col('Duplicate #')]).toBe(2);
  expect(byId('sku:O1')[col('SKU or Key')]).toBe('O1');
  expect(byId('name:soap|')[col('SKU or Key')]).toBe('name:soap|');
  expect(byId('name:soap|')[col('Flags')]).toBe('Negative System Stock');

  const history = grid(book, 'Adjustment History');
  const events = history.slice(1).map((r) => `${r[4]} ${r[5]} ${r[6]}`);
  expect(events).toContain('name:flour|2kg Approved Mary');
  expect(events).toContain('name:flour|2kg Applied Joe');
  expect(events).toContain('name:rice|#1 Put on hold Mary');
  expect(history.find((r) => r[5] === 'Put on hold')![7]).toBe('Check the storeroom');
});

test('shows green and red through number formats, with ADD and REMOVE in words', async ({ page }) => {
  await open(page, SEEDED);
  const book = await read(await generate(page));
  const sheet = book.Sheets['Adjustments']!;
  const rows = grid(book, 'Adjustments');
  const header = rows[0] as string[];
  const rowOf = (id: string) => rows.findIndex((r) => r[header.indexOf('Adjustment ID')] === id) + 1;
  const q = XLSX.utils.encode_col(header.indexOf('Quantity (units)'));
  const v = XLSX.utils.encode_col(header.indexOf('Value ($)'));
  expect(sheet[`${q}${rowOf('sku:O1')}`]!.z).toBe('[Color10]+#,##0.000;[Red]-#,##0.000;0.000');
  expect(sheet[`${v}${rowOf('sku:O1')}`]!.z).toBe('[Color10]+"$"#,##0.00;[Red]-"$"#,##0.00;"$"0.00');
  expect(rows[rowOf('sku:O1') - 1]![header.indexOf('Action')]).toBe('ADD');
  expect(rows[rowOf('name:flour|2kg') - 1]![header.indexOf('Action')]).toBe('REMOVE');
  expect(sheet[`${q}${rowOf('sku:O1')}`]!.v).toBe(3);
  expect(sheet[`${q}${rowOf('name:flour|2kg')}`]!.v).toBe(-1);
});

test('lists a Count changed after Applied, the correcting link, and the review in plain words', async ({ page }) => {
  await open(page, SEEDED);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await act(row(page, 'Flour'), 'Mark Applied', { name: 'Joe', tick: true });
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('flour');
  await page.getByRole('button', { name: /Flour/ }).click();
  const panel = page.getByTestId('item-panel');
  await panel.getByRole('button', { name: /^Edit \d/ }).first().click();
  await panel.getByLabel('Edit Tally').fill('8');
  await panel.getByRole('button', { name: 'Save' }).click();
  await adjust(page);

  let book = await read(await generate(page));
  let rows = grid(book, 'Adjustments');
  const header = rows[0] as string[];
  const flour = rows.find((r) => r[header.indexOf('Adjustment ID')] === 'name:flour|2kg')!;
  expect(flour[header.indexOf('Review')]).toBe('Count changed after Applied: review. It was applied with a Count of 6; the Count is now 8.');
  expect(flour[header.indexOf('Status')]).toBe('Applied');
  const summary = grid(book, 'Summary').map((r) => r.filter((c) => c !== null));
  expect(summary.find((r) => r[0] === 'Applied Adjustments needing review')).toEqual(['Applied Adjustments needing review', 1]);

  await act(row(page, 'Flour').first(), 'Raise a correcting Adjustment', { name: 'Mary', note: 'Two more found' });
  book = await read(await generate(page));
  rows = grid(book, 'Adjustments');
  const applied = rows.find((r) => r[header.indexOf('Adjustment ID')] === 'name:flour|2kg')!;
  const correcting = rows.find((r) => r[header.indexOf('Adjustment ID')] === 'name:flour|2kg~2')!;
  expect(applied[header.indexOf('Corrected by')]).toBe('name:flour|2kg~2');
  expect(applied[header.indexOf('Review')]).toBeNull();
  expect([correcting[header.indexOf('Corrects')], correcting[header.indexOf('Action')], correcting[header.indexOf('Quantity (units)')]]).toEqual(['name:flour|2kg', 'ADD', 2]);
  const history = grid(book, 'Adjustment History').map((r) => String(r[5]));
  expect(history).toContain('Correcting Adjustment raised');
});

test('the Summary names the Export date and the totals, and says it is a record, not security', async ({ page }) => {
  await open(page, SEEDED);
  const book = await read(await generate(page));
  const rows = grid(book, 'Summary').map((r) => r.filter((c) => c !== null));
  const find = (label: string) => rows.find((r) => r[0] === label);
  expect(find('Branch')).toEqual(['Branch', 'Main Street']);
  expect(find('Counter')).toEqual(['Counter', 'Alex Moyo']);
  expect(find('Export file')).toEqual(['Export file', 'seeded-export.xlsx']);
  expect(find('Export loaded (quantities are measured against this Export)')![1]).toBe('2026-10-06 02:30');
  expect(find('Held')).toEqual(['Held', 3]);
  expect(find('Pending')).toEqual(['Pending', 2]);
  expect(find('ADD')).toEqual(['ADD', 3, 10, 14.5]); // Rice #2 +2 ($3.50), Oil +3 ($6.00), Soap +5 ($5.00)
  expect(find('REMOVE')).toEqual(['REMOVE', 2, -2, -4.5]); // Flour -1 ($3.00), Rice #1 -1 ($1.50)
  expect(find('Net')).toEqual(['Net', 5, 8, 10]);
  expect(JSON.stringify(rows)).toContain('a record, not security');
  expect(JSON.stringify(rows)).not.toMatch(/fraud|suspicious|tamper|theft|authori[sz]|verified/i);
});

test('downloading sets only the Adjustment marker: the guard is cleared for what it covers, and the Session Report is not marked', async ({ page }) => {
  await open(page, SEEDED);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await expect(page.getByTestId('report-status')).toHaveText('Not downloaded yet.');

  await generate(page);
  await expect(page.getByTestId('report-status')).toHaveText('Downloaded: everything recorded so far is in the Adjustment Report.');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stockcheck.session.v1')!));
  expect(saved.adjustmentsReportedChanges).toBe(saved.adjustmentChanges);
  expect(saved.reportedChanges).toBeNull(); // the Session Report marker is untouched
  expect(saved.counter).toBe('Alex Moyo');

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByText('Not reported yet.')).toBeVisible(); // the Counts are still not in a Session Report
});

test('after the download the guard shows only the Counts, and a later change brings the Adjustments back', async ({ page }) => {
  await open(page, { ...SEEDED, reportedChanges: SMALL.changes }); // the Counts are reported
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('button', { name: 'Load a new Export' }).click();
  await expect(page.getByRole('alert')).toContainText('Approved Adjustments that are not yet Applied');
  await expect(page.getByRole('button', { name: 'Download the Adjustment Report first' })).toBeVisible();

  // the guard's button leads to the card, already open
  await page.getByRole('button', { name: 'Download the Adjustment Report first' }).click();
  await expect(card(page).getByLabel('Branch')).toBeVisible();
  await generate(page);
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('button', { name: 'Load a new Export' }).click();
  await expect(page.getByLabel('Zobaze Export')).toBeVisible(); // nothing is guarded now
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Pending and Held records are covered by the report, and clear the warning', async ({ page }) => {
  await open(page, { ...SEEDED, reportedChanges: SMALL.changes });
  await act(row(page, '#1'), 'Put on hold', { name: 'Mary' });
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('button', { name: 'Load a new Export' }).click();
  await expect(page.getByRole('alert')).toContainText('1 Adjustment on hold');
  await page.getByRole('button', { name: 'Download the Adjustment Report first' }).click();
  const book = await read(await generate(page));
  const rows = grid(book, 'Adjustments');
  expect(rows.map((r) => r[(rows[0] as string[]).indexOf('Status')]).filter((s) => s === 'Held').length).toBeGreaterThanOrEqual(1); // Pending and Held rows are in it

  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('button', { name: 'Load a new Export' }).click();
  await expect(page.getByLabel('Zobaze Export')).toBeVisible();
});

test('a change after the download is a warning again, counting what was already there', async ({ page }) => {
  await open(page, { ...SEEDED, reportedChanges: SMALL.changes });
  await act(row(page, '#1'), 'Put on hold', { name: 'Mary' });
  await generate(page);
  await act(row(page, 'Flour'), 'Put on hold', { name: 'Mary' });
  await expect(page.getByTestId('report-status')).toHaveText('Changed since the last Adjustment Report: download it again.');
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('button', { name: 'Load a new Export' }).click();
  await expect(page.getByTestId('guard-adjustments')).toContainText('It has 2 Adjustments on hold.');
});

test('the Session Report is the same file before and after an Adjustment Report, including its styles', async ({ page }) => {
  await open(page, SEEDED);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  const sessionReport = async () => {
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await page.getByLabel('Branch').fill('Main Street');
    await page.getByLabel('Counter', { exact: true }).fill('Alex Moyo');
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
    const zip = XLSX.CFB.read(readFileSync((await file.path())!), { type: 'buffer' });
    const part = (p: string) => new TextDecoder().decode(XLSX.CFB.find(zip, p)!.content as Uint8Array);
    // Everything except the "generated" time, which is the clock
    return { styles: part('/xl/styles.xml'), detail: part('/xl/worksheets/sheet2.xml'), recount: part('/xl/worksheets/sheet3.xml'), name: file.suggestedFilename() };
  };
  const before = await sessionReport();
  await adjust(page);
  await generate(page);
  const after = await sessionReport();
  expect(after.styles).toBe(before.styles);
  expect(after.detail).toBe(before.detail);
  expect(after.recount).toBe(before.recount);
});

test('works while new Sessions are paused by the Access Switch', async ({ page }) => {
  await page.route('**/status.json*', (route: Route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ newSessions: 'disabled', message: 'Paused.' }) }),
  );
  await open(page, SEEDED);
  const file = await generate(page);
  expect(file.suggestedFilename()).toMatch(/^stockcheck-adjustments-/);
  await expect(page.getByTestId('report-status')).toHaveCount(0); // nothing recorded yet: no status line
});

test('with no Adjustments there is nothing to report, and the button says so', async ({ page }) => {
  await open(page, { ...SEEDED, tallies: {}, finished: {}, countAtDone: {}, changes: 0 });
  await openCard(page);
  await card(page).getByLabel('Branch').fill('Main Street');
  await expect(page.getByRole('button', { name: GENERATE })).toBeDisabled();
  await expect(card(page)).toContainText('There are no Adjustments to report yet.');
});

for (const width of [360, 320]) {
  test(`the card and its button fit ${width} px with 44 px tap targets and 16 px fields`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await open(page, SEEDED);
    await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
    await openCard(page);
    await card(page).getByLabel('Branch').fill('A branch with a rather long name indeed');
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('page scrolls sideways');
      for (const el of document.querySelectorAll<HTMLElement>('[data-testid="report-card"] summary, [data-testid="report-card"] button, [data-testid="report-card"] input')) {
        const box = el.getBoundingClientRect();
        if (box.width < 44 || box.height < 44) out.push(`${el.tagName} "${el.getAttribute('aria-label') ?? el.innerText}" ${Math.round(box.width)}×${Math.round(box.height)}`);
        if (box.right > window.innerWidth) out.push(`${el.tagName} off screen`);
        if (el instanceof HTMLInputElement && parseFloat(getComputedStyle(el).fontSize) < 16) out.push('input under 16px');
      }
      return out;
    });
    expect(problems).toEqual([]);
  });
}
