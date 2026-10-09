import { findCharacter, STANDARD_FIVE_STARS } from '../data/characters';
import type { BannerKey, GachaType, WishPool, WishRecord } from '../lib/types';

export const POOL_OF: Record<GachaType, WishPool> = {
  '100': 'beginner',
  '200': 'standard',
  '301': 'character',
  '400': 'character',
  '302': 'weapon',
  '500': 'chronicled',
};

/** Record ids grow over time; compare numerically without losing precision. */
export function compareIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

/** Server-local "YYYY-MM-DD HH:mm:ss" → epoch ms (treated as UTC; good enough for ordering and dates). */
export const recordTime = (time: string) => Date.parse(time.replace(' ', 'T') + 'Z');

export type Outcome = 'won' | 'lost' | 'guaranteed' | 'na';

export interface PulledItem {
  record: WishRecord;
  /** Pity at which this item was pulled (counted within its rarity). */
  pity: number;
  outcome: Outcome;
  /** Pull number within the pool, 1-based. */
  index: number;
}

export interface PoolStats {
  pool: WishPool;
  total: number;
  pity5: number;
  pity4: number;
  guaranteed: boolean;
  five: PulledItem[];
  four: PulledItem[];
  threeCount: number;
  /** Five-star characters/weapons sorted newest first. */
  fiveNewestFirst: PulledItem[];
  avgPity5: number;
  avgPity4: number;
  fiftyWon: number;
  fiftyLost: number;
  first?: string;
  last?: string;
}

/** Was this 5★ a lost 50/50 on a character event banner? */
export function isStandardFiveStar(r: WishRecord): boolean {
  if (r.itemType !== 'character') return false;
  const c = findCharacter(r.name);
  if (!c) return false;
  const since = STANDARD_FIVE_STARS[c.id];
  return since != null && recordTime(r.time) >= since;
}

/** Oldest first. Time first (synthetic ids from backups), then id within a ten-pull. */
export function sortRecords(list: WishRecord[]): WishRecord[] {
  return [...list].sort((a, b) => recordTime(a.time) - recordTime(b.time) || compareIds(a.id, b.id));
}

export function analyzePool(
  pool: WishPool,
  all: WishRecord[],
  overrides: Record<string, 'won' | 'lost'> = {},
): PoolStats {
  const records = sortRecords(all.filter((r) => POOL_OF[r.gachaType] === pool));
  let since5 = 0;
  let since4 = 0;
  let guaranteed = false;
  const five: PulledItem[] = [];
  const four: PulledItem[] = [];
  let threeCount = 0;
  let won = 0;
  let lost = 0;
  records.forEach((r, i) => {
    since5++;
    since4++;
    if (r.rank === 5) {
      let outcome: Outcome = 'na';
      if (pool === 'character') {
        if (guaranteed) outcome = 'guaranteed';
        else outcome = overrides[r.id] ?? (isStandardFiveStar(r) ? 'lost' : 'won');
        if (outcome === 'won') won++;
        if (outcome === 'lost') lost++;
        guaranteed = outcome === 'lost';
      }
      five.push({ record: r, pity: since5, outcome, index: i + 1 });
      since5 = 0;
      // "A 4★ or above every 10 wishes": a 5★ satisfies that guarantee too.
      since4 = 0;
    } else if (r.rank === 4) {
      four.push({ record: r, pity: since4, outcome: 'na', index: i + 1 });
      since4 = 0;
    } else threeCount++;
  });
  const avg = (xs: PulledItem[]) => (xs.length ? xs.reduce((s, x) => s + x.pity, 0) / xs.length : 0);
  return {
    pool,
    total: records.length,
    pity5: since5,
    pity4: since4,
    guaranteed,
    five,
    four,
    threeCount,
    fiveNewestFirst: [...five].reverse(),
    avgPity5: avg(five),
    avgPity4: avg(four),
    fiftyWon: won,
    fiftyLost: lost,
    first: records[0]?.time,
    last: records[records.length - 1]?.time,
  };
}

export const BANNER_POOLS: BannerKey[] = ['character', 'weapon', 'standard', 'chronicled'];
