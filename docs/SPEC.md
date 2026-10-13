# StockCheck v1: Specification

Terms in **bold capitals** (Item, Count, Tally…) are defined in [CONTEXT.md](../CONTEXT.md). Hard-to-reverse decisions are in [docs/adr/](adr/). Anything in [IDEAS.md](IDEAS.md) is **out of v1**.

## 1. Problem

Branches of a retailer on Zobaze POS need to compare physical stock with what Zobaze believes, in units and in USD at cost, using cheap phones with poor signal, at $0 running cost. Most Items have no barcode, so Items are found by name.

## 2. Operating preconditions (requirements of the process, not assumptions)

1. **Count only while the branch is closed to trading.** The Export is loaded right before counting starts. (CONTEXT: Counting Window)
2. **One Counter per Session, on one phone.** Different Sessions may use different phones.
3. Counting is usually directly on the phone. Paper is allowed if it's typed in the same Counting Window.

## 3. v1 scope

**In:** load Export → search → enter Tallies → live Variance with Look Again → Session Report (Excel) → reported-Session reload guard → How to count screen → Backup/restore → installable offline PWA on GitHub Pages. Added by ADR 0007: optional Wastage per Item, an Adjust tab (recommended corrections to make in Zobaze by hand, with approval and Applied records), a separate Adjustment Report (Excel), and a reload guard for Adjustments (§4.13–4.15).

**Out (see IDEAS.md):** unlisted Items, multi-device merge, cross-Session progress, manual column picker, text-number parsing, PDF report, pack conversion, Zobaze clean-up. Also out: +/− buttons (cut from Q18 to keep v1 small; typed Tallies only), settings screens, barcode scanning, any server or analytics, any network request after the app has loaded.

## 4. Behaviour

### 4.1 Loading an Export

- Reads the **first sheet** of an `.xlsx` (or `.xls`/`.csv` if SheetJS reads it). The first row is headers.
- Headers are matched case-insensitively, ignoring spaces, `_`, `-` and `.`:

| Field | Aliases | Required |
|---|---|---|
| Item name | ITEM_NAME, ITEMNAME, NAME, PRODUCTNAME, ITEM | yes |
| Expected | STOCK, QTY, QUANTITY, STOCKQTY, ONHAND | yes |
| Cost price | COST_PRICE, COST, BUYINGPRICE | yes |
| Variant | VARIANT_NAME, VARIANT, UNIT, SIZE | no |
| SKU | SKU, ITEMCODE, CODE | no |
| Category | CATEGORY, CATEGORYNAME, DEPARTMENT | no |

- **A missing required field refuses the file.** The message names the field, the aliases searched, and the headers actually found. Example: *"No cost price column found. Looked for: COST_PRICE, COST, BUYING PRICE. This file has: CATEGORY, ITEM_NAME, STOCK, …"*
- Rows with a blank item name are skipped. An Export with no usable rows is refused.
- **On success, the import summary shows:** the matched header for each field ("Expected ← STOCK"), the Item count, and every warning count below that is non-zero.

### 4.2 Reading cells (Expected and cost)

| Cell | Result |
|---|---|
| numeric cell `2.5` | 2.5 |
| numeric cell `0` (even if Excel displays "-") | 0 |
| numeric cell `-3` | −3 → **Negative System Stock** (if Expected) |
| blank | Expected 0 / cost $0, counted in the warning |
| text `" 7 "` | 7 (plain number text: optional `-`, digits, optional `.` and digits) |
| text `-3` | −3 |
| text `$1,200.50` | unreadable *(v1; see IDEAS.md)* |
| text `1,200` | unreadable *(v1)* |
| text `12 pcs` | unreadable *(v1)* |
| text `N/A`, `-`, `see note`, `12,5`, `1.200,50` | unreadable |

