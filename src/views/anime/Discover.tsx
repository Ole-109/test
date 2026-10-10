import { Check, ChevronDown, Compass, Plus, Search, Star, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { toast } from '../../components/toast';
import { Button, Empty, PageHeader, Segmented } from '../../components/ui';
import { Cover } from '../../components/visuals';
import { useT } from '../../i18n';
import { addAnime } from '../../lib/actions';
import { AniListError, browseAnime, mediaFields, searchAnime, type AniMedia, type BrowseMode } from '../../lib/anilist';
import { STATUSES } from '../../lib/anime';
import { useDebounced } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import type { AnimeStatus } from '../../lib/types';
import { AnimeSheet } from './AnimeSheet';
import { airLabel, genreLabel, GENRES, metaLine } from './labels';

const cache = new Map<string, AniMedia[]>();
const QUERY_KEY = 'waypoint:discoverQuery';

/** Lets other parts of the app (command palette) open Discover with a query. */
export function presetDiscoverQuery(q: string) {
  try {
    sessionStorage.setItem(QUERY_KEY, q);
  } catch {
    /* ignore */
  }
}

function mediaTitle(m: AniMedia, pref: string) {
  return (pref === 'english' ? m.title.english : pref === 'native' ? m.title.native : null) || m.title.romaji;
}

export function Discover() {
  const t = useT();
  const titleLang = useStore((s) => s.settings.titleLang);
  const anime = useStore((s) => s.anime);
  const [mode, setMode] = useState<BrowseMode>('trending');
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
  const key = `${dq ? `q:${dq.toLowerCase()}` : `m:${mode}`}|${genre}`;
  const [results, setResults] = useState<AniMedia[] | null>(() => cache.get(key) ?? null);
  const [error, setError] = useState<'network' | 'rate' | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<AniMedia | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hit = cache.get(key);
    if (hit) {
      setResults(hit);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    (dq ? searchAnime(dq, ctrl.signal, genre) : browseAnime(mode, ctrl.signal, genre))
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
  }, [key, dq, mode, genre, retry]);

  const byAniList = new Map(anime.filter((a) => a.anilistId).map((a) => [a.anilistId!, a]));

  const add = (m: AniMedia, status: AnimeStatus) => {
    if (byAniList.has(m.id)) {
      toast({ message: t('anime.already') });
      return;
    }
    const e = addAnime({ ...mediaFields(m), title: mediaFields(m).title! }, status);
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
        {!dq && (
          <Segmented
            label={t('discover.title')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'trending', label: t('discover.trending') },
              { value: 'season', label: t('discover.season') },
              { value: 'upcoming', label: t('discover.upcoming') },
              { value: 'popular', label: t('discover.popular') },
            ]}
          />
        )}
        <select className="select" value={genre} onChange={(e) => setGenre(e.target.value)} aria-label={t('anime.category')}>
          <option value="">{t('anime.allGenres')}</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>
              {genreLabel(t, g)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
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
            const title = mediaTitle(m, titleLang);
            return (
              <article key={m.id} className="media-card">
                <button type="button" className="media-open" onClick={() => (owned ? setOpenId(owned.id) : setPreview(m))} aria-label={title}>
                  <Cover src={m.coverImage.extraLarge ?? m.coverImage.large ?? undefined} title={title} color={m.coverImage.color ?? undefined} />
                  {m.averageScore != null && (
                    <span className="media-score">
                      <Star size={11} fill="currentColor" strokeWidth={0} aria-hidden /> {m.averageScore}%
                    </span>
                  )}
                  <div className="media-info">
                    <h3 title={title}>{title}</h3>
                    <p className="muted small">
                      {metaLine(t, {
                        format: m.format ?? undefined,
                        season: m.season ?? undefined,
                        year: m.seasonYear ?? undefined,
                        episodes: m.episodes ?? undefined,
                      })}
                    </p>
                  </div>
                </button>
                {owned ? (
                  <span className="media-owned">
                    <Check size={14} /> {t('discover.inLibrary')}
                  </span>
                ) : (
                  <AddMenu onAdd={(s) => add(m, s)} />
                )}
              </article>
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

function AddMenu({ onAdd }: { onAdd: (s: AnimeStatus) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="add-menu" ref={ref}>
      <button type="button" className="add-main" onClick={() => onAdd('planning')}>
        <Plus size={14} /> {t('anime.status.planning')}
      </button>
      <button type="button" className="add-more" aria-label={t('discover.addAs')} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => {
                onAdd(s);
                setOpen(false);
              }}
            >
              <span className={`status-dot st-${s}`} aria-hidden /> {t(`anime.status.${s}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
