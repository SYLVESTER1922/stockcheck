/** Item Keys (ADR 0001): SKU when filled in and unique, otherwise normalised name + variant. */
type KeySource = { name: string; variant: string; sku: string };

export type Keyed<T> = T & {
  /** Unique within the Export. `sku:` and `name:` prefixes keep the two kinds apart. */
  key: string;
  /** 1, 2… for Duplicate Items (same base key), in Export order; null otherwise. */
  duplicate: number | null;
};

const normalise = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

export function assignKeys<T extends KeySource>(rows: T[]): Keyed<T>[] {
  const skuUses = countBy(rows.map((r) => r.sku.trim()).filter(Boolean));
  const baseKeys = rows.map((r) => {
    const sku = r.sku.trim();
    return sku && skuUses.get(sku) === 1 ? `sku:${sku}` : `name:${normalise(r.name)}|${normalise(r.variant)}`;
  });

  const baseUses = countBy(baseKeys);
  const seen = new Map<string, number>();
  return rows.map((row, i) => {
    const base = baseKeys[i]!;
    if (baseUses.get(base) === 1) return { ...row, key: base, duplicate: null };
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...row, key: `${base}#${n}`, duplicate: n };
  });
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}
