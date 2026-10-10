/**
 * Farming planner: what a character needs to reach a target level and talent
 * levels, which domains are open today, and roughly how much resin it costs.
 * Costs come from the game data (src/data/game.json); drop rates are community
 * averages at World Level 8, so resin numbers are estimates.
 */
import game from '../data/game.json';
import { ascensionForLevel, toGoodKey } from './good';

export type MatKind = 'book' | 'crown' | 'weekly' | 'boss' | 'gem' | 'local' | 'common' | 'other';

export interface MaterialDef {
  id: string;
  name: string;
  nameDe: string;
  rank: number;
  icon: string;
  type: string;
  kind: MatKind;
  /** Talent books: weekdays the domain is open (0 = Sunday). */
  days?: number[];
  domain?: string;
  /** Boss materials: the boss that drops it. */
  from?: string;
}

type RawMat = { name: string; nameDe: string; rank: number; icon: string; type: string; days?: number[]; domain?: string; from?: string };

function kindOf(id: string, m: RawMat): MatKind {
  if (id === '104319') return 'crown';
  if (m.type === 'characterTalentMaterial') return m.rank === 5 ? 'weekly' : 'book';
  if (m.type === 'characterLevelUpMaterial') return m.rank === 5 ? 'weekly' : 'boss';
  if (m.type === 'characterAscensionMaterial') return 'gem';
  if (m.type.startsWith('localSpecialty')) return 'local';
  if (m.type === 'characterandWeaponEnhancementMaterial') return 'common';
  return 'other';
}

export const MATERIALS: Record<string, MaterialDef> = Object.fromEntries(
  Object.entries(game.materials as Record<string, RawMat>).map(([id, m]) => [id, { id, ...m, kind: kindOf(id, m) }]),
);

type Cost = [Record<string, number>, number];
const MATS = new Map<string, { asc: Cost[]; talent: Cost[] }>(
  (game.characters as { id: string; mats?: { asc: Cost[]; talent: Cost[] } }[])
    .filter((c) => c.mats)
    .map((c) => [c.id, c.mats!]),
);

export const hasCostData = (characterId: string) => MATS.has(characterId);

export type { FarmTarget } from '../lib/types';
import type { FarmTarget } from '../lib/types';

export interface CurrentState {
  level: number;
  ascension?: number;
  talents: [number, number, number];
}

/** Ascension phase needed to reach `level` (20 → 0, 21–40 → 1, …, 81–90 → 6). */
export function ascensionForTarget(level: number): number {
  const caps = [20, 40, 50, 60, 70, 80, 90];
  const i = caps.findIndex((c) => level <= c);
  return i < 0 ? 6 : i;
}

/**
 * Hero's Wit needed to reach a level from level 1 (20,000 EXP each).
 * Breakpoints from the game's EXP table; levels in between are interpolated.
 */
const HERO_WIT_AT: [number, number][] = [
  [1, 0],
  [20, 6],
  [40, 35],
  [50, 64],
  [60, 100],
  [70, 147],
  [80, 207],
  [90, 420],
];

export function heroWitTo(level: number): number {
  for (let i = 1; i < HERO_WIT_AT.length; i++) {
    const [l1, w1] = HERO_WIT_AT[i];
    const [l0, w0] = HERO_WIT_AT[i - 1];
    if (level <= l1) return w0 + ((w1 - w0) * (level - l0)) / (l1 - l0);
  }
  return HERO_WIT_AT[HERO_WIT_AT.length - 1][1];
}

export interface Requirement {
  items: Map<string, number>;
  mora: number;
  heroWit: number;
}

const add = (m: Map<string, number>, items: Record<string, number>) => {
  for (const [id, n] of Object.entries(items)) {
    if (id === '202') continue; // Mora is tracked separately
    m.set(id, (m.get(id) ?? 0) + n);
  }
};

/** Materials, Mora and EXP to take one character from `current` to `target`. */
export function requirementFor(characterId: string, current: CurrentState, target: FarmTarget): Requirement {
  const req: Requirement = { items: new Map(), mora: 0, heroWit: 0 };
  const mats = MATS.get(characterId);
  if (!mats) return req;
  const ascFrom = current.ascension ?? ascensionForLevel(current.level);
  const ascTo = Math.max(ascFrom, ascensionForTarget(target.level));
  for (let phase = ascFrom; phase < ascTo; phase++) {
    const [items, coin] = mats.asc[phase] ?? [{}, 0];
    add(req.items, items);
    req.mora += coin;
  }
  for (let t = 0; t < 3; t++) {
    for (let lvl = current.talents[t] + 1; lvl <= target.talents[t]; lvl++) {
      const [items, coin] = mats.talent[lvl - 2] ?? [{}, 0];
      add(req.items, items);
      req.mora += coin;
    }
  }
  const wit = Math.max(0, Math.ceil(heroWitTo(target.level) - heroWitTo(current.level)));
  req.heroWit = wit;
  req.mora += wit * 4000; // 1 Mora per 5 EXP when levelling
  return req;
}

