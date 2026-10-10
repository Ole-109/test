import { Hourglass, Library, Loader2, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty } from '../../components/ui';
import { useT } from '../../i18n';
import type { AniMedia } from '../../lib/anilist';
import { anilistFetcher, CatalogCursor, RateLimitError, type CatalogFilters, type CatalogItem, type CatalogSort } from '../../lib/catalog';
import type { AnimeEntry, AnimeStatus } from '../../lib/types';
import { airLabel, formatLabel, genreLabel, genresFor, seasonLabel } from './labels';
import { MediaCard, mediaTitle } from './MediaCard';

const STATE_KEY = 'waypoint:catalog';
const BATCH = 60;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC'];
const AIR = ['RELEASING', 'FINISHED', 'NOT_YET_RELEASED', 'HIATUS', 'CANCELLED'];
const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const SORTS: CatalogSort[] = ['az', 'za', 'popular', 'score', 'newest', 'trending'];
const SCORES = [60, 70, 75, 80, 85];
const YEARS = Array.from({ length: new Date().getFullYear() + 2 - 1940 }, (_, i) => new Date().getFullYear() + 1 - i);

interface Saved {
  filters: Omit<CatalogFilters, 'search'>;
  sort: CatalogSort;
}

function loadSaved(): Saved {
  try {
    const v = JSON.parse(sessionStorage.getItem(STATE_KEY) ?? 'null') as Saved | null;
    if (v && Array.isArray(v.filters?.genres) && SORTS.includes(v.sort)) return v;
  } catch {
    /* ignore */
  }
  return { filters: { genres: [] }, sort: 'az' };
}

/**
 * The whole AniList catalog: filters, any sort, A–Z letter jumps, endless
 * scrolling. Paging and merging live in lib/catalog.ts.
 */
