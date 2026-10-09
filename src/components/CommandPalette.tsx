import {
  CalendarDays,
  ChartNoAxesColumn,
  Compass,
  CornerDownLeft,
  House,
  Languages,
  Library,
  ListChecks,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Tv,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BASE_CHARACTERS } from '../data/characters';
import { useT } from '../i18n';
import { setSetting, spendResin } from '../lib/actions';
import { displayTitle } from '../lib/anime';
import { navigate, type Route } from '../lib/router';
import { getState, useStore } from '../lib/store';
import { setUI, useUI } from '../lib/ui';
import { presetDiscoverQuery } from '../views/anime/Discover';
import { toast } from './toast';
import { Cover, ElementIcon } from './visuals';

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

/** Subsequence fuzzy score; higher is better, -1 means no match. */
function score(text: string, q: string): number {
  if (!q) return 0;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx === 0) return 1000 - t.length;
  if (idx > 0) return 500 - idx;
  let ti = 0;
  let gaps = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    gaps += found - ti;
    ti = found + 1;
  }
  return 100 - gaps;
}

export function CommandPalette() {
  const open = useUI((s) => s.palette);
  if (!open) return null;
  return createPortal(<Palette />, document.body);
}

function Palette() {
  const t = useT();
  const anime = useStore((s) => s.anime);
  const custom = useStore((s) => s.customCharacters);
  const titleLang = useStore((s) => s.settings.titleLang);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const close = () => setUI({ palette: false });

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  const items = useMemo<Item[]>(() => {
    const go = (to: Route) => () => navigate(to);
    const nav = t('cmd.navigate');
    const act = t('cmd.actions');
    const base: Item[] = [
      { id: 'n-home', group: nav, label: t('nav.home'), icon: <House size={16} />, run: go('/') },
      { id: 'n-today', group: nav, label: `${t('nav.teyvat')} › ${t('nav.today')}`, icon: <ListChecks size={16} />, keywords: 'resin harz dailies', run: go('/teyvat') },
      { id: 'n-chars', group: nav, label: `${t('nav.teyvat')} › ${t('nav.characters')}`, icon: <Users size={16} />, run: go('/teyvat/characters') },
      { id: 'n-wishes', group: nav, label: `${t('nav.teyvat')} › ${t('nav.wishes')}`, icon: <Sparkles size={16} />, keywords: 'pity gacha banner', run: go('/teyvat/wishes') },
      { id: 'n-lib', group: nav, label: `${t('nav.anime')} › ${t('nav.library')}`, icon: <Library size={16} />, run: go('/anime') },
      { id: 'n-sched', group: nav, label: `${t('nav.anime')} › ${t('nav.schedule')}`, icon: <CalendarDays size={16} />, run: go('/anime/schedule') },
      { id: 'n-stats', group: nav, label: `${t('nav.anime')} › ${t('nav.stats')}`, icon: <ChartNoAxesColumn size={16} />, run: go('/anime/stats') },
      { id: 'n-disc', group: nav, label: t('nav.discover'), icon: <Compass size={16} />, run: go('/discover') },
      { id: 'n-set', group: nav, label: t('nav.settings'), icon: <Settings size={16} />, run: go('/settings') },
      {
        id: 'a-theme',
        group: act,
        label: t('cmd.toggleTheme'),
        icon: document.documentElement.dataset.resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
        keywords: 'dark light theme design',
        run: () => setSetting('theme', document.documentElement.dataset.resolvedTheme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'a-lang',
        group: act,
        label: t('cmd.switchLang'),
        icon: <Languages size={16} />,
        keywords: 'language sprache deutsch english',
        run: () => setSetting('lang', getState().settings.lang === 'de' ? 'en' : 'de'),
      },
      ...[20, 40].map((n) => ({
        id: `a-spend-${n}`,
        group: act,
        label: t(n === 20 ? 'cmd.spend20' : 'cmd.spend40'),
        icon: <Zap size={16} />,
        keywords: 'resin harz',
        run: () => spendResin(n) && toast({ message: t('resin.spent', { n }) }),
      })),
      { id: 'a-add', group: act, label: t('cmd.addAnime'), icon: <Tv size={16} />, run: go('/discover') },
    ];
    const animeItems: Item[] = anime.map((a) => ({
      id: `anime-${a.id}`,
      group: t('cmd.anime'),
      label: displayTitle(a, titleLang),
      hint: t(`anime.status.${a.status}`),
      keywords: [a.title.romaji, a.title.english, a.title.native].filter(Boolean).join(' '),
      icon: <Cover src={a.cover} title={a.title.romaji} color={a.color} className="cmd-cover" />,
      run: () => setUI({ animeId: a.id }),
    }));
    const charItems: Item[] = [...BASE_CHARACTERS, ...custom].map((c) => ({
      id: `char-${c.id}`,
      group: t('cmd.characters'),
      label: c.name,
      hint: t(`el.${c.element}`),
      icon: <ElementIcon element={c.element} size={14} />,
      run: () => setUI({ characterId: c.id }),
    }));
    return [...base, ...animeItems, ...charItems];
  }, [t, anime, custom, titleLang]);

  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) return items.filter((i) => !i.id.startsWith('char-')).slice(0, 30);
    const scored = items
      .map((i) => ({ i, s: Math.max(score(i.label, needle), i.keywords ? score(i.keywords, needle) - 50 : -1) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.i);
    scored.push({
      id: 'a-anilist',
      group: t('cmd.actions'),
      label: t('cmd.searchAniList', { q: q.trim() }),
      icon: <Search size={16} />,
      run: () => {
        presetDiscoverQuery(q.trim());
        navigate('/discover');
        // Re-mount Discover if already there so it picks up the query.
        window.dispatchEvent(new Event('waypoint:discover'));
      },
    });
    return scored;
  }, [items, needle, q, t]);

  useEffect(() => setActive(0), [needle]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const runItem = (i: Item) => {
    close();
    i.run();
  };

  // Group while preserving order.
  const groups: { name: string; items: { item: Item; index: number }[] }[] = [];
  results.forEach((item, index) => {
    let g = groups.find((x) => x.name === item.group);
    if (!g) groups.push((g = { name: item.group, items: [] }));
    g.items.push({ item, index });
  });
  const ordered = groups.flatMap((g) => g.items.map((x) => x.item));

  return (
    <div className="palette-root" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('nav.search')}>
        <div className="palette-input">
          <Search size={18} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('cmd.placeholder')}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={ordered[active] ? `pi-${ordered[active].id}` : undefined}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(ordered.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (ordered[active]) runItem(ordered[active]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
          />
        </div>
        <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {ordered.length === 0 && <li className="palette-empty">{t('cmd.empty')}</li>}
          {groups.map((g) => (
            <li key={g.name} role="presentation">
              <div className="palette-group">{g.name}</div>
              <ul role="presentation">
                {g.items.map(({ item }) => {
                  const idx = ordered.indexOf(item);
                  return (
                    <li
                      key={item.id}
                      id={`pi-${item.id}`}
                      role="option"
                      aria-selected={idx === active}
                      className={`palette-item ${idx === active ? 'is-active' : ''}`}
                      onMouseMove={() => idx !== active && setActive(idx)}
                      onClick={() => runItem(item)}
                    >
                      <span className="palette-icon">{item.icon}</span>
                      <span className="palette-label">{item.label}</span>
                      {item.hint && <span className="palette-hint">{item.hint}</span>}
                      {idx === active && <CornerDownLeft size={14} className="palette-enter" aria-hidden />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        <div className="palette-foot">{t('cmd.hint')}</div>
      </div>
    </div>
  );
}
