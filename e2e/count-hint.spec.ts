import { expect, test, type Page } from '@playwright/test';
import { act, row } from './helpers/adjustActions';
import { open, SMALL } from './helpers/adjustSession';

// The Count tab says when changing a Count would cancel an Approval (ADR 0007). SMALL: Flour 2kg Expected 7, Count 6.
const HINT = 'This Item has an Approved Adjustment. Changing the Count cancels the Approval, and it will need approving again.';

async function openItem(page: Page, query: string, name: RegExp) {
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill(query);
  await page.getByRole('button', { name }).click();
}
const hint = (page: Page) => page.getByTestId('approved-hint');

test('shows for an Item with an Approved Adjustment, and only then', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });

  await openItem(page, 'flour', /Flour/);
  await expect(hint(page)).toHaveText(HINT);

  await openItem(page, 'rice', /Rice #1/); // Pending
  await expect(hint(page)).toHaveCount(0);
});

test('is gone once the Count has changed, and the Approval with it', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await openItem(page, 'flour', /Flour/);
  await expect(hint(page)).toBeVisible();
  const panel = page.getByTestId('item-panel');
  await panel.getByRole('button', { name: /^Edit \d/ }).first().click();
  await panel.getByLabel('Edit Tally').fill('5');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(hint(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Adjust', exact: true }).click();
  await expect(row(page, 'Flour').getByTestId('status')).toHaveText('Pending');
});

test('is not shown for a Held or an Applied Adjustment (Pending, Rejected and the rest are covered in the unit tests)', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await act(row(page, 'Flour'), 'Mark Applied', { name: 'Joe', tick: true });
  await act(row(page, '#1'), 'Put on hold', { name: 'Mary' });
  await openItem(page, 'flour', /Flour/);
  await expect(hint(page)).toHaveCount(0); // Applied: the change is flagged for review instead
  await openItem(page, 'rice', /Rice #1/);
  await expect(hint(page)).toHaveCount(0); // Held
});

for (const width of [360, 320]) {
  test(`the hint fits ${width} px, with no sideways scroll and the Item panel still usable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await open(page, SMALL);
    await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
    await openItem(page, 'flour', /Flour/);
    await expect(hint(page)).toBeVisible();
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('page scrolls sideways');
      const box = document.querySelector('[data-testid="approved-hint"]')!.getBoundingClientRect();
      if (box.left < 0 || box.right > window.innerWidth) out.push('hint is off screen');
      for (const el of document.querySelectorAll<HTMLElement>('[data-testid="item-panel"] button, [data-testid="item-panel"] input')) {
        if (el.offsetParent === null) continue;
        const b = el.getBoundingClientRect();
        if (b.width < 44 || b.height < 44) out.push(`${el.getAttribute('aria-label') ?? el.innerText} ${Math.round(b.width)}×${Math.round(b.height)}`);
        if (el instanceof HTMLInputElement && parseFloat(getComputedStyle(el).fontSize) < 16) out.push('input under 16px');
      }
      return out;
    });
    expect(problems).toEqual([]);
  });
}

// ---- the Applied hint ----
const APPLIED_HINT = 'This Item has an Applied Adjustment. Changing the Count will flag it for review.';
const appliedHint = (page: Page) => page.getByTestId('applied-hint');

test('shows for an Item with an Applied Adjustment, and not the Approved one', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await act(row(page, 'Flour'), 'Mark Applied', { name: 'Joe', tick: true });
  await openItem(page, 'flour', /Flour/);
  await expect(appliedHint(page)).toHaveText(APPLIED_HINT);
  await expect(hint(page)).toHaveCount(0);

  await openItem(page, 'rice', /Rice #1/); // nothing recorded
  await expect(appliedHint(page)).toHaveCount(0);
});

test('the Approved hint turns into the Applied hint when it is Applied', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await openItem(page, 'flour', /Flour/);
  await expect(hint(page)).toBeVisible();
  await expect(appliedHint(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Adjust', exact: true }).click();
  await act(row(page, 'Flour'), 'Mark Applied', { name: 'Joe', tick: true });
  await openItem(page, 'flour', /Flour/);
  await expect(appliedHint(page)).toBeVisible();
  await expect(hint(page)).toHaveCount(0);
});

test('is gone once the Count has changed, and the Adjust tab shows the review flag instead', async ({ page }) => {
  await open(page, SMALL);
  await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
  await act(row(page, 'Flour'), 'Mark Applied', { name: 'Joe', tick: true });
  await openItem(page, 'flour', /Flour/);
  const panel = page.getByTestId('item-panel');
  await panel.getByRole('button', { name: /^Edit \d/ }).first().click();
  await panel.getByLabel('Edit Tally').fill('5');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(appliedHint(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Adjust', exact: true }).click();
  await expect(row(page, 'Flour').getByTestId('review-flag')).toBeVisible();
});

for (const width of [360, 320]) {
  test(`the Applied hint fits ${width} px, with no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await open(page, SMALL);
    await act(row(page, 'Flour'), 'Approve', { name: 'Mary' });
    await act(row(page, 'Flour'), 'Mark Applied', { name: 'Joe', tick: true });
    await openItem(page, 'flour', /Flour/);
    await expect(appliedHint(page)).toBeVisible();
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('page scrolls sideways');
      const box = document.querySelector('[data-testid="applied-hint"]')!.getBoundingClientRect();
      if (box.left < 0 || box.right > window.innerWidth) out.push('hint is off screen');
      for (const el of document.querySelectorAll<HTMLElement>('[data-testid="item-panel"] button, [data-testid="item-panel"] input')) {
        if (el.offsetParent === null) continue;
        const b = el.getBoundingClientRect();
        if (b.width < 44 || b.height < 44) out.push(`${el.getAttribute('aria-label') ?? el.innerText} ${Math.round(b.width)}×${Math.round(b.height)}`);
        if (el instanceof HTMLInputElement && parseFloat(getComputedStyle(el).fontSize) < 16) out.push('input under 16px');
      }
      return out;
    });
    expect(problems).toEqual([]);
  });
}
