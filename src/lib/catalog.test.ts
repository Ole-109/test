import { describe, expect, it } from 'vitest';
import {
  CatalogCursor,
  planStreams,
  COMPARE,
  compareTitles,
  filterArgs,
  MAX_PAGE,
  PER_PAGE,
  type CatalogFilters,
  type CatalogItem,
  type CatalogSort,
  type LetterIndex,
  type PageFetcher,
} from './catalog';

// Deterministic pseudo-random data.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const WORDS = ['ai', 'Boku', 'kimi', 'Sora', 'no', 'Hoshi', 'yume', '.hack//', 'Zero', 'Mahou', 'Tensei', '!NVADE', 'Ōkami', 'quest', 'Ultra', 'élan'];
const GENRES = ['Action', 'Comedy', 'Drama', 'Sports', 'Romance'];

function makeItem(id: number): CatalogItem {
  const n = 1 + Math.floor(rnd() * 3);
  const title = Array.from({ length: n }, () => WORDS[Math.floor(rnd() * WORDS.length)]).join(' ') + ` ${id % 97}`;
  const genres = GENRES.filter(() => rnd() < 0.3);
  // Heavy tail like AniList: most entries are obscure.
  const popularity = Math.floor(10 + 200000 * rnd() ** 6);
  return {
    id,
    title: { romaji: title, english: null, native: null },
    coverImage: { large: null, extraLarge: null, color: null },
    bannerImage: null,
    format: 'TV',
    episodes: 12,
    duration: 24,
    genres,
    season: null,
    seasonYear: 2000 + (id % 25),
    status: 'FINISHED',
    averageScore: rnd() < 0.2 ? null : Math.floor(40 + rnd() * 50),
    description: null,
    nextAiringEpisode: null,
    popularity,
    trending: Math.floor(rnd() * 100),
    startDate: { year: 2000 + (id % 25), month: 1 + (id % 12), day: 1 },
  };
}

const DATA = Array.from({ length: 12_000 }, (_, i) => makeItem(i + 1));

/** In-memory AniList: same filters, same sort, same 5,000-entry paging limit. */
function fakeServer() {
  const calls: number[] = [];
  const fetcher: PageFetcher = async (filters, sort, requests) => {
    calls.push(requests.length);
    const out: Record<string, { items: CatalogItem[]; hasNext: boolean }> = {};
    for (const r of requests) {
      if (r.page * PER_PAGE > MAX_PAGE * PER_PAGE) throw new Error('Page depth exceeds maximum');
      let list = DATA.filter(
        (m) =>
          (!filters.genres[0] || m.genres.includes(filters.genres[0])) &&
          (!r.range || (m.popularity >= r.range[0] && (r.range[1] == null || m.popularity < r.range[1]))),
      );
      list = [...list].sort(COMPARE[sort]);
      const start = (r.page - 1) * PER_PAGE;
      out[r.alias] = { items: list.slice(start, start + PER_PAGE), hasNext: start + PER_PAGE < list.length };
    }
    return out;
  };
  return { fetcher, calls };
}

async function drain(c: CatalogCursor) {
  const all: CatalogItem[] = [];
  for (let i = 0; i < 1000 && !c.done; i++) all.push(...(await c.next(200)));
  return all;
}

describe('catalog cursor', () => {
  it('walks the whole catalog A–Z past the 5,000 limit, each anime once', async () => {
    const { fetcher, calls } = fakeServer();
    const c = new CatalogCursor(fetcher, { genres: [] }, 'az');
    const all = await drain(c);
    expect(c.streams.length).toBeGreaterThan(2);
    expect(all).toHaveLength(DATA.length);
    expect(new Set(all.map((m) => m.id)).size).toBe(DATA.length);
    for (let i = 1; i < all.length; i++) expect(COMPARE.az(all[i - 1], all[i])).toBeLessThanOrEqual(0);
    // Several ranges per request: far fewer requests than pages.
    expect(calls.length).toBeLessThan(DATA.length / PER_PAGE / 2);
    expect(c.truncated).toBe(false);
  });

  it('plans ranges that each fit under the paging limit and cover everything', async () => {
    const { fetcher } = fakeServer();
    const streams = await planStreams(fetcher, { genres: [] }, 'az', 3000);
    expect(streams.length).toBeGreaterThan(3);
    expect(streams.every((s) => (s.size ?? 0) <= 3000)).toBe(true);
    expect(streams[0].range![0]).toBe(0);
    expect(streams[streams.length - 1].range![1]).toBeNull();
    const all = await drain(new CatalogCursor(fetcher, { genres: [] }, 'az', streams.map((s) => s.range)));
    expect(all).toHaveLength(DATA.length);
  });

  it('flags ranges that hit the paging limit', async () => {
    const { fetcher } = fakeServer();
    const c = new CatalogCursor(fetcher, { genres: [] }, 'az', [null]);
    const all = await drain(c);
    expect(all).toHaveLength(MAX_PAGE * PER_PAGE);
    expect(c.truncated).toBe(true);
  });

  it.each<CatalogSort>(['za', 'popular', 'score', 'newest'])('keeps %s order across ranges', async (sort) => {
    const { fetcher } = fakeServer();
    const all = await drain(new CatalogCursor(fetcher, { genres: [] }, sort));
    expect(all).toHaveLength(DATA.length);
    for (let i = 1; i < all.length; i++) expect(COMPARE[sort](all[i - 1], all[i])).toBeLessThanOrEqual(0);
  });

  it('applies every selected genre', async () => {
    const { fetcher } = fakeServer();
    const c = new CatalogCursor(fetcher, { genres: ['Sports', 'Drama'] }, 'az');
    const all = await drain(c);
    const want = DATA.filter((m) => m.genres.includes('Sports') && m.genres.includes('Drama'));
    expect(all.map((m) => m.id).sort()).toEqual(want.map((m) => m.id).sort());
  });

  it('jumps to a letter', async () => {
    const { fetcher } = fakeServer();
    const c = new CatalogCursor(fetcher, { genres: [] }, 'az');
    await c.next(50);
    await c.jumpTo('M');
    const rest = await drain(c);
    const want = DATA.filter((m) => compareTitles(m.title.romaji, 'm') >= 0);
    expect(rest).toHaveLength(want.length);
    expect(rest[0].title.romaji.toLowerCase().startsWith('m')).toBe(true);
  });

  it('jumps to a letter in Z–A order', async () => {
    const { fetcher } = fakeServer();
    const c = new CatalogCursor(fetcher, { genres: [] }, 'za');
    await c.jumpTo('K');
    const rest = await drain(c);
    expect(rest[0].title.romaji.toLowerCase().startsWith('k')).toBe(true);
    expect(rest).toHaveLength(DATA.filter((m) => compareTitles(m.title.romaji, 'k\uffff') <= 0).length);
  });
});

