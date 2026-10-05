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
