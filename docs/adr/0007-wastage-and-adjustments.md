---
status: proposed
---

# Wastage and Adjustments: recorded in the Session, applied by hand in Zobaze

Counters find Variances that are partly explained by known Wastage (expired, damaged) that staff never deducted in Zobaze. Management also needs a list of what to correct in Zobaze, who agreed, and whether it was done. Both are added to the existing pilot without a server, without any Zobaze connection, and without disturbing Sessions already in progress.

## Decisions

### Calculations
- **Total Variance** = Count − Expected (unchanged, still called "Variance" everywhere). **Unexplained Variance** = Total Variance + Wastage. Wastage is a non-negative quantity in thousandths, entered like a Tally.
- **The Adjustment quantity equals Total Variance**, not Unexplained Variance. Zobaze has not deducted the Wastage, so the balance must still be corrected by the full difference. It is ONE net ADD or REMOVE per Item, because that is what staff type. The split ("of which documented Wastage X, unexplained Y") is shown on the row and in the report.
- **Net Variance Value and the Recount List stay on Total Variance.** Wastage Value and Unexplained Value are added as new lines only. Wastage is entered after Done, so it cannot affect Look Again, which preserves ADR 0004.
- **Which Items get an Adjustment:** Done Items with a non-zero Total Variance and a readable Expected. Items that are Uncounted, In progress, or have an unreadable Expected never do. The tab says how many Items were left out.

### Wastage entry
- Optional, only after the Item is Done (Expected is visible by then, so Wastage could be back-solved to hide a shortage; the safeguards below are the answer to that).
- Requires a reason (Expired, Damaged, Spoilt, Other + note), a paper-register reference, and a tick: "This is NOT already deducted in Zobaze." No reason-code system.
- **Flagged, never blocked,** when Wastage covers the whole shortage exactly, exceeds the shortage, or is entered on an Item with a surplus or a zero Total Variance. The flags show in the Adjustment list and the Session Report.

### Statuses and approval
- Statuses: Pending (no record), Approved, Applied, Rejected, Held. Allowed moves are listed in CONTEXT.md; Applied is final, and a mistake needs a new correcting Adjustment. Applied requires Approved. Every move is logged with a timestamp and a typed name, including who applied it.
- **ADD needs a Supplier Document** (invoice or delivery note number). Without one the Adjustment goes to Held and cannot be Approved.
- **Approval** records the approver's typed name (remembered names are suggestions) and the date and time from the device clock, which cannot be edited. It stores a snapshot of the approved quantities. A warning shows if the approver's name matches the Counter (see "The Counter's name" below).
- **Marking Applied** requires the tick "I checked the current Zobaze balance and intervening movements". The Export date is shown prominently on the tab and in the report, because the quantity is a delta against that Export. A delta stays correct when sales happened after the Export; an absolute "set to" figure would not.
- **The Counter's name** is kept on the Session (`counter`, optional, empty until known) so the approver warning has something to compare with.
  - It is asked for once, in the first Approval form of a Session while it is still empty, and may be left empty. It is never guessed: the remembered names are suggestions only.
  - The Report screen starts with it, and the name typed there when a report is downloaded is kept on the Session.
  - The warning compares the approver with it, ignoring case and spacing. It is a warning only, never a block.
  - Setting it moves no marker: it is not a Count change and not an Adjustment change, so a reported Session stays reported.
- **This is a record, not security.** Names are typed on a phone and the Backup is a JSON file anyone can edit. The docs and the About text say so.

### Count changes
- **Approved, then the Count changes:** it goes back to Pending at once, and an automatic entry (no person, `by` empty) is added to its log with the Count at the Approval and the Count now. The old Approval and its snapshot stay in the log. A "the Approval was cancelled because the Count changed" marker shows until a new decision is made. Editing the Tally back restores nothing: it needs approving again. Only a change of the Count cancels an Approval; a change of Wastage does not, because the quantity staff apply is the same.
- **Applied, then the Count changes:** the Applied record's status and snapshot, and everything already in its log, are never changed. The row keeps showing the figures as they were applied, and a "Count changed after Applied: review" flag is DERIVED: the Count when it was applied differs from the Count now, and nobody has reviewed that Count. The flag stays until one of two actions is taken. Each needs a typed name and a note, gets an automatic timestamp, and is logged by appending an entry to the Applied record's log (the entry records which Count was reviewed):
  - **Acknowledge, no action needed:** records that management reviewed it.
  - **Raise a correcting Adjustment:** creates a NEW Adjustment (id `<Item Key>~2`, `~3`…) linked to the Applied one. Its quantity is the new Total Variance minus everything already applied for the Item (ADD if positive, REMOVE if negative). It goes through Pending, Approved and Applied like any other, including the Applied Check and the Supplier Document rule for an ADD. If the difference is 0, only Acknowledge is offered. The link is shown on both rows. The Wastage split is not shown on a correcting Adjustment.
  - Only the latest Applied Adjustment of an Item is flagged, and not while a correction raised for it is still open (Pending, Held or Approved). If the Count changes again after a review, the flag comes back. If the Count returns to the Count that was applied, the flag goes away by itself.
