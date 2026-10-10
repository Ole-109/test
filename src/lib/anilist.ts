import type { AnimeEntry } from './types';

const ENDPOINT = 'https://graphql.anilist.co';

const FIELDS = `
  id
  title { romaji english native }
  coverImage { large extraLarge color }
  bannerImage
  format
  episodes
  duration
  genres
  season
  seasonYear
  status
  averageScore
  description(asHtml: false)
  nextAiringEpisode { airingAt episode }
`;

export interface AniMedia {
  id: number;
  title: { romaji: string; english: string | null; native: string | null };
  coverImage: { large: string | null; extraLarge: string | null; color: string | null };
  bannerImage: string | null;
  format: string | null;
  episodes: number | null;
  duration: number | null;
  genres: string[];
  season: string | null;
  seasonYear: number | null;
  status: string | null;
  averageScore: number | null;
  description: string | null;
  nextAiringEpisode: { airingAt: number; episode: number } | null;
}

export class AniListError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

async function query<T>(q: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: q, variables }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AniListError('network');
  }
  if (res.status === 429) throw new AniListError('rate', 429);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.errors) throw new AniListError(json?.errors?.[0]?.message ?? 'http', res.status);
  return json.data as T;
}

type PageResult = { Page: { media: AniMedia[] } };

/** `genre` narrows results to one AniList genre; null/undefined means any. */
export async function searchAnime(search: string, signal?: AbortSignal, genre?: string): Promise<AniMedia[]> {
  const q = `query ($search: String, $genre: String) { Page(perPage: 24) { media(search: $search, genre: $genre, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { ${FIELDS} } } }`;
  return (await query<PageResult>(q, { search, genre: genre || null }, signal)).Page.media;
}

export type BrowseMode = 'trending' | 'season' | 'popular' | 'upcoming';

export function currentSeason(date = new Date()): { season: string; year: number } {
  const m = date.getMonth();
  const season = m < 3 ? 'WINTER' : m < 6 ? 'SPRING' : m < 9 ? 'SUMMER' : 'FALL';
  return { season, year: date.getFullYear() };
}

function nextSeason(date = new Date()) {
  const order = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  const { season, year } = currentSeason(date);
  const i = order.indexOf(season);
  return i === 3 ? { season: 'WINTER', year: year + 1 } : { season: order[i + 1], year };
}

export async function browseAnime(mode: BrowseMode, signal?: AbortSignal, genre?: string): Promise<AniMedia[]> {
  const g = genre || null;
  if (mode === 'season' || mode === 'upcoming') {
    const { season, year } = mode === 'season' ? currentSeason() : nextSeason();
    const q = `query ($season: MediaSeason, $year: Int, $genre: String) { Page(perPage: 30) { media(season: $season, seasonYear: $year, genre: $genre, type: ANIME, isAdult: false, sort: POPULARITY_DESC) { ${FIELDS} } } }`;
    return (await query<PageResult>(q, { season, year, genre: g }, signal)).Page.media;
  }
  const sort = mode === 'trending' ? 'TRENDING_DESC' : 'POPULARITY_DESC';
  const q = `query ($sort: [MediaSort], $genre: String) { Page(perPage: 30) { media(genre: $genre, type: ANIME, isAdult: false, sort: $sort) { ${FIELDS} } } }`;
  return (await query<PageResult>(q, { sort: [sort], genre: g }, signal)).Page.media;
}

export async function fetchByIds(ids: number[]): Promise<AniMedia[]> {
  const out: AniMedia[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const q = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { ${FIELDS} } } }`;
    out.push(...(await query<PageResult>(q, { ids: ids.slice(i, i + 50) })).Page.media);
  }
  return out;
}

/** AniList descriptions contain light HTML; render them as plain text only. */
export function plainText(html: string | null | undefined): string {
  if (!html) return '';
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Fields that mirror AniList (refreshed on sync); user fields are untouched. */
export function mediaFields(m: AniMedia): Partial<AnimeEntry> {
  return {
    anilistId: m.id,
    title: { romaji: m.title.romaji, english: m.title.english ?? undefined, native: m.title.native ?? undefined },
    cover: m.coverImage.extraLarge ?? m.coverImage.large ?? undefined,
    banner: m.bannerImage ?? undefined,
    color: m.coverImage.color ?? undefined,
    format: m.format ?? undefined,
    episodes: m.episodes ?? undefined,
    duration: m.duration ?? undefined,
    genres: m.genres ?? [],
    season: m.season ?? undefined,
    year: m.seasonYear ?? undefined,
    airStatus: m.status ?? undefined,
    averageScore: m.averageScore ?? undefined,
    synopsis: plainText(m.description),
    nextAiring: m.nextAiringEpisode
      ? { at: m.nextAiringEpisode.airingAt * 1000, episode: m.nextAiringEpisode.episode }
      : undefined,
    syncedAt: Date.now(),
  };
}
