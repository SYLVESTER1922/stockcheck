---
status: accepted (amended 2026-10-05: a Session is one sitting, not multi-day; see ADR 0003)
---

# A Session lives on one phone, in browser storage, with manual backups

One Counter enters a Session on one phone. Different Sessions in the same Stocktake may use different phones. There is no server and no sync, so the current Session (the Export's Items plus every Count) is kept in that phone's browser storage until its Session Report is downloaded. A JSON backup lets the Counter save and restore an unfinished Session.

## Considered options

- **Several phones per Session, merged by file:** rejected for v1 (parked in IDEAS.md). It needs a file format, an import step, and rules for overlapping Counts.
- **A server or cloud sync:** rejected by the product constraints ($0 hosting, no login, bad signal).

## Consequences: storage risks

Because a Session is one sitting (ADR 0003), these risks now threaten one sitting's typing, not several days of work. They still matter if a sitting is interrupted.

Browser storage belongs to an **origin** (scheme + host + port), inside **one browser** on **one phone**. Anything that changes one of those makes the Session look empty, even though the data still exists somewhere else.

- **Always open the same URL.** `https://x.github.io/stockcheck` and a custom domain, or `http` and `https`, are different origins with separate storage.
- **Always open it the same way, ideally from the installed home-screen icon.** Opening the link inside WhatsApp's built-in browser, or in a different browser, uses different storage. On iPhones, a home-screen app's storage is separate from Safari's even for the same URL.
- **Storage can be wiped without warning:** by "clear browsing data", by cleaner apps, or by the browser evicting data when a cheap phone runs low on space. Safari can also delete storage for sites not visited for 7 days. The app should ask the browser to mark its storage as persistent, but the browser can refuse.
- **If a sitting is interrupted, take a JSON backup before leaving it,** and send it off the phone if a different phone will finish the Session.
