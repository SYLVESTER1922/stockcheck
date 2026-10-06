# Tickets: StockCheck v1

Each ticket is a thin vertical slice: demoable on its own, built test-first, one commit. Spec references are to [SPEC.md](SPEC.md).

**Milestones**
- 🟢 **Deployable** after T1.
- 🟡 **Usable count-and-report flow** after T6.
- 🔵 **Pilot** (first real client use) = T1–T10. This includes the offline PWA and the real-file check.
- ⚪ **v1 complete** = T1–T12.

**Proposed batches:** [T1, T2] · [T3, T4] · [T5, T6] · [T7, T8, T9] · [T10, T11] · [T12]

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

## T12: Visual pass ⚪
**Depends on:** T11. No new features: layout, legibility and touch only. *(Added 2026-10-05; content proposed, to be confirmed.)*

**Acceptance**
- [ ] Every screen (start, Count, item panel, Report, guard, How to count, update banner) reviewed on a 360×640 phone viewport and at 320 px wide. Screenshots shared for review.
- [ ] No horizontal scrolling on any screen at 320 px (automated Playwright check).
- [ ] Buttons and other tap targets are at least 44×44 px (automated Playwright check on the main screens).
- [ ] Inputs use at least 16 px text, so phones don't zoom in when typing.
- [ ] Text and notes (Look Again, warnings, guard) meet WCAG AA contrast, so they stay readable in a bright storeroom.
- [ ] Headings, spacing and button styles are consistent across screens.
- [ ] Done is visually primary and clearly different from Another place.
- [ ] The search box and the number input are large and quick to use one-handed.
- [ ] The overall look follows the v1 prototype: a header with branch and progress, bottom navigation, cards and its colours.
- [ ] No behaviour changes: every existing unit and end-to-end test passes unchanged.


## T13: Netrisyl branding ⚪
**Depends on:** T12. Branding only; no behaviour changes. *(Added 2026-10-05.)*

**Acceptance**
- [ ] The Netrisyl Insights logo, copied in as a small local asset (`public/netrisyl-logo.jpg`, 11 KB, 300×79) and cached for offline use.
- [ ] "Powered by Netrisyl Insights" with the logo in the footer of the start and Report screens, and as a line on the Excel Summary sheet. Plain text, not a link, not in the sticky header.
- [ ] A brand palette derived from the logo, applied to brand parts only (accents, header, Done and primary buttons, active tab): navy `#041a47`, blue `#0a56b3`, deep blue `#063879`, and orange `#e76c0f` (decoration only, never text). Meaning colours (short, over, Look Again, warnings, errors) unchanged. Every text/background pair is WCAG AA.
- [ ] All existing unit and end-to-end tests pass unchanged, including the 320 px layout test.

## T14: Access switch ⚪
**Depends on:** T13. Spec: ADR 0006. **Contact details (given):** Netrisyl Insights · netrisyl.support@netrisyl.com. Plain selectable text, no links; phone, WhatsApp or hours can be added later with a one-line change.

A Status File (`public/status.json`) lets Netrisyl pause the start of new Sessions, for non-payment or as an emergency stop. It never deletes or locks a Counter's data.

**Behaviour**
- File format: `{ "newSessions": "enabled" | "disabled", "message": "" }`. Switching is a one-line edit and a push.
- Fail-open with a sticky explicit answer: valid `enabled` → allowed; valid `disabled` → suspended; offline, over 3 s, 404, 5xx or malformed → no answer, keep the last explicit state; never heard → allowed.
- Checks on open, on return to the foreground, and right before an Export is loaded.
- While suspended, only "Load an Export" is blocked: the picker is replaced by the message and the contact block. Counting, editing, Done, report download, Save a backup, Restore a backup and Discard all keep working.
- Mid-count: a calm notice, *"New counts are paused. You can finish, report and back up this count."*
- Message: plain text only, at most 300 characters (then "…"); empty → *"New counts are paused by Netrisyl Insights."* A built-in "Contact Netrisyl Insights" block in plain text is always shown underneath.
- `status.json` is never precached, and is fetched with `no-store` and a cache-busting query. The app version comes from the last app-code commit, so a status-only push doesn't show the update banner.

