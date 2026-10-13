import { expect, test, type Page } from '@playwright/test';
import { act, form, press, row } from './helpers/adjustActions';
import { adjust, SMALL } from './helpers/adjustSession';

// T28: a pass over every screen and form added for Wastage and Adjustments, at 360 px and 320 px.
// Problems are collected across the whole walk and reported together, so one run finds them all.
const SESSION = {
  ...SMALL,
  counter: 'Alex Moyo',
  reportedChanges: SMALL.changes,
  wastage: {
    'name:flour|2kg': { quantity: 2_000, reason: 'Expired', note: '', register: 'R-1', notDeductedConfirmed: true, at: '2026-10-06T06:50:00.000Z' },
    'sku:O1': { quantity: 9_000, reason: 'Other', note: 'Dropped on the loading dock', register: 'R-2', notDeductedConfirmed: true, at: '2026-10-06T06:50:00.000Z' },
  },
};

async function problemsOn(page: Page, where: string): Promise<string[]> {
  return (await page.evaluate((where) => {
    const out: string[] = [];
    const width = window.innerWidth;
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push(`${where}: the page scrolls sideways`);
    const describe = (el: Element) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? (el as HTMLElement).innerText ?? '').trim().slice(0, 40)}"`;
    for (const el of document.querySelectorAll<HTMLElement>('button, input, select, summary, a[href]')) {
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      const box = el.getBoundingClientRect();
      if (box.width < 44 || box.height < 44) out.push(`${where}: ${describe(el)} is ${Math.round(box.width)}×${Math.round(box.height)}, under 44 px`);
      if ((el instanceof HTMLInputElement && !['checkbox', 'radio', 'file'].includes(el.type)) || el instanceof HTMLSelectElement) {
        if (parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`${where}: ${describe(el)} has text under 16 px`);
      }
    }
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      if (el.closest('datalist, option, script, style')) continue;
      const box = el.getBoundingClientRect();
      if (box.width > 0 && (box.right > width + 1 || box.left < -1)) out.push(`${where}: ${describe(el)} runs off the screen`);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth > 0 && ['P', 'SPAN', 'LI', 'DD', 'DT', 'H1', 'H2', 'H3', 'BUTTON', 'LABEL', 'SUMMARY'].includes(el.tagName)) {
        out.push(`${where}: ${describe(el)} has text wider than its box`);
      }
    }
    return out;
  }, where)) as string[];
}

for (const width of [360, 320]) {
  test(`every Wastage and Adjustment screen fits ${width} px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 720 });
    const problems: string[] = [];
    const check = async (where: string) => problems.push(...(await problemsOn(page, `${width}px ${where}`)));

    await page.addInitScript((s) => !localStorage.getItem('stockcheck.session.v1') && localStorage.setItem('stockcheck.session.v1', JSON.stringify(s)), SESSION);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'StockCheck' })).toBeVisible();
    await check('Home with a Session');

    // Count: Done Item with Wastage, its form, an Approved hint, an Applied hint
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Find an item' }).fill('flour');
    await page.getByRole('button', { name: /Flour/ }).click();
    await expect(page.getByTestId('wastage')).toBeVisible();
    await check('Count: Item with Wastage');
    await page.getByRole('button', { name: 'Edit Wastage' }).click();
    await page.getByLabel('Wastage reason').selectOption('Other');
    await check('Count: Wastage form');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Variance
    await page.getByRole('button', { name: 'Variance', exact: true }).click();
    await expect(page.getByTestId('wastage-card')).toBeVisible();
    await check('Variance with Wastage');

    // Adjust: list, totals, card, every form
    await adjust(page);
    await expect(page.getByTestId('adjust-totals')).toBeVisible();
    await check('Adjust: list and totals');
    await page.getByTestId('report-card').locator('summary').click();
    await page.getByTestId('report-card').getByLabel('Branch').fill('A branch with a rather long name indeed');
    await check('Adjust: Adjustment Report card');
    await page.getByTestId('report-card').locator('summary').click();

    const flour = row(page, 'Flour');
    await press(flour, 'Approve');
    await form(flour).getByLabel('Your name').fill('A person with a rather long name here');
    await check('Adjust: Approve form (Counter asked)');
    await form(flour).getByRole('button', { name: 'Cancel' }).click();
    await act(flour, 'Approve', { name: 'Mary' });
    await check('Adjust: Approved row');
    await press(flour, 'Mark Applied');
    await check('Adjust: Applied form');
    await form(flour).getByRole('button', { name: 'Cancel' }).click();
    await act(flour, 'Mark Applied', { name: 'Joe', tick: true });
    await press(flour, 'History');
    await check('Adjust: Applied row with History');

    const oil = row(page, 'Cooking Oil');
    await press(oil, 'Add Supplier Document');
    await check('Adjust: Supplier Document form');
    await form(oil).getByRole('button', { name: 'Cancel' }).click();

    // a Count change after Applied: the Count tab hint, then the review flag and its forms
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Find an item' }).fill('flour');
    await page.getByRole('button', { name: /Flour/ }).click();
    await expect(page.getByTestId('applied-hint')).toBeVisible();
    await check('Count: Applied hint');
    const panel = page.getByTestId('item-panel');
    await panel.getByRole('button', { name: /^Edit \d/ }).first().click();
    await panel.getByLabel('Edit Tally').fill('8');
    await panel.getByRole('button', { name: 'Save' }).click();
    await adjust(page);
    await expect(row(page, 'Flour').getByTestId('review-flag')).toBeVisible();
    await check('Adjust: review flag');
    await press(row(page, 'Flour'), 'Raise a correcting Adjustment');
    await check('Adjust: correcting form');
    await form(row(page, 'Flour')).getByRole('button', { name: 'Cancel' }).click();
    await press(row(page, 'Flour'), 'Acknowledge, no action needed');
    await check('Adjust: Acknowledge form');
    await form(row(page, 'Flour')).getByRole('button', { name: 'Cancel' }).click();

    // Report, Help, and the replace-guard
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await check('Report');
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await expect(page.getByTestId('about-adjustments')).toBeVisible();
    await check('Help');
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    await page.getByRole('button', { name: 'Load a new Export' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await check('Replace-guard');

    expect(problems).toEqual([]);
  });
}
