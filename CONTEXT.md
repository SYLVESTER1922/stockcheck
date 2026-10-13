# StockCheck

A stocktake tool for the branches of a retailer using Zobaze POS. Counters load the Zobaze inventory export, record physical counts by searching item names, and see how far the system's stock is from reality, in units and in USD at cost.

## Language

### Source data

**Export**:
The inventory spreadsheet downloaded from Zobaze POS for one branch, listing every Item with its Expected quantity and cost price.
_Avoid_: Stock list, inventory file, upload

**Item**:
One sellable product line in the Export, identified by its Item Key.
_Avoid_: Product, row, SKU

**Item Key**:
What identifies an Item. Its SKU, if the SKU is filled in and unique within the Export. Otherwise its ITEM_NAME and Variant, compared ignoring case, leading/trailing spaces and repeated spaces.
_Avoid_: ID, barcode

**Variant**:
The VARIANT_NAME part of an Item, such as a pack size ("2kg", "Bale"). Each Variant is a separate Item with its own Expected and its own Count. Variants are never converted into each other. A blank Variant is valid.
_Avoid_: Size, unit, pack

**Duplicate Item**:
One of two or more Export rows that share an Item Key. Each is kept as its own Item, numbered #1, #2… in Export order, and shown with its cost price so a counter can tell them apart.
_Avoid_: Merged item

**Expected**:
The quantity of an Item that Zobaze believes is on hand, as given in the Export. May be negative or fractional.
_Avoid_: Stock, system stock, book quantity

**Negative System Stock**:
An Item whose Expected is below zero. Usually a receiving or paperwork problem rather than a counting problem, so it is flagged separately.

### Counting

**Counter**:
The one person who counts a branch during a Session.
_Avoid_: User, staff, operator

**Stocktake**:
The whole exercise of counting every Item in one branch. It may take several days, and it is made up of one or more Sessions.
_Avoid_: Audit, count

**Session**:
One Export plus the Counts entered against it, in one sitting on one phone, within one Counting Window. Loading a new Export ends the Session and starts a new one with no Counts.

**Counting Window**:
A period when the branch is closed to trading. It starts by loading the Export and ends when counting finishes. Every Session happens inside one Counting Window. This is an operating precondition of the process, confirmed with the client, not an assumption.
_Avoid_: Shift, count time
_Avoid_: Day, stocktake

**Session Report**:
The Excel file downloaded at the end of a Session. It names the Export it was measured against, and lists every Item as counted or Uncounted, with Variances and Variance Values. The collected Session Reports are the Stocktake's record of what has been counted.
_Avoid_: Export (that word is reserved for the Zobaze file)

**Uncounted**:
An Item with no Count in the current Session. This is different from a Count of 0, which means the Item was counted and none were found. An Uncounted Item has no Variance and no Variance Value, and is never included in totals.
_Avoid_: Zero, missing

**Reported Session**:
A Session whose latest Counts are all in a downloaded Session Report. Editing any Count afterwards makes it unreported again. A Session ends when it is reported (or explicitly discarded) and a new Export is loaded. If one Session produced several reports, the newest is the true one.
_Avoid_: Finished, closed, locked

**Backup**:
A file holding one complete Session, used to rescue an interrupted sitting or finish it on another phone. Restoring a Backup replaces the current Session. It contains cost prices and stock values, so it goes only to the manager.
_Avoid_: Save file, export (that word is reserved for the Zobaze file)

**Finished Stocktake**:
Every Item has been counted in at least one Session Report. Where an Item was counted in several Sessions, the latest Count stands. The business judges this from the reports; the app does not track it.

**Count**:
The physical quantity of an Item in the whole branch for this Session: the sum of its Tallies. Zero or more, with up to 3 decimal places.
_Avoid_: Qty, actual, physical stock

**Tally**:
One number entered for an Item, usually from one paper sheet or one location (for example, shelf 12, storeroom 24). A new entry for an Item that already has a Count adds a Tally rather than replacing the Count. Any Tally can be corrected or removed.
_Avoid_: Entry, line, part

**Variance**:
Count minus Expected for one Item. Negative means less on the shelf than the system expects (shrinkage). Positive means more.
_Avoid_: Difference, discrepancy

**Variance Value**:
An Item's Variance multiplied by its cost price, in USD.
_Avoid_: Loss, shrinkage value

**Large Variance**:
A Variance big enough, in dollars or in units relative to Expected, to be worth a second look. The thresholds are set by the business and tuned from pilot results.
_Avoid_: Big difference, outlier

**Look Again**:
The note shown on an Item's row when a committed Tally leaves it with a Large Variance, asking the Counter to check other storage places (shortage) or an unbooked delivery (surplus).
_Avoid_: Alert, warning, popup

**Recount List**:
The Items in a Session with a Large Variance, listed in the Session Report for a follow-up count.
_Avoid_: Exceptions, problem list

**Count at Look Again**:
An Item's Count at the moment Look Again first fired for it, kept so the Session Report can show what a second look changed. Items that never prompted have none.
_Avoid_: First count, original count

