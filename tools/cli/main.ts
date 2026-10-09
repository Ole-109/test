/**
 * waypoint-export – collects everything the game and HoYoverse services expose
 * about your account and writes one file Waypoint can import.
 *
 *   node waypoint-export.mjs                  wish history (+ HoYoLAB / Enka if configured)
 *   node waypoint-export.mjs link             just print the wish history link
 *   node waypoint-export.mjs --help
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fetchWishHistory, GachaApiError, parseWishUrl, validateWishUrl, type WishUrlInfo } from '../../src/core/gachaApi';
import { mergeWishes, parseImport, toUigfV4, type Realtime, type WaypointBundle } from '../../src/core/formats';
import type { GoodData } from '../../src/core/good';
import { POOL_OF } from '../../src/core/wishStats';
import type { Account, WishRecord } from '../../src/lib/types';
import { searchWishUrls } from './cache';
import { enkaToGood, fetchEnka } from './enka';
import { accountFromIndex, dailyNoteToRealtime, Hoyolab, hoyolabToGood, normaliseCookie } from './hoyolab';
import { createHttp } from './http';

const VERSION = '2.0.0';
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: number) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = c(1);
const dim = c(2);
const green = c(32);
const yellow = c(33);
const red = c(31);
const cyan = c(36);

const log = (s = '') => process.stdout.write(s + '\n');
const step = (s: string) => log(`${cyan('›')} ${s}`);
const ok = (s: string) => log(`${green('✓')} ${s}`);
const warn = (s: string) => log(`${yellow('!')} ${s}`);
const fail = (s: string) => log(`${red('✗')} ${s}`);

const HELP = `${bold('waypoint-export')} ${dim(VERSION)} – export your Genshin Impact data for Waypoint

${bold('Usage')}
  waypoint-export [command] [options]

${bold('Commands')}
  all        ${dim('(default)')} wish history + HoYoLAB / Enka data → one Waypoint file
  link       find the wish history link in the game cache and copy it
  wishes     download the full wish history → UIGF v4 file
  hoyolab    characters, weapons, artifacts, resin & dailies via HoYoLAB
  enka       showcase characters via Enka.Network (public, no login)

${bold('Options')}
  --url <link>        wish history link (skip the game cache search)
  --game-dir <path>   game folder if it isn't found automatically
  --cookie <cookie>   HoYoLAB cookie with ltoken_v2 + ltuid_v2 (or env HOYOLAB_COOKIE)
  --uid <uid>         Genshin UID (for HoYoLAB / Enka)
  --merge <file>      previous export: only download new wishes, keep the old ones
  --out <file>        output file name
  --no-wishes         skip the wish history
  --enka              also use Enka.Network (default when no HoYoLAB cookie is given)
  -h, --help          show this help

${bold('Examples')}
  waypoint-export
  waypoint-export --cookie "ltoken_v2=…; ltuid_v2=…"
  waypoint-export --merge waypoint-export-700000000.json
  waypoint-export enka --uid 700000000

Open the wish history in game once before running, so the link is fresh.
`;

function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === 'win32') execFileSync('clip', { input: text });
    else if (process.platform === 'darwin') execFileSync('pbcopy', { input: text });
    else execFileSync('xclip', ['-selection', 'clipboard'], { input: text });
    return true;
  } catch {
    return false;
  }
}

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      'game-dir': { type: 'string' },
      cookie: { type: 'string' },
      uid: { type: 'string' },
      merge: { type: 'string' },
      out: { type: 'string' },
      'no-wishes': { type: 'boolean' },
      enka: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.help) return void log(HELP);
  if (values.version) return void log(VERSION);
  const command = positionals[0] ?? 'all';
  if (!['all', 'link', 'wishes', 'hoyolab', 'enka'].includes(command)) {
    fail(`Unknown command "${command}".`);
    log(HELP);
    process.exitCode = 1;
    return;
  }

  log(`${bold('Waypoint export')} ${dim(VERSION)}\n`);
  const http = createHttp();
  const cookie = values.cookie ?? process.env.HOYOLAB_COOKIE;
  let uid = values.uid;
  let account: Account = {};
  let records: WishRecord[] = [];
  let good: GoodData | undefined;
  let realtime: Realtime | undefined;

  // ── Previous export (incremental) ──────────────────────────────────────
  let previous: WishRecord[] = [];
  if (values.merge) {
    if (!existsSync(values.merge)) throw new Error(`--merge file not found: ${values.merge}`);
    const prev = parseImport(readFileSync(values.merge, 'utf8'));
    previous = prev.wishes?.records ?? [];
    uid ??= prev.wishes?.uid ?? prev.account?.uid;
    ok(`Loaded ${previous.length} wishes from ${values.merge}`);
  }

  // ── Wish history ───────────────────────────────────────────────────────
  const wantWishes = command === 'link' || command === 'wishes' || (command === 'all' && !values['no-wishes']);
  if (wantWishes) {
    let info: WishUrlInfo | undefined;
    let link: string | undefined;
    if (values.url) {
      info = parseWishUrl(values.url);
      step('Checking the link…');
      await validateWishUrl(info, { fetch: http.fetcher });
      link = values.url;
    } else {
      step('Looking for the wish history link in the game cache…');
      const found = searchWishUrls({ gameDir: values['game-dir'] });
      if (found.gameDataDir) log(dim(`  game data: ${found.gameDataDir}`));
      if (!found.urls.length) {
        fail('No wish history link found.');
        log(dim('  Open the game, press F3 (Wish) → History, wait for it to load, then run this again.'));
        if (!found.gameDataDir) log(dim(`  Looked for the game log in:\n    ${found.tried.join('\n    ')}\n  Use --game-dir "D:/Games/Genshin Impact game" if it lives elsewhere.`));
      }
      // Newest first; take the first one the server still accepts.
      for (const u of [...found.urls].reverse()) {
        try {
          const candidate = parseWishUrl(u);
          await validateWishUrl(candidate, { fetch: http.fetcher });
          info = candidate;
          link = u;
          break;
        } catch (e) {
          if (!(e instanceof GachaApiError) || (e.code !== 'authkey-expired' && e.code !== 'authkey-invalid')) throw e;
        }
      }
      if (found.urls.length && !info) fail('All links in the cache have expired. Open the wish history in game again, then rerun.');
    }

    if (info && link) {
      ok('Found a valid wish history link.');
      if (command === 'link') {
        log(`\n${link}\n`);
        if (copyToClipboard(link)) ok('Copied to the clipboard – paste it into Waypoint → Wishes → Import.');
        return;
      }
      step('Downloading wish history (this takes a minute for large accounts)…');
      const names: Record<string, string> = { '301': 'Character Event', '302': 'Weapon Event', '500': 'Chronicled', '200': 'Standard', '100': 'Beginners' };
      let lastType = '';
      const res = await fetchWishHistory(info, {
        fetch: http.fetcher,
        knownIds: new Set(previous.map((r) => r.id)),
        onProgress: (p) => {
          if (p.gachaType !== lastType && lastType && process.stdout.isTTY) process.stdout.write('\n');
          lastType = p.gachaType;
          const line = `  ${names[p.gachaType].padEnd(16)} page ${String(p.page).padStart(3)} · ${p.fetched} new`;
          if (process.stdout.isTTY) process.stdout.write(`\r${line}`);
        },
      });
      if (process.stdout.isTTY) process.stdout.write('\n');
      uid ??= res.uid;
      const merged = mergeWishes(previous, res.records);
      records = merged.list;
      ok(`${res.records.length} new wishes · ${records.length} in total`);
      const byPool = new Map<string, number>();
      for (const r of records) byPool.set(POOL_OF[r.gachaType], (byPool.get(POOL_OF[r.gachaType]) ?? 0) + 1);
      log(dim(`  ${[...byPool].map(([k, n]) => `${k} ${n}`).join(' · ')}`));
    } else if (command === 'link' || command === 'wishes') {
      process.exitCode = 1;
      return;
    }
  } else records = previous;

  if (command === 'wishes') {
    const out = values.out ?? `uigf-${uid ?? 'unknown'}-${today()}.json`;
    writeFileSync(out, JSON.stringify(toUigfV4(records, uid), null, 2), 'utf8');
    ok(`Wrote ${bold(out)}`);
    return;
  }

  // ── HoYoLAB ────────────────────────────────────────────────────────────
  if ((command === 'all' || command === 'hoyolab') && cookie) {
    try {
      const hl = new Hoyolab(http, cookie);
      if (!uid) {
        const { ltuid } = normaliseCookie(cookie);
        if (ltuid) {
          step('Finding your Genshin account on HoYoLAB…');
          const accs = await hl.accounts(ltuid);
          if (accs.length > 1) warn(`Several accounts found; using ${accs[0].uid}. Pass --uid to pick another.`);
          uid = accs[0]?.uid;
        }
      }
      if (!uid) throw new Error('Pass --uid so HoYoLAB knows which account to read.');
      step(`Reading Battle Chronicle for UID ${uid}…`);
      account = { ...account, ...accountFromIndex(uid, await hl.index(uid)) };
      const chars = await hl.characters(uid);
      good = hoyolabToGood(chars);
      ok(`${good.characters?.length} characters, ${good.weapons?.length} equipped weapons, ${good.artifacts?.length} equipped artifacts`);
      try {
        realtime = dailyNoteToRealtime(await hl.dailyNote(uid));
        ok(`Resin ${realtime.resin?.current}/${realtime.resin?.max} · commissions ${realtime.commissions?.done}/${realtime.commissions?.total}`);
      } catch (e) {
        warn(`Real-time notes unavailable: ${(e as Error).message}`);
      }
    } catch (e) {
      (command === 'hoyolab' ? fail : warn)(`HoYoLAB: ${(e as Error).message}`);
      if (command === 'hoyolab') process.exitCode = 1;
    }
  } else if (command === 'hoyolab') {
    fail('HoYoLAB needs --cookie "ltoken_v2=…; ltuid_v2=…" (or the HOYOLAB_COOKIE environment variable).');
    log(dim('  hoyolab.com → log in → F12 → Application → Cookies → copy ltoken_v2 and ltuid_v2.'));
    process.exitCode = 1;
    return;
  }

  // ── Enka.Network ───────────────────────────────────────────────────────
  if ((command === 'enka' || (command === 'all' && (values.enka || !good))) && uid) {
    try {
      step(`Reading the Enka.Network showcase for UID ${uid}…`);
      const { data, skillOrder } = await fetchEnka(http, uid);
      const r = enkaToGood(data, skillOrder);
      account = { ...r.account, ...account };
      if (!good) good = r.good;
      else {
        // Showcase builds are a snapshot of fully equipped characters – fill gaps only.
        const have = new Set(good.characters?.map((x) => x.key));
        good.characters?.push(...(r.good.characters ?? []).filter((x) => !have.has(x.key)));
      }
      if (!r.good.characters?.length) warn('The showcase is empty. Add characters to your in-game profile showcase to export them.');
      else ok(`${r.good.characters.length} showcase characters`);
    } catch (e) {
      (command === 'enka' ? fail : warn)(`Enka.Network: ${(e as Error).message}`);
      if (command === 'enka') process.exitCode = 1;
    }
  } else if (command === 'enka') {
    fail('Enka needs --uid.');
    process.exitCode = 1;
    return;
  }

  // ── Write ──────────────────────────────────────────────────────────────
  account.uid ??= uid;
  const bundle: WaypointBundle = {
    format: 'waypoint-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    source: `waypoint-export ${VERSION}`,
    account,
    uigf: records.length ? toUigfV4(records, uid) : undefined,
    good,
    realtime,
  };
  if (!records.length && !good && !realtime) {
    fail('Nothing to export.');
    process.exitCode = 1;
    return;
  }
  const out = values.out ?? `waypoint-export-${uid ?? 'unknown'}-${today()}.json`;
  writeFileSync(out, JSON.stringify(bundle), 'utf8');
  log();
  ok(`Saved ${bold(out)}`);
  log(dim('  Import it in Waypoint: Wishes → Import → choose file (or drag it onto the page).'));
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
