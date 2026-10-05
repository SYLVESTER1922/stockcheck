# Ideas (not approved for the build)

Parked ideas. Nothing here gets built unless it is explicitly promoted into the spec.

- **Unlisted Item entry:** the Counter types a free-text name and quantity for stock that isn't in the Export. It goes on its own sheet in the Session Report, with no Expected, cost or Variance. Rejected for v1 (Q13): the paper list covers it. **Trigger: build this if the pilot's paper list of unlisted items is more than a handful, or if the manager asks for it.**
- **Zobaze data clean-up:** fill SKUs and fix the duplicate rows. Needs client consent, a backup Export, and a one-item test first. Do it between stocktakes, not during one, because adding a SKU changes an Item's key (see ADR 0001).
- **Multi-device Sessions:** split one branch across several phones and merge their Counts by file. If two phones count the same Item, add the Counts and flag the overlap. Rejected for v1 (Q5): one Counter per branch is enough, and merge adds a file format, an import step and overlap rules.
- **Stocktake progress from Session Reports:** import earlier Session Reports so the app marks Items already counted on previous days, and/or totals Variance across the whole Stocktake. Rejected for v1 (Q7): the paper sheets and Session Reports are the record.
- **Manual column picker:** when a required header doesn't match any known alias, let the Counter choose which column is Expected or cost price instead of refusing the file. Rejected for v1 (Q11): new UI, and the refusal message plus an alias update covers it.
- **Text-number parsing:** read text cells like `$1,200.50`, `1,200` and `12 pcs` as numbers, with commas accepted only as strict thousands separators (rules and examples from Q12). Cut from v1 because the client's real Export has no text cells in STOCK or COST_PRICE; v1 treats any text cell as unreadable. Build for a future client whose export has text numbers.
- **PDF Session Report:** rejected for v1 (Q8). It needs either a PDF library (extra weight on cheap phones) or the browser's print-to-PDF, which is unreliable across Android phones. PDFs also can't be summed across Sessions.
- **Pack conversion between Variants:** for example, 1 Bale = 10 × 2kg, so a counter can count in either unit. Would need a pack-ratio source the Export doesn't have. A wrong ratio would distort Variance Value.
