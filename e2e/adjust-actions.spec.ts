import { expect, test, type Route } from '@playwright/test';
import { act, alertIn, buttons, form, press, row, TICK } from './helpers/adjustActions';
import { adjust, open, seed, SMALL } from './helpers/adjustSession';

// T24, ADR 0007: approvals and Applied marks. SMALL: Rice #1 REMOVE 1, Rice #2 ADD 2, Flour 2kg REMOVE 1,
// Cooking Oil ADD 3, Soap ADD 5. The ADDs have no Supplier Document, so they show as Held.
test('a Pending REMOVE offers Approve, Reject and Put on hold, and nothing else', async ({ page }) => {
  await open(page, SMALL);
  expect(await buttons(row(page, 'Flour'))).toEqual(['Approve', 'Reject', 'Put on hold']);
});

test('Approve needs a name, says so when it is missing, then shows who approved and when', async ({ page }) => {
  await open(page, SMALL);
  const flour = row(page, 'Flour');
  await press(flour, 'Approve');
  await expect(form(flour)).toContainText('It is a record, not security');
  await expect(form(flour)).toContainText(/Time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}, taken from this phone/);
  expect(await form(flour).locator('input').count()).toBe(3); // the Counter (first Approval only), a name and a note: the time is not a field
  await form(flour).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(alertIn(flour)).toHaveText('Type your name.');
  await expect(flour.getByTestId('status')).toHaveText('Pending');

  await form(flour).getByLabel('Your name').fill('Mary');
  await form(flour).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(flour.getByTestId('status')).toHaveText('Approved');
  await expect(flour.getByTestId('approved-by')).toHaveText(/^Approved by Mary · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  await expect(page.getByTestId('notice')).toHaveText('Flour 2kg: Approve saved.');
  expect(await buttons(flour)).toEqual(['Mark Applied', 'Revoke approval', 'History']);
});

test('remembered names are suggestions only: never filled in for the next person', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await press(row(page, '#1'), 'Approve');
  await expect(form(row(page, '#1')).getByLabel('Your name')).toHaveValue('');
  await expect(page.locator('datalist#approver-names option[value="Mary"]')).toHaveCount(1);
});

test('approving under the Counter\'s own name shows a warning and still works', async ({ page }) => {
  await open(page, { ...SMALL, counter: 'Alex Moyo' });
  const flour = row(page, 'Flour');
  await press(flour, 'Approve');
  await expect(form(flour).getByLabel('Counter of this count')).toHaveCount(0); // already known: not asked again
  await form(flour).getByLabel('Your name').fill('alex  moyo');
  await expect(flour.getByTestId('same-name')).toContainText('same name as the Counter');
  await form(flour).getByLabel('Your name').fill('Mary');
  await expect(flour.getByTestId('same-name')).toHaveCount(0);
  await form(flour).getByLabel('Your name').fill('Alex Moyo');
  await form(flour).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(flour.getByTestId('status')).toHaveText('Approved'); // a warning, never a block
});

test('the Counter is asked for once, on the first Approval, and kept on the Session', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('stockcheck.names.v1', JSON.stringify({ branches: [], counters: ['Alex Moyo'] })));
  await open(page, SMALL);
  const flour = row(page, 'Flour');
  await press(flour, 'Approve');
  await expect(form(flour).getByLabel('Counter of this count')).toHaveValue(''); // never guessed
  await expect(page.locator('datalist#counter-names option[value="Alex Moyo"]')).toHaveCount(1);
  await form(flour).getByLabel('Counter of this count').fill('Alex Moyo');
  await form(flour).getByLabel('Your name').fill('alex moyo');
  await expect(flour.getByTestId('same-name')).toBeVisible(); // the typed Counter is used straight away
  await form(flour).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(flour.getByTestId('status')).toHaveText('Approved');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stockcheck.session.v1')!));
  expect(saved.counter).toBe('Alex Moyo');
  await press(row(page, '#1'), 'Approve');
  await expect(form(row(page, '#1')).getByLabel('Counter of this count')).toHaveCount(0); // asked once
});

test('leaving the Counter empty is allowed, and it is asked again next time', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await expect(row(page, 'Flour').getByTestId('status')).toHaveText('Approved');
  await press(row(page, '#1'), 'Approve');
  await expect(form(row(page, '#1')).getByLabel('Counter of this count')).toBeVisible();
});

