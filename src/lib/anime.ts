import { DAY } from './time';
import type { AnimeEntry, AnimeStatus, TitleLang } from './types';

export const STATUSES: AnimeStatus[] = ['watching', 'planning', 'completed', 'paused', 'dropped'];
const WEEK = 7 * DAY;

export function displayTitle(a: AnimeEntry, pref: TitleLang): string {
  return (pref === 'english' ? a.title.english : pref === 'native' ? a.title.native : undefined) || a.title.romaji;
}

/** Next known airing, rolled forward by whole weeks if the synced value is stale. */
export function projectedAiring(a: AnimeEntry, now: number): { at: number; episode: number } | null {
  if (!a.nextAiring) return null;
  let { at, episode } = a.nextAiring;
  while (at < now) {
    at += WEEK;
    episode += 1;
  }
  if (a.episodes && episode > a.episodes) return null;
  return { at, episode };
}

/** Episodes released so far, if known. */
export function airedEpisodes(a: AnimeEntry, now: number): number | null {
  if (a.airStatus === 'FINISHED') return a.episodes ?? null;
  const next = projectedAiring(a, now);
  if (next) return next.episode - 1;
  if (a.nextAiring && a.episodes) return a.episodes; // projected past the finale
  return null;
}

export function behindBy(a: AnimeEntry, now: number): number {
  const aired = airedEpisodes(a, now);
  return aired == null ? 0 : Math.max(0, aired - a.progress);
}

export interface Occurrence {
  entry: AnimeEntry;
  at: number;
  episode?: number;
}

/** Airings in [from, to) from AniList data or the manual weekly slot. */
export function occurrences(a: AnimeEntry, from: number, to: number): Occurrence[] {
  const out: Occurrence[] = [];
  const next = projectedAiring(a, from);
  if (next) {
    let { at, episode } = next;
    // Include last week's slot if it falls inside the window (e.g. aired earlier today).
    // Only one step: a show returning from a break must not get invented airings.
    if (at - WEEK >= from && episode > 1) {
      at -= WEEK;
      episode -= 1;
    }
    while (at < to && (!a.episodes || episode <= a.episodes)) {
      out.push({ entry: a, at, episode });
      at += WEEK;
      episode += 1;
    }
    return out;
  }
  if (a.nextAiring || a.airDay == null || a.airStatus === 'FINISHED') return out;
  const [hh, mm] = (a.airTime || '00:00').split(':').map(Number);
  const d = new Date(from);
  d.setHours(hh || 0, mm || 0, 0, 0);
  d.setDate(d.getDate() + ((a.airDay - d.getDay() + 7) % 7));
  let at = d.getTime();
  if (at < from) at += WEEK;
  for (; at < to; at += WEEK) out.push({ entry: a, at });
  return out;
}

/** Apply a progress change with the natural status transitions. */
export function withProgress(a: AnimeEntry, progress: number, now = Date.now()): AnimeEntry {
  const max = a.episodes ?? Infinity;
  const p = Math.max(0, Math.min(max, progress));
  const next: AnimeEntry = { ...a, progress: p, updatedAt: now };
  if (p > 0 && (a.status === 'planning' || a.status === 'paused')) next.status = 'watching';
  if (p > 0 && !a.startedAt) next.startedAt = now;
  if (a.episodes && p >= a.episodes && a.status !== 'completed') {
    next.status = 'completed';
    next.completedAt = now;
  } else if (a.status === 'completed' && a.episodes && p < a.episodes) {
    // Undoing the last episode re-opens the show.
    next.status = 'watching';
    next.completedAt = undefined;
  }
  return next;
}

export function withStatus(a: AnimeEntry, status: AnimeStatus, now = Date.now()): AnimeEntry {
  const next: AnimeEntry = { ...a, status, updatedAt: now };
  if (status === 'completed') {
    next.completedAt = now;
    if (a.episodes) next.progress = a.episodes;
  } else if (a.status === 'completed') {
    next.completedAt = undefined;
    // "Completed" filled in every episode; moving it back to "Plan to watch" means it wasn't watched.
    if (status === 'planning') next.progress = 0;
  }
  if (status === 'watching' && !a.startedAt) next.startedAt = now;
  return next;
}

/** Watched (finished or at least one episode seen) but not scored yet. Planned shows never count. */
export const isUnrated = (a: Pick<AnimeEntry, 'score' | 'status' | 'progress'>) =>
  a.score === 0 && a.status !== 'planning' && (a.status === 'completed' || a.progress > 0);

/** Not started yet: planned with no episode seen. */
export const isUntouched = (a: Pick<AnimeEntry, 'status' | 'progress'>) => a.status === 'planning' && a.progress === 0;

/**
 * Repairs entries saved by older versions: a show moved from "Completed" back
 * to "Plan to watch" kept every episode marked as seen.
 */
export function repairAnime(a: AnimeEntry): AnimeEntry {
  if (a.status === 'planning' && a.completedAt) return { ...a, progress: 0, completedAt: undefined };
  return a;
}