**Count at Done**:
An Item's Count the first time the Counter marked it Done, before Expected was revealed. Kept even if Tallies are later edited or removed, so the Session Report shows the blind count next to the final one.
_Avoid_: First count, original count

### Adjustments

**Total Variance**:
Another name for Variance, used next to Unexplained Variance. It is Count minus Expected, and nothing in the app or the Session Report is renamed: "Variance" still means Total Variance.

**Wastage**:
A quantity of an Item that was thrown away, spoilt or damaged and was NOT already deducted in Zobaze. Optional, entered per Item after it is Done, never before. It needs a reason (Expired, Damaged, Spoilt, or Other with a note), a paper-register reference, and a tick confirming it is not already deducted in Zobaze. Zero or more, with up to 3 decimal places, like a Tally.
_Avoid_: Loss, shrinkage (those are the Variance), write-off

**Unexplained Variance**:
Total Variance plus Wastage. Example: Expected 100, Count 85, Wastage 10 gives Total Variance −15 and Unexplained Variance −5. It is what is left after documented Wastage. An Item with Unexplained Variance of 0 is fully accounted for.
_Avoid_: Real shortage, true variance

**Wastage Flag**:
A note shown, never a block, when Wastage covers the whole shortage or is larger than it, or is entered on an Item with a surplus or a zero Total Variance. These need a manager's attention because Wastage would make the gap bigger, or explain a gap that is not there. Shown in the Adjustment list and in the Session Report.

**Adjustment**:
A recommendation to correct one Item's balance in Zobaze by hand. It exists for every Done Item with a non-zero Total Variance, and its quantity equals the Total Variance: ADD when the Count is above Expected, REMOVE when below. It is one net quantity, because that is what staff type into Zobaze. The Wastage and Unexplained parts are shown beside it so staff can put them in Zobaze's note field. Netrisyl never changes Zobaze: staff make the change themselves and then mark the Adjustment Applied.
_Avoid_: Correction, fix, stock update

**Adjustment Status**:
One of Pending, Approved, Applied, Rejected or Held. An Item with no record is Pending. The only moves allowed:
- Pending → Approved, Rejected or Held.
- Held → Pending, Approved or Rejected.
- Rejected → Pending (needs a note).
- Approved → Applied, or back to Pending (a revoke, needs a note).
- Applied is final. A mistake is fixed by a new, correcting Adjustment.

Applied requires Approved first. Every move is logged with a timestamp and a typed name.
_Avoid_: State, stage

**Supplier Document**:
The invoice or delivery note number that supports an ADD Adjustment. An ADD without one is Held and cannot be Approved, so a surplus that nobody can explain is never added to Zobaze silently.

**Approval**:
A manager's recorded agreement that an Adjustment should be made in Zobaze. It stores the approver's typed name, the date and time from the phone's clock (not editable), and a snapshot of the quantities approved. It is a record, not security: anyone holding the phone can type a name, and a Backup can be edited. A warning shows if the approver's name matches the Session's Counter name, which is kept on the Session and asked for once, at the first Approval. It is a warning only, never a block.
_Avoid_: Sign-off, authorisation

**Changed Count**:
An Item's Count changing after its Adjustment was Approved or Applied.
- If Approved, the Approval is cancelled at once and the Adjustment goes back to Pending. StockCheck logs this itself (no person), with both Counts, and the old Approval stays in the history. Editing the Tally back restores nothing.
- If Applied, the record is never changed. The row shows the figures as they were applied and a "Count changed after Applied: review" flag, which stays until management either acknowledges it or raises a Correcting Adjustment. An Applied row never disappears, even if the Variance becomes zero or Done is removed ("Count removed after Applied").
- If Done is removed, the Item's Pending and Held Adjustments and its live Wastage are dropped. Approved and Applied history is kept, marked "count removed", with the Approval snapshot and Wastage split.

**Correcting Adjustment**:
A new Adjustment linked to an Applied one, raised when the Count changed after Applied. Its quantity is the new Total Variance minus everything already applied for the Item. It goes through the same statuses, Applied Check and Supplier Document rule as any Adjustment. The Applied record is never edited.

**Applied Check**:
The tick required to mark an Adjustment Applied: "I checked the current Zobaze balance and intervening movements." The Export date is shown prominently on the Adjust tab and in the Adjustment Report, because the quantity is a difference measured against that Export.

**Adjustment Report**:
The separate Excel file made from the Adjust tab: a Summary (with the Export date), one row per Adjustment, and an Adjustment History of every move. It records who approved and applied each Adjustment, any change of Count after Applied, and correcting links. It is a record, not security. It does not make the Session a Reported Session, and it has its own marker: downloading it clears the replace-guard for what it covers, until the next Adjustment change.
_Avoid_: Session Report (that one is about Counts)

### Access

**Access Switch**:
Netrisyl's ability to suspend the starting of new Sessions, for non-payment, for breach of the agreement, or as an emergency stop. It never affects a Session already in progress: that can always be finished, backed up and exported. The client is told about it up front.
_Avoid_: Kill switch, licence lock

**Status File**:
The small file Netrisyl publishes alongside the app that says whether new Sessions are allowed, and the message (with Netrisyl contact details) to show when they are not.
_Avoid_: Config, flag
