import { expect, test } from '@playwright/test';

test('How to count is reachable before any Export is loaded', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to count' }).click();
  await expect(page.getByRole('heading', { name: 'How to count' })).toBeVisible();
  await expect(page.getByText('Required:')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(10);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Zobaze Export')).toBeVisible();
});
