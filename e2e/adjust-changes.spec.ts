import { expect, test } from '@playwright/test';
import { act, alertIn, buttons, editCount, form, press, row } from './helpers/adjustActions';
import { adjust, open, SMALL } from './helpers/adjustSession';

// T25, ADR 0007. SMALL: Flour 2kg Expected 7, Count 6 (REMOVE 1, $3.00 each); Rice #1 REMOVE 1; the ADDs are Held.
const FLOUR = /Flour/;
const REVIEW = 'Count changed after Applied: review';
const history = async (r: ReturnType<typeof row>) => {
  await press(r, 'History');
  return r.getByTestId('history').locator('li').allInnerTexts();
};
const appliedFlour = async (page: Parameters<typeof open>[0]) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await act(row(page, 'Flour'), 'Mark Applied', { name: 'Joe', tick: true });
};

test('after Approval, a Count change cancels it, says why, and keeps the Approval in the history', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await editCount(page, 'flour', FLOUR, { to: '5' });
  await adjust(page);

  const flour = row(page, 'Flour');
  await expect(flour.getByTestId('status')).toHaveText('Pending');
  await expect(flour.getByTestId('count-changed')).toHaveText(
    'The Count changed from 6 to 5 after it was approved, so the Approval was cancelled. It needs approving again.',
  );
  await expect(flour.getByTestId('approved-by')).toHaveCount(0);
  await expect(flour.getByTestId('action')).toContainText('REMOVE −2'); // the quantity follows the new Count: 5 against 7
  expect(await buttons(flour)).toEqual(['Approve', 'Reject', 'Put on hold', 'History']);
  const lines = await history(flour);
  expect(lines[0]).toMatch(/^Approved by Mary · /);
  expect(lines[1]).toMatch(/^Count changed from 6 to 5, so the Approval was cancelled · \d{4}-/);
});

test('a Count that turns it into an ADD shows it as Held until it has a Supplier Document', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await editCount(page, 'flour', FLOUR, { to: '8' }); // 8 against 7: ADD 1
  await adjust(page);
  const flour = row(page, 'Flour');
  await expect(flour.getByTestId('action')).toContainText('ADD +1');
  await expect(flour.getByTestId('status')).toHaveText('Held');
  await expect(flour.getByTestId('count-changed')).toBeVisible();
  expect(await buttons(flour)).toEqual(['Add Supplier Document', 'Reject', 'Put on hold', 'History']);
});

test('editing the Tally back restores nothing: it stays Pending until approved again', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await editCount(page, 'flour', FLOUR, { to: '8' });
  await editCount(page, 'flour', FLOUR, { to: '6' });
  await adjust(page);
  await expect(row(page, 'Flour').getByTestId('status')).toHaveText('Pending');
  await expect(row(page, 'Flour').getByTestId('approved-by')).toHaveCount(0);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await expect(row(page, 'Flour').getByTestId('status')).toHaveText('Approved');
});

test('after Applied, a Count change leaves the Applied row as it was and flags it for review', async ({ page }) => {
  await appliedFlour(page);
  await editCount(page, 'flour', FLOUR, { to: '8' });
  await adjust(page);

  const flour = row(page, 'Flour');
  await expect(flour.getByTestId('status')).toHaveText('Applied');
  await expect(flour.getByTestId('action')).toContainText('REMOVE −1'); // as applied
  await expect(flour.getByTestId('applied-by')).toContainText('Applied by Joe');
  await expect(flour.getByTestId('review-flag')).toContainText(REVIEW);
  await expect(flour.getByTestId('review-flag')).toContainText('It was applied with a Count of 6. The Count is now 8.');
  await expect(page.getByTestId('needs-review')).toHaveText('1 Applied Adjustment needs a review: the count changed after it was applied.');
  await expect(page.getByTestId('adjustment-row').first()).toContainText(REVIEW); // listed first, not buried
  expect(await buttons(flour)).toEqual(['Acknowledge, no action needed', 'Raise a correcting Adjustment', 'History']);
});

test('an Applied row stays in the list when the Variance becomes zero, still flagged', async ({ page }) => {
  await appliedFlour(page);
  await editCount(page, 'flour', FLOUR, { to: '7' }); // Count = Expected: nothing left to adjust
  await adjust(page);
  const flour = row(page, 'Flour');
  await expect(flour).toHaveCount(1);
  await expect(flour.getByTestId('status')).toHaveText('Applied');
  await expect(flour.getByTestId('review-flag')).toContainText('The Count is now 7.');
  await expect(page.getByTestId('matching')).toContainText('matches Expected');
  await page.getByLabel('Find an adjustment').fill('flour');
  await expect(row(page, 'Flour')).toHaveCount(1);
  await page.getByRole('button', { name: /^Applied/ }).click();
  await expect(row(page, 'Flour')).toHaveCount(1);
});

