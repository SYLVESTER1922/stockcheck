// Screenshots of Home and the restyled pickers at 360 px with the synthetic sample Export (T18).
// Run: npm run build && npx vite preview --port 4180, then: node scripts/home-screenshots.mts <outDir>
import { chromium } from '@playwright/test';
const [, , outDir = 'screenshots', base = 'http://localhost:4180/'] = process.argv;
const browser = await chromium.launch();
const open = async () => (await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 })).newPage();

let page = await open();
await page.goto(base);
await page.screenshot({ path: `${outDir}/h1-home-empty.png` });
await page.screenshot({ path: `${outDir}/h1b-home-empty-full.png`, fullPage: true });

await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/sample.xlsx');
for (const [query, n] of [['sugar', '22'], ['rice', '11'], ['oil', '10'], ['cola', '34'], ['bleach', '5']]) {
  await page.getByRole('searchbox', { name: 'Find an item' }).fill(query!);
  await page.getByRole('button', { name: new RegExp(query!, 'i') }).first().click();
  await page.getByLabel('Count').fill(n!);
  await page.getByRole('button', { name: 'Done' }).click();
}
await page.screenshot({ path: `${outDir}/h2-count-with-home-arrow.png` });
await page.getByRole('button', { name: 'Home', exact: true }).click();
await page.screenshot({ path: `${outDir}/h3-home-continue.png` });
await page.getByRole('button', { name: /Continue count/ }).click();
await page.getByRole('button', { name: 'Report', exact: true }).click();
await page.getByLabel('Branch').fill('Sample Branch');
await page.getByLabel('Counter').fill('Sample Counter');
await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report' }).click()]);
await page.getByTestId('powered-by').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${outDir}/h4-report-restore-button.png` });
await page.getByRole('button', { name: 'Count', exact: true }).click();
await page.getByRole('button', { name: 'Load a new Export' }).click();
await page.screenshot({ path: `${outDir}/h5-load-new-export.png` });

page = await open(); // a fresh phone with the switch on (faked in this browser only)
await page.route('**/status.json*', (r) =>
  r.fulfill({ contentType: 'application/json', body: JSON.stringify({ newSessions: 'disabled', message: 'New counts are paused. Please contact Netrisyl Insights.' }) }),
);
await page.goto(base);
await page.getByTestId('suspended').waitFor();
await page.screenshot({ path: `${outDir}/h6-home-suspended.png`, fullPage: true });
await browser.close();
