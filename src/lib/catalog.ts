/**
 * Browse the whole AniList catalog with filters and a stable sort.
 *
 * AniList stops paging after 5,000 results per query (page × perPage ≤ 5000)
 * and its `pageInfo.total` is capped, so the full catalog (~20k anime) can't be
 * paged through in one query. The catalog is therefore split into popularity
 * ranges that each stay under the limit; every range is paged with the same
 * sort and the ranges are merged client-side. Several ranges are fetched in one
 * HTTP request (GraphQL aliases) to stay within the rate limit (30/min).
 *
 * Filters only ever shrink a range, so one fixed split of the unfiltered
 * catalog works for every query and no planning requests are needed.
 */
import catalogIndex from '../data/anilist-catalog.json';
import type { AniMedia } from './anilist';

export type CatalogSort = 'az' | 'za' | 'popular' | 'score' | 'newest' | 'trending';

export interface CatalogFilters {
  /** All selected genres must match. */
  genres: string[];
  format?: string;
  status?: string;
  season?: string;
  year?: number;
  /** Minimum average score (0–100). */
  minScore?: number;
  search?: string;
  /** Include titles AniList marks as adult (18+). */
  adult?: boolean;
}

export interface CatalogItem extends AniMedia {
  popularity: number;
  trending: number;
  startDate: { year: number | null; month: number | null; day: number | null } | null;
}

/** [min, max) popularity; max null = no upper bound. null range = no popularity filter. */
export type PopRange = [number, number | null] | null;

export interface PageRequest {
  alias: string;
  range: PopRange;
  page: number;
  /** Only ids and titles (for planning and letter jumps). */
  light?: boolean;
}

export interface PageResult {
  items: CatalogItem[];
  hasNext: boolean;
}

/** Runs several page queries at once (one HTTP request). */
export type PageFetcher = (filters: CatalogFilters, sort: CatalogSort, requests: PageRequest[]) => Promise<Record<string, PageResult>>;

export const PER_PAGE = 50;
/** Deepest page AniList serves (5,000 entries). */
export const MAX_PAGE = 100;

export const SERVER_SORT: Record<CatalogSort, string[]> = {
  az: ['TITLE_ROMAJI', 'ID'],
  za: ['TITLE_ROMAJI_DESC', 'ID_DESC'],
  popular: ['POPULARITY_DESC', 'ID'],
  score: ['SCORE_DESC', 'POPULARITY_DESC'],
  newest: ['START_DATE_DESC', 'POPULARITY_DESC'],
  trending: ['TRENDING_DESC', 'POPULARITY_DESC'],
};

/** AniList orders titles with the Unicode Collation Algorithm (case-insensitive), as Intl.Collator does. */
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: false });
export const compareTitles = (a: string, b: string) => collator.compare(a, b);

const dateKey = (m: CatalogItem) =>
  m.startDate?.year ? m.startDate.year * 10000 + (m.startDate.month ?? 0) * 100 + (m.startDate.day ?? 0) : -1;

export const COMPARE: Record<CatalogSort, (a: CatalogItem, b: CatalogItem) => number> = {
  az: (a, b) => compareTitles(a.title.romaji, b.title.romaji) || a.id - b.id,
  za: (a, b) => compareTitles(b.title.romaji, a.title.romaji) || b.id - a.id,
  popular: (a, b) => b.popularity - a.popularity || a.id - b.id,
  score: (a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1) || b.popularity - a.popularity,
  newest: (a, b) => dateKey(b) - dateKey(a) || b.popularity - a.popularity,
  trending: (a, b) => b.trending - a.trending || b.popularity - a.popularity,
};

/** Range boundaries used when the catalog is too big for one query. Popularity starts around 10. */
const BOUNDS = [
  20, 30, 40, 50, 60, 75, 90, 110, 135, 165, 200, 250, 300, 400, 500, 650, 800, 1000, 1300, 1700, 2200, 3000, 4000, 5500, 8000, 12000,
  20000, 35000, 70000, 150000,
];

