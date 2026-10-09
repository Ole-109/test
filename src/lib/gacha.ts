import type { BannerKey } from './types';

export const PRIMOS_PER_PULL = 160;
export const STARGLITTER_PER_PULL = 5;

export interface BannerRules {
  hard: number;
  softStart: number;
  base: number;
  step: number;
  /** Chance that a 5★ is the featured/chosen item without a guarantee. */
  featured: number;
}

/**
 * Community-derived model of the official rates: a flat base rate that ramps
 * linearly after soft pity and is guaranteed at hard pity.
 */
export const RULES: Record<BannerKey, BannerRules> = {
  character: { hard: 90, softStart: 74, base: 0.006, step: 0.06, featured: 0.5 },
  chronicled: { hard: 90, softStart: 74, base: 0.006, step: 0.06, featured: 0.5 },
  standard: { hard: 90, softStart: 74, base: 0.006, step: 0.06, featured: 1 },
  // Epitomized Path with 1 fate point: 75% featured × 50% chosen = 37.5%.
  weapon: { hard: 80, softStart: 63, base: 0.007, step: 0.07, featured: 0.375 },
};

/** Probability that the n-th pull since the last 5★ (1-indexed) is a 5★. */
export function fiveStarRate(rules: BannerRules, n: number): number {
  if (n >= rules.hard) return 1;
  if (n < rules.softStart) return rules.base;
  return Math.min(1, rules.base + rules.step * (n - rules.softStart + 1));
}

/**
 * Probability of having obtained at least `copies` featured 5★ after each pull,
 * starting from the current pity and guarantee state. Returns an array where
 * index i is the cumulative probability after i pulls (index 0 = 0 pulls).
 */
export function featuredCurve(
  rules: BannerRules,
  opts: { pity: number; guaranteed: boolean; copies: number; maxPulls: number; featured?: number },
): number[] {
  const { hard } = rules;
  const featured = opts.featured ?? rules.featured;
  const copies = Math.max(1, opts.copies);
  // state index: (c * 2 + g) * hard + pity
  const size = copies * 2 * hard;
  let cur = new Float64Array(size);
  const startPity = Math.min(Math.max(0, opts.pity), hard - 1);
  cur[(0 * 2 + (opts.guaranteed ? 1 : 0)) * hard + startPity] = 1;
  let done = 0;
  const out = [0];
  for (let pull = 1; pull <= opts.maxPulls; pull++) {
    const next = new Float64Array(size);
    for (let c = 0; c < copies; c++) {
      for (let g = 0; g < 2; g++) {
        const base = (c * 2 + g) * hard;
        for (let p = 0; p < hard; p++) {
          const mass = cur[base + p];
          if (mass === 0) continue;
          const rate = fiveStarRate(rules, p + 1);
          const hit = mass * rate;
          const miss = mass - hit;
          if (miss > 0) next[base + p + 1] += miss;
          const win = g === 1 ? 1 : featured;
          const winMass = hit * win;
          if (c + 1 >= copies) done += winMass;
          else next[((c + 1) * 2 + 0) * hard] += winMass;
          const loseMass = hit - winMass;
          if (loseMass > 0) next[(c * 2 + 1) * hard] += loseMass;
        }
      }
    }
    cur = next;
    out.push(Math.min(1, done));
  }
  return out;
}

/** Expected number of pulls to reach the goal (from a curve that reaches ~1). */
export function expectedPulls(curve: number[]): number {
  let e = 0;
  for (let i = 1; i < curve.length; i++) e += 1 - curve[i - 1];
  return e;
}

/** Worst-case pulls needed to guarantee `copies` featured items. */
export function worstCase(banner: BannerKey, pity: number, guaranteed: boolean, copies: number): number {
  const { hard } = RULES[banner];
  const perCopy = banner === 'standard' ? hard : hard * 2;
  const firstLeft = hard - pity;
  if (banner === 'standard') return firstLeft + (copies - 1) * hard;
  const first = guaranteed ? firstLeft : firstLeft + hard;
  return first + (copies - 1) * perCopy;
}

export function totalPulls(primogems: number, fates: number, starglitter: number): number {
  return Math.floor(primogems / PRIMOS_PER_PULL) + fates + Math.floor(starglitter / STARGLITTER_PER_PULL);
}
