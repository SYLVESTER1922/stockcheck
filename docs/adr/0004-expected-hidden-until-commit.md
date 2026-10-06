---
status: accepted
---

# Expected is hidden while a Tally is entered, and revealed on commit with a "look again" prompt

The Counter usually works alone for days, counting directly on the phone. If Expected is visible while counting, it becomes a target: it is easy to count toward it, or to stop once the number "looks right". So Expected stays hidden until the Counter says the Item is finished. Each entry has two buttons:

- **Another place** adds the Tally and keeps Expected hidden, showing only the parts so far ("4 + …").
- **Done** adds the typed Tally (if any) and finishes the Item. Only then does the row reveal Expected, Count, Variance and Variance Value.

A single-location Item costs the same taps as before (type, Done). A multi-location Item costs one tap per extra place. If the Variance is large when the Item is finished, a "look again" prompt appears:

- **Shortage:** "Check every place this item could be stored."
- **Large surplus:** "Possible delivery not booked in Zobaze."

Two further rules (2026-10-05):

1. **In progress.** An Item with Tallies but no Done is shown as "in progress" in the app, and flagged IN PROGRESS in the Session Report, so a forgotten Done is never mistaken for a finished count. Its Variance is left blank in the report and it is excluded from totals and the Recount List.
2. **Edits after Done.** Editing or removing a Tally after Done is allowed. Count at Look Again, once recorded, is never overwritten or cleared by later edits or removals, so the audit trail survives.

The Counter may change or add Tallies after looking again. The Item's Count at the moment Look Again first fired is kept as its Count at Look Again, and the Session Report shows it next to the final Count. Prompted Items that end exactly at Expected are flagged for the manager to ask about. **The audit value of the app comes from this prompt:** the report shows where a second look changed the number and where it didn't.

## Considered options

- **Show Expected throughout, with a one-tap "Count = Expected" button and +/− starting from Expected** (the prototype): rejected. Every shortcut lets a tired Counter record Expected instead of what's there, which shows Variance 0 and hides losses.
- **Fully blind until the Session is reported:** rejected. It loses live Variance, and with it the chance to look again while standing at the shelf.

## Consequences

- A Tally added *after* Done is not blind: the Counter has seen Expected. This is the intended Look Again flow (go and look, add what you find). Counters who know an Item is in several places should use Another place before Done.
- The large-Variance threshold also drives the Recount List, so the two are one rule.
