# Tickets: StockCheck v1

Each ticket is a thin vertical slice: demoable on its own, built test-first, one commit. Spec references are to [SPEC.md](SPEC.md).

**Milestones**
- 🟢 **Deployable** after T1.
- 🟡 **Usable count-and-report flow** after T6.
- 🔵 **Pilot** (first real client use) = T1–T10. This includes the offline PWA and the real-file check.
- ⚪ **v1 complete** = T1–T11.

**Proposed batches:** [T1, T2] · [T3, T4] · [T5, T6] · [T7, T8, T9] · [T10, T11]

---

## T1: Walking skeleton, deployed 🟢🔵
**Depends on:** nothing. **Needs you:** create the GitHub repo `SYLVESTER1922/stockcheck`; approve the push; in Settings → Pages set the source to "GitHub Actions", the custom domain to `stockcheck.netrisyl.com`, and tick "Enforce HTTPS" (ADR 0005).

Vite + React + TS + Tailwind app. Pick an `.xlsx` → a table of item name, Variant, STOCK and COST_PRICE from the first sheet. A GitHub Actions workflow runs the tests, builds, and deploys to Pages.

**Acceptance**
- [ ] Unit test (written first, seen failing): parsing the synthetic `test/fixtures/tiny.xlsx` (3 rows) returns 3 rows with the right values.
- [ ] Picking that file in the browser shows a 3-row table.
- [ ] `.gitignore` blocks `*.xlsx`/`*.xls`/`*.csv` outside `test/fixtures/`.
- [ ] Pushing to `main` runs the tests and deploys. `https://stockcheck.netrisyl.com/` shows the app and can load the fixture. The Vite `base` is `/`.

## T2: Export rules: headers, cells and warnings 🔵
**Depends on:** T1. Spec §4.1–4.2.

**Acceptance**
- [ ] Header aliases matched as specified. A missing required field is refused, and the message lists the aliases searched and the headers found.
- [ ] Every row of the §4.2 cell table is a unit test: numeric, blank, plain text number, unreadable, and the decimal-place limits with binary-noise handling.
- [ ] Import summary shows the matched headers, the Item count and the non-zero warning counts (no cost, blank Expected, unreadable Expected, Negative System Stock).
- [ ] Negative System Stock is flagged on the Item.

## T3: Item Keys and Duplicate Items 🔵
**Depends on:** T2. Spec §4.3, ADR 0001.

**Acceptance**
- [ ] Unit tests: unique SKU → `sku:` key; duplicate SKU → falls back to name; blank SKU → name; a mixed file; normalisation (case, trim, repeated spaces); blank Variant; a `sku:` key and a `name:` key never collide.
- [ ] Same-key rows become #1/#2 in Export order. The import warning reports "N Duplicate Items in M groups".
- [ ] Duplicate Items show their cost price in the list.

## T4: Search and count an Item 🔵
**Depends on:** T3. Spec §4.4, §4.5 (single Tally), §4.7, ADR 0004. **Needs you:** approve installing Playwright and its browser.

Search, pick an Item, type a Tally, commit, and see Expected, Count, Variance and Variance Value. The Session is saved in browser storage.

**Acceptance**
- [ ] Unit tests: the search rules ("sug 2kg" finds "White Sugar 2 KG"; ordering), Tally parsing (≥ 0, ≤ 3 dp, comma as decimal point, rejections), and the §4.7 money table.
- [ ] Expected does not appear anywhere before commit (checked by a test).
- [ ] After commit, the row shows Expected, Count, Variance and `$` value. The comma input is echoed back as "= 12.5".
- [ ] Reloading the page keeps the Count.
- [ ] Playwright: load fixture → search → enter a Tally → see the Variance.

## T5: Tallies and Look Again 🔵
**Depends on:** T4. Spec §4.5–4.6.

**Acceptance**
- [ ] A second entry adds a Tally ("12 + 24 = 36"). Tallies can be edited and removed. Removing the last one makes the Item Uncounted.
- [ ] Every row of the §4.6 table is a unit test of the large-Variance rule. `LOOK_AGAIN` and `RECOUNT_LIST` are constants in one file.
- [ ] The Look Again inline note shows the correct shortage or surplus text, with no modal and no extra tap.
- [ ] Count at Look Again is stored the first time Look Again fires, and never overwritten.

## T6: Session Report download 🟡🔵
**Depends on:** T5. Spec §4.9.

**Acceptance**
- [ ] Branch and Counter are required, with `<datalist>` suggestions from this phone. The file name follows the spec.
- [ ] Unit tests on the report model: Summary figures; Status per Item; Uncounted Items blank and excluded from totals; "Ended exactly at Expected" only on prompted Items; Recount List membership; **the sum of the line values equals the headline**.
- [ ] Workbook test: write the report, read it back with SheetJS, and confirm the quantity and dollar cells are numeric and all three sheets exist.
- [ ] Playwright: count 3 Items → download → the file exists, with the expected sheet names.

## T7: Reported Session and reload guard 🔵
**Depends on:** T6. Spec §4.8, ADR 0003.

**Acceptance**
- [ ] Unit tests: a new Session is unreported only once it has Counts; downloading marks it reported; any Tally change after that unmarks it.
- [ ] Loading a new Export over unreported Counts is refused with both options. Discard needs a second confirmation. A reported or empty Session is replaced without asking.
- [ ] "Counting finished" time = the last Tally change.

## T8: How to count screen 🔵
**Depends on:** T1 (can be built any time after it). Spec §4.11.

**Acceptance**
- [ ] Reachable from the start screen with no Export loaded. Shows the 10 instructions in the spec.
- [ ] Playwright: open the app → open How to count → the "Required" line is visible.

## T9: Installable offline PWA 🔵
**Depends on:** T8. Spec §4.12. **Needs you:** approve installing `vite-plugin-pwa`.

**Acceptance**
- [ ] Manifest with name, icons and theme. The browser offers to install.
- [ ] Persistent storage is requested on first load. A refusal is tolerated.
- [ ] Playwright offline test: visit online → go offline → reload → the app loads, a fixture Export loads, and a Tally can be entered.
- [ ] No network requests after load (checked in the Playwright test).

## T10: Real-file check (stage 5) 🔵
**Depends on:** T7, T9. Local only; never runs in CI; prints counts only.

**Acceptance**
- [ ] `test/local/real-export.test.ts` loads the file named by `STOCKCHECK_REAL_EXPORT` and compares it with `private-notes/real-export-expectations.json` (skipped if either is missing). It checks: the Item count; no refused columns; every warning count matches the expectations file; and, with synthetic Counts for every Item, the sum of the report's lines equals the headline to the cent. No client numbers appear in the test file.
- [ ] Every finding that breaks something gets its own test before it is fixed.
- [ ] A short findings note in `private-notes/` (counts only).

## T11: Backup and restore ⚪
**Depends on:** T7. Spec §4.10.

**Acceptance**
- [ ] Unit tests: round trip (backup → restore → identical Session); wrong `app` or `format`, or bad JSON, is refused; restore follows the reload guard.
- [ ] A size test: a synthetic 1,000-Item Session with a Tally on every Item; the size is recorded in LEARNING.md.
- [ ] The privacy warning is shown next to the Backup button.
