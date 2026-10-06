---
status: accepted
---

# Access Switch: a disclosed, fail-open pause on new Sessions, never on existing data

Netrisyl needs a way to stop new counts, both for non-payment and as an emergency stop when a release is found to be wrong. The app has no server, so the switch is a small **Status File** on the app's own origin (`/status.json`), which the app checks when online. While it says `disabled`, **only starting a new Session (loading an Export) is blocked**. A Session in progress can always be counted, finished, reported, backed up and restored. The switch never deletes or locks a Counter's data. The client is told about it up front.

## Decisions

- **Purpose:** licence (non-payment) and emergency stop. The reason text comes from the file; the app always appends built-in Netrisyl contact details, so a bad file can't leave a Counter without a way to reach Netrisyl.
- **Fail-open, with a sticky explicit answer.** Only a valid `disabled` suspends, and only a valid `enabled` lifts. No signal, a check over 3 seconds, 404, server errors and malformed files are "no answer" and change nothing. A phone that has never received an answer is allowed. A failed or slow check can therefore never block a Counter who wasn't explicitly suspended.
- **When it checks:** on open, on return to the foreground, and right before an Export is loaded.
- **Mid-count:** the open Session is untouched. A calm notice says new counts are paused and this one can be finished, reported and backed up.
- **Restore stays allowed** while suspended, because a backup is an existing Session. This deliberately leaves a loophole (restoring an old backup) rather than risk locking a Counter out of their data.
- **Delivery:** `public/status.json` in this repository, switched by a one-line edit and a push. It is never precached by the service worker, and it is fetched with `no-store` and a cache-busting query. The app version is taken from the last commit that changed app code, so a status-only push doesn't trigger the "new version" banner. CI runs in full on status pushes, and a test validates the file's format. Expected time to take effect: about 5–15 minutes after the push (to be measured).
- **Message display:** plain text only, capped at 300 characters, with a default when empty.
- **Disclosure:** an About section at the end of the How to count screen states the switch exists and what it never affects.

## Considered options

- **Fail-closed** (block when the check fails): rejected. A storeroom with bad signal would block legitimate Counters.
- **Always allow when there's no answer** (non-sticky): rejected. Airplane mode would defeat a suspension.
- **Status file on another origin** (e.g. the Netrisyl website): rejected. It would need cross-origin requests and a second deployment to keep in step.
- **Blocking restores or locking the open Session:** rejected. Either could stop a Counter finishing or exporting their own work.
- **An undisclosed switch:** rejected. The request is visible in the app's code, so it would be found, and finding it would damage trust.

## Consequences

- **This is a deterrent, not a lock.** A phone that stays offline, or a technical user who blocks or edits the request, can keep starting Sessions. That is acceptable for a disclosed business term. Hard enforcement would need a server, which the product rules out.
- **Emergency stops can fix calculation bugs but not import bugs by update alone.** Variances are recalculated by the new code after an update, so the message can say "update the app, then download the report again". Items are stored as they were read from the Export, so an import bug needs a migration in the fix release, or a new Export (new Session). The emergency message should say which.
- The Status File is public, like the rest of the site, so its message must never contain anything private.
