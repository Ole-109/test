import { describe, expect, it } from 'vitest';
import { airedEpisodes, behindBy, isUnrated, occurrences, projectedAiring, repairAnime, withProgress, withStatus, withSynced } from './anime';
import { hydrate } from './store';
import { DAY } from './time';
import type { AnimeEntry } from './types';

const entry = (p: Partial<AnimeEntry> = {}): AnimeEntry => ({
  id: 'a',
  title: { romaji: 'Test' },
  genres: [],
  status: 'watching',
  progress: 0,
  score: 0,
  rewatches: 0,
  favorite: false,
  notes: '',
  addedAt: 0,
  updatedAt: 0,
  ...p,
});

describe('anime helpers', () => {
  it('rolls stale airing data forward by weeks', () => {
    const a = entry({ nextAiring: { at: 0, episode: 5 }, episodes: 12 });
    expect(projectedAiring(a, 10 * DAY)).toEqual({ at: 14 * DAY, episode: 7 });
    expect(airedEpisodes(a, 10 * DAY)).toBe(6);
  });

  it('computes how far behind you are', () => {
    const a = entry({ nextAiring: { at: 1000, episode: 8 }, progress: 4 });
    expect(behindBy(a, 0)).toBe(3);
    expect(behindBy(entry({ airStatus: 'FINISHED', episodes: 12, progress: 12 }), 0)).toBe(0);
  });

  it('lists weekly occurrences in a window', () => {
    const a = entry({ nextAiring: { at: DAY, episode: 3 }, episodes: 4 });
    const occ = occurrences(a, 0, 30 * DAY);
    expect(occ.map((o) => o.episode)).toEqual([3, 4]);
  });

  it('includes episodes that already aired earlier in the window', () => {
    const a = entry({ nextAiring: { at: 8 * DAY, episode: 6 } });
    expect(occurrences(a, 0, 7 * DAY)).toEqual([{ entry: a, at: DAY, episode: 5 }]);
  });

  it('does not invent airings for a show on a break', () => {
    const a = entry({ nextAiring: { at: 60 * DAY, episode: 20 } });
    expect(occurrences(a, 0, 7 * DAY)).toEqual([]);
  });

  it('moves planning → watching → completed with progress', () => {
    let a = entry({ status: 'planning', episodes: 2 });
    a = withProgress(a, 1, 5);
    expect(a.status).toBe('watching');
    expect(a.startedAt).toBe(5);
    a = withProgress(a, 2, 9);
    expect(a.status).toBe('completed');
    expect(a.completedAt).toBe(9);
    expect(withProgress(a, 5).progress).toBe(2);
  });

  it('undoing the last episode re-opens a completed show', () => {
    const done = withProgress(entry({ episodes: 2, progress: 1 }), 2, 5);
    expect(done.status).toBe('completed');
    const back = withProgress(done, 1, 9);
    expect(back.status).toBe('watching');
    expect(back.completedAt).toBeUndefined();
  });

  it('completing fills progress', () => {
    expect(withStatus(entry({ episodes: 24, progress: 3 }), 'completed').progress).toBe(24);
  });
});

describe('unrated', () => {
  it('counts watched shows without a score', () => {
    expect(isUnrated({ score: 0, status: 'completed', progress: 0 })).toBe(true);
    expect(isUnrated({ score: 0, status: 'watching', progress: 3 })).toBe(true);
    expect(isUnrated({ score: 0, status: 'dropped', progress: 1 })).toBe(true);
    expect(isUnrated({ score: 0, status: 'planning', progress: 0 })).toBe(false);
    expect(isUnrated({ score: 7, status: 'completed', progress: 12 })).toBe(false);
    // A planned show is never "watched", whatever its episode count says.
    expect(isUnrated({ score: 0, status: 'planning', progress: 24 })).toBe(false);
  });

  it('moving a completed show back to "Plan to watch" clears the episodes it filled in', () => {
    const done = withStatus(entry({ episodes: 24 }), 'completed', 1000);
    expect(done.progress).toBe(24);
    const planned = withStatus(done, 'planning', 2000);
    expect(planned).toMatchObject({ status: 'planning', progress: 0, completedAt: undefined });
    // Back to "Watching" after finishing is a rewatch from episode 0.
    const watching = withStatus(done, 'watching', 2000);
    expect(watching).toMatchObject({ status: 'watching', progress: 0, rewatches: 1, completedAt: undefined });
    // Completed → Paused → Plan to watch also ends up unwatched.
    expect(withStatus(withStatus(done, 'paused', 2000), 'planning', 3000)).toMatchObject({ progress: 0, completedAt: undefined });
    // Re-selecting the current status changes nothing.
    expect(withStatus(done, 'completed', 9999)).toBe(done);
  });

  it('only stepping forward completes a show', () => {
    // Total lowered below progress, then −1: must not complete.
    const over = entry({ status: 'watching', progress: 12, episodes: 10 });
    expect(withProgress(over, 11).status).toBe('watching');
    expect(withProgress(entry({ status: 'watching', progress: 9, episodes: 10 }), 10).status).toBe('completed');
  });

  it('merges AniList data without losing what the user set', () => {
    const typed = entry({ status: 'watching', progress: 3, episodes: 12 });
    expect(withSynced(typed, { episodes: undefined, airStatus: 'RELEASING' }).episodes).toBe(12);
    // A completed show with an unknown total gets its episodes once the total is known.
    expect(withSynced(entry({ status: 'completed', progress: 0 }), { episodes: 13 }).progress).toBe(13);
    // Watched every episode of a show that has now finished airing → completed.
    const done = withSynced(entry({ status: 'watching', progress: 12 }), { episodes: 12, airStatus: 'FINISHED' }, 5);
    expect(done).toMatchObject({ status: 'completed', completedAt: 5 });
  });

  it('repairs entries saved by older versions', () => {
    const broken = entry({ status: 'planning', progress: 24, episodes: 24, completedAt: 5 });
    expect(repairAnime(broken)).toMatchObject({ progress: 0, completedAt: undefined });
    const fine = entry({ status: 'planning', progress: 0 });
    expect(repairAnime(fine)).toBe(fine);
    expect(hydrate({ anime: [broken] }).anime[0].progress).toBe(0);
  });
});

describe('schedule', () => {
  it('does not invent an airing in a week the show skipped', () => {
    const week = 7 * DAY;
    const now = Date.UTC(2026, 9, 12, 12); // Monday
    // Next episode (6) airs in 12 days: the week in between has no airing.
    const a = entry({ status: 'watching', nextAiring: { at: now + 12 * DAY, episode: 6 } });
    const list = occurrences(a, now - DAY, now - DAY + week, now);
    expect(list).toHaveLength(0);
    // An episode that aired earlier today still shows.
    const b = entry({ status: 'watching', nextAiring: { at: now + week - 3600_000, episode: 6 } });
    expect(occurrences(b, now - 6 * 3600_000, now + DAY, now).map((o) => o.episode)).toEqual([5]);
  });
});
