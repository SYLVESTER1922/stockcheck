import { expect, test, type Page } from '@playwright/test';

// T12: every screen fits a 320 px phone, and everything tappable is at least 44×44 px.
test.use({ viewport: { width: 320, height: 640 } });

async function checkScreen(page: Page, name: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name}: horizontal scroll`).toBe(0);

  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, input, select, a[href]')]
      .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.height < 44 || box.width < 44)
      .map(({ el, box }) => `${el.tagName} "${el.getAttribute('aria-label') ?? el.textContent?.trim()}" ${Math.round(box.width)}×${Math.round(box.height)}`),
  );
  expect(small, `${name}: tap targets under 44 px`).toEqual([]);

  const tinyText = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('input:not([type=file])')]
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.getAttribute('aria-label') ?? el.name),
  );
  expect(tinyText, `${name}: inputs under 16 px text`).toEqual([]);
}

test('every screen fits 320 px with large enough tap targets and input text', async ({ page }) => {
  await page.goto('/');
  await checkScreen(page, 'start');

  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await checkScreen(page, 'loaded');

  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('4');
  await page.getByRole('button', { name: 'Another place' }).click();
  await checkScreen(page, 'in progress');

  await page.getByLabel('Count').fill('2');
  await page.getByRole('button', { name: 'Done' }).click();
  await checkScreen(page, 'done with Look Again');

  await page.getByRole('button', { name: 'Edit 4' }).click();
  await checkScreen(page, 'editing a Tally');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await checkScreen(page, 'report');

  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('button', { name: 'Load a new Export' }).click();
  await checkScreen(page, 'guard');
  await page.getByRole('button', { name: 'Discard this Session' }).click();
  await checkScreen(page, 'guard confirm');
  await page.getByRole('button', { name: 'Keep counting' }).click();

  await page.getByRole('button', { name: 'How to count' }).click();
  await checkScreen(page, 'how to count');
});