test('an Applied row stays when the count is removed, flagged, and cannot be corrected yet', async ({ page }) => {
  await appliedFlour(page);
  await editCount(page, 'flour', FLOUR, { remove: true });
  await adjust(page);
  const flour = row(page, 'Flour');
  await expect(flour.getByTestId('status')).toHaveText('Applied');
  await expect(flour.getByTestId('review-flag')).toContainText('Count removed after Applied: review');
  await expect(flour.getByTestId('review-flag')).toContainText('The Item has no Count now.');
  expect(await buttons(flour)).toEqual(['Acknowledge, no action needed', 'History']);
});

test('Acknowledge needs a name and a note, says so, then clears the flag and is logged', async ({ page }) => {
  await appliedFlour(page);
  await editCount(page, 'flour', FLOUR, { to: '8' });
  await adjust(page);
  const flour = row(page, 'Flour');

  await act(flour, 'Acknowledge, no action needed', { name: '' });
  await expect(alertIn(flour)).toHaveText('Type your name.');
  await form(flour).getByLabel('Your name').fill('Mary');
  await form(flour).getByRole('button', { name: 'Acknowledge, no action needed' }).click();
  await expect(alertIn(flour)).toHaveText('Type a note: what was checked, and what was decided.');
  await expect(flour.getByTestId('review-flag')).toBeVisible();

  await form(flour).getByLabel('Note').fill('Recount agreed');
  await form(flour).getByRole('button', { name: 'Acknowledge, no action needed' }).click();
  await expect(flour.getByTestId('review-flag')).toHaveCount(0);
  await expect(page.getByTestId('needs-review')).toHaveCount(0);
  await expect(page.getByTestId('notice')).toHaveText('Flour 2kg: Acknowledged.');
  await expect(flour.getByTestId('status')).toHaveText('Applied');
  const lines = await history(flour);
  expect(lines.at(-1)).toMatch(/^Acknowledged by Mary, no action needed · \d{4}-\d{2}-\d{2} \d{2}:\d{2} · Recount agreed$/);
  expect(await buttons(flour)).toEqual(['History']);
});

test('the flag comes back if the Count changes again after an Acknowledge', async ({ page }) => {
  await appliedFlour(page);
  await editCount(page, 'flour', FLOUR, { to: '8' });
  await adjust(page);
  await act(row(page, 'Flour'), 'Acknowledge, no action needed', { name: 'Mary', note: 'seen' });
  await editCount(page, 'flour', FLOUR, { to: '9' });
  await adjust(page);
  await expect(row(page, 'Flour').getByTestId('review-flag')).toContainText('The Count is now 9.');
});

test('Raise a correcting Adjustment: a new, linked Adjustment that goes through the same statuses', async ({ page }) => {
  await appliedFlour(page);
  await editCount(page, 'flour', FLOUR, { to: '8' }); // total +1; applied −1; the difference is ADD 2
  await adjust(page);
  let flour = row(page, 'Flour').first();

  await press(flour, 'Raise a correcting Adjustment');
  await expect(form(flour).getByTestId('correction-preview')).toContainText('ADD +2');
  await form(flour).getByLabel('Your name').fill('Mary');
  await form(flour).getByRole('button', { name: 'Raise a correcting Adjustment' }).click();
  await expect(alertIn(flour)).toHaveText('Type a note: what was checked, and what was decided.');
  await form(flour).getByLabel('Note').fill('Two more found');
  await form(flour).getByRole('button', { name: 'Raise a correcting Adjustment' }).click();
  await expect(page.getByTestId('notice')).toHaveText('Flour 2kg: Correcting Adjustment raised.');

  await expect(row(page, 'Flour')).toHaveCount(2); // the Applied one, and the new one
  const applied = page.getByTestId('adjustment-row').filter({ has: page.getByTestId('corrected-by') });
  const correcting = page.getByTestId('adjustment-row').filter({ has: page.getByTestId('corrects') });
  await expect(applied.getByTestId('status')).toHaveText('Applied');
  await expect(applied.getByTestId('review-flag')).toHaveCount(0);
  await expect(applied.getByTestId('corrected-by')).toHaveText('A correcting Adjustment was raised: ADD +2 (Held).');
  await expect(applied.getByTestId('action')).toContainText('REMOVE −1'); // untouched
  await expect(correcting.getByTestId('corrects')).toContainText('Corrects the Adjustment applied by Joe');
  await expect(correcting.getByTestId('corrects')).toContainText('REMOVE −1');
  await expect(correcting.getByTestId('action')).toContainText('ADD +2');
  await expect(correcting.getByTestId('status')).toHaveText('Held'); // an ADD: needs a Supplier Document
  expect(await buttons(correcting)).toEqual(['Add Supplier Document', 'Reject', 'Put on hold', 'History']);

  // the same statuses, the same Supplier Document rule and the same Applied Check
  await act(correcting, 'Add Supplier Document', { name: 'Mary', doc: 'INV-77' });
  await act(correcting, 'Approve', { name: 'Mary' });
  await press(correcting, 'Mark Applied');
  await form(correcting).getByLabel('Your name').fill('Joe');
  await form(correcting).getByRole('button', { name: 'Mark Applied', exact: true }).click();
  await expect(alertIn(correcting)).toContainText('Tick the box');
  await form(correcting).getByLabel('I checked the current Zobaze balance and intervening movements.').check();
  await form(correcting).getByRole('button', { name: 'Mark Applied', exact: true }).click();
  await expect(correcting.getByTestId('status')).toHaveText('Applied');
  await expect(page.getByTestId('needs-review')).toHaveCount(0); // everything applied now matches the Count
  flour = row(page, 'Flour').first();
  await expect(page.getByTestId('adjustment-row').filter({ has: page.getByTestId('review-flag') })).toHaveCount(0);
});

