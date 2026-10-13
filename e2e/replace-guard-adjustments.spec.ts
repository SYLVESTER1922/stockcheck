import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { act, row } from './helpers/adjustActions';
import { adjust, open, SMALL } from './helpers/adjustSession';

// T26, ADR 0007. The Counts are reported, so only the Adjustments can still be at stake.
// SMALL: Flour 2kg REMOVE 1 and Rice #1 REMOVE 1 (no Supplier Document needed); the ADDs show as Held.
const REPORTED = { ...SMALL, reportedChanges: SMALL.changes };
const BLOCK = 'This Session has Approved Adjustments that are not yet Applied.';
const WARN = 'This Session has Adjustments with decisions recorded.';
const COUNTS = "This Session has counts that aren't in a downloaded report.";

const loadNew = async (page: Page) => {
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('button', { name: 'Load a new Export' }).click();
};
const picker = (page: Page) => page.getByLabel('Zobaze Export');
const guard = (page: Page) => page.getByRole('alert');

test('a Session with nothing recorded is replaced without asking, as before', async ({ page }) => {
  await open(page, REPORTED);
  await loadNew(page);
  await expect(picker(page)).toBeVisible();
  await expect(guard(page)).toHaveCount(0);
});

test('an Approved Adjustment that is not Applied stops a new Export, and discarding takes two taps', async ({ page }) => {
  await open(page, REPORTED);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await loadNew(page);

  await expect(guard(page)).toContainText(BLOCK);
  await expect(page.getByTestId('guard-adjustments')).toHaveText(
    'It has 1 Approved Adjustment that is not yet Applied. Loading a new Export or restoring a backup clears them. Download the Adjustment Report first, or discard them.',
  );
  await expect(picker(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download the Adjustment Report first' })).toBeVisible(); // T27
  await expect(page.getByRole('button', { name: 'Download the report first' })).toHaveCount(0); // the Counts are reported

  await page.getByRole('button', { name: 'Discard this Session' }).click();
  await expect(guard(page)).toContainText('Discard 1 Approved Adjustment that is not yet Applied? This cannot be undone.');
  await expect(picker(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Yes, discard' }).click();
  await expect(picker(page)).toBeVisible();
});

test('Keep working returns to the Session, which is untouched', async ({ page }) => {
  await open(page, REPORTED);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await loadNew(page);
  await page.getByRole('button', { name: 'Keep working' }).click();
  await expect(page.getByLabel('Find an item')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stockcheck.session.v1')!));
  expect(Object.values(saved.adjustments as Record<string, { status: string }>).map((r) => r.status)).toEqual(['Approved']);
});

test('Go to Adjust opens the tab, and once the Adjustment is Applied the guard is gone', async ({ page }) => {
  await open(page, REPORTED);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await loadNew(page);
  await page.getByRole('button', { name: 'Go to Adjust' }).click();
  await expect(row(page, 'Flour')).toBeVisible();
  await act(row(page, 'Flour'), 'Mark Applied', { name: 'Joe', tick: true });
  await loadNew(page);
  await expect(picker(page)).toBeVisible();
});

test('only a Held Adjustment: a plain warning with the same choices', async ({ page }) => {
  await open(page, REPORTED);
  await act(row(page, 'Flour'), 'Put on hold', { name: 'Mary', note: 'Check the storeroom' });
  await loadNew(page);
  await expect(guard(page)).toContainText(WARN);
  await expect(page.getByTestId('guard-adjustments')).toContainText('It has 1 Adjustment on hold.');
  await expect(page.getByRole('button', { name: 'Go to Adjust' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard this Session' }).click();
  await expect(guard(page)).toContainText('Discard 1 Adjustment on hold? This cannot be undone.');
  await page.getByRole('button', { name: 'Yes, discard' }).click();
  await expect(picker(page)).toBeVisible();
});

test('Rejected, and Applied, are not blocked', async ({ page }) => {
  await open(page, REPORTED);
  await act(row(page, 'Flour'), 'Reject', { name: 'Mary' });
  await act(row(page, '#1'), 'Approve', { name: 'Mary' });
  await act(row(page, '#1'), 'Mark Applied', { name: 'Joe', tick: true });
  await loadNew(page);
  await expect(picker(page)).toBeVisible();
  await expect(guard(page)).toHaveCount(0);
});

test('unreported Counts and an Approved Adjustment: both are said, and the Counts text is as before', async ({ page }) => {
  await open(page, SMALL); // the Counts are NOT reported
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await loadNew(page);
  await expect(guard(page)).toContainText(COUNTS);
  await expect(guard(page)).toContainText('Loading a new Export or restoring a backup clears them. Download the report first, or discard them.');
  await expect(page.getByTestId('guard-adjustments')).toHaveText('It also has 1 Approved Adjustment that is not yet Applied. They are cleared too.');
  await expect(page.getByRole('button', { name: 'Download the report first' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to Adjust' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard this Session' }).click();
  await expect(guard(page)).toContainText('Discard 5 counted items and 1 Approved Adjustment that is not yet Applied? This cannot be undone.');
  await expect(page.getByRole('button', { name: 'Keep counting' })).toBeVisible();
});

test('downloading the Session Report does not clear the Adjustments block', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByLabel('Branch').fill('Main Street');
  await page.getByLabel('Counter', { exact: true }).fill('Alex');
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
  await expect(page.getByText('Reported: the latest counts are in your downloaded report.')).toBeVisible();
  await loadNew(page);
  await expect(guard(page)).toContainText(BLOCK); // the Counts are reported; the Adjustments are not
  await expect(guard(page)).not.toContainText(COUNTS);
});

test('restoring a backup takes the same path', async ({ page }) => {
  const backup = join(tmpdir(), 'stockcheck-backup-guard-test.json');
  writeFileSync(backup, JSON.stringify({ app: 'stockcheck', format: 2, savedAt: '2026-10-06T07:00:00.000Z', session: { ...REPORTED, exportFileName: 'restored-export.xlsx' } }));
  await open(page, REPORTED);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByLabel('Restore a backup').setInputFiles(backup);
  await expect(guard(page)).toContainText(BLOCK);
  await page.getByRole('button', { name: 'Discard this Session' }).click();
  await page.getByRole('button', { name: 'Yes, discard' }).click();
  await adjust(page);
  await expect(page.getByTestId('export-date')).toContainText('restored-export.xlsx');
  await expect(row(page, 'Flour').getByTestId('status')).toHaveText('Pending'); // the backup's own Session
});

test('a stale window cannot replace a Session that has an Approved Adjustment', async ({ context }) => {
  const stale = await context.newPage(); // opened first, and never told about the change
  await stale.addInitScript(() => window.addEventListener('storage', (e) => e.stopImmediatePropagation(), true));
  await stale.goto('/');
  await expect(picker(stale)).toBeVisible();

  const working = await context.newPage();
  await open(working, REPORTED);
  await act(row(working, 'Flour'), 'Approve', { name: 'Mary' });

  await picker(stale).setInputFiles('test/fixtures/tiny.xlsx');
  await expect(guard(stale)).toContainText(BLOCK);

  await working.reload();
  await adjust(working);
  await expect(row(working, 'Flour').getByTestId('status')).toHaveText('Approved'); // still intact
});

test('while new Sessions are paused, discarding still works and restoring stays allowed', async ({ page }) => {
  await page.route('**/status.json*', (route: Route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ newSessions: 'disabled', message: 'Paused.' }) }),
  );
  await open(page, REPORTED);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await loadNew(page);
  await expect(guard(page)).toContainText(BLOCK); // the guard comes first, even while paused
  await page.getByRole('button', { name: 'Discard this Session' }).click();
  await page.getByRole('button', { name: 'Yes, discard' }).click();
  await expect(page.getByTestId('suspended')).toContainText('Paused.');
  await expect(page.getByLabel('Restore a backup')).toBeVisible();
});

test('the wording is factual: nothing blames anyone or talks about security', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await act(row(page, '#1'), 'Put on hold', { name: 'Mary' });
  await loadNew(page);
  const text = await guard(page).innerText();
  expect(text).not.toMatch(/fraud|suspicious|tamper|theft|secure|authori[sz]|verified|careless|mistake/i);
  expect(text).toContain('1 Approved Adjustment that is not yet Applied, and 1 on hold');
});

for (const width of [360, 320]) {
  test(`the guard fits ${width} px with 44 px tap targets, in every wording`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await open(page, SMALL);
    await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
    await act(row(page, '#1'), 'Put on hold', { name: 'Mary' });
    const check = async (name: string) => {
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('page scrolls sideways');
        for (const el of document.querySelectorAll<HTMLElement>('[role="alert"] button')) {
          const box = el.getBoundingClientRect();
          if (box.width < 44 || box.height < 44) out.push(`"${el.innerText}" ${Math.round(box.width)}×${Math.round(box.height)}`);
          if (box.right > window.innerWidth) out.push(`"${el.innerText}" off screen`);
        }
        return out;
      });
      expect(problems, name).toEqual([]);
    };
    await loadNew(page);
    await expect(guard(page)).toBeVisible();
    await check('Counts and Adjustments');
    await page.getByRole('button', { name: 'Discard this Session' }).click();
    await check('confirm');
    await page.getByRole('button', { name: 'Keep counting' }).click();

    // Adjustments only: report the Counts first
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await page.getByLabel('Branch').fill('Main Street');
    await page.getByLabel('Counter', { exact: true }).fill('Alex');
    await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
    await loadNew(page);
    await expect(guard(page)).toContainText(BLOCK);
    await check('Adjustments only');
  });
}
