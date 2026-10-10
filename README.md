# Waypoint

A Genshin Impact account tracker and anime list in one web app, plus a local exporter that pulls your
data out of the game and HoYoverse services. English and German UI.

## What it does

**Genshin Impact**
- **Wish history**, like paimon.moe: every 5★ with its pity, 50/50 won/lost/guaranteed (click to correct),
  4★ breakdown, lifetime stats, current pity per banner and a searchable, paged pull log.
- **Import** from the in-game wish link, UIGF v3/v4 files, paimon.moe backups, GOOD files
  (Inventory Kamera, Genshin Optimizer, …) and full Waypoint exports. **Export** to UIGF v4.
  Files with several kinds of data (e.g. a paimon.moe backup with wishes, achievements, characters and
  AR/WL for every account) open a menu to pick the account and the parts to import.
- **Characters**: every playable character (generated from game data, with icons). Track level,
  constellations, talents, weapon and build. Imports fill this in.
- **Inventory**: weapons, artifacts (with crit value) and materials from GOOD imports, plus weapon
  refinements derived from the wish history.
- **Farming plan**: exact ascension/talent materials for target levels, domains open today, resin estimate.
- **Achievements**: all achievements in English and German with tiers, Primogem totals, search and version
  filter. Import from a paimon.moe backup or UIAF (Snap Hutao, YaeAchievement, Cocogoat, …), export UIAF.
- **Today**: live Original Resin, daily/weekly/monthly routine with correct 04:00 server resets, cooldowns.
- **Planner**: chance to get a featured 5★ (C0–C6 / R1–R5) from your savings, current pity and guarantee.

**Anime**: library with one-tap episode progress, AniList search, weekly airing schedule, stats.

No account, no server: data stays in your browser (`localStorage`). Back up or move it via Settings.

## Getting your Genshin data in

The wish history and HoYoLAB APIs send no CORS headers, so a website can't call them from your browser.
There are three ways around that:

### 1. Wish history file (Windows, nothing to install)

Open the game → Wish → History, then run this in PowerShell:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex "&{$((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/Ole-109/test/main/tools/export.ps1'))}"
```

[`tools/export.ps1`](tools/export.ps1) finds the link in the game's web cache, downloads your complete
history and saves `waypoint-wishes-<uid>-<date>.json` (UIGF v4) to your Desktop. Drop the file onto
**Wishes → Import**. Add ` -LinkOnly` inside the quotes to only copy the link.

### 2. Paste the link

Paste the link into **Import → Wish history**. This works with `npm run dev` / `npm run preview`, which
include a small proxy. On static hosting (GitHub Pages), deploy [`tools/proxy/worker.js`](tools/proxy/worker.js)
as a Cloudflare Worker and enter its URL under **Settings → Wish import proxy**. The proxy only forwards
the wish history endpoint.

### 3. Full account export (Node.js 18+)

[`tools/dist/waypoint-export.mjs`](tools/dist/waypoint-export.mjs) is a single-file CLI. It collects:

| Source | What | Needs |
| --- | --- | --- |
| Game cache + wish API | complete wish history | the game on this PC |
| HoYoLAB Battle Chronicle | all characters with level, constellations, talents, weapon, artifacts; live resin, commissions, realm currency, transformer, weekly boss discounts | `ltoken_v2` + `ltuid_v2` cookie, public Battle Chronicle |
| Enka.Network | showcase characters with full builds | UID only |

```bash
node waypoint-export.mjs                                   # wishes (+ Enka if the UID is known)
node waypoint-export.mjs --cookie "ltoken_v2=…; ltuid_v2=…"  # + everything from HoYoLAB
node waypoint-export.mjs --merge waypoint-export-7000….json  # only fetch new wishes
node waypoint-export.mjs enka --uid 700000000
node waypoint-export.mjs --help
```

From PowerShell, `export.ps1 -Full -Cookie "…"` downloads and runs the CLI for you. The cookie never
leaves your PC except in requests to HoYoLAB.

**Screen scanners** such as Inventory Kamera produce GOOD files, which Waypoint imports directly
(characters, constellations, weapons, artifacts, materials).

## Development

```bash
npm install
npm run dev          # http://localhost:5173 (includes the wish-link proxy)
npm test             # unit tests: resets, resin, gacha model, wish parsing, importers, CLI
npm run typecheck    # app + build config + CLI
npm run build        # static site in dist/
npm run build:cli    # tools/dist/waypoint-export.mjs
npm run sync-data    # refresh characters/weapons/materials/achievements from gi.yatta.moe
```

Game data and icons come from [Project Amber](https://gi.yatta.moe) (icons are linked, not bundled).
Anime data comes from [AniList](https://anilist.co). `.github/workflows/deploy.yml` publishes to GitHub Pages on
pushes to `main` (enable *Settings → Pages → Source: GitHub Actions*).

```
src/core/       wish API client, wish statistics, UIGF/paimon/GOOD/UIAF formats, farming, achievements
src/lib/        store, actions, import application, resets, resin, gacha model, AniList client
src/data/       generated game data (game.json, achievements.json – loaded on demand) and lookups
src/views/      Overview, Teyvat (Today, Characters, Inventory, Farming, Achievements, Wishes, Planner, Import), Anime, Settings
tools/cli/      waypoint-export source (cache search, HoYoLAB, Enka)
tools/export.ps1, tools/proxy/worker.js
```

Waypoint is a fan project and is not affiliated with HoYoverse, Enka.Network, Project Amber or AniList.
