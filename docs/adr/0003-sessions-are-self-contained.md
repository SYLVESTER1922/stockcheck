---
status: accepted
---

# Each Session is self-contained: a new Export clears all Counts

A Stocktake can take several days, and the shop trades in between, so an Export goes stale. Rather than carry Counts across Exports, each Session is one Export plus the Counts entered against it. Variance is always Count minus the **current** Export's Expected. Loading a new Export starts a new Session with no Counts. The Counter keeps track of what has been counted across days through the downloaded Session Reports, not inside the app.

**Operating precondition (confirmed with the client):** counting happens only while the branch is closed to trading, in a Counting Window. The Export is loaded right before counting starts. Counting is usually directly on the phone (or on paper, typed in the same day).

## Considered options

- **Each Count stores the Expected that was live when it was entered,** so Counts survive a reload and earlier Variances stay correct. Rejected: more state to store and explain, and it ties a Stocktake to one phone. Self-contained Sessions let the Counter use any phone on any day.
- **Recompute old Counts against the newest Export:** rejected. This is silently wrong. A Monday Count of 18 against Expected 20 (−2) would become +3 against Tuesday's Expected of 15.
- **The app keeps a "done list" across reloads:** rejected for v1. It brings back phone-bound state. Rebuilding it from imported Session Reports is parked in IDEAS.md.

## Consequences

- **Loading a new Export destroys the current Session's Counts.** The app must refuse to load over a Session with Counts until its Session Report has been downloaded, or until the Counter explicitly chooses to discard it.
- Stocktake totals across days are built outside the app, by combining Session Reports.
- Sales or deliveries between loading the Export and counting would show up as false Variance. The Counting Window precondition rules out sales. A delivery that arrives while the branch is closed is still possible, because deliveries have no fixed time; Look Again's surplus text points at it. The Session Report header shows when the Export was loaded and when counting finished, so a reader can see if a Session overlapped trading.
- Because Items appear in several places (shelf, storeroom) and the layout cuts across categories, one Item can appear on several paper sheets in the same Session. How those are entered is decided separately.
