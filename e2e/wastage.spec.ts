import { expect, test, type Page } from '@playwright/test';

// T20, ADR 0007. tiny.xlsx: Sample Sugar has Expected 10 and a cost of $1.50.
async function doneSugar(page: Page, count: string) {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill(count);
  await page.getByRole('button', { name: 'Done' }).click();
}

async function recordWastage(page: Page, quantity: string, over: { tick?: boolean; register?: string; reason?: string } = {}) {
  await page.getByRole('button', { name: 'Record Wastage' }).click();
  await page.getByLabel('Wastage quantity').fill(quantity);
  await page.getByLabel('Wastage reason').selectOption(over.reason ?? 'Expired');
  await page.getByLabel('Register reference').fill(over.register ?? 'R-12');
  if (over.tick !== false) await page.getByLabel('This is NOT already deducted in Zobaze.').check();
  await page.getByRole('button', { name: 'Save Wastage' }).click();
}

test('Wastage is offered only after Done', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('4');
  await page.getByRole('button', { name: 'Another place' }).click();
  await expect(page.getByRole('button', { name: 'Record Wastage' })).toHaveCount(0);
  await page.getByLabel('Count').fill('2');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Record Wastage' })).toBeVisible();
});

test('Wastage sits beside the Variance and never changes it', async ({ page }) => {
  await doneSugar(page, '4');
  await recordWastage(page, '2');

  const wastage = page.getByTestId('wastage');
  await expect(wastage).toContainText('Variance−6');
  await expect(wastage).toContainText('Wastage2');
  await expect(wastage).toContainText('Unexplained−4');
  await expect(wastage).toContainText('Expired · Register R-12');

  const line = page.getByTestId('line');
  await expect(line).toContainText('Variance −6');
  await expect(line).toContainText('−$9.00');
  await expect(page.getByText('Check every place this item could be stored.')).toBeVisible(); // Look Again is unchanged

  await page.reload();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await expect(page.getByTestId('wastage')).toContainText('Unexplained−4');
});

test('Wastage is not saved without a register reference, a reason or the tick', async ({ page }) => {
  await doneSugar(page, '4');
  await recordWastage(page, '2', { tick: false });
  await expect(page.getByRole('alert')).toHaveText('Tick the box to confirm this is NOT already deducted in Zobaze.');
  await expect(page.getByTestId('wastage')).toHaveCount(0);

  await page.getByLabel('This is NOT already deducted in Zobaze.').check();
  await page.getByLabel('Register reference').fill('');
  await page.getByRole('button', { name: 'Save Wastage' }).click();
  await expect(page.getByRole('alert')).toHaveText('Type the paper-register reference.');

  await page.getByLabel('Register reference').fill('R-1');
  await page.getByLabel('Wastage reason').selectOption('Other');
  await page.getByRole('button', { name: 'Save Wastage' }).click();
  await expect(page.getByRole('alert')).toHaveText('Say what happened, for the reason Other.');

  await page.getByLabel('Wastage note').fill('Dropped in the storeroom');
  await page.getByRole('button', { name: 'Save Wastage' }).click();
  await expect(page.getByTestId('wastage')).toContainText('Other: Dropped in the storeroom · Register R-1');
});

test('Wastage larger than the shortage is flagged, and still saved', async ({ page }) => {
  await doneSugar(page, '4'); // short by 6
  await recordWastage(page, '8');
  const wastage = page.getByTestId('wastage');
  await expect(wastage).toContainText('Wastage is more than the shortage');
  await expect(wastage).toContainText('Unexplained+2');
});

test('Wastage on a surplus or on an Item that matches Expected is flagged', async ({ page }) => {
  await doneSugar(page, '10');
  await recordWastage(page, '1');
  await expect(page.getByTestId('wastage')).toContainText('This Item matches Expected');

  await page.getByRole('button', { name: 'Remove Wastage' }).click();
  await page.getByLabel('Count').fill('2');
  await page.getByRole('button', { name: 'Add', exact: true }).click(); // 10 + 2: a surplus of 2
  await recordWastage(page, '1');
  await expect(page.getByTestId('wastage')).toContainText('This Item has a surplus');
});

test('Wastage can be edited and removed; removing leaves the Variance as it was', async ({ page }) => {
  await doneSugar(page, '4');
  await recordWastage(page, '2');

  await page.getByRole('button', { name: 'Edit Wastage' }).click();
  await expect(page.getByLabel('This is NOT already deducted in Zobaze.')).not.toBeChecked(); // a fresh confirmation
  await page.getByLabel('Wastage quantity').fill('3');
  await page.getByLabel('This is NOT already deducted in Zobaze.').check();
  await page.getByRole('button', { name: 'Save Wastage' }).click();
  await expect(page.getByTestId('wastage')).toContainText('Unexplained−3');

  await page.getByRole('button', { name: 'Remove Wastage' }).click();
  await expect(page.getByTestId('wastage')).toHaveCount(0);
  await expect(page.getByTestId('line')).toContainText('Variance −6');
});

for (const width of [360, 320]) {
  test(`the Wastage form and summary fit ${width} px with 44 px tap targets`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await doneSugar(page, '4');
    await page.getByRole('button', { name: 'Record Wastage' }).click();
    await page.getByLabel('Wastage reason').selectOption('Other');
    await checkFit(page, 'form');
    await page.getByLabel('Wastage quantity').fill('8');
    await page.getByLabel('Register reference').fill('R-12');
    await page.getByLabel('Wastage note').fill('A long note about what happened to this stock');
    await page.getByLabel('This is NOT already deducted in Zobaze.').check();
    await page.getByRole('button', { name: 'Save Wastage' }).click();
    await expect(page.getByTestId('wastage')).toContainText('Wastage is more than the shortage');
    await checkFit(page, 'summary with a flag');
  });
}

async function checkFit(page: Page, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${name}: horizontal scroll`).toBe(0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, input, select')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.height < 44 || box.width < 44)
      .map(({ el, box }) => `${el.tagName} "${el.getAttribute('aria-label') ?? el.textContent?.trim()}" ${Math.round(box.width)}×${Math.round(box.height)}`),
  );
  expect(small, `${name}: tap targets under 44 px`).toEqual([]);
  const tiny = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('input:not([type=checkbox]), select')].filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).length,
  );
  expect(tiny, `${name}: fields under 16 px text`).toBe(0);
}