test('the Report screen starts with the Counter kept on the Session', async ({ page }) => {
  await open(page, { ...SMALL, counter: 'Alex Moyo' });
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByLabel('Counter', { exact: true })).toHaveValue('Alex Moyo');
});

test('typing the Counter on the Report screen keeps it on the Session, and the report stays reported', async ({ page }) => {
  await open(page, SMALL);
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByLabel('Branch').fill('Main Street');
  await page.getByLabel('Counter', { exact: true }).fill('Sam Dube');
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
  await expect(page.getByText('Reported: the latest counts are in your downloaded report.')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stockcheck.session.v1')!));
  expect(saved.counter).toBe('Sam Dube');
  await adjust(page);
  await press(row(page, 'Flour'), 'Approve');
  await expect(form(row(page, 'Flour')).getByLabel('Counter of this count')).toHaveCount(0);
});

test('an ADD with no Supplier Document shows as Held, and does not offer Approve or Back to Pending', async ({ page }) => {
  await open(page, SMALL);
  const oil = row(page, 'Cooking Oil');
  await expect(oil.getByTestId('status')).toHaveText('Held');
  expect(await buttons(oil)).toEqual(['Add Supplier Document', 'Reject', 'Put on hold']);
});

test('the Supplier Document is asked for, refused when empty, and then lets the ADD be Approved', async ({ page }) => {
  await open(page, SMALL);
  const oil = row(page, 'Cooking Oil');
  await act(oil, 'Add Supplier Document', { name: 'Mary', doc: '  ' });
  await expect(alertIn(oil)).toHaveText('Type the invoice or delivery note number.');
  await form(oil).getByLabel('Supplier Document (invoice or delivery note number)').fill('INV-204');
  await form(oil).getByRole('button', { name: 'Add Supplier Document', exact: true }).click();
  await expect(oil).toContainText('Supplier Document: INV-204');
  await expect(oil.getByTestId('status')).toHaveText('Pending');
  expect(await buttons(oil)).toEqual(['Change Supplier Document', 'Approve', 'Reject', 'Put on hold', 'History']);
  await act(oil, 'Approve', { name: 'Mary' });
  await expect(oil.getByTestId('status')).toHaveText('Approved');
});

test('a REMOVE never asks for a Supplier Document', async ({ page }) => {
  await open(page, SMALL);
  expect(await buttons(row(page, 'Flour'))).not.toContain('Add Supplier Document');
});

test('Mark Applied needs a name and the tick, shows the Export date, and ends the Adjustment', async ({ page }) => {
  await open(page, SMALL);
  const flour = row(page, 'Flour');
  await act(flour, 'Approve', { name: 'Mary' });
  await press(flour, 'Mark Applied');
  await expect(form(flour)).toContainText('Quantities are measured against the Export loaded 2026-10-06');
  await expect(form(flour)).toContainText('a record, not security');

  await form(flour).getByRole('button', { name: 'Mark Applied', exact: true }).click();
  await expect(alertIn(flour)).toHaveText('Type your name.');
  await form(flour).getByLabel('Your name').fill('Joe');
  await form(flour).getByRole('button', { name: 'Mark Applied', exact: true }).click();
  await expect(alertIn(flour)).toHaveText('Tick the box to confirm you checked the current Zobaze balance and intervening movements.');
  await expect(flour.getByTestId('status')).toHaveText('Approved');

  await form(flour).getByLabel(TICK).check();
  await form(flour).getByRole('button', { name: 'Mark Applied', exact: true }).click();
  await expect(flour.getByTestId('status')).toHaveText('Applied');
  await expect(flour.getByTestId('applied-by')).toHaveText(/^Applied by Joe · /);
  await expect(flour.getByTestId('approved-by')).toHaveText(/^Approved by Mary · /);
  expect(await buttons(flour)).toEqual(['History']); // Applied is final: no move, no Supplier Document change
});

test('Revoke approval and Reopen each need a note, and say so when it is missing', async ({ page }) => {
  await open(page, SMALL);
  const flour = row(page, 'Flour');
  await act(flour, 'Approve', { name: 'Mary' });
  await act(flour, 'Revoke approval', { name: 'Mary' });
  await expect(alertIn(flour)).toHaveText('Say why the Approval is being revoked.');
  await form(flour).getByLabel('Note').fill('Wrong Item');
  await form(flour).getByRole('button', { name: 'Revoke approval', exact: true }).click();
  await expect(flour.getByTestId('status')).toHaveText('Pending');
  await expect(flour.getByTestId('approved-by')).toHaveCount(0);

  await act(flour, 'Reject', { name: 'Mary' });
  await expect(flour.getByTestId('status')).toHaveText('Rejected');
  expect(await buttons(flour)).toEqual(['Reopen', 'History']);
  await act(flour, 'Reopen', { name: 'Mary' });
  await expect(alertIn(flour)).toHaveText('Say why it is being reopened.');
  await form(flour).getByLabel('Note').fill('Recount done');
  await form(flour).getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(flour.getByTestId('status')).toHaveText('Pending');
});

test('Put on hold offers Back to Pending, Approve and Reject; its history reads as plain facts', async ({ page }) => {
  await open(page, SMALL);
  const flour = row(page, 'Flour');
  await act(flour, 'Put on hold', { name: 'Mary', note: 'Check the storeroom' });
  await expect(flour.getByTestId('status')).toHaveText('Held');
  expect(await buttons(flour)).toEqual(['Approve', 'Back to Pending', 'Reject', 'History']);
  await act(flour, 'Back to Pending', { name: 'Joe' });
  await press(flour, 'History');
  const lines = await flour.getByTestId('history').locator('li').allInnerTexts();
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatch(/^Put on hold by Mary · \d{4}-\d{2}-\d{2} \d{2}:\d{2} · Check the storeroom$/);
  expect(lines[1]).toMatch(/^Moved back to Pending by Joe · /);
  expect(lines.join(' ')).not.toMatch(/signed|authori[sz]|verified|secure/i);
});

test('a move that is no longer allowed shows its message instead of failing silently', async ({ browser }) => {
  const context = await browser.newContext();
  const a = await context.newPage();
  await a.addInitScript((s) => !localStorage.getItem('stockcheck.session.v1') && localStorage.setItem('stockcheck.session.v1', JSON.stringify(s)), SMALL);
  await a.goto('/');
  await adjust(a);
  const b = await context.newPage();
  await b.goto('/');
  await adjust(b);

  await press(row(b, 'Flour'), 'Approve'); // window B opens the form...
  await form(row(b, 'Flour')).getByLabel('Your name').fill('Joe');
  await act(row(a, 'Flour'), 'Approve', { name: 'Mary' }); // ...window A approves first

  await expect(row(b, 'Flour').getByTestId('status')).toHaveText('Approved'); // B adopted A's change
  await form(row(b, 'Flour')).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(alertIn(row(b, 'Flour'))).toHaveText('A Approved Adjustment cannot become Approved.');
  await context.close();
});

test('applying changes no Count, Variance or Session Report number, and leaves the report as reported', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  for (const [query, name, count] of [['sugar', /Sample Sugar/, '4'], ['oil', /Sample Cooking Oil/, '6']] as const) {
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Find an item' }).fill(query);
    await page.getByRole('button', { name }).click();
    await page.getByLabel('Count').fill(count);
    await page.getByRole('button', { name: 'Done' }).click();
  }
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByLabel('Branch').fill('Main Street');
  await page.getByLabel('Counter').fill('Alex');
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
  await expect(page.getByText('Reported: the latest counts are in your downloaded report.')).toBeVisible();
  const net = await page.getByTestId('net-value').innerText();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('stockcheck.session.v1')!));

  await adjust(page);
  const sugar = row(page, 'Sample Sugar');
  await act(sugar, 'Approve', { name: 'Mary' });
  await act(sugar, 'Mark Applied', { name: 'Joe', tick: true });
  await expect(sugar.getByTestId('status')).toHaveText('Applied');

  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('stockcheck.session.v1')!));
  const { adjustments, adjustmentChanges, ...rest } = after;
  const { adjustments: _a, adjustmentChanges: _c, ...restBefore } = before;
  expect(rest).toEqual(restBefore); // Tallies, Done, Wastage, changes, lastChangeAt, reportedChanges: all untouched
  expect(adjustmentChanges).toBe(2);
  expect(Object.keys(adjustments)).toHaveLength(1);

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByTestId('net-value')).toHaveText(net);
  await expect(page.getByText('Reported: the latest counts are in your downloaded report.')).toBeVisible();
  await page.getByRole('button', { name: 'Variance', exact: true }).click();
  await expect(page.getByTestId('hero-net')).toContainText('−$2.50'); // Sugar −$9.00 and Oil +$6.50, as before
});

