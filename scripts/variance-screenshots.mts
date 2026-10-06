// Screenshots of the Variance tab at 360 px with the synthetic sample Export (T17).
// Run: npm run build && npx vite preview --port 4180, then: node scripts/variance-screenshots.mts <outDir>
import { chromium } from '@playwright/test';
const [, , outDir = 'screenshots', base = 'http://localhost:4180/'] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
await page.goto(base);
await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/sample.xlsx');
const COUNTS: [string, string, boolean?][] = [
  ['sugar', '22'], ['rice', '11'], ['oil', '10'], ['flour', '13'], ['cola', '34'], ['juice', '19'],
  ['water', '40'], ['soap', '41'], ['bleach', '5'], ['matches', '6'], ['sweets', '160'], ['tea', '3', false],
];
for (const [query, n, done = true] of COUNTS) {
  await page.getByRole('searchbox', { name: 'Find an item' }).fill(query);
  await page.getByRole('button', { name: new RegExp(query, "i") }).first().click();
  await page.getByLabel('Count').fill(n);
  await page.getByRole('button', { name: done ? 'Done' : 'Another place' }).click();
}
await page.getByRole('button', { name: 'Variance', exact: true }).click();
await page.screenshot({ path: `${outDir}/v1-hero-tiles.png` });
await page.getByTestId('gaps').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${outDir}/v2-gaps-by-value.png` });
await page.getByRole('button', { name: 'by units' }).click();
await page.screenshot({ path: `${outDir}/v3-gaps-by-units.png` });
await page.getByRole('button', { name: /Sample Bleach/ }).click();
await page.screenshot({ path: `${outDir}/v4-row-tapped.png` });
await page.screenshot({ path: `${outDir}/v5-full-page.png`, fullPage: true });
await browser.close();
