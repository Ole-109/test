# ✦ Waypoint

**Teyvat & anime, in one place.** Waypoint is a fast, offline-first web app for keeping track of your
Genshin Impact routine and your anime watchlist, in English or German.

## Features

### Teyvat (Genshin Impact)
- **Original Resin tracker.** It regenerates live (1 point / 8 min) and shows the time until full plus
  milestones (40 / 60 / 120 / 160 / cap). Spending keeps the partial regen progress, just like in-game.
  It also tracks Condensed and Fragile Resin, and can send an optional browser notification when resin is full.
- **Routine checklist.** Daily, weekly, monthly and cooldown tasks reset on their own at the right
  **04:00 server time** for America, Europe or Asia. Built-ins include commissions, weekly bosses,
  Spiral Abyss (16th), Imaginarium Theater (1st) and the Parametric Transformer (7-day cooldown).
  You can add your own tasks.
- **Character roster.** All playable characters through Nod-Krai, with filters by element, weapon, rarity and
  ownership. For each one you can track level, constellation, talents, weapon/refinement, artifacts, build
  status, favorites and notes. You can add new releases yourself.
- **Wish tracker.** Pity per banner (character, weapon, standard, chronicled), soft pity indicator, 4★ pity,
  50/50 guarantee and Epitomized Path state. It keeps a 5★ history with average pity and 50/50 win rate.
- **Savings planner.** Turns primogems, fates and starglitter into pulls and computes the exact
  **probability of reaching your goal** (C0–C6 / R1–R5) from your current pity and guarantee, using the
  community soft-pity model. Also shows expected pulls, the worst case and an interactive probability curve.

### Anime
- **Library.** Statuses (watching, plan to watch, completed, on hold, dropped), one-tap **+1 episode**,
  scores, rewatches, notes and favorites. Planning switches to watching, and finishing the last episode marks the show completed.
- **Discover.** Search [AniList](https://anilist.co) or browse trending, this season, next season and all-time popular,
  then add shows with covers, episode counts and airing data.
- **Schedule.** A week view of upcoming episodes in your local time, with "new episode" badges when you fall behind.
  Airing data refreshes in the background.
- **Stats.** Episodes and time watched, mean score, status breakdown, top genres and score distribution
  (every chart can also be shown as a table).

### Everywhere
- Command palette (<kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> or <kbd>/</kbd>), <kbd>G</kbd> then a letter to jump between sections,
  <kbd>N</kbd> to add anime.
- Dark and light themes (or follow the system), English and German UI (UTF-8 throughout).
- Undo for destructive actions, responsive layout with a bottom tab bar on phones, keyboard and screen-reader friendly.
- **No account and no server.** Data lives in your browser's `localStorage`; export or import JSON backups in Settings.

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit tests (reset math, resin, gacha model, airing logic)
npm run build     # production build in dist/
```

The build uses a relative base path, so `dist/` can be hosted anywhere as static files.
`.github/workflows/deploy.yml` publishes to **GitHub Pages** on every push to `main`. Enable it under
*Settings → Pages → Source: GitHub Actions*.

## Tech

React 19 · TypeScript · Vite · lucide icons · Vitest. Anime data comes from the public AniList GraphQL API (no key needed).

## Project layout

```
src/
  lib/          state store, actions, time/reset math, resin, gacha probabilities, AniList client
  data/         character list and default routine tasks
  i18n/         English and German strings
  components/   UI primitives, sheets, toasts, charts, command palette
  views/        Home, Teyvat (Today, Characters, Wishes), Anime (Library, Schedule, Stats, Discover), Settings
  styles/       design tokens and styles
```

---

Waypoint is a fan project and is not affiliated with HoYoverse or AniList.