- **Unreadable Expected:** the Item loads and can be counted, but it has no Variance. Its status is EXPECTED UNREADABLE.
- **Unreadable cost:** treated as $0.
- **Expected** may have up to 3 decimal places, and **cost** up to 2 (it's read in cents). More is unreadable. Decimal places are judged after removing binary noise, so a stored `1.1000000000000001` counts as 1.1.

**Import warnings** (shown on import and repeated in the Session Report):
- "N items have no cost, so their dollar Variance counts as $0" (blank, zero or unreadable cost)
- N with blank Expected
- N with unreadable Expected
- N with Negative System Stock
- N Duplicate Items in M groups

### 4.3 Item Keys (ADR 0001)

- If a row's SKU is non-empty and unique in the Export, the key is `sku:<SKU>`. Otherwise it's `name:<normalised name>|<normalised variant>` (lowercase, trimmed, repeated spaces collapsed). The prefixes keep the two kinds of key from colliding.
- Rows that still share a key are **Duplicate Items** #1, #2… in Export order. They're shown with their cost price everywhere they appear.

### 4.4 Search

- Every typed word must appear (case-insensitive, any order) in the name, Variant or category. Spaces between a number and a unit are ignored on both sides ("2kg" matches "2 KG").
- Order: names starting with the first typed word come first, then alphabetical.
- A result shows the name, Variant, current Tallies ("12 + 24") if any, and cost for Duplicate Items. **Expected is never shown in search results.**

### 4.5 Entering Tallies (ADR 0004)

- **Before commit, Expected is hidden.** That covers search results, the input, and any placeholder.
- A Tally is a number ≥ 0 with up to 3 decimal places. A single comma is accepted as the decimal point ("12,5"), and the parsed value is shown back ("= 12.5"). Anything else is rejected with a message, and nothing is saved.
- **Another place** adds the typed Tally and keeps Expected hidden, showing the parts so far ("4 + …").
- **Done** (the main button, also Enter) adds the typed Tally, if any, and finishes the Item. Count = the sum of the Item's Tallies. An entry never replaces an earlier Tally.
- An Item with Tallies but no Done is **in progress**: marked so in search results, never shows Expected, and is flagged IN PROGRESS in the Session Report (ADR 0004).
- **After Done, the row shows:** Expected, Count (with parts "4 + 6"), Variance, and Variance Value. Further Tallies are added with **Add**.
- Any Tally can be edited or removed, before or after Done. An Item whose last Tally is removed becomes **Uncounted** and no longer Done.

### 4.6 Large Variance and Look Again

- **Large** if |Variance Value| ≥ **$5**, or (|Variance| ≥ **2 units** and |Variance| × 100 ≥ **20** × |Expected|). With Expected 0, this means |Variance| ≥ 2. All comparisons use the integer values (§4.7).
- Two named constants in one file: `LOOK_AGAIN` and `RECOUNT_LIST`, both `{ dollars: 5, units: 2, percent: 20 }` in v1. There is no settings screen.
- **Look Again** is an inline note on the row, shown while a Done Item has a Large Variance. It's never a modal and costs zero extra taps.
  - Shortage: *"Check every place this item could be stored."*
  - Surplus: *"Possible delivery not booked in Zobaze."*
- The first time Look Again fires for an Item, its Count at that moment is stored as **Count at Look Again**. Later edits or removals never overwrite or clear it.
- Items with EXPECTED UNREADABLE are never Large.

| Expected | Count | Cost | Variance | Value | Large? |
|---|---|---|---|---|---|
| 20 | 18 | $0.50 | −2 | −$1.00 | no |
| 20 | 15 | $0.50 | −5 | −$2.50 | yes |
| 40 | 0 | $0.05 | −40 | −$2.00 | yes |
| 3 | 2 | $25.00 | −1 | −$25.00 | yes |
| 0 | 6 | $1.00 | +6 | +$6.00 | yes |
| 1 | 0 | $1.20 | −1 | −$1.20 | no |
| −3 | 5 | $1.00 | +8 | +$8.00 | yes |

### 4.7 Money

- Quantities are integer thousandths, cost is integer cents.
- Line Variance Value = Variance × cost, rounded to cents **half away from zero** (like Excel's `ROUND`).
- Totals are sums of rounded lines.
- Display is `$1,234.56`, with shortages as `−$3.40`.

| Variance | Cost | Line Variance Value |
|---|---|---|
| 3 | $1.10 | $3.30 |
| 2.5 | $1.07 | $2.68 |
| −2.5 | $1.07 | −$2.68 |

### 4.8 Session lifecycle (ADR 0003)

- The Session is saved in browser storage after every change and survives a page reload.
- A Session is **reported** when a Session Report has been downloaded and nothing has changed since. Any Tally change makes it unreported.
- **Reload guard:** loading a new Export or restoring a Backup over a Session that has Counts and is unreported is refused. The message offers two options: "Download the report first" or "Discard this Session". Discard needs a second, explicit confirmation. A Session with no Counts, or a reported one, is replaced without asking.
- **Adjustments are guarded the same way** (§4.14): recorded Adjustments that are not yet in a downloaded Adjustment Report stop a new Export or a restore until the Counter downloads that report or discards with a second confirmation.
- The Session also keeps the Counter's name (optional, empty until known: asked once at the first Approval, and pre-filled on the Report screen).

### 4.9 Session Report (Excel)

- **Branch** and **Counter** are required before download. They're free-text inputs with a `<datalist>` of values previously used on this phone.
- File name: `stockcheck-<branch>-<counter>-<YYYY-MM-DD>-<HHmm>.xlsx`, slugified, using local time at download.
- All quantity and dollar cells are **numeric cells**, not text.

**Summary sheet:**
- Branch, Counter
- Export file name
- **Session start** (when the Export was loaded)
- **Counting finished** (the last Tally change)
- Report generated at
- Items in the Export, counted, Uncounted, matching, short, over
- Units short and units over
- Shortage value, surplus value, and the **net Variance Value** (the headline)
- Items that prompted at least once
- Items on the Recount List
- Every import warning count, and a line naming how many Items are In progress (Done not tapped)
- The note: *"A shortage may be stock on the shelf under a different name or not set up in Zobaze. Check the Recount List and the paper list before treating it as a loss."*

**Summary sheet additions (T15):** % of Items counted; Expected value at cost of the counted Items; net Variance as a % of that value; a Variance by Category table (Items counted, units, net $), worst first; Top 10 shortages and Top 10 overages by $ value. Bold section headings, currency formats, red negatives, set column widths.

**Variance Detail sheet (T15):** one row per Item. Columns: Item, Variant, Category, Key, Expected, Count at Done, Final Count, Variance (units), Cost price, Variance ($), Status (Short / Over / Match / In progress / Not counted / Expected unreadable), Look Again prompted (Y/N), Count at Look Again, Ended exactly at Expected (Y), Flags (Duplicate Item, Negative System Stock, No cost), then Session start, Duplicate #, SKU. Sorted by absolute Variance ($), largest first; rows without a value (Expected unreadable, In progress, Not counted) last. In-progress and Uncounted Items have no Variance and are never treated as 0. Header row frozen and bold, autofilter on, units to 3 decimals, money to 2 as currency, negatives in red.

**Recount List sheet:** the same columns and formatting, for Items with a Large Variance under `RECOUNT_LIST`.

Bold and frozen panes are added to the written file's XML after SheetJS writes it, because the free SheetJS edition doesn't write them.

**Invariant:** the sum of the Variance Value column equals the net Variance Value on the Summary, to the cent.

### 4.10 Backup and restore

- **Backup:** a JSON file containing the whole Session (Items as loaded, Tallies, Done marks, Count at Done, Count at Look Again, Wastage, Adjustment records with their logs, the Counter's name, Export file name and times, reported status) plus `app: "stockcheck"` and `format: 2`. Format 2 added Wastage and Adjustments (ADR 0007); the app reads formats 1 and 2, and every new field is optional and gets an empty default on load and on restore, so old Sessions and format 1 backups load unchanged. A newer `format` (and format 2 on an app that only knows 1) is refused with "update the app". Branch is not in the Session, so it is not in the Backup; the Report screen asks for it as usual. The download screen says: *"This file contains cost prices and stock values. Send it only to the manager."* It now also holds the names people typed as approvers.
- **Restore:** replaces the current Session under the same reload guard. A file that isn't a valid StockCheck backup is refused with a clear message.
- A test measures the real size of a counted 1,000-Item Backup: 256 KB (measured), and of one with Wastage on 100 Items and 300 Approvals: about 396 KB (measured, T28).

### 4.11 How to count screen

Reachable from the start screen before any Export is loaded, and works offline. It contains:

1. **Required:** count only while the branch is closed. Load the Export right before you start counting. If you count on paper, type it in the same day.
2. Count what you see, in the unit on the label. Never convert between Variants.
3. An item in several places: type each place's number and tap Another place, then tap Done after the last one.
4. When the app says "look again", go and look: every place the Item could be stored for a shortage, or for an unbooked delivery for a surplus.
5. Always open the app from the home-screen icon, never from a link in WhatsApp.
6. Download the Session Report before loading a new Export. If you correct anything, download again; the newest report is the true one.
7. A backup file contains the shop's cost prices and stock values. Send it only to the manager.
8. Stock that isn't in Zobaze goes on a separate paper list for the manager.
9. A shortage may be stock on the shelf under a different name or not set up in Zobaze. Check the Recount List and the paper list before treating it as a loss.
10. *For the manager:* if an Item appears as counted in more than one report, use the latest.

Below the numbered instructions, outside them (so the list stays ten), a short **Wastage and Adjustments** section says: Wastage is optional and never changes the Variance; the Adjust tab lists what to correct in Zobaze, which StockCheck never changes; and Approved by and Applied by are a record, not security. The About section (Access Switch) is unchanged.

### 4.12 Offline and install

- An installable PWA (manifest and icons) with a service worker that precaches the app. After one online visit it opens and works fully offline.
- On first load, the app asks the browser for persistent storage (`navigator.storage.persist()`). If the browser refuses, it continues anyway.
- **Updates (a new deploy while an old version is cached):**
  - The browser checks for a new version every time the app is opened. The app also checks every hour while open and whenever it returns to the foreground, when online.
  - A new version downloads in the background and then waits. A banner says *"A new version of StockCheck is ready. Your counts are kept."* with **Update now**. The app never reloads by itself, so a Counter is never interrupted mid-entry.
  - Update now activates the new version and reloads once, including on a phone's first visit. Counts survive because the Session is saved on every change.
  - The footer always shows the running version (commit and build date), so a stale phone is visible to anyone who looks.
  - Offline, no check is possible: the phone keeps the version it has, and the banner appears the next time it's online.
  - Rejected: automatic update and reload (`autoUpdate`). It would interrupt typing without warning. Also rejected: no update prompt at all, which could leave a Counter on a stale version without knowing.
- The app makes no network requests after load: client data never leaves the phone except in files the Counter downloads.

### 4.13 Wastage (ADR 0007)

- Optional, per Item, only after the Item is Done (Expected is shown by then). Wastage is what was thrown away and is **not already deducted in Zobaze**.
- Needs a reason (Expired, Damaged, Spoilt, or Other with a note), the paper-register reference, and the tick "This is NOT already deducted in Zobaze". Quantity as for a Tally: more than 0, up to 3 decimal places.
- **Unexplained Variance = Variance + Wastage.** Wastage sits beside the Variance and never replaces it: Count, Variance, Look Again, Net Variance Value and the Recount List do not read it.
- Flagged, never blocked: Wastage that covers the whole shortage, is more than the shortage, or is entered on a surplus or on an Item that matches Expected.
- Entering it marks the Session Report as changed since it was downloaded, without moving "Counting finished". Removing the last Tally (Done) drops the live Wastage.
- Shown on the Variance tab and the Report screen as Wastage Value and Unexplained Value, only when there is Wastage.
- In the Session Report: Wastage columns after the last existing column (Wastage, reason, note, register reference, Unexplained Variance, flags) and a Wastage block after the last Summary row, **only when the Session has Wastage**. Otherwise the report is identical to the one the app wrote before ADR 0007, byte for byte (tested against a baseline).

### 4.14 Adjustments (ADR 0007)

- The bottom navigation is Count · Variance · Adjust · Report · Help (five tabs, fitting 320 px). "Help" opens the How to count screen.
- The **Adjust tab** lists one Adjustment for each Done Item with a Variance: ADD or REMOVE a quantity equal to the Variance, to be made in Zobaze by hand. StockCheck never changes Zobaze and has no connection to it. Each row shows Expected, Count, Wastage, Variance, Unexplained Variance, the value at cost, a status, flags and, for Duplicate Items, `#n` and cost. The Export date is shown prominently, with totals by ADD and REMOVE, a status filter with counts, and a search by name, Variant or SKU. 50 rows are drawn at a time.
- **Statuses:** Pending, Approved, Applied, Rejected, Held. Allowed moves: Pending → Approved, Rejected or Held; Held → Pending, Approved or Rejected; Rejected → Pending (note); Approved → Applied, or back to Pending (note). Applied is final; a mistake needs a correcting Adjustment. Every move is logged with a typed name and the phone's clock time, which cannot be edited.
- An **ADD needs a Supplier Document** (invoice or delivery note number); until it has one it shows as Held and cannot be Approved. **Marking Applied** needs the tick "I checked the current Zobaze balance and intervening movements".
- **Approval** keeps the approver's typed name, the time, and a snapshot of what was agreed. It is **a record, not security**: anyone using the phone can type a name, and a Backup can be edited. A warning (never a block) shows if the approver has the Counter's name.
- **Count changes:** if the Count changes after Approval, the Approval is cancelled (logged by StockCheck, with the old Approval kept in the history), and the Count tab says so beforehand. After Applied, the record is never changed: the row is flagged "Count changed after Applied: review" until a person acknowledges it or raises a **correcting Adjustment** (a new, linked Adjustment for the difference). An Applied row never disappears from view. Removing Done drops Pending and Held Adjustments and keeps Approval history as history-only rows.
- Untouched Adjustments are derived from the Tallies and Wastage every time. Only decisions are stored.

### 4.15 Adjustment Report and the reload guard for Adjustments (ADR 0007)

- **Generate Adjustment Report** (Adjust tab; Branch and Counter needed, like the Session Report) downloads `stockcheck-adjustments-<branch>-<counter>-<YYYY-MM-DD>-<HHmm>.xlsx`, a file separate from the Session Report, with three sheets: **Summary** (the Export date, counts by status, totals by ADD and REMOVE, the record-not-security note), **Adjustments** (one row per Adjustment: names, Expected, Count, split, ADD/REMOVE in words with a signed quantity and value, status, approver and time, Supplier Document, who applied it and when, the Applied Check, flags, a plain-words review text, correcting links) and **Adjustment History** (every logged move). Green and red come from number formats. Quantities and money are numeric cells.
- It has its own marker and **never marks the Session Report as reported**; the Session Report is unchanged by it.
- **Reload guard:** only Adjustments that people recorded count (untouched ones are derived from the Counts, which the Session Report holds). Approved but not yet Applied is a block; Pending or on-hold records are a warning. Both offer "Download the Adjustment Report first" or discard with a second confirmation. Applied, Rejected and Sessions with nothing recorded are not guarded. The guard comes before the Access Switch, and the saved copy is checked as well as the window's.

## 5. Technical decisions

| Choice | Rejected alternative, and why |
|---|---|
| React + TypeScript (strict) + Vite + Tailwind | Your expected stack. No reason to change it. |
| **SheetJS installed from its official CDN tarball** (cdn.sheetjs.com) | The `xlsx` package on the npm registry is an old version that SheetJS no longer updates there. I'll confirm the current version at install time. |
| Pure logic in `src/domain/` (parse, keys, cells, money, large-Variance, session, report model, backup, search), with no React or browser APIs. UI in `src/ui/`. Storage behind one small module. | Logic inside components: can't be unit-tested without rendering. |
| Session in `localStorage` as one JSON document | IndexedDB: an async API and more code. A 1,000-Item Session should be far under localStorage's ~5 MB (confirmed by the backup-size test). |
| No router; screens chosen in state | A router library adds weight. GitHub Pages also needs workarounds for deep links. |
| Service worker via `vite-plugin-pwa` (Workbox precache) | Hand-written: caching hashed build files correctly is error-prone. The plugin generates the file list for us. |
| Vitest for domain logic; Playwright for end-to-end flows and the offline test | Your expected stack. |

**Client data safety:**
- `.gitignore` excludes every `*.xlsx`, `*.xls` and `*.csv` except under `test/fixtures/`. Fixtures are synthetic only.
- Tests against a real client Export live in `test/local/`. They read the file named by the `STOCKCHECK_REAL_EXPORT` environment variable and the expected counts from `private-notes/real-export-expectations.json`, and are skipped if either is missing. They print counts only and never run in CI. Client facts and statistics live only in the gitignored `private-notes/`.

## 6. Open items

- Hosting: see ADR 0005. The origin must not change after the pilot.
- Pilot questions are kept in `private-notes/`.