- **An Applied record never disappears from view.** If a count change drops its derived Adjustment (the Variance becomes zero, or Done is removed), it is still listed, as applied, flagged "Count changed after Applied" or "Count removed after Applied". Rows that need a review are listed first, and the tab says how many there are.
- **Done removed (the last Tally goes):** Pending, Held and Rejected Adjustments are dropped, and so is the live Wastage. An Approval that was Approved at that moment goes back to Pending with an automatic entry, and its history is kept as a history-only row marked "count removed", with its snapshot and Wastage split. The same goes for a Pending Adjustment that already has an Approval in its history. An Applied record gets an automatic "count removed" note on its log and stays as above. A history-only row offers nothing but its History.
- **Counted again after a removal:** the Item gets a fresh Adjustment, Pending, never approved by itself. A history-only row from before is not brought back.
- **Records left by an older version are ignored when read:** a Pending, Held or Rejected record with no Approval in its history is ignored if its Item is not Done. An Approved record whose Count no longer matches its snapshot (an older version edited the Tally and did not cancel it) is read as cancelled, without changing the Session. Applied records and Approval history are always shown.

### Data and compatibility
- **Same storage:** the same `localStorage` document, the same key `stockcheck.session.v1`. The key is NOT bumped, because that would orphan a Session already in progress on a phone. New fields (Wastage, Adjustment records and logs, the adjustments-reported marker) are optional and get empty defaults when a saved Session is loaded.
- **Restore applies the same defaults.** Today restore returns the file's Session as it is. New fields must not be required by the damage check.
- **Optional fields need no format bump.** Format 2 has not shipped, so the Counter's name (added after the other new fields) went into it. In general an optional field that the loader defaults, on load and on restore, can be added to a format without a bump. A bump is for a change an older reader would misread.
- **Backup format 2.** The app reads formats 1 and 2. Format 1 backups and old saved Sessions load unchanged. A format 2 backup shown to an app version that only knows 1 fails with the existing clear "newer version, update the app" message. Writing 2 always is simpler than switching by content, so a phone that has not updated cannot silently drop approvals.
- **Verified with a real saved Session fixture** kept in `private-notes/` (counts only, never committed), as well as synthetic fixtures in the repository.
- **Existing Session Report columns do not move.** New columns go at the right end, because the collected reports are combined outside the app.
- **Nothing derivable is stored.** Total Variance, Unexplained Variance, the ADD/REMOVE direction and the quantity are recomputed. Stored are only: Wastage entries, Adjustment records (status, approvals with snapshots, notes, Supplier Document, history), and markers.

### Markers and guards
- Wastage entry bumps `changes`, so the Session Report shows "changed since the last report", but it does not move `lastChangeAt` ("Counting finished").
- Adjustment workflow changes use a separate change counter and a separate "adjustments reported" marker. They never make the Session Report look out of date.
- **Replacing the Session** (new Export or restore):
  - If any Adjustment is Approved but not yet Applied: the same guard pattern as unreported Counts. Download the Adjustment Report first, or discard with a second confirmation.
  - If only Pending or Held Adjustments exist: a plain warning.
- **Access Switch (ADR 0006) is untouched.** The Adjust tab, Wastage entry, the Adjustment Report and restore all work while new Sessions are suspended. Nothing here calls a network.

### Report and screen
- **The Adjustment Report is a separate Excel file.** It does not mark the Session as reported and has its own marker. It shows Export date, status, split, history and the flags. ADD/REMOVE is always written in words and signs; colour (green add, red remove) is only an extra.
- **The Adjust tab** is a fifth bottom tab if it fits at 360 px, verified in a layout test; if not, it goes inside Report. It has a status filter and search, and each row shows the cost and `#n` for Duplicate Items, and name plus Variant for Items without a SKU.
- Netrisyl never updates Zobaze and never calls its API. The app stays offline and phone-based.

## Considered options

- **A separate store for Adjustments, apart from the Session:** rejected. It would break "a Session is self-contained" (ADR 0003) and make Backups incomplete.
- **Quantity = Unexplained Variance:** rejected. The Wastage was never deducted in Zobaze, so Zobaze would stay wrong by exactly that amount.
- **Block Wastage that exceeds the shortage:** rejected. There are valid cases, such as an unbooked delivery. Flagging puts it in front of the manager without stopping the Counter.
- **Typed approval date:** rejected. A device-clock timestamp that cannot be edited is a stronger record than a typed one.
- **Bump the storage key to v2:** rejected. It strands Sessions already in progress.
- **PIN or login for approvers:** rejected for now. There is no server, so it would be theatre. The records are labelled as records.

## Consequences

- **Loading a new Export destroys the Adjustments too** (ADR 0003). The guard and the Adjustment Report are the protection. Staff should apply the Adjustments in Zobaze before the next Export is loaded, so the new Expected includes them.
- A phone running an older version can open a Session that has Adjustments. It will not clean up after a Tally edit or removal, so the read-side rules above are what keep the data sound.
- Backups now also hold typed names, so they remain for the manager only.
- The Session Report and the Adjustment Report can disagree if the Counts change between downloading them. Each carries its own generated time.
- All figures on screen and in the files come from one builder, like the Variance tab (T17), so they cannot disagree.