/**
 * Popularity ranges of the unfiltered catalog, each well under 5,000 entries,
 * and where each letter starts inside them (A–Z jump hints). Filters only
 * shrink a range, so the split works for every query. Regenerate with
 * `node scripts/sync-anilist-index.mjs`; pick new ranges with
 * `planStreams(anilistFetcher(), { genres: [] }, 'az', 3200)` if one grows past ~4,500.
 */
export const STATIC_RANGES = catalogIndex.ranges as [number, number | null][];

export interface LetterIndex {
  total: number;
  /** Entries before the letter. */
  before: Record<string, number>;
  /** Entries up to the end of the letter. */
  upto: Record<string, number>;
}

const STATIC_INDEX = catalogIndex.streams as LetterIndex[];
const STATIC_INDEX_ADULT = (catalogIndex as { adultStreams?: LetterIndex[] }).adultStreams ?? [];

export const isUnfiltered = (f: CatalogFilters) =>
  !f.genres.length && !f.format && !f.status && !f.season && !f.year && !f.minScore && !f.search?.trim();

export interface Stream {
  range: PopRange;
  /** Upper bound of the number of entries, when known. */
  size?: number;
  /** Last page fetched. */
  page: number;
  buffer: CatalogItem[];
  done: boolean;
}

/**
 * Number of entries in each range (Infinity when a range is too big to page
 * through). Binary-searches the last page of all ranges at once, one request per step.
 */
async function countRanges(fetch: PageFetcher, filters: CatalogFilters, sort: CatalogSort, ranges: [number, number | null][]) {
  const counts: (number | undefined)[] = ranges.map(() => undefined);
  const lo = ranges.map(() => 0); // last page known to be full
  const hi = ranges.map(() => MAX_PAGE); // page that is empty or the deepest page
  let pages = ranges.map(() => MAX_PAGE);
  for (;;) {
    const open = ranges.map((_, i) => i).filter((i) => counts[i] === undefined);
    if (!open.length) break;
    const res = await fetch(
      filters,
      sort,
      open.map((i) => ({ alias: `r${i}`, range: ranges[i], page: pages[i], light: true })),
    );
    for (const i of open) {
      const { items, hasNext } = res[`r${i}`];
      const page = pages[i];
      if (items.length === PER_PAGE && hasNext) {
        if (page === MAX_PAGE) counts[i] = Infinity;
        else lo[i] = page;
      } else if (items.length > 0) counts[i] = (page - 1) * PER_PAGE + items.length;
      else hi[i] = page;
      if (counts[i] === undefined && hi[i] - lo[i] <= 1) counts[i] = lo[i] * PER_PAGE;
    }
    pages = pages.map((p, i) => (counts[i] === undefined ? Math.max(1, Math.floor((lo[i] + hi[i]) / 2)) : p));
  }
  return counts as number[];
}

/**
 * Splits the catalog into as few popularity ranges as possible that each fit
 * under AniList's paging limit.
 */
