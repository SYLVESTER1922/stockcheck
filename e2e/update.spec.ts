import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { serve } from './helpers/static-server';

// Two real builds, A and B, served from one origin. Swapping the folder is a deploy.
// Each Playwright worker gets its own port (so its own origin and service worker).
let PORT = 4174;
const builds = { A: '', B: '' };
let current: 'A' | 'B' = 'A';
let server: Server;

test.beforeAll(() => {
  for (const version of ['A', 'B'] as const) {
    builds[version] = mkdtempSync(join(tmpdir(), `stockcheck-${version}-`));
    execSync(`npx vite build --outDir ${builds[version]} --emptyOutDir`, {
      env: { ...process.env, STOCKCHECK_VERSION: `test-${version}` },
      stdio: 'ignore',
    });
  }
});
test.beforeEach(async ({}, testInfo) => {
  PORT = 4174 + testInfo.workerIndex;
  current = 'A';
  server = await serve(() => builds[current], PORT);
});
test.afterEach(() => new Promise<void>((done) => server.close(() => done())));
test.setTimeout(60_000);

test('a new deploy shows an update banner, never reloads by itself, and keeps the counts', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await expect(page.getByText('Version test-A')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);

  await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await page.getByRole('button', { name: /Sample Sugar/ }).click();
  await page.getByLabel('Count').fill('9');
  await page.getByRole('button', { name: 'Done' }).click();

  current = 'B'; // deploy
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());

  await expect(page.getByText('A new version of StockCheck is ready. Your counts are kept.')).toBeVisible();
  await expect(page.getByText('Version test-A')).toBeVisible(); // still running A: no surprise reload

  await page.getByRole('button', { name: 'Update now' }).click();
  await expect(page.getByText('Version test-B')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
  await expect(page.getByRole('button', { name: /Sample Sugar.*✓ 9/ })).toBeVisible();
});

test('Update now also works when the page was already controlled by the old version', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  current = 'B';
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await page.getByRole('button', { name: 'Update now' }).click();
  await expect(page.getByText('Version test-B')).toBeVisible();
});

test('opening the app again checks for a new version', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  current = 'B';
  await page.reload();
  await expect(page.getByText('A new version of StockCheck is ready. Your counts are kept.')).toBeVisible();
});
