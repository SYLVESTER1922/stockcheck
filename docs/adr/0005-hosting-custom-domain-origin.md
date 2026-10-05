---
status: accepted
---

# Hosted on GitHub Pages at https://stockcheck.netrisyl.com/, served from the domain root

The app is a static build deployed by GitHub Actions from the `SYLVESTER1922/stockcheck` repository to GitHub Pages, on the custom domain `stockcheck.netrisyl.com`, served from the root path (`/`, so Vite's `base` is `/`).

**The origin `https://stockcheck.netrisyl.com` is where every Counter's data lives** (ADR 0002). Browser storage, the installed home-screen app and the service worker all belong to that exact origin. **It must never change after the pilot.** Moving to another domain, subdomain, or to `http` would make every phone's saved Session and installed app look empty, with no way to migrate them except Backups.

**HTTPS is required.** Service workers (needed for offline use) only run in a secure context, and Pages' "Enforce HTTPS" also stops anyone opening the `http` origin by accident, which has separate storage.

## Considered options

- **`https://sylvester1922.github.io/stockcheck/`:** rejected. The origin would be tied to a GitHub username and a sub-path (needing `base: '/stockcheck/'`). Moving to a custom domain later would orphan Counters' data.
- **Another static host (Netlify, Cloudflare Pages):** not needed. GitHub Pages is free, and the code is already on GitHub.

## Consequences

- DNS: `stockcheck.netrisyl.com` has a CNAME record pointing to `sylvester1922.github.io`. The custom domain is set in the repository's Pages settings. With GitHub Actions deployments, my understanding is that a `CNAME` file in the build is not used, so the setting is the source of truth. Verify this at setup.
- Verify `netrisyl.com` in the GitHub account's Pages settings, so no other GitHub account can claim the subdomain if the Pages site is ever unpublished.
- If the domain lapses, the app and every Counter's data on it are lost to Counters. Keep the domain renewed.