export async function planStreams(fetch: PageFetcher, filters: CatalogFilters, sort: CatalogSort, limit = MAX_PAGE * PER_PAGE): Promise<Stream[]> {
  const whole = await fetch(filters, sort, [{ alias: 'all', range: null, page: MAX_PAGE, light: true }]);
  const all = whole.all;
  if (all.items.length < PER_PAGE || !all.hasNext) return [{ range: null, page: 0, buffer: [], done: false }];

  let ranges: [number, number | null][] = [[0, BOUNDS[0]], ...BOUNDS.map((b, i) => [b, BOUNDS[i + 1] ?? null] as [number, number | null])];
  let counts = await countRanges(fetch, filters, sort, ranges);
  // Split any range that is still too big (rare; very large catalogs or new data).
  for (let guard = 0; counts.some((c) => c === Infinity) && guard < 6; guard++) {
    const next: [number, number | null][] = [];
    ranges.forEach((r, i) => {
      if (counts[i] !== Infinity) return next.push(r);
      const top = r[1] ?? r[0] * 4;
      const mid = Math.floor((r[0] + top) / 2);
      if (mid <= r[0]) return next.push(r);
      next.push([r[0], mid], [mid, r[1]]);
    });
    ranges = next;
    counts = await countRanges(fetch, filters, sort, ranges);
  }
  // Merge neighbouring ranges while they still fit.
  const merged: { range: [number, number | null]; size: number }[] = [];
  ranges.forEach((r, i) => {
    const last = merged[merged.length - 1];
    if (last && last.size + counts[i] <= limit) {
      last.range = [last.range[0], r[1]];
      last.size += counts[i];
    } else merged.push({ range: [r[0], r[1]], size: counts[i] });
  });
  // The outer ends stay open so nothing falls between the cracks.
  merged[0].range[0] = 0;
  merged[merged.length - 1].range[1] = null;
  const streams: Stream[] = merged.map((m) => ({ range: m.range, size: m.size, page: 0, buffer: [], done: false }));
  return streams;
}

const matchesGenres = (m: CatalogItem, genres: string[]) => genres.every((g) => m.genres.includes(g));

/** A merged, sorted cursor over the whole (filtered) catalog. */
export class CatalogCursor {
  streams: Stream[] = [];
  private seen = new Set<number>();
  /** A range reached AniList's paging limit, so some entries could not be listed. */
  truncated = false;

  private index: (LetterIndex | undefined)[];

  constructor(
    private fetch: PageFetcher,
    readonly filters: CatalogFilters,
    readonly sort: CatalogSort,
    ranges: PopRange[] = STATIC_RANGES,
    index: (LetterIndex | undefined)[] = ranges === STATIC_RANGES ? (filters.adult ? STATIC_INDEX_ADULT : STATIC_INDEX) : [],
  ) {
    this.streams = ranges.map((range) => ({ range, page: 0, buffer: [], done: false }));
    this.index = index;
  }

  get done() {
    return this.streams.every((s) => s.done && s.buffer.length === 0);
  }

  /**
   * Fetches the next page of every stream whose buffer is empty. Streams that
   * are running low ride along in the same request, which saves requests.
   */
  private async refill() {
    if (!this.streams.some((s) => !s.done && s.buffer.length === 0)) return;
    const need = this.streams.map((s, i) => ({ s, i })).filter(({ s }) => !s.done && s.buffer.length < PER_PAGE / 2);
    const res = await this.fetch(
      this.filters,
      this.sort,
      need.map(({ s, i }) => ({ alias: `s${i}`, range: s.range, page: s.page + 1 })),
    );
    for (const { s, i } of need) {
      const r = res[`s${i}`];
      s.page++;
      s.buffer.push(...r.items);
      if (!r.hasNext || r.items.length === 0 || s.page >= MAX_PAGE) s.done = true;
      if (r.hasNext && s.page >= MAX_PAGE) this.truncated = true;
    }
  }

  private queue: Promise<unknown> = Promise.resolve();