export function Catalog({
  query,
  adult,
  titleLang,
  owned,
  onOpenOwned,
  onPreview,
  onAdd,
}: {
  query: string;
  /** Include titles AniList marks as adult (18+). */
  adult: boolean;
  titleLang: string;
  owned: Map<number, AnimeEntry>;
  onOpenOwned: (id: string) => void;
  onPreview: (m: AniMedia) => void;
  onAdd: (m: AniMedia, s: AnimeStatus) => void;
}) {
  const t = useT();
  const [saved, setSaved] = useState(loadSaved);
  const { filters: base, sort } = saved;
  const filters = useMemo<CatalogFilters>(
    // The adult-only genre is ignored while 18+ titles are hidden.
    () => ({ ...base, genres: adult ? base.genres : base.genres.filter((g) => g !== 'Hentai'), search: query || undefined, adult: adult || undefined }),
    [base, query, adult],
  );
  const key = JSON.stringify([filters, sort]);

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [busy, setBusy] = useState<'load' | 'jump' | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<'rate' | 'network' | null>(null);
  const [wait, setWait] = useState(0);
  const [letter, setLetter] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const cursor = useRef<CatalogCursor | null>(null);
  /** Synchronous busy flag: the scroll observer can fire before React re-renders. */
  const busyRef = useRef(false);
  /** What the last operation was, so "Retry" repeats a failed letter jump instead of appending. */
  const lastKind = useRef<'load' | 'jump'>('load');
  const gen = useRef(0);
  const ctrl = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<Saved> & { filters?: Saved['filters'] }) => {
    setSaved((cur) => {
      const next = { ...cur, ...patch };
      try {
        sessionStorage.setItem(STATE_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  };
  const setFilter = <K extends keyof Saved['filters']>(k: K, v: Saved['filters'][K]) => update({ filters: { ...base, [k]: v } });

  /** Runs a cursor operation; drops the result if filters changed meanwhile. */
  const run = useCallback(async (kind: 'load' | 'jump', op: (c: CatalogCursor) => Promise<CatalogItem[]>, replace: boolean) => {
    const c = cursor.current;
    if (!c) return;
    const g = gen.current;
    lastKind.current = kind;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    try {
      const got = await op(c);
      if (g !== gen.current) return;
      setItems((cur) => (replace ? got : [...cur, ...got]));
      setDone(c.done);
      setTruncated(c.truncated);
    } catch (e) {
      if (g !== gen.current || (e as Error).name === 'AbortError') return;
      setError(e instanceof RateLimitError ? 'rate' : 'network');
    } finally {
      if (g === gen.current) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }, []);

  /** New cursor for the current filters; cancels whatever the old one was doing. */
  const fresh = useCallback(() => {
    gen.current++;
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    cursor.current = new CatalogCursor(anilistFetcher(setWait, ctrl.current.signal), filters, sort);
    setWait(0);
    setDone(false);
    setTruncated(false);
  }, [key]); // `key` stands for filters + sort

  const restart = useCallback(() => {
    fresh();
    setItems([]);
    setLetter(null);
    run('load', (c) => c.next(BATCH), true);
  }, [fresh, run]);

  useEffect(() => {
    restart();
  }, [restart]);
  useEffect(() => () => ctrl.current?.abort(), []);

  const loadMore = useCallback(() => {
    if (busyRef.current || busy || done || error) return;
    run('load', (c) => c.next(BATCH), false);
  }, [busy, done, error, run]);

  // Endless scrolling: load the next batch well before the end comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, items.length]);

  const retry = () => {
    setError(null);
    if (lastKind.current === 'jump' && letter) jump(letter);
    else if (!items.length) restart();
    else run('load', (c) => c.next(BATCH), false);
  };

  const jump = (l: string | null) => {
    setLetter(l);
    top.current?.scrollIntoView({ block: 'start' });
    if (!l) return restart();
    fresh();
    run(
      'jump',
      async (c) => {
        await c.jumpTo(l);
        return c.next(BATCH);
      },
      true,
    );
  };

  const toggleGenre = (g: string) =>
    setFilter('genres', base.genres.includes(g) ? base.genres.filter((x) => x !== g) : [...base.genres, g]);
  const active = base.genres.length > 0 || !!base.format || !!base.status || !!base.season || !!base.year || !!base.minScore;
  const alpha = sort === 'az' || sort === 'za';
  const letters = sort === 'za' ? [...LETTERS].reverse() : LETTERS;

  return (
    <div className="catalog" ref={top}>
      <div className="catalog-filters">
        <select className="select" value={sort} onChange={(e) => update({ sort: e.target.value as CatalogSort })} aria-label={t('common.sort')}>
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`catalog.sort.${s}`)}
            </option>
          ))}
        </select>
        <select className="select" value={base.format ?? ''} onChange={(e) => setFilter('format', e.target.value || undefined)} aria-label={t('anime.format')}>
          <option value="">{t('anime.allFormats')}</option>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {formatLabel(t, f)}
            </option>
          ))}
        </select>
        <select className="select" value={base.status ?? ''} onChange={(e) => setFilter('status', e.target.value || undefined)} aria-label={t('catalog.status')}>
          <option value="">{t('catalog.anyStatus')}</option>
          {AIR.map((s) => (
            <option key={s} value={s}>
              {airLabel(t, s)}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={base.year ?? ''}
          onChange={(e) => setFilter('year', e.target.value ? Number(e.target.value) : undefined)}
          aria-label={t('catalog.year')}
        >
          <option value="">{t('catalog.anyYear')}</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select className="select" value={base.season ?? ''} onChange={(e) => setFilter('season', e.target.value || undefined)} aria-label={t('catalog.season')}>
          <option value="">{t('catalog.anySeason')}</option>
          {SEASONS.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(t, s)}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={base.minScore ?? ''}
          onChange={(e) => setFilter('minScore', e.target.value ? Number(e.target.value) : undefined)}
          aria-label={t('catalog.minScore')}
        >
          <option value="">{t('catalog.anyScore')}</option>
          {SCORES.map((s) => (
            <option key={s} value={s}>
              {t('catalog.scoreAtLeast', { n: s })}
            </option>
          ))}
        </select>
        {active && (
          <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => update({ filters: { genres: [] } })}>
            {t('anime.resetFilters')}
          </Button>
        )}
      </div>

      <div className="cat-chips" role="group" aria-label={t('anime.category')}>
        {genresFor(adult).map((g) => {
          const on = base.genres.includes(g);
          return (
            <button key={g} type="button" className={`cat-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggleGenre(g)}>
              {genreLabel(t, g)}
            </button>
          );
        })}
        {base.genres.length > 0 && (
          <button type="button" className="cat-chip cat-chip-clear" onClick={() => setFilter('genres', [])}>
            <X size={13} aria-hidden />
            {t('anime.clearCategories')}
          </button>
        )}
      </div>

      {alpha && (
        <nav className="az-rail" aria-label={t('catalog.jump')}>
          <button type="button" className={letter === null ? 'is-on' : ''} onClick={() => jump(null)} title={t('catalog.fromStart')}>
            #
          </button>
          {letters.map((l) => (
            <button key={l} type="button" className={letter === l ? 'is-on' : ''} aria-pressed={letter === l} onClick={() => jump(l)}>
              {l}
            </button>
          ))}
        </nav>
      )}

      <div className="catalog-status muted small" role="status">
        {wait > 0 ? (
          <>
            <Hourglass size={14} /> {t('catalog.waiting', { s: wait })}
          </>
        ) : busy === 'jump' ? (
          <>
            <Loader2 size={14} className="spin" /> {t('catalog.jumping', { l: letter ?? '' })}
          </>
        ) : (
          <>
            {t.n('catalog.shown', items.length, { n: t.num(items.length) })}
            {done && items.length > 0 && ` · ${t('catalog.end')}`}
          </>
        )}
      </div>

      {error ? (
        <Empty
          icon={<TriangleAlert size={26} />}
          title={error === 'rate' ? t('discover.rate') : t('discover.error')}
          action={<Button onClick={retry}>{t('common.retry')}</Button>}
        />
      ) : !busy && done && items.length === 0 ? (
        <Empty icon={<Library size={26} />} title={t('catalog.empty')} body={t('catalog.emptyBody')} />
      ) : (
        <div className={`discover-grid ${busy === 'jump' ? 'is-loading' : ''}`}>
          {items.map((m) => {
            const mine = owned.get(m.id);
            // Sorted by romaji title, so show it first and the preferred title below.
            const title = alpha ? m.title.romaji : mediaTitle(m, titleLang);
            const sub = alpha && titleLang !== 'romaji' ? mediaTitle(m, titleLang) : undefined;
            return (
              <MediaCard
                key={m.id}
                m={m}
                title={title}
                subtitle={sub}
                owned={!!mine}
                onOpen={() => (mine ? onOpenOwned(mine.id) : onPreview(m))}
                onAdd={(s) => onAdd(m, s)}
              />
            );
          })}
          {busy === 'load' && Array.from({ length: items.length ? 6 : 18 }, (_, i) => <div key={`s${i}`} className="media-card skeleton" />)}
        </div>
      )}

      {truncated && (
        <p className="notice notice-warn small">
          <TriangleAlert size={14} /> {t('catalog.truncated')}
        </p>
      )}
      <div ref={sentinel} className="catalog-sentinel" aria-hidden />
      {!done && !busy && !error && items.length > 0 && (
        <div className="center">
          <Button onClick={loadMore}>{t('catalog.more')}</Button>
        </div>
      )}
    </div>
  );
}
