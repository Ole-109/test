import { MINUTE } from './time';
import type { ResinState } from './types';

export const RESIN_INTERVAL = 8 * MINUTE;
export const RESIN_HARD_MAX = 2000;

export interface ResinSnapshot {
  current: number;
  /** ms until the next point regenerates (0 when capped). */
  nextIn: number;
  /** Timestamp when resin reaches the cap (≤ now when already full). */
  fullAt: number;
  capped: boolean;
}

export function resinAt(r: ResinState, cap: number, now: number): ResinSnapshot {
  if (r.value >= cap) return { current: r.value, nextIn: 0, fullAt: r.at, capped: true };
  const elapsed = Math.max(0, now - r.at);
  const gained = Math.floor(elapsed / RESIN_INTERVAL);
  const current = Math.min(cap, r.value + gained);
  const fullAt = r.at + (cap - r.value) * RESIN_INTERVAL;
  if (current >= cap) return { current, nextIn: 0, fullAt, capped: true };
  return { current, nextIn: RESIN_INTERVAL - (elapsed % RESIN_INTERVAL), fullAt, capped: false };
}

/** Time when resin reaches `target` (≤ now if already there). */
export function resinReachAt(r: ResinState, cap: number, target: number, now: number): number {
  const snap = resinAt(r, cap, now);
  if (snap.current >= target) return now;
  if (target > cap) return Infinity;
  return r.at + (target - r.value) * RESIN_INTERVAL;
}

/**
 * Re-anchor resin to a new value while keeping the partial progress toward the
 * next point, so spending resin doesn't reset the regen timer (just like in-game).
 */
export function setResin(r: ResinState, cap: number, nextValue: number, now: number): ResinState {
  const snap = resinAt(r, cap, now);
  const value = Math.max(0, Math.min(RESIN_HARD_MAX, Math.round(nextValue)));
  if (snap.capped || value >= cap) return { ...r, value, at: now };
  const partial = RESIN_INTERVAL - snap.nextIn;
  return { ...r, value, at: now - partial };
}
