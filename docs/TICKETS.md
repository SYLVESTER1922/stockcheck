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

## T18: Home screen ⚪
**Depends on:** T17. *(Added 2026-10-06.)* No behaviour change to counting, guards, backup, restore or the Access Switch.

**Acceptance**
- [ ] Home: brand line and headline "Count your stock. Find the gaps."; a 3-step strip; one primary button ("Start a count" with no Session, "Continue count" with "X of N counted" with one; X = Items Done); Restore a backup and How to count as secondary actions; "Works offline" and "Your counts stay on this phone" chips; the suspension message instead of Start a count when the Access Switch is on; the Netrisyl footer and version.
- [ ] Styled file buttons replace the native controls everywhere and show the chosen file name. Each keeps an accessible name containing its visible text.
- [ ] A Home arrow (accessible name "Home", 44 px) in the header on every screen except Home; going Home never changes or discards the Session; Load a new Export keeps its guard.
- [ ] The browser/Android back button returns to Home, including after reopening the app mid-count.
- [ ] Reopening the app mid-count still opens on Count. Home is shown whenever there is no Session.
- [ ] Tests: Home reachable from every screen, Continue counts, back button, 320 px layout. Existing tests unchanged.

---

# Wastage and Adjustments (ADR 0007)

*(Added 2026-10-13.)* The live pilot keeps running throughout. T19 is the only ticket that touches how a Session is loaded or saved, and it can go live alone. Every later ticket leaves the app working and all existing tests green, and each adds its own tests first. Netrisyl never updates Zobaze, nothing here uses the network, and the Access Switch is untouched.

**Proposed batches:** [T19] · [T20, T21] · [T22, T23] · [T24] · [T25, T26] · [T27, T28]

## T19: Data model and backup format 2 ⚪
**Delivers:** the new optional Session fields, empty defaults on load and on restore, and backup format 2, with no visible change in the app.
**Depends on:** T11. **Main risk:** a Session in progress on a phone, or an old backup, fails to load or loses data. Releasable on its own.