test('decisions survive a reload, a backup restore on another phone, and a second window', async ({ page, browser }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await act(row(page, 'Flour'), 'Mark Applied', { name: 'Joe', tick: true });
  await act(row(page, 'Cooking Oil'), 'Add Supplier Document', { name: 'Mary', doc: 'INV-204' });
  await act(row(page, 'Cooking Oil'), 'Approve', { name: 'Mary' });

  await page.reload();
  await adjust(page);
  await expect(row(page, 'Flour').getByTestId('status')).toHaveText('Applied');
  await expect(row(page, 'Cooking Oil').getByTestId('approved-by')).toContainText('Approved by Mary');

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save a backup' }).click()]);
  const other = await browser.newPage(); // another phone: empty storage
  await other.goto('/');
  await other.getByLabel('Restore a backup').setInputFiles((await file.path())!);
  await adjust(other);
  await expect(row(other, 'Flour').getByTestId('applied-by')).toContainText('Applied by Joe');
  await expect(row(other, 'Cooking Oil')).toContainText('Supplier Document: INV-204');
  await expect(row(other, 'Cooking Oil').getByTestId('status')).toHaveText('Approved');
  await other.close();

  const second = await page.context().newPage(); // a second window on the same phone
  await second.goto('/');
  await adjust(second);
  await adjust(page);
  await act(row(page, '#1'), 'Reject', { name: 'Mary' });
  await expect(row(second, '#1').getByTestId('status')).toHaveText('Rejected'); // no reload
});

