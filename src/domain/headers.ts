/** Matching Export headers to fields (spec §4.1). */
export type Field = 'name' | 'expected' | 'cost' | 'variant' | 'sku' | 'category';

type FieldRule = { label: string; aliases: string[]; required: boolean };

// Aliases are written as people see them; matching ignores case, spaces, _ - and .
const FIELDS: Record<Field, FieldRule> = {
  name: { label: 'item name', aliases: ['ITEM_NAME', 'NAME', 'PRODUCT NAME', 'ITEM'], required: true },
  expected: { label: 'Expected (stock)', aliases: ['STOCK', 'QTY', 'QUANTITY', 'STOCK QTY', 'ON HAND'], required: true },
  cost: { label: 'cost price', aliases: ['COST_PRICE', 'COST', 'BUYING PRICE'], required: true },
  variant: { label: 'variant', aliases: ['VARIANT_NAME', 'VARIANT', 'UNIT', 'SIZE'], required: false },
  sku: { label: 'SKU', aliases: ['SKU', 'ITEM CODE', 'CODE'], required: false },
  category: { label: 'category', aliases: ['CATEGORY', 'CATEGORY NAME', 'DEPARTMENT'], required: false },
};

const normalise = (header: string) => header.toUpperCase().replace(/[\s_.-]+/g, '');

export type HeaderMatch =
  | { ok: true; columns: Partial<Record<Field, number>>; matched: Partial<Record<Field, string>> }
  | { ok: false; message: string };

export function matchHeaders(headers: string[]): HeaderMatch {
  const columns: Partial<Record<Field, number>> = {};
  const matched: Partial<Record<Field, string>> = {};
  const problems: string[] = [];

  for (const [field, rule] of Object.entries(FIELDS) as [Field, FieldRule][]) {
    const wanted = rule.aliases.map(normalise);
    const index = headers.findIndex((h) => wanted.includes(normalise(h)));
    if (index >= 0) {
      columns[field] = index;
      matched[field] = headers[index];
    } else if (rule.required) {
      problems.push(`No ${rule.label} column found. Looked for: ${rule.aliases.join(', ')}.`);
    }
  }

  if (problems.length > 0) {
    return { ok: false, message: `${problems.join(' ')} This file has: ${headers.join(', ')}.` };
  }
  return { ok: true, columns, matched };
}
