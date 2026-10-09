/**
 * Locates the wish history link the game writes into its embedded browser cache,
 * the same approach paimon.moe's getlink.ps1 uses:
 *   1. read the game's log to find the install folder,
 *   2. open <Game>_Data/webCaches/<newest version>/Cache/Cache_Data/data_2,
 *   3. pull every gacha URL with an authkey out of it, newest last.
 */
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { findWishUrls } from '../../src/core/gachaApi';

const LOG_DIRS = ['Genshin Impact', '原神'];
const LOG_FILES = ['output_log.txt', 'Player.log'];

export interface CacheSearch {
  gameDataDir?: string;
  cacheFile?: string;
  urls: string[];
  tried: string[];
}

/** Finds `…/GenshinImpact_Data` (or `YuanShen_Data`) from the game logs. */
export function findGameDataDir(home = homedir()): { dir?: string; tried: string[] } {
  const tried: string[] = [];
  for (const d of LOG_DIRS) {
    for (const f of LOG_FILES) {
      const log = join(home, 'AppData', 'LocalLow', 'miHoYo', d, f);
      tried.push(log);
      if (!existsSync(log)) continue;
      const dir = gameDirFromLog(readFileSync(log, 'utf8'));
      if (dir && existsSync(dir)) return { dir, tried };
    }
  }
  return { tried };
}

export function gameDirFromLog(text: string): string | undefined {
  const m = text.match(/([A-Za-z]:[\\/][^\r\n:]*?(?:GenshinImpact_Data|YuanShen_Data))/);
  return m?.[1].replace(/\\/g, '/');
}

/** Newest `webCaches/<version>/Cache/Cache_Data/data_2` (older games: `webCaches/Cache/…`). */
export function findCacheFile(gameDataDir: string): string | undefined {
  const root = join(gameDataDir, 'webCaches');
  if (!existsSync(root)) return undefined;
  const candidates: { file: string; mtime: number }[] = [];
  const consider = (file: string) => existsSync(file) && candidates.push({ file, mtime: statSync(file).mtimeMs });
  consider(join(root, 'Cache', 'Cache_Data', 'data_2'));
  for (const v of readdirSync(root)) consider(join(root, v, 'Cache', 'Cache_Data', 'data_2'));
  return candidates.sort((a, b) => b.mtime - a.mtime)[0]?.file;
}

/** Reads the cache even while the game holds it open, by copying it first. */
export function readCache(file: string): string {
  try {
    return readFileSync(file).toString('latin1');
  } catch {
    const tmp = mkdtempSync(join(tmpdir(), 'waypoint-'));
    const copy = join(tmp, 'data_2');
    try {
      copyFileSync(file, copy);
      return readFileSync(copy).toString('latin1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

export function searchWishUrls(opts: { gameDir?: string; home?: string } = {}): CacheSearch {
  let gameDataDir = opts.gameDir;
  let tried: string[] = [];
  if (gameDataDir && !/_Data[\\/]?$/.test(gameDataDir)) {
    // Accept the install folder too.
    for (const sub of ['GenshinImpact_Data', 'YuanShen_Data']) if (existsSync(join(gameDataDir, sub))) gameDataDir = join(gameDataDir, sub);
  }
  if (!gameDataDir) ({ dir: gameDataDir, tried } = findGameDataDir(opts.home));
  if (!gameDataDir) return { urls: [], tried };
  const cacheFile = findCacheFile(gameDataDir);
  if (!cacheFile) return { gameDataDir, urls: [], tried: [...tried, join(gameDataDir, 'webCaches')] };
  // Unique, keeping the latest occurrence last.
  const urls = [...new Map(findWishUrls(readCache(cacheFile)).map((u) => [u, u])).values()];
  return { gameDataDir, cacheFile, urls, tried };
}
