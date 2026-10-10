import { describe, expect, it } from 'vitest';
import { airedEpisodes, behindBy, occurrences, projectedAiring, withProgress, withStatus } from './anime';
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
