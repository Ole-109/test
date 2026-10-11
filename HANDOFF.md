# Waypoint – Handoff

This file is the context for a new chat. Read it first, then `README.md`.

## What the app is

**Waypoint** is a web app with two parts: a Genshin Impact account tracker and an anime manager.
- UI in English and German. All files are UTF-8; keep it that way, since the German text has umlauts.
- No server and no login. All data stays in the browser (`localStorage`, key `waypoint:v1`). Backup and restore are under Settings.
- Stack: Vite 6, React 19, TypeScript, Vitest, lucide-react icons. There are no other runtime dependencies.
- Repo: `Ole-109/test`. GitHub Pages deploys on pushes to `main` (`.github/workflows/deploy.yml`).

### Genshin part (the "Teyvat" tabs)
- **Today**: live resin, daily/weekly/monthly routines with the correct 04:00 server resets, cooldowns.
- **Characters**: every playable character with level, constellations, talents, weapon and build. Filled in by imports and by the wish history ("roster sync").
- **Inventory**: weapons, artifacts (with crit value) and materials from GOOD files. **1–3★ weapons are not stored**; they only appear in the wish history.
- **Farming plan**: exact materials needed for target levels and talents, domains open today, a resin estimate.
- **Achievements**: all 1,854 achievements in EN/DE, with tiers, Primogems, search, a version filter, and links to the quest pages on HoYoWiki (HoYoWiki has no pages for achievements themselves). Import from a paimon.moe backup or UIAF, export to UIAF.
- **Wishes**: works like paimon.moe. Each 5★ shows its pity and 50/50 result (click to correct it). Also the 4★ breakdown, luck rating, charts, a share image, and a paged pull log.
- **Planner**: the chance to get a featured 5★ (C0–C6 / R1–R5) from your savings and current pity.
- **Import**:
  - Sources: wish link, UIGF v3/v4, paimon.moe backup (every account), GOOD (Inventory Kamera / Genshin Optimizer), UIAF, and Waypoint's own export.
  - Files that hold several kinds of data open a **picker**. It shows the account, the date the backup was saved, and a checkbox for each part.
  - After any import, "Undo" restores the previous state.
- **Tools outside the app**:
  - `tools/export.ps1`: one PowerShell line that saves the wish history as UIGF.
  - `tools/dist/waypoint-export.mjs`: Node CLI that pulls data from the wish API, HoYoLAB and Enka.
  - `tools/proxy/worker.js`: a Cloudflare Worker proxy for pasting the wish link when the site is on static hosting.

### Anime part
- **Library**:
  - One-tap episode progress, status, score, rewatches, notes.
  - Category (genre) chips that combine with AND, plus a format filter.
  - An **Unrated** filter with a quick rating strip. Planned shows don't count as unrated.
  - In "All" sorted by last updated, untouched planned shows come after the ones you started.
- **Schedule** (weekly airing) and **Stats**.
- **Discover** (AniList): trending, seasons, search, and **All anime**.
  - All anime covers the full AniList catalog (about 21k titles) A–Z, or sorted by popularity, score or newest.
  - It has filters, an A–Z jump bar and endless scrolling.
  - There is an **18+ opt-in** switch (`settings.showAdult`). It exists because titles like Yosuga no Sora are flagged adult on AniList and were hidden.
- AniList only pages through 5,000 results per query. `src/lib/catalog.ts` works around this:
  - It reads 8 fixed popularity ranges in one request and merges them in order.
  - `src/data/anilist-catalog.json` holds a letter index so A–Z jumps are fast. Refresh it with `npm run sync-anilist`.

### Design
The look is calm and editorial, not "gamer":
- Warm paper background in light mode (#f6f3ee), charcoal in dark mode (#161514).
- Clay accent: #a85f45 in light mode, #d69c82 in dark mode.
- Instrument Serif for headings and big numbers, Inter for text, soft shadows.
- Design tokens are in `src/styles/tokens.css`.

## Where things live
```
src/core/     formats (UIGF/paimon/GOOD/UIAF parsing), wish stats, farming, achievements, gacha API
src/lib/      store (hydrate/validation), actions, importActions, anime logic, AniList client, catalog engine
src/data/     game.json, achievements.json (lazy-loaded), anilist-catalog.json, characters, tasks
src/views/    Home, Settings, genshin/*, anime/*
src/i18n/     en.ts (source of keys), de.ts
scripts/      sync-game-data.mjs, sync-achievements.mjs (gi.yatta.moe + HoYoWiki), sync-anilist-index.mjs
tools/        CLI exporter, PowerShell script, proxy worker
```
Commands: `npm run dev`, `npm test` (116 tests passing), `npm run typecheck`, `npm run build`, `npm run sync-data`, `npm run sync-anilist`.

## How we work (user preferences)
- **Only `main`.** No feature branches, no pull requests. Commit and push straight to `main`.
- Use UTF-8 everywhere, since the project contains German.
- Every user-facing text needs an English and a German version (`en.ts` + `de.ts`).
- Before pushing, run the typecheck, the tests and the build.

## History of what was built (in order)
1. First version of the app: Genshin tracker and anime manager.
2. Redesign after "looks like AI slop" feedback. Added a wish importer like paimon.moe's, the PowerShell link script and the full exporter CLI.
3. Pull history now fills the Characters page automatically.
4. Bug scan, then new features: luck rating, wish charts, savings forecast.
5. Farming planner, weapon refinements from pulls, share image, real element icons.
6. Achievement tracker with paimon.moe/UIAF import and the import picker (account, save date, parts).
7. Category filter for the anime library and Discover, then a more premium look.
8. HoYoWiki quest links on achievements.
9. Full AniList catalog A–Z with filters, then the 18+ opt-in (Yosuga no Sora was missing).
10. "Unrated" filter in the library.
11. Fix: *Darling in the Franxx* was planned but showed up first and asked for a rating. Planned shows had been counted as watched.
12. Full bug review across state, imports and undo. Redesign to a calmer, more aesthetic style.
13. 1–3★ weapons are no longer stored in the inventory.
14. **Latest:** achievement totals now match paimon.moe.
    - Removed "Instant Karma" (84517). It's in the game data but can't be earned.
    - paimon.moe imports only count a tick inside the achievement's own category, using the same old-ID fixes as paimon.moe.
    - Achievement imports now **replace** your progress instead of merging into it (known completion dates are kept, and Undo works).
    - The user has to **re-import their paimon.moe backup** once. Expected result: 1,818 of 1,854 and 13,750 of 14,085 Primogems. This has not been confirmed by the user yet.

## Open points / ideas
- Check with the user that the achievement numbers match after re-importing.
- Left unchanged on purpose because they're unverified or judgment calls:
  - whether Beginners' Wish pity is shared with the Standard banner;
  - Home vs. Today counting routines differently;
  - several browser tabs writing at the same time;
  - the Chronicled Wish guarantee from imports.
- If yatta adds more achievements that can't be earned, add their IDs to `UNOBTAINABLE` in `scripts/sync-achievements.mjs`.
