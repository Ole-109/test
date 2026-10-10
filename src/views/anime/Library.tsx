import { Compass, LayoutGrid, List, PenLine, Plus, Search, StarOff, Tv, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Empty, IconButton, PageHeader } from '../../components/ui';
import { useT } from '../../i18n';
import { behindBy, displayTitle, isUnrated, isUntouched, STATUSES } from '../../lib/anime';
import { useNow } from '../../lib/hooks';
import { navigate } from '../../lib/router';
import { useStore } from '../../lib/store';
import type { AnimeEntry, AnimeStatus } from '../../lib/types';
import { AnimeCard } from './AnimeCard';
import { AnimeSheet, ManualAnimeSheet } from './AnimeSheet';
import { AnimeTabs } from './AnimeTabs';
import { formatLabel, genreLabel } from './labels';

type Sort = 'updated' | 'title' | 'score' | 'progress' | 'added';
type Tab = AnimeStatus | 'all';

const VIEW_KEY = 'waypoint:libraryView';

export function Library() {
  const t = useT();
  const now = useNow(30_000);
  const anime = useStore((s) => s.anime);
  const titleLang = useStore((s) => s.settings.titleLang);
  const [tab, setTab] = useState<Tab>(() => (anime.some((a) => a.status === 'watching') ? 'watching' : 'all'));
  const [q, setQ] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [format, setFormat] = useState('');
  const [unrated, setUnrated] = useState(false);
  const [sort, setSort] = useState<Sort>('updated');
  const [layout, setLayout] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: anime.length, watching: 0, planning: 0, completed: 0, paused: 0, dropped: 0 };
    for (const a of anime) c[a.status]++;
    return c;
  }, [anime]);

  const formats = useMemo(() => [...new Set(anime.map((a) => a.format).filter((f): f is string => !!f))].sort(), [anime]);
  const episodesWatched = anime.reduce((s, a) => s + a.progress + a.rewatches * (a.episodes ?? 0), 0);

  // Everything except the categories, so the chips can show how many shows each one would leave.
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (a: AnimeEntry) =>
      !needle ||
      [a.title.romaji, a.title.english, a.title.native].some((x) => x?.toLowerCase().includes(needle));
    const cmp: Record<Sort, (a: AnimeEntry, b: AnimeEntry) => number> = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      added: (a, b) => b.addedAt - a.addedAt,
      title: (a, b) => displayTitle(a, titleLang).localeCompare(displayTitle(b, titleLang)),
      score: (a, b) => b.score - a.score || b.updatedAt - a.updatedAt,
      progress: (a, b) =>
        (b.episodes ? b.progress / b.episodes : 0) - (a.episodes ? a.progress / a.episodes : 0) || b.updatedAt - a.updatedAt,
    };
    return anime
      .filter((a) => (tab === 'all' || a.status === tab) && (!format || a.format === format) && match(a))
      .sort((a, b) => {
        // In "Watching", shows with new episodes come first.
        if (tab === 'watching' && sort === 'updated') {
          const d = Number(behindBy(b, now) > 0) - Number(behindBy(a, now) > 0);
          if (d) return d;
        }
        // In "All", shows you have started come before ones you only plan to watch.
        if (tab === 'all' && sort === 'updated') {
          const d = Number(isUntouched(a)) - Number(isUntouched(b));
          if (d) return d;
        }
        return cmp[sort](a, b);
      });
  }, [anime, tab, format, q, sort, titleLang, now]);

  /** A show must have every selected category. */
  const inCats = useMemo(() => (cats.length ? base.filter((a) => cats.every((c) => a.genres.includes(c))) : base), [base, cats]);
  // Counted with every other filter applied, so the number matches what the toggle shows.
  const unratedCount = useMemo(() => inCats.filter(isUnrated).length, [inCats]);
  const list = useMemo(() => (unrated ? inCats.filter(isUnrated) : inCats), [inCats, unrated]);

  const chips = useMemo(() => {
    const count = new Map<string, number>();
    for (const a of list) for (const g of a.genres) count.set(g, (count.get(g) ?? 0) + 1);
    const all = new Set([...anime.flatMap((a) => a.genres), ...cats]);
    return [...all]
      .map((g) => ({ g, n: cats.includes(g) ? list.length : (count.get(g) ?? 0) }))
      .filter((c) => c.n > 0 || cats.includes(c.g))
      .sort((a, b) => Number(cats.includes(b.g)) - Number(cats.includes(a.g)) || b.n - a.n || a.g.localeCompare(b.g));
  }, [anime, list, cats]);

  const toggleCat = (g: string) => setCats((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  const filtered = cats.length > 0 || !!format || unrated || !!q.trim();

  const setView = (v: 'grid' | 'list') => {
    setLayout(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const tabs: Tab[] = ['all', ...STATUSES];

  return (
    <div className="page">
      <AnimeTabs />
      <PageHeader
       
        title={t('anime.title')}
        subtitle={`${t.n('anime.subtitle', anime.length)} · ${t.n('anime.watchedEps', episodesWatched)}`}
        actions={
          <>
            <Button icon={<PenLine size={16} />} onClick={() => setManual(true)}>
              {t('anime.addManual')}
            </Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/discover')}>
              {t('anime.add')}
            </Button>
          </>
        }
      />

      {anime.length === 0 ? (
        <Empty
          icon={<Tv size={32} />}
          title={t('anime.emptyTitle')}
          body={t('anime.emptyBody')}
          action={
            <div className="row gap-sm center wrap">
              <Button variant="primary" icon={<Compass size={16} />} onClick={() => navigate('/discover')}>
                {t('anime.findOnline')}
              </Button>
              <Button icon={<PenLine size={16} />} onClick={() => setManual(true)}>
                {t('anime.addManual')}
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="status-tabs" role="tablist" aria-label={t('anime.status')}>
            {tabs.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={tab === s}
                className={tab === s ? 'is-active' : ''}
                onClick={() => setTab(s)}
              >
                {s !== 'all' && <span className={`status-dot st-${s}`} aria-hidden />}
                {s === 'all' ? t('common.all') : t(`anime.status.${s}`)}
                <span className="seg-count">{counts[s]}</span>
              </button>
            ))}
          </div>

          <div className="toolbar">
            <label className="search">
              <Search size={16} aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('anime.search')} aria-label={t('anime.search')} />
            </label>
            {(unratedCount > 0 || unrated) && (
              <button
                type="button"
                className={`cat-chip unrated-toggle ${unrated ? 'is-on' : ''}`}
                aria-pressed={unrated}
                title={t('anime.unratedHint')}
                onClick={() => setUnrated((u) => !u)}
              >
                <StarOff size={13} aria-hidden />
                {t('anime.unrated')}
                <span className="cat-chip-n num">{unratedCount}</span>
              </button>
            )}
            {formats.length > 1 && (
              <select className="select" value={format} onChange={(e) => setFormat(e.target.value)} aria-label={t('anime.format')}>
                <option value="">{t('anime.allFormats')}</option>
                {formats.map((f) => (
                  <option key={f} value={f}>
                    {formatLabel(t, f)}
                  </option>
                ))}
              </select>
            )}
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('common.sort')}>
              {(['updated', 'added', 'title', 'score', 'progress'] as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {t(`anime.sort.${s}`)}
                </option>
              ))}
            </select>
            <div className="row gap-xs">
              <IconButton label={t('anime.view.grid')} active={layout === 'grid'} onClick={() => setView('grid')}>
                <LayoutGrid size={18} />
              </IconButton>
              <IconButton label={t('anime.view.list')} active={layout === 'list'} onClick={() => setView('list')}>
                <List size={18} />
              </IconButton>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="cat-chips" role="group" aria-label={t('anime.category')}>
              {chips.map(({ g, n }) => {
                const on = cats.includes(g);
                return (
                  <button key={g} type="button" className={`cat-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggleCat(g)}>
                    {genreLabel(t, g)}
                    <span className="cat-chip-n num">{n}</span>
                  </button>
                );
              })}
              {cats.length > 0 && (
                <button type="button" className="cat-chip cat-chip-clear" onClick={() => setCats([])}>
                  <X size={13} aria-hidden />
                  {t('anime.clearCategories')}
                </button>
              )}
            </div>
          )}

          {list.length === 0 ? (
            <Empty
              icon={<Search size={28} />}
              title={t('anime.emptyFiltered')}
              action={
                filtered ? (
                  <Button
                    onClick={() => {
                      setCats([]);
                      setFormat('');
                      setUnrated(false);
                      setQ('');
                    }}
                  >
                    {t('anime.resetFilters')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className={layout === 'grid' ? 'anime-grid' : 'anime-list'}>
              {list.map((a) => (
                <AnimeCard key={a.id} a={a} now={now} layout={layout} quickRate={unrated} onOpen={() => setOpenId(a.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {openId && <AnimeSheet id={openId} onClose={() => setOpenId(null)} />}
      <ManualAnimeSheet open={manual} onClose={() => setManual(false)} />
    </div>
  );
}