test('a count removed after Approval leaves its history, and the old Approval does not come back', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await editCount(page, 'flour', FLOUR, { remove: true });
  await adjust(page);
  const flour = row(page, 'Flour');
  await expect(flour.getByTestId('gone')).toHaveText('Count removed. This is the history of an Approval; nothing can be done with it.');
  await expect(flour.getByTestId('action')).toContainText('REMOVE −1'); // what was approved, with its snapshot
  expect(await buttons(flour)).toEqual(['History']);
  const lines = await history(flour);
  expect(lines[0]).toMatch(/^Approved by Mary/);
  expect(lines[1]).toMatch(/^Count removed, so the Approval was cancelled/);

  // counted again: a fresh Adjustment, Pending, never approved by itself
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('flour');
  await page.getByRole('button', { name: FLOUR }).click();
  await page.getByLabel('Count').fill('5');
  await page.getByRole('button', { name: 'Done' }).click();
  await adjust(page);
  await expect(row(page, 'Flour').getByTestId('status')).toHaveText('Pending');
  await expect(row(page, 'Flour').getByTestId('gone')).toHaveCount(0);
  await expect(row(page, 'Flour').getByTestId('approved-by')).toHaveCount(0);
});

test('a Pending or Held Adjustment is dropped when its count is removed', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, '#1'), 'Put on hold', { name: 'Mary' });
  await expect(row(page, '#1').getByTestId('status')).toHaveText('Held');
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('rice');
  await page.getByRole('button', { name: /Rice #1/ }).click();
  await page.getByTestId('item-panel').getByRole('button', { name: /^Remove / }).first().click();
  await adjust(page);
  await expect(row(page, '#1')).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stockcheck.session.v1')!));
  expect(Object.keys(saved.adjustments)).toEqual([]);
});

test('flags, history and corrections survive a reload, a restore on another phone, and a second window', async ({ page, browser }) => {
  await appliedFlour(page);
  await editCount(page, 'flour', FLOUR, { to: '8' });
  await adjust(page);
  await page.reload();
  await adjust(page);
  await expect(row(page, 'Flour').getByTestId('review-flag')).toContainText(REVIEW);

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save a backup' }).click()]);
  const other = await browser.newPage();
  await other.goto('/');
  await other.getByLabel('Restore a backup').setInputFiles((await file.path())!);
  await adjust(other);
  await expect(row(other, 'Flour').getByTestId('review-flag')).toContainText(REVIEW);
  await other.close();

  const second = await page.context().newPage();
  await second.goto('/');
  await adjust(second);
  await adjust(page);
  await act(row(page, 'Flour'), 'Acknowledge, no action needed', { name: 'Mary', note: 'seen' });
  await expect(row(second, 'Flour').getByTestId('review-flag')).toHaveCount(0); // no reload
});

test('nothing in the review wording blames anyone or talks about security', async ({ page }) => {
  await appliedFlour(page);
  await editCount(page, 'flour', FLOUR, { to: '8' });
  await adjust(page);
  const text = await page.getByTestId('adjustment-row').first().innerText();
  expect(text).not.toMatch(/fraud|suspicious|tamper|theft|stole|secure|authori[sz]|verified/i);
});

for (const width of [360, 320]) {
  test(`the review flag, its forms and the history fit ${width} px with 44 px tap targets and 16 px fields`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await appliedFlour(page);
    await editCount(page, 'flour', FLOUR, { to: '8' });
    await adjust(page);
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
    await check('flagged row');
    const flour = row(page, 'Flour');
    await press(flour, 'Raise a correcting Adjustment');
    await form(flour).getByLabel('Your name').fill('A very long name for the person reviewing this one');
    await check('correcting form');
    await form(flour).getByRole('button', { name: 'Cancel' }).click();
    await press(flour, 'Acknowledge, no action needed');
    await check('acknowledge form');
    await form(flour).getByRole('button', { name: 'Cancel' }).click();
    await press(flour, 'History');
    await check('with history');
  });
}
