---
status: accepted
---

# Expected is hidden while a Tally is entered, and revealed on commit with a "look again" prompt

The Counter usually works alone for days, counting directly on the phone. If Expected is visible while counting, it becomes a target: it is easy to count toward it, or to stop once the number "looks right". So while a Tally is being entered (typing or +/− taps, which start from 0), Expected is hidden. When the Tally is committed, the row reveals Expected, Count, Variance and Variance Value. If the Variance is large, a "look again" prompt appears:

- **Shortage:** "Check every place this item could be stored."
- **Large surplus:** "Possible delivery not booked in Zobaze."

The Counter may change or add Tallies after looking again. The Item's Count at the moment Look Again first fired is kept as its Count at Look Again, and the Session Report shows it next to the final Count. Prompted Items that end exactly at Expected are flagged for the manager to ask about. **The audit value of the app comes from this prompt:** the report shows where a second look changed the number and where it didn't.

## Considered options

- **Show Expected throughout, with a one-tap "Count = Expected" button and +/− starting from Expected** (the prototype): rejected. Every shortcut lets a tired Counter record Expected instead of what's there, which shows Variance 0 and hides losses.
- **Fully blind until the Session is reported:** rejected. It loses live Variance, and with it the chance to look again while standing at the shelf.

## Consequences

- Once one Tally is committed for an Item, the Counter has seen its Expected. A second Tally for the same Item (another location) is no longer blind. This is accepted as a known limitation.
- The large-Variance threshold also drives the Recount List, so the two are one rule.