  /** Runs cursor operations one after another; overlapping calls would skip pages. */
  private serial<T>(op: () => Promise<T>): Promise<T> {
    const run = this.queue.then(op, op);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** The next `n` anime in order (fewer at the end of the catalog). */
  next(n = PER_PAGE): Promise<CatalogItem[]> {
    return this.serial(() => this.take(n));
  }

  private async take(n: number): Promise<CatalogItem[]> {
    const cmp = COMPARE[this.sort];
    const out: CatalogItem[] = [];
    while (out.length < n) {
      await this.refill();
      let best: Stream | null = null;
      for (const s of this.streams) if (s.buffer.length && (!best || cmp(s.buffer[0], best.buffer[0]) < 0)) best = s;
      if (!best) break;
      const item = best.buffer.shift()!;
      if (this.seen.has(item.id) || !matchesGenres(item, this.filters.genres)) continue;
      this.seen.add(item.id);
      out.push(item);
    }
    return out;
  }

  /** Page where `key` starts in a stream of the unfiltered catalog, from the letter index. */
  private hintPage(i: number, key: string): number | undefined {
    const ix = this.index[i];
    if (!ix || !(key in ix.before)) return undefined;
    const pos = this.sort === 'az' ? ix.before[key] : ix.total - ix.upto[key];
    return Math.min(MAX_PAGE, Math.floor(pos / PER_PAGE) + 1);
  }

  /**
   * Moves the cursor to the first title starting with `letter` (A–Z sorts only).
   * Every stream searches for the page that holds the start of the letter, all
   * streams per request: from the letter index when there are no filters (one
   * or two requests), else galloping forward from page 1 – shallow pages are
   * fast, deep ones slow – with the index position as an upper bound.
   */
  jumpTo(letter: string): Promise<void> {
    return this.serial(() => this.seek(letter));
  }

  private async seek(letter: string) {
    if (this.sort !== 'az' && this.sort !== 'za') return;
    const asc = this.sort === 'az';
    const key = letter.toLowerCase();
    const before = (title: string) => (asc ? compareTitles(title, key) < 0 : compareTitles(title, key + '\uffff') > 0);
    const unfiltered = isUnfiltered(this.filters);
    const st = this.streams.map((_, i) => {
      const hint = this.hintPage(i, key);
      return {
        lo: 1, // pages before lo are entirely before the key
        hi: Infinity, // page hi holds the start, or is past the end
        probe: unfiltered && hint ? hint : 1,
        step: 1,
        back: !!(unfiltered && hint),
        cap: !unfiltered && hint ? hint + 1 : Infinity,
        found: undefined as number | undefined,
        pages: new Map<number, PageResult>(),
      };
    });
    for (let round = 0; round < 24; round++) {
      const open = st.map((_, i) => i).filter((i) => st[i].found === undefined);
      if (!open.length) break;
      const res = await this.fetch(
        this.filters,
        this.sort,
        open.map((i) => ({ alias: `j${i}`, range: this.streams[i].range, page: st[i].probe })),
      );
      for (const i of open) {
        const x = st[i];
        const p = x.probe;
        const r = res[`j${i}`];
        x.pages.set(p, r);
        const { items } = r;
        if (!items.length) x.hi = Math.min(x.hi, p);
        else if (before(items[items.length - 1].title.romaji)) {
          x.lo = Math.max(x.lo, p + 1);
          if (!r.hasNext) x.found = p; // the whole stream comes before the key
        } else {
          x.hi = Math.min(x.hi, p);
          if (p === 1 || before(items[0].title.romaji)) x.found = p; // the key starts on this page
        }
        if (x.found !== undefined) continue;
        if (x.lo >= x.hi || x.lo > MAX_PAGE) {
          x.found = Math.min(x.hi, MAX_PAGE);
          continue;
        }
        if (x.lo >= x.cap) x.cap = Infinity; // the index was off; keep galloping
        if (x.hi === Infinity) {
          // Gallop forward: lo, lo+1, lo+3, lo+7, … (bounded by the index position when filtered).
          x.probe = Math.min(MAX_PAGE, x.cap - 1, x.lo + x.step - 1);
          x.step *= 2;
          if (x.probe < x.lo) x.probe = x.lo;
        } else if (x.back && x.lo === 1) {
          // The index pointed past the start (the catalog grew): step back 1, 2, 4, … pages.
          x.probe = Math.max(1, x.hi - x.step);
          x.step *= 2;
        } else x.probe = Math.floor((x.lo + x.hi) / 2);
      }
    }
    // Load pages the search settled on without fetching them.
    const missing = st.map((x, i) => ({ x, i })).filter(({ x }) => x.found !== undefined && !x.pages.has(x.found));
    if (missing.length) {
      const res = await this.fetch(
        this.filters,
        this.sort,
        missing.map(({ x, i }) => ({ alias: `p${i}`, range: this.streams[i].range, page: x.found! })),
      );
      for (const { x, i } of missing) x.pages.set(x.found!, res[`p${i}`]);
    }
    this.seen.clear();
    this.streams.forEach((s, i) => {
      const x = st[i];
      const page = x.found ?? 1;
      const r = x.pages.get(page) ?? { items: [], hasNext: false };
      s.page = page;
      s.buffer = r.items.filter((m) => !before(m.title.romaji));
      s.done = !r.hasNext || r.items.length === 0 || page >= MAX_PAGE;
    });
  }
}

// ── AniList implementation ────────────────────────────────────────────────

const ENUMS = {
  format: ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC'],
  status: ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'],
  season: ['WINTER', 'SPRING', 'SUMMER', 'FALL'],
};

const FULL_FIELDS = `id title { romaji english native } coverImage { large extraLarge color } bannerImage format episodes duration genres isAdult season seasonYear status averageScore popularity trending startDate { year month day } nextAiringEpisode { airingAt episode }`;
const LIGHT_FIELDS = `id title { romaji } genres popularity`;

/** GraphQL arguments for the filters. Strings are JSON-encoded, enums whitelisted. */
export function filterArgs(f: CatalogFilters, sort: CatalogSort, range: PopRange): string {
  const args = ['type: ANIME', `sort: [${SERVER_SORT[sort].join(', ')}]`];
  if (!f.adult) args.push('isAdult: false');
  // The first genre narrows the query; further genres are checked locally (AniList's genre_in means "any of").
  if (f.genres[0]) args.push(`genre: ${JSON.stringify(f.genres[0])}`);
  if (f.format && ENUMS.format.includes(f.format)) args.push(`format: ${f.format}`);
  if (f.status && ENUMS.status.includes(f.status)) args.push(`status: ${f.status}`);
  if (f.season && ENUMS.season.includes(f.season)) args.push(`season: ${f.season}`);
  if (f.year && Number.isInteger(f.year)) args.push(`seasonYear: ${f.year}`);
  if (f.minScore && Number.isInteger(f.minScore)) args.push(`averageScore_greater: ${f.minScore - 1}`);
  if (f.search?.trim()) args.push(`search: ${JSON.stringify(f.search.trim())}`);
  if (range) {
    if (range[0] > 0) args.push(`popularity_greater: ${range[0] - 1}`);
    if (range[1] != null) args.push(`popularity_lesser: ${range[1]}`);
  }
  return args.join(', ');
}

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super('rate');
  }
}