export function combine(reqs: Requirement[]): Requirement {
  const out: Requirement = { items: new Map(), mora: 0, heroWit: 0 };
  for (const r of reqs) {
    for (const [id, n] of r.items) out.items.set(id, (out.items.get(id) ?? 0) + n);
    out.mora += r.mora;
    out.heroWit += r.heroWit;
  }
  return out;
}

/** Inventory count for a material from a GOOD `materials` map. */
export const haveOf = (materials: Record<string, number>, id: string) => materials[toGoodKey(MATERIALS[id]?.name ?? '')] ?? 0;

/** Community averages per run at World Level 8. */
export const DROPS = {
  /** Talent domain (20 resin): ≈2.2 green + 1.97 blue + 0.23 purple, in green-equivalents. */
  bookGreenPerRun: 2.2 + 1.97 * 3 + 0.23 * 9,
  /** Normal boss (40 resin): boss material per run. */
  bossPerRun: 2.6,
  /** Ley line (20 resin): Hero's Wit equivalent per run. */
  heroWitPerRun: 5.75,
};
export const RESIN_PER_DAY = 180;

export interface ResinEstimate {
  bookRuns: number;
  bossRuns: number;
  leyRuns: number;
  resin: number;
  days: number;
}

/** Resin for the missing talent books, boss materials and EXP (gems, weekly bosses excluded). */
export function resinEstimate(missing: Map<string, number>, heroWitMissing: number): ResinEstimate {
  const seriesNeed = new Map<string, number>();
  let bossRuns = 0;
  for (const [id, n] of missing) {
    const m = MATERIALS[id];
    if (!m || n <= 0) continue;
    if (m.kind === 'book') {
      const series = String(Number(id) - (m.rank - 2)); // green id of the series
      seriesNeed.set(series, (seriesNeed.get(series) ?? 0) + n * 3 ** (m.rank - 2));
    } else if (m.kind === 'boss') bossRuns += Math.ceil(n / DROPS.bossPerRun);
  }
  let bookRuns = 0;
  for (const green of seriesNeed.values()) bookRuns += Math.ceil(green / DROPS.bookGreenPerRun);
  const leyRuns = Math.ceil(Math.max(0, heroWitMissing) / DROPS.heroWitPerRun);
  const resin = bookRuns * 20 + bossRuns * 40 + leyRuns * 20;
  return { bookRuns, bossRuns, leyRuns, resin, days: Math.ceil(resin / RESIN_PER_DAY) };
}

/** Talent book series (green-book ids) a character uses. */
export function bookSeriesOf(characterId: string): string[] {
  const mats = MATS.get(characterId);
  if (!mats) return [];
  const ids = new Set<string>();
  for (const [items] of mats.talent) {
    for (const id of Object.keys(items)) {
      const m = MATERIALS[id];
      if (m?.kind === 'book') ids.add(String(Number(id) - (m.rank - 2)));
    }
  }
  return [...ids];
}

/** Key materials of a character for compact display: books, boss drop, weekly drop, gem. */
export function keyMaterials(characterId: string): MaterialDef[] {
  const mats = MATS.get(characterId);
  if (!mats) return [];
  const seen = new Map<MatKind, MaterialDef>();
  const consider = (items: Record<string, number>) => {
    for (const id of Object.keys(items)) {
      const m = MATERIALS[id];
      if (!m || seen.has(m.kind)) continue;
      if (m.kind === 'book' && m.rank !== 2) continue;
      if (m.kind === 'gem' && m.rank !== 5) continue;
      if (['book', 'boss', 'weekly', 'gem', 'local'].includes(m.kind)) seen.set(m.kind, m);
    }
  };
  mats.talent.forEach(([i]) => consider(i));
  mats.asc.forEach(([i]) => consider(i));
  return (['book', 'boss', 'weekly', 'gem', 'local'] as MatKind[]).map((k) => seen.get(k)).filter((m): m is MaterialDef => !!m);
}

export const isOpenOn = (m: MaterialDef, weekday: number) => weekday === 0 || !!m.days?.includes(weekday);

