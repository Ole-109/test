import type { T } from '../../i18n';
import { en, type MessageKey } from '../../i18n/en';
import type { AnimeEntry } from '../../lib/types';

const has = (k: string): k is MessageKey => k in en;

export const formatLabel = (t: T, f?: string) => (f ? (has(`format.${f}`) ? t(`format.${f}` as MessageKey) : f) : '');
export const airLabel = (t: T, s?: string) => (s ? (has(`air.${s}`) ? t(`air.${s}` as MessageKey) : s) : '');
export const seasonLabel = (t: T, s?: string, y?: number) =>
  [s && has(`season.${s}`) ? t(`season.${s}` as MessageKey) : s, y].filter(Boolean).join(' ');

/** AniList's genres (the adult-only genre is added by `genresFor`). */
export const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

/** Genres to offer; "Hentai" only when 18+ titles are shown. */
export const genresFor = (adult: boolean) => (adult ? [...GENRES, 'Hentai'] : GENRES);

const GENRE_DE: Record<string, string> = {
  Adventure: 'Abenteuer',
  Comedy: 'Komödie',
  Music: 'Musik',
  Psychological: 'Psychologisch',
  Romance: 'Romantik',
  'Sci-Fi': 'Science-Fiction',
  Sports: 'Sport',
  Supernatural: 'Übernatürlich',
};

/** Genre names come from AniList in English; custom genres stay as typed. */
export const genreLabel = (t: T, g: string) => (t.lang === 'de' ? (GENRE_DE[g] ?? g) : g);

/** "TV · Fall 2026 · 12 ep" style meta line. */
export function metaLine(t: T, a: Pick<AnimeEntry, 'format' | 'season' | 'year' | 'episodes'>) {
  return [formatLabel(t, a.format), seasonLabel(t, a.season, a.year), a.episodes ? t.n('anime.eps', a.episodes) : '']
    .filter(Boolean)
    .join(' · ');
}
