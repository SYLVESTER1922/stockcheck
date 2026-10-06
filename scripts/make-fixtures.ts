// Builds synthetic Export fixtures for tests. Never put client data here.
// Run: node scripts/make-fixtures.ts
import * as XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

function write(path: string, rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Inventory');
  writeFileSync(path, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
}

write('test/fixtures/tiny.xlsx', [
  ['CATEGORY', 'ITEM_NAME', 'VARIANT_NAME', 'COST_PRICE', 'STOCK'],
  ['Grocery', 'Sample Sugar', '2kg', 1.5, 10],
  ['Grocery', 'Sample Cooking Oil', '2L', 3.25, 4],
  ['Household', 'Sample Soap', '', 0.45, -2],
]);

// A larger synthetic Export for screenshots and demos (T17).
write('test/fixtures/sample.xlsx', [
  ['CATEGORY', 'ITEM_NAME', 'VARIANT_NAME', 'COST_PRICE', 'STOCK'],
  ['Grocery', 'Sample Sugar', '2kg', 1.5, 24],
  ['Grocery', 'Sample Rice', '5kg', 5.2, 12],
  ['Grocery', 'Sample Cooking Oil', '2L', 3.25, 10],
  ['Grocery', 'Sample Flour', '2kg', 1.4, 15],
  ['Grocery', 'Sample Tea', '100s', 3.8, 6],
  ['Drinks', 'Sample Cola', '2L', 1.1, 30],
  ['Drinks', 'Sample Juice', '1L', 0.95, 20],
  ['Drinks', 'Sample Water', '500ml', 0.3, 48],
  ['Household', 'Sample Soap', 'Bar', 0.45, 40],
  ['Household', 'Sample Bleach', '750ml', 2.1, 8],
  ['Household', 'Sample Matches', '10s', 0.6, -3],
  ['Confectionery', 'Sample Sweets', 'Each', 0.05, 200],
]);
