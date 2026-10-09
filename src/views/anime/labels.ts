import type { T } from '../../i18n';
import { en, type MessageKey } from '../../i18n/en';
import type { AnimeEntry } from '../../lib/types';

const has = (k: string): k is MessageKey => k in en;

export const formatLabel = (t: T, f?: string) => (f ? (has(`format.${f}`) ? t(`format.${f}` as MessageKey) : f) : '');
export const airLabel = (t: T, s?: string) => (s ? (has(`air.${s}`) ? t(`air.${s}` as MessageKey) : s) : '');
export const seasonLabel = (t: T, s?: string, y?: number) =>
  [s && has(`season.${s}`) ? t(`season.${s}` as MessageKey) : s, y].filter(Boolean).join(' ');

/** "TV · Fall 2026 · 12 ep" style meta line. */
export function metaLine(t: T, a: Pick<AnimeEntry, 'format' | 'season' | 'year' | 'episodes'>) {
  return [formatLabel(t, a.format), seasonLabel(t, a.season, a.year), a.episodes ? t('anime.eps', { n: a.episodes }) : '']
    .filter(Boolean)
    .join(' · ');
}