test('approving and applying work while new Sessions are paused', async ({ page }) => {
  await page.route('**/status.json*', (route: Route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ newSessions: 'disabled', message: 'Paused.' }) }),
  );
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await act(row(page, 'Flour'), 'Mark Applied', { name: 'Joe', tick: true });
  await expect(row(page, 'Flour').getByTestId('status')).toHaveText('Applied');
});

test('How to count says Approved by and Applied by are a record, not security', async ({ page }) => {
  await open(page, SMALL);
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByTestId('about-adjustments')).toContainText('a record, not security');
  await expect(page.getByTestId('about-adjustments')).toContainText('StockCheck never changes Zobaze');
});

for (const width of [360, 320]) {
  test(`rows, buttons and forms fit ${width} px with 44 px tap targets and 16 px fields`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.addInitScript(() => localStorage.setItem('stockcheck.names.v1', JSON.stringify({ branches: [], counters: ['Alex'] })));
    await open(page, seed([
      { key: 'name:a|', name: 'A very long item name that needs to wrap on a narrow phone', variant: '5kg bag', expected: 10_000, cost: 150, count: 9_000 },
      { key: 'name:b|', name: 'Second', expected: 2_000, cost: 300, count: 5_000 },
    ]));
    const check = async (name: string) => {
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('page scrolls sideways');
        for (const el of document.querySelectorAll<HTMLElement>('button, input, select')) {
          if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
          const box = el.getBoundingClientRect();
          if (box.width < 44 || box.height < 44) out.push(`${el.tagName} "${el.getAttribute('aria-label') ?? el.innerText}" ${Math.round(box.width)}×${Math.round(box.height)}`);
          if (el instanceof HTMLInputElement && el.type !== 'checkbox' && parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`input "${el.getAttribute('aria-label')}" under 16px`);
        }
        return out;
      });
      expect(problems, name).toEqual([]);
    };
    await check('rows');
    const a = row(page, 'very long');
    await act(a, 'Approve', { name: 'Mary' });
    await press(a, 'Mark Applied');
    await form(a).getByLabel('Your name').fill('A very long name for the person who applied it here');
    await check('Applied form');
    await form(a).getByRole('button', { name: 'Cancel' }).click();
    await press(row(page, 'Second'), 'Add Supplier Document');
    await form(row(page, 'Second')).getByLabel('Your name').fill('Alex');
    await check('document form');
    await press(row(page, 'very long'), 'History');
    await check('with history');
  });
}