describe('concurrency', () => {
  it('overlapping calls neither skip nor repeat entries', async () => {
    const { fetcher } = fakeServer();
    const c = new CatalogCursor(fetcher, { genres: [] }, 'az');
    const batches = await Promise.all([c.next(60), c.next(60), c.next(60)]);
    const all = batches.flat();
    const want = [...DATA].sort(COMPARE.az).slice(0, 180);
    expect(all.map((m) => m.id)).toEqual(want.map((m) => m.id));
  });
});

describe('letter index', () => {
  /** Exact index of the fake catalog for the given ranges, optionally shifted to simulate growth. */
  function indexFor(ranges: [number, number | null][], shift = 0): LetterIndex[] {
    return ranges.map(([lo, hi]) => {
      const titles = DATA.filter((m) => m.popularity >= lo && (hi == null || m.popularity < hi)).map((m) => m.title.romaji);
      const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
      return {
        total: titles.length,
        before: Object.fromEntries(letters.map((l) => [l, Math.max(0, titles.filter((t) => compareTitles(t, l) < 0).length + shift)])),
        upto: Object.fromEntries(letters.map((l) => [l, titles.filter((t) => compareTitles(t, l + '\uffff') <= 0).length])),
      };
    });
  }
  // Each range under the 5,000 paging limit for the fake data.
  const RANGES: [number, number | null][] = [
    [0, 30],
    [30, 300],
    [300, 3000],
    [3000, 30000],
    [30000, null],
  ];

  it('jumps in one request with an accurate index', async () => {
    const { fetcher, calls } = fakeServer();
    const c = new CatalogCursor(fetcher, { genres: [] }, 'az', RANGES, indexFor(RANGES));
    await c.jumpTo('t');
    expect(calls.length).toBeLessThanOrEqual(2);
    const rest = await drain(c);
    expect(rest).toHaveLength(DATA.filter((m) => compareTitles(m.title.romaji, 't') >= 0).length);
  });

  it('corrects an index that drifted by a few pages', async () => {
    for (const shift of [-180, 160]) {
      const { fetcher, calls } = fakeServer();
      const c = new CatalogCursor(fetcher, { genres: [] }, 'az', RANGES, indexFor(RANGES, shift));
      await c.jumpTo('h');
      expect(calls.length).toBeLessThanOrEqual(6);
      const rest = await drain(c);
      expect(rest).toHaveLength(DATA.filter((m) => compareTitles(m.title.romaji, 'h') >= 0).length);
    }
  });

  it('uses the index as an upper bound with filters', async () => {
    const { fetcher } = fakeServer();
    const c = new CatalogCursor(fetcher, { genres: ['Comedy'] }, 'za', RANGES, indexFor(RANGES));
    await c.jumpTo('m');
    const rest = await drain(c);
    expect(rest).toHaveLength(DATA.filter((m) => m.genres.includes('Comedy') && compareTitles(m.title.romaji, 'm\uffff') <= 0).length);
    expect(rest[0].title.romaji.toLowerCase().startsWith('m')).toBe(true);
  });
});

describe('filter arguments', () => {
  it('escapes text and ignores unknown enum values', () => {
    const f: CatalogFilters = { genres: ['Slice of Life', 'Drama'], format: 'TV); evil', status: 'RELEASING', search: 'a"b', minScore: 70, year: 2024 };
    const args = filterArgs(f, 'az', [50, 300]);
    expect(args).toContain('genre: "Slice of Life"');
    expect(args).not.toContain('Drama');
    expect(args).not.toContain('evil');
    expect(args).toContain('status: RELEASING');
    expect(args).toContain('search: "a\\"b"');
    expect(args).toContain('averageScore_greater: 69');
    expect(args).toContain('popularity_greater: 49, popularity_lesser: 300');
    expect(args).toContain('sort: [TITLE_ROMAJI, ID]');
    expect(args).toContain('isAdult: false');
  });

  it('includes 18+ titles only when asked to', () => {
    expect(filterArgs({ genres: [], adult: true }, 'az', null)).not.toContain('isAdult');
    expect(filterArgs({ genres: [] }, 'az', null)).toContain('isAdult: false');
  });
});

