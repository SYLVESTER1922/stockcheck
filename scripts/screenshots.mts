// Screenshots of every screen at 360 px for visual review (T12).
// Run: npm run build && npx vite preview --port 4180, then: node scripts/screenshots.mts <outDir> http://localhost:4180/
import { chromium } from '@playwright/test';
const [, , outDir = 'screenshots', base = 'http://localhost:4180/'] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
const shot = (name: string) => page.screenshot({ path: `${outDir}/${name}.png` });
await page.goto(base);
await shot('1-start');
await page.getByLabel('Zobaze Export').setInputFiles('test/fixtures/tiny.xlsx');
await page.getByRole('searchbox', { name: 'Find an item' }).fill('sugar');
await page.getByRole('button', { name: /Sample Sugar/ }).click();
await page.getByLabel('Count').fill('4');
await page.getByRole('button', { name: 'Another place' }).click();
await shot('2-in-progress');
await page.getByLabel('Count').fill('2');
await page.getByRole('button', { name: 'Done' }).click();
await shot('3-done-look-again');
await page.getByRole('button', { name: 'Report', exact: true }).click();
await shot('4-report');
await page.getByRole('button', { name: 'Count', exact: true }).click();
await page.getByRole('button', { name: 'Load a new Export' }).click();
await shot('5-guard');
await page.getByRole('button', { name: 'Keep counting' }).click();
await page.getByRole('button', { name: 'How to count' }).click();
await shot('6-how-to-count');
await browser.close();
