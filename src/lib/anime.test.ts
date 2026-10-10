import { describe, expect, it } from 'vitest';
import { airedEpisodes, behindBy, isUnrated, occurrences, projectedAiring, repairAnime, withProgress, withStatus } from './anime';
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
    // Back to "Watching" keeps the episodes but is no longer completed.
    const watching = withStatus(done, 'watching', 2000);
    expect(watching).toMatchObject({ status: 'watching', progress: 24, completedAt: undefined });
  });

  it('repairs entries saved by older versions', () => {
    const broken = entry({ status: 'planning', progress: 24, episodes: 24, completedAt: 5 });
    expect(repairAnime(broken)).toMatchObject({ progress: 0, completedAt: undefined });
    const fine = entry({ status: 'planning', progress: 0 });
    expect(repairAnime(fine)).toBe(fine);
    expect(hydrate({ anime: [broken] }).anime[0].progress).toBe(0);
  });
});
