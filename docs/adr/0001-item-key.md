---
status: accepted (amended 2026-10-05 to prefer SKU when present and unique)
---

# Item Key is SKU when unique, otherwise normalised name + variant; duplicates are kept separate

A Count must stay attached to the right Item, including across reloads of the Export. Each row's Item Key is chosen per row:

1. If the row's SKU is non-empty **and** no other row in the same Export has that SKU, the key is the SKU.
2. Otherwise the key is the normalised ITEM_NAME + VARIANT_NAME (lowercase, trimmed, repeated spaces collapsed).

One Export may mix both kinds of key. Rows that still share a key after this are kept as separate Duplicate Items (#1, #2… in Export order), flagged on import, and shown with their cost price. A duplicated SKU falls back to name + variant and gets the same #1/#2 handling if that also collides.

## Evidence (client's real Export, checked 2026-10-05)

Exact counts are kept in `private-notes/` (not in the repo). In summary:
- The SKU column was present but empty on every row, so today every row uses name + variant.
- Name + variant was unique for over 99% of rows. A few rows formed duplicate pairs.
- At least one duplicate pair had different cost prices between its rows.
- Some rows had a blank VARIANT_NAME. This is fine; blank is part of the key.

## Considered options

- **Row position** (the prototype's approach): rejected. Inserting one row in a new Export shifts every Count below it onto the wrong Item.
- **SKU only**: rejected. It is empty on every row today.
- **Name + variant only** (the original decision): superseded. The client can fill SKUs in Zobaze, and a unique SKU survives renames and resolves duplicates, so it is the better key wherever it exists.
- **Merge duplicates and sum Expected**: rejected. A real duplicate pair had different cost prices, so any merged cost would make Variance Value wrong without anyone noticing.
- **Reject the Export on duplicates**: rejected. a few rows should not block a whole stocktake.

## Consequences

- **An Item's key changes when its SKU is added, removed, or becomes duplicated.** A Count recorded under the old key will not match the new Export. SKU clean-up in Zobaze should therefore happen between stocktakes, not during one. How a mid-count reload handles this is decided separately.
- SKU keys and name keys must never collide with each other (for example, a SKU that happens to read like a product name). The two kinds of key must be kept distinguishable.
- Duplicate Items without a unique SKU are told apart only by their order in the Export. If a later Export reorders them, their Counts could swap. This affects only a few rows in the client's data today.
- Renaming an Item that has no SKU changes its key.