**Disclosure wording (approved).** An About section at the end of How to count, **not a numbered instruction**, so the existing "10 instructions" test is unchanged:
> **About StockCheck.** StockCheck is provided by Netrisyl Insights. Netrisyl can pause the start of new counts for non-payment, for breach of the agreement, or as an emergency stop if a fault is found. A count already in progress is never affected: it can always be finished, reported and backed up.

**Acceptance: unit tests (written first)**
- [ ] Decision rule table: never heard + enabled → allowed; never heard + disabled → suspended; never heard + offline/timeout/404/500/malformed → allowed; suspended + offline/timeout/malformed → still suspended; suspended + enabled → allowed; allowed + timeout → still allowed.
- [ ] Message: plain text, 300-character cap, empty fallback, contact block always present.
- [ ] The committed `public/status.json` is valid.

**Acceptance: end-to-end tests (Playwright fakes `status.json`)**
- [ ] Enabled: loading an Export works as before.
- [ ] Disabled: the message and contact block are shown, no picker is offered, and restoring a backup still works.
- [ ] Offline or slow (> 3 s): loading an Export still works, with a delay under 4 s.
- [ ] Mid-count: suspension arrives on return to the foreground; the notice appears; counting, Done, report download and Save a backup work; Tallies unchanged.
- [ ] Lifted: disabled, then enabled, then loading works.
- [ ] Sticky offline: disabled, then offline, then still suspended.
- [ ] Never cached: offline, `status.json` is not served from the service worker cache.
- [ ] Every existing unit and end-to-end test passes unchanged.
- [x] Measured: time from a status push to the live file changing: **83 s and 78 s** (2026-10-05), with `sw.js` unchanged both times. Phones pick it up on next open or foreground.

## T15: Report detail and formatting ⚪
**Depends on:** T13. Excel report only; no change to counting. *(Added 2026-10-05.)*

**Acceptance**
- [ ] Summary: % of Items counted; Expected value at cost of counted Items; net Variance as % of that value; Variance by Category (Items counted, units, net $); Top 10 shortages and overages by $. Bold headings, currency formats, red negatives, column widths.
- [ ] Variance Detail: the target columns in order (Item … Flags), Status in words, Look Again prompted Y/N, Ended exactly at Expected as its own column; Session start, Duplicate # and SKU kept at the end (Session start is needed by the latest-count-wins rule). Sorted by absolute $, largest first. Frozen bold header, autofilter, units 3 dp, money 2 dp.
- [ ] Recount List: same columns and formatting, including Count at Done.
- [ ] Bold and frozen panes added by post-processing the file with SheetJS's bundled zip tools (no new dependency).
- [ ] Only report-content tests change; all other tests pass unchanged.

## T17: Variance tab ⚪
**Depends on:** T15. *(Added 2026-10-05. There is no T16.)* Layout follows the v1 prototype's Variance screen, phone-first, T13 palette.

**Acceptance**
- [ ] A Variance tab in the bottom navigation (Count · Variance · Report · How to count).
- [ ] Hero card: "Net variance value (at cost)", the short and over split, and the Expected value of the counted Items (not the whole Export). No "estimated shrinkage" wording, no "line accuracy" headline.
- [ ] Four tiles (Lines short, Lines over, Exact match, Not counted), 2×2 at 360 px.
- [ ] In-progress Items appear only as "N in progress (Done not tapped)" and never reveal Expected; only Done Items count.
- [ ] Biggest gaps (top 20) with a by value / by units toggle, bars scaled to the largest gap, each row showing expected, counted and cost; tapping a row shows Count at Done and Count at Look Again.
- [ ] Signs as well as colour on every value; over uses the "over" green, not the warning amber; all text pairs WCAG AA.
- [ ] The shortage note is kept.
- [ ] Every figure comes from buildReport; a test proves the screen totals equal the Excel Summary to the cent.
- [ ] All existing tests pass unchanged, including the 320 px layout test; the Variance tab has its own 320 px check.