/**
 * Real fetcher. Waits and retries when AniList rate-limits (reports the wait
 * through `onWait` so the UI can show it).
 */
export function anilistFetcher(onWait?: (seconds: number) => void, signal?: AbortSignal): PageFetcher {
  return async (filters, sort, requests) => {
    const query = `query { ${requests
      .map((r) => `${r.alias}: Page(page: ${r.page}, perPage: ${PER_PAGE}) { pageInfo { hasNextPage } media(${filterArgs(filters, sort, r.range)}) { ${r.light ? LIGHT_FIELDS : FULL_FIELDS} } }`)
      .join(' ')} }`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query }),
        signal,
      });
      if (res.status === 429 && attempt < 3) {
        const wait = Math.min(65, Number(res.headers.get('Retry-After')) || 30);
        onWait?.(wait);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, wait * 1000);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
        onWait?.(0);
        continue;
      }
      if (res.status === 429) throw new RateLimitError(60);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error(json?.errors?.[0]?.message ?? `HTTP ${res.status}`);
      const out: Record<string, PageResult> = {};
      for (const r of requests) {
        const p = json.data[r.alias];
        out[r.alias] = { items: (p?.media ?? []) as CatalogItem[], hasNext: !!p?.pageInfo?.hasNextPage };
      }
      return out;
    }
  };
}