**Acceptance**
- [x] `Session` gains optional `wastage`, `adjustments` (records with history) and an adjustments-change marker plus an adjustments-reported marker. Each defaults to empty.
- [x] `SESSION_KEY` stays `stockcheck.session.v1`.
- [x] Loading a saved Session without the new fields gives the empty defaults and every Count, Done, Look Again and reported marker is identical.
- [x] Restore applies the same defaults. `looksLikeSession` does not require the new fields, but rejects them if they are present and the wrong shape.
- [x] Backups are written as format 2. Format 1 backups restore unchanged. Format 3 or above is refused with the existing "newer version" message. A format 2 file shown to the format-1 reader (kept in a test as a copy of today's check) is refused with that message.
- [x] Round trip: backup then restore gives an identical Session, including new fields.
- [ ] A real saved Session from `private-notes/saved-session.json` (counts only, not committed) loads, saves, and restores with identical Counts. The test is written (`test/local/saved-session.test.ts`) and skips where the file is absent. **Still to run:** no real saved Session exists yet; save a backup from the pilot phone, or copy the `stockcheck.session.v1` value, into that path and run `npm run test:local`.
- [x] A Session that was in progress when the new version arrives opens on Count with its Counts intact (end-to-end: seed the old shape, load the app).
- [x] Every existing test passes unchanged, except the two that assert the format number (written 1 → 2; the "newer format" example 2 → 3).

## T20: Wastage calculation and entry ⚪
**Delivers:** an optional Wastage entry on a Done Item, with Unexplained Variance and its flags worked out and shown on the Item's row.
**Depends on:** T19. **Main risk:** Wastage entered after Expected is visible can be back-solved to hide a shortage.

**Acceptance**
- [x] Domain: Unexplained Variance = Total Variance + Wastage, in integer thousandths. The spec example holds: Expected 100, Count 85, Wastage 10 gives Total −15 and Unexplained −5.
- [x] Wastage cannot be entered until the Item is Done, and is never in a total for an Uncounted or In progress Item.
- [x] Entry needs a reason (Expired, Damaged, Spoilt, Other plus a note), a paper-register reference, and the tick "This is NOT already deducted in Zobaze." Without all of them it is not saved. The quantity uses the Tally rules (non-negative, up to 3 decimals).
- [x] Wastage can be edited and removed. Removing it leaves the Count and the Total Variance as they were.
- [x] Flags, never blocks: Wastage that covers the whole shortage exactly; Wastage above the shortage; Wastage on an Item with a surplus; Wastage on an Item with a zero Total Variance. Each flag has plain wording on the row.
- [x] Entering Wastage bumps `changes` (so the Session Report shows "changed since the last report") and does not move `lastChangeAt`.
- [x] Wastage does not change Look Again, the Recount List, Net Variance Value or any existing figure.
- [x] Entry works with Items that are Duplicate Items and Items without a SKU. (Tested in the domain; the screen is the same for every Item.)
- [x] Existing tests pass unchanged. 320 px layout check for the entry form.

## T21: Wastage in the Session Report ⚪
**Delivers:** Wastage, Unexplained Variance, the flags, and Wastage and Unexplained Value in the Session Report and the report model.
**Depends on:** T20. **Main risk:** moving existing columns breaks reports that are combined outside the app.

**Acceptance**
- [x] New Variance Detail and Recount List columns go after the existing last column. No existing column moves or changes (a test pins the existing header order).
- [x] New columns: Wastage, Wastage reason, Wastage note, Register reference, Unexplained Variance (units), Wastage flags.
- [x] Summary: a Wastage block (Items with Wastage, Items with a Wastage flag, Wastage Value, Unexplained Value) after the last existing row, so no existing row moves. Net Variance Value and the Recount List are unchanged for the same Counts.
- [x] A Session with no Wastage gives exactly the report it always did, cell for cell: the new columns and the Wastage block appear only when the Session has Wastage. A test compares the raw sheet, style and workbook XML with a baseline captured before T21 (`test/fixtures/report-before-t21.json`, synthetic data).
- [x] Rows and totals come from `buildReport`, and a test shows the screen figure for T20 equals the report to the cent.
- [x] Only report-content tests change. (One T20 test, which compared whole reports, now compares them apart from the Wastage fields.)

## T22: Adjustments: derivation, statuses and transitions ⚪
**Delivers:** the domain rules for Adjustments with no screen: which Items have one, the net quantity and split, status transitions, and the log.
**Depends on:** T20. **Main risk:** the transition rules have many edge cases, and every one must be in a test before any screen uses them.

**Acceptance**
- [x] An Adjustment exists for every Done Item with a non-zero Total Variance and a readable Expected. Uncounted, In progress, zero-variance and unreadable-Expected Items have none. The count of Items left out is available.
- [x] Direction and quantity equal the Total Variance: ADD above Expected, REMOVE below. The split into documented Wastage and Unexplained is available.
- [x] No record means Pending. Allowed transitions only: Pending → Approved, Rejected, Held; Held → Pending, Approved, Rejected; Rejected → Pending (note required); Approved → Applied, or → Pending as a revoke (note required). Applied is final. Anything else is refused.
- [x] Every transition is appended to the log with an automatic timestamp and a typed name; an empty name is refused. Applied also records who applied it.
- [x] An ADD without a Supplier Document is Held and cannot be Approved. Adding the document lets it leave Held. (This Held is derived, not stored: it shows while the stored status is Pending. A person can also set Held, which is stored.)
- [x] Approval stores a snapshot: Total Variance, quantity, direction, Wastage split and Count at that time.
- [x] Applied requires a prior Approval and the Applied Check tick.
- [x] Workflow changes bump the adjustments-change marker, never `changes`, and never `lastChangeAt`.
- [x] Duplicate Items and Items without a SKU get separate Adjustments keyed by Item Key.
- [x] Negative System Stock and blank Expected Items produce the correct delta (Expected −5, Count 0 gives ADD 5), with their existing flags carried.
- [x] Existing tests unchanged.

## T23: Adjust tab: the list ⚪
**Delivers:** an "Adjust" tab showing every Adjustment with its split and status, filter and search, no editing yet.
**Depends on:** T22. **Main risk:** a fifth tab may not fit at 360 px, and a long list is slow on a cheap phone.

**Acceptance**
- [x] Bottom nav shows Count · Variance · Adjust · Report · How to count and fits at 360 px with no clipping, tested. If it cannot fit, the list is placed inside Report instead and the test says so.
- [x] Each row: name and Variant, SKU, Expected, Count, Wastage, Total Variance, Unexplained Variance, ADD or REMOVE with the quantity, status. ADD/REMOVE is in words and sign; green and red are only extra.
- [x] Duplicate Items show `#n` and cost; Items without a SKU show name plus Variant.
- [x] Export date shown prominently at the top. A line says how many Items were left out and why.
- [x] Status filter (All, Pending, Approved, Applied, Rejected, Held) and a search by name, Variant or SKU. The list is not capped at 20.
- [x] Wastage flags appear on their rows. ("Count changed" markers cannot exist until T25 adds the count-change handling; the row is ready for them.)
- [x] Works with no Session (not shown), with zero Adjustments (plain message), and while the Access Switch is suspended.
- [x] A test with a 1,000-Item Session keeps the list responsive (recorded in LEARNING.md). Rows are drawn 50 at a time with "Show 50 more"; filter and search reach every Adjustment.
- [x] All existing tests unchanged, including the 320 px layout test; the Adjust tab has its own 320 px check.

## T24: Approval and Applied flows ⚪
**Delivers:** the screen actions for every allowed transition, with the typed name, notes, Supplier Document, and the Applied Check.
**Depends on:** T23. **Main risk:** a record that looks like security when it is not.

**Acceptance**
- [x] Each allowed transition is available from the row; disallowed ones are not offered.
- [x] Buttons are labelled from the STORED status (`storedStatus`), not the displayed one. A row that shows Held only because its ADD has no Supplier Document (stored Pending) must not offer "Held → Pending"; it offers the Pending moves and asks for the Supplier Document.
- [x] Approve asks for an approver name (remembered names suggested) and takes the time from the device clock, shown but not editable. A warning shows if the name matches the Counter, which is kept on the Session (asked once at the first Approval, pre-filled on the Report screen). Approving never needs the Counter's name to differ.
- [x] An ADD asks for a Supplier Document; without one the row stays Held and Approve is unavailable.
- [x] Mark Applied needs the tick "I checked the current Zobaze balance and intervening movements", a typed name, and shows the Export date.
- [x] Revoke (Approved → Pending) and Reopen (Rejected → Pending) ask for a note. Reject, Put on hold and Back to Pending take an optional one.
- [x] A row's history (every transition, who, when, note) can be opened.
- [x] Names are remembered as suggestions only.
- [x] The text "a record, not security" is shown on the Approve action and in How to count (About).
- [x] Changes are saved and survive reload, restore and a second window.
- [x] Existing tests unchanged. (The bottom-nav label became "Help" in a separate commit, with the three tests that clicked it.)

## T25: Count changes and the review flag ⚪
**Delivers:** what happens to Adjustments when a Count changes or Done is removed, and the two ways to clear the review flag.
**Depends on:** T24. **Main risk:** silently changing an approval, or hiding a change after Applied.

**Acceptance**
- [x] Count changes after Approved: it returns to Pending with a "count changed" marker, and the old Approval stays in the history.
- [x] Count changes after Applied: the Applied record is untouched and the row shows "count changed after Applied, review". The flag stays until one of the two actions below is done.
- [x] Acknowledge, no action needed: needs a typed name and a note, adds an automatic timestamp, is logged, and clears the flag.
- [x] Raise a correcting Adjustment: creates a NEW Adjustment linked to the Applied one, with quantity = new Total Variance minus the quantity already applied (ADD if positive, REMOVE if negative). It goes through all statuses, the Applied Check and the Supplier Document rule. The flag clears when it is raised and the link is shown on both rows. If the difference is 0, only Acknowledge is offered.
- [x] Done removed: Pending and Held Adjustments and the live Wastage are dropped. Approved and Applied history stays, marked "count removed", with its snapshot and Wastage split.
- [x] An Applied record NEVER disappears from view. If a later count change drops its derived Adjustment (for example the Variance becomes zero, or Done is removed), the list still shows it, marked "count changed after Applied" (or "count removed"), with its history, until it is acknowledged or corrected. A test covers a Variance that becomes zero.
- [x] Records left by an older version are ignored when read: a Pending, Held or Rejected record with no Approval in its history is ignored if its Item is not Done, and an Approved record whose Count no longer matches is read as cancelled. Applied records and Approval history are always shown (see the line above).
- [x] Editing a Tally back to the approved value restores nothing automatically; the Adjustment stays Pending and needs approving again.
- [x] Existing tests unchanged. (Rows that need a review are listed first. Only a Count change cancels an Approval; a Wastage change does not. The Applied record's log gains an entry when it is acknowledged or corrected; its status and snapshot never change.)

## T26: Replace-guard for Adjustments ⚪
**Delivers:** the warning before a new Export or restore would destroy unapplied Adjustments.
**Depends on:** T25, T27 for the download button (build the guard with the button hidden, then enable it when T27 lands). **Main risk:** a regression in the existing reported-Session guard, which has e2e coverage.

**Acceptance**
- [ ] If any Adjustment is Approved but not Applied: the same pattern as unreported Counts. The Counter can download the Adjustment Report first, or discard with a second confirmation.
- [ ] If only Pending or Held Adjustments exist: a plain warning that they will be lost, with the same choices.
- [ ] Applied, Rejected and nothing-to-do Sessions are not blocked.
- [ ] Downloading the Adjustment Report clears the Approved-not-Applied block until a later workflow change. That uses the adjustments-reported marker, never the Session's `reportedChanges`.
- [ ] Both new Export and restore take this path, and `blockingSession()` also checks the saved copy.
- [ ] Not blocked while the Access Switch is suspended (restore stays allowed, as in ADR 0006).
- [ ] The existing guard tests (`guard`, `guard-installed`) pass unchanged.

## T27: Adjustment Report (Excel) ⚪
**Delivers:** "Generate Adjustment Report" downloads a separate Excel file and sets only the adjustments-reported marker.
**Depends on:** T24 (T25 for the history and flags). **Main risk:** the post-processing in `polish()` is tied to sheet numbers, and SheetJS Community cannot write colours.

**Acceptance**
- [ ] A separate workbook builder and file name (`stockcheck-adjustments-<branch>-<counter>-<date>-<time>.xlsx`).
- [ ] Sheet 1 Summary: Branch, Counter, Export file, Export date (prominent), generated time, counts by status, totals by ADD and REMOVE units and value, and the "record, not security" note.
- [ ] Sheet 2 Adjustments: one row per Adjustment with name, Variant, SKU or Key, `#n`, Expected, Count, Wastage, Total Variance, Unexplained Variance, ADD/REMOVE, quantity, status, approver, approval date and time, Supplier Document, Applied by and time, flags, link to a correcting Adjustment.
- [ ] Sheet 3 History: every logged transition and review action.
- [ ] ADD/REMOVE is written in words; green and red appear through a number format (for example `[Color10]+#,##0.000;[Red]-#,##0.000`) rather than cell styling that SheetJS cannot write.
- [ ] Quantities and money are numeric cells; bold header, frozen panes, filter, as in T15.
- [ ] The Session Report's `reportedChanges` is not touched, and the Session Report downloaded afterward is unchanged by this.
- [ ] Downloading works while the Access Switch is suspended.
- [ ] The existing Session Report builder and `polish` tests pass unchanged.

## T28: Cross-tab polish and documentation ⚪
**Delivers:** consistency across screens and files, the end-to-end walkthrough, and the docs.
**Depends on:** T21, T26, T27. **Main risk:** small inconsistencies between the Variance tab, Adjust tab and the two Excel files.

**Acceptance**
- [ ] Variance tab and Report screen show Wastage Value and Unexplained Value as new lines; Net Variance Value is unchanged.
- [ ] A test proves the Adjust tab totals equal the Adjustment Report to the cent, and the Session Report's new lines equal the Variance tab.
- [ ] How to count gains a short Wastage and Adjustments section, not a numbered instruction, so the "10 instructions" test is unchanged. About states Approval is a record, not security.
- [ ] End-to-end walkthrough: count, Done, Wastage, Approve, Applied, change a Count, review flag, correcting Adjustment, Adjustment Report, restore on a second phone.
- [ ] 320 px and 360 px layout checks for every new screen. Offline test covers the Adjust tab.
- [ ] SPEC.md updated for the new sections; LEARNING.md records measured sizes; ADR 0007 status set to `accepted`.
- [ ] Pilot regression: the Session Report from a fixed Session with no Wastage matches the pre-change report apart from empty new columns.
