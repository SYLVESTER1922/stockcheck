import { type Locator, type Page } from '@playwright/test';

// Shared by the Adjust tab specs (T24, T25).
export const row = (page: Page, text: string) => page.getByTestId('adjustment-row').filter({ hasText: text });
export const buttons = (r: Locator) => r.getByRole('button').evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText.trim()));
export const form = (r: Locator) => r.getByTestId('action-form');
export const press = (r: Locator, name: string) => r.getByRole('button', { name, exact: true }).click();
export const alertIn = (r: Locator) => r.getByRole('alert');
export const TICK = 'I checked the current Zobaze balance and intervening movements.';

export async function act(r: Locator, label: string, fields: { name?: string; note?: string; doc?: string; tick?: boolean } = {}) {
  await press(r, label);
  const f = form(r);
  if (fields.doc !== undefined) await f.getByLabel('Supplier Document (invoice or delivery note number)').fill(fields.doc);
  if (fields.name !== undefined) await f.getByLabel('Your name').fill(fields.name);
  if (fields.note !== undefined) await f.getByLabel('Note').fill(fields.note);
  if (fields.tick) await f.getByLabel(TICK).check();
  await f.getByRole('button', { name: label, exact: true }).click();
}


/** Changes what is on the Count tab for one Item: edit its first Tally, or remove it. */
export async function editCount(page: Page, query: string, name: RegExp, change: { to: string } | { remove: true }) {
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill(query);
  await page.getByRole('button', { name }).click();
  const panel = page.getByTestId('item-panel');
  if ('remove' in change) {
    await panel.getByRole('button', { name: /^Remove / }).first().click();
  } else {
    await panel.getByRole('button', { name: /^Edit \d/ }).first().click();
    await panel.getByLabel('Edit Tally').fill(change.to);
    await panel.getByRole('button', { name: 'Save' }).click();
  }
}
