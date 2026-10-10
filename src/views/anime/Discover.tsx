import { Compass, Plus, Search, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { toast } from '../../components/toast';
import { Button, Empty, PageHeader, Segmented } from '../../components/ui';
import { Cover } from '../../components/visuals';
import { useT } from '../../i18n';
import { addAnime, mergeSynced } from '../../lib/actions';
import { AniListError, browseAnime, fetchByIds, mediaFields, searchAnime, type AniMedia, type BrowseMode } from '../../lib/anilist';
import { useDebounced } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import type { AnimeStatus } from '../../lib/types';
import { AnimeSheet } from './AnimeSheet';
import { Catalog } from './Catalog';
import { airLabel, genreLabel, GENRES, metaLine } from './labels';
import { MediaCard, mediaTitle } from './MediaCard';

const cache = new Map<string, AniMedia[]>();
const QUERY_KEY = 'waypoint:discoverQuery';
const MODE_KEY = 'waypoint:discoverMode';
type Mode = BrowseMode | 'all';

/** Lets other parts of the app (command palette) open Discover with a query. */
export function presetDiscoverQuery(q: string) {
  try {
    sessionStorage.setItem(QUERY_KEY, q);
  } catch {
    /* ignore */
  }
}

export function Discover() {
  const t = useT();
  const titleLang = useStore((s) => s.settings.titleLang);
  const anime = useStore((s) => s.anime);
  const [mode, setModeState] = useState<Mode>(() => {
    try {
      const v = sessionStorage.getItem(MODE_KEY);
      return v === 'season' || v === 'upcoming' || v === 'popular' || v === 'all' ? v : 'trending';
    } catch {
      return 'trending';
    }
  });
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      sessionStorage.setItem(MODE_KEY, m);
    } catch {
      /* private mode */
    }
  };
  const all = mode === 'all';
  const [q, setQ] = useState(() => {
    try {
      const v = sessionStorage.getItem(QUERY_KEY) ?? '';
      sessionStorage.removeItem(QUERY_KEY);
      return v;
    } catch {
      return '';
    }
  });
  const [genre, setGenre] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const key = all ? '' : `${dq ? `q:${dq.toLowerCase()}` : `m:${mode}`}|${genre}`;
  const [results, setResults] = useState<AniMedia[] | null>(() => cache.get(key) ?? null);
  const [error, setError] = useState<'network' | 'rate' | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<AniMedia | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (all) return;
    const hit = cache.get(key);
    if (hit) {
      setResults(hit);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    (dq ? searchAnime(dq, ctrl.signal, genre) : browseAnime(mode as BrowseMode, ctrl.signal, genre))
      .then((r) => {
        cache.set(key, r);
        setResults(r);
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        setError(e instanceof AniListError && e.message === 'rate' ? 'rate' : 'network');
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [key, dq, mode, genre, retry, all]);

  // Catalog results come without descriptions (smaller requests): load it for the preview.
  useEffect(() => {
    if (!preview || preview.description !== undefined) return;
    let alive = true;
    fetchByIds([preview.id])
      .then(([full]) => alive && full && setPreview((cur) => (cur?.id === full.id ? { ...cur, ...full } : cur)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [preview]);

  const byAniList = new Map(anime.filter((a) => a.anilistId).map((a) => [a.anilistId!, a]));

  const add = (m: AniMedia, status: AnimeStatus) => {
    if (byAniList.has(m.id)) {
      toast({ message: t('anime.already') });
      return;
    }
    const e = addAnime({ ...mediaFields(m), title: mediaFields(m).title! }, status);
    // Fill in the synopsis for entries added from the catalog.
    if (m.description === undefined)
      fetchByIds([m.id])
        .then((media) => mergeSynced(new Map(media.map((x) => [x.id, mediaFields(x)]))))
        .catch(() => {});
    toast({
      message: t('anime.added', { name: mediaTitle(m, titleLang), status: t(`anime.status.${status}`) }),
      tone: 'success',
      action: { label: t('common.edit'), run: () => setOpenId(e.id) },
    });
  };

  return (
    <div className="page">
      <PageHeader title={t('discover.title')} subtitle={t('discover.subtitle')} />

      <div className="discover-bar">
        <label className="search search-lg">
          <Search size={18} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('discover.search')}
            aria-label={t('discover.search')}
            autoFocus={!!q}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
          />
          {q && (
            <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={() => setQ('')}>
              <X size={16} />
            </button>
          )}
        </label>
        {(!dq || all) && (
          <Segmented
            label={t('discover.title')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'trending', label: t('discover.trending') },
              { value: 'season', label: t('discover.season') },
              { value: 'upcoming', label: t('discover.upcoming') },
              { value: 'popular', label: t('discover.popular') },
              { value: 'all', label: t('catalog.tab') },
            ]}
          />
        )}
        {!all && (
          <select className="select" value={genre} onChange={(e) => setGenre(e.target.value)} aria-label={t('anime.category')}>
            <option value="">{t('anime.allGenres')}</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {genreLabel(t, g)}
              </option>
            ))}
          </select>
        )}
      </div>

      {all ? (
        <Catalog
          query={dq}
          titleLang={titleLang}
          owned={byAniList}
          onOpenOwned={setOpenId}
          onPreview={setPreview}
          onAdd={add}
        />
      ) : error ? (
        <Empty
          icon={<WifiOff size={28} />}
          title={error === 'rate' ? t('discover.rate') : t('discover.error')}
          action={<Button onClick={() => (cache.delete(key), setRetry((r) => r + 1))}>{t('common.retry')}</Button>}
        />
      ) : loading && !results?.length ? (
        <div className="discover-grid" aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="media-card skeleton" />
          ))}
        </div>
      ) : results && results.length === 0 ? (
        <Empty icon={<Compass size={28} />} title={t('discover.noResults', { q: dq })} />
      ) : (
        <div className={`discover-grid ${loading ? 'is-loading' : ''}`}>
          {results?.map((m) => {
            const owned = byAniList.get(m.id);
            return (
              <MediaCard
                key={m.id}
                m={m}
                title={mediaTitle(m, titleLang)}
                owned={!!owned}
                onOpen={() => (owned ? setOpenId(owned.id) : setPreview(m))}
                onAdd={(st) => add(m, st)}
              />
            );
          })}
        </div>
      )}

      <p className="muted small attribution">
        {t('discover.poweredBy')} ·{' '}
        <a href="https://anilist.co" target="_blank" rel="noreferrer noopener">
          anilist.co
        </a>
      </p>

      {preview && (
        <Sheet
          open
          onClose={() => setPreview(null)}
          variant="drawer"
          title={mediaTitle(preview, titleLang)}
          closeLabel={t('common.close')}
          hero={
            <div className="sheet-hero anime-hero">
              {preview.bannerImage && <img className="anime-hero-bg" src={preview.bannerImage} alt="" referrerPolicy="no-referrer" />}
              <Cover
                src={preview.coverImage.extraLarge ?? preview.coverImage.large ?? undefined}
                title={preview.title.romaji}
                color={preview.coverImage.color ?? undefined}
                className="anime-hero-cover"
              />
              <div className="anime-hero-text">
                <div className="muted small">
                  {metaLine(t, {
                    format: preview.format ?? undefined,
                    season: preview.season ?? undefined,
                    year: preview.seasonYear ?? undefined,
                    episodes: preview.episodes ?? undefined,
                  })}
                </div>
                <div className="row gap-xs wrap">
                  {preview.status && <span className="badge">{airLabel(t, preview.status)}</span>}
                  {preview.averageScore != null && <span className="badge">{t('anime.avgScore', { n: preview.averageScore })}</span>}
                </div>
              </div>
            </div>
          }
          footer={
            <>
              <Button
                onClick={() => {
                  add(preview, 'planning');
                  setPreview(null);
                }}
              >
                {t('anime.status.planning')}
              </Button>
              <Button
                variant="primary"
                data-autofocus
                icon={<Plus size={16} />}
                onClick={() => {
                  add(preview, 'watching');
                  setPreview(null);
                }}
              >
                {t('anime.status.watching')}
              </Button>
            </>
          }
        >
          {preview.genres.length > 0 && (
            <div className="genres">
              {preview.genres.map((g) => (
                <span key={g} className="tag">
                  {genreLabel(t, g)}
                </span>
              ))}
            </div>
          )}
          <p className="synopsis-text">{mediaFields(preview).synopsis}</p>
        </Sheet>
      )}
      {openId && <AnimeSheet id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

