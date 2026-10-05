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
