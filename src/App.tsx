import {
  CalendarDays,
  ChartNoAxesColumn,
  ChevronsLeft,
  ChevronsRight,
  Compass,
  House,
  Library,
  ListChecks,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Tv,
  Users,
  Package,
  Calculator,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { Toaster } from './components/toast';
import { Kbd } from './components/ui';
import { Logo } from './components/visuals';
import { BASE_CHARACTERS } from './data/characters';
import { translate, useT } from './i18n';
import { setSetting } from './lib/actions';
import { useHotkey, useMediaQuery } from './lib/hooks';
import { resinAt } from './lib/resin';
import { href, navigate, useRoute, type Route } from './lib/router';
import { getState, useStore } from './lib/store';
import { syncAiring } from './lib/sync';
import { setUI, useUI } from './lib/ui';
import { AnimeSheet } from './views/anime/AnimeSheet';
import { Discover } from './views/anime/Discover';
import { Library as LibraryView } from './views/anime/Library';
import { Schedule } from './views/anime/Schedule';
import { Stats } from './views/anime/Stats';
import { CharacterSheet } from './views/genshin/CharacterSheet';
import { Characters } from './views/genshin/Characters';
import { Today } from './views/genshin/Today';
import { Wishes } from './views/genshin/Wishes';
import { PlannerPage } from './views/genshin/Planner';
import { Import } from './views/genshin/Import';
import { Inventory } from './views/genshin/Inventory';
import { Home } from './views/Home';
import { Settings } from './views/Settings';

const VIEWS: Record<Route, () => ReactNode> = {
  '/': () => <Home />,
  '/teyvat': () => <Today />,
  '/teyvat/characters': () => <Characters />,
  '/teyvat/wishes': () => <Wishes />,
  '/teyvat/planner': () => <PlannerPage />,
  '/teyvat/import': () => <Import />,
  '/teyvat/inventory': () => <Inventory />,
  '/anime': () => <LibraryView />,
  '/anime/schedule': () => <Schedule />,
  '/anime/stats': () => <Stats />,
  '/discover': () => <Discover />,
  '/settings': () => <Settings />,
};

const GO_KEYS: Record<string, Route> = {
  h: '/',
  t: '/teyvat',
  c: '/teyvat/characters',
  w: '/teyvat/wishes',
  i: '/teyvat/inventory',
  p: '/teyvat/planner',
  a: '/anime',
  s: '/anime/schedule',
  d: '/discover',
};

function useTheme() {
  const pref = useStore((s) => s.settings.theme);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'system') delete root.dataset.theme;
    else root.dataset.theme = pref;
    root.dataset.resolvedTheme = resolved;
    root.style.colorScheme = resolved;
  }, [pref, resolved]);
  return resolved;
}

/** Fires a browser notification when resin fills up (while the tab is open). */
function useResinNotifier() {
  const resin = useStore((s) => s.resin);
  const cap = useStore((s) => s.settings.resinCap);
  const on = useStore((s) => s.settings.resinNotify);
  const lang = useStore((s) => s.settings.lang);
  useEffect(() => {
    if (!on || !('Notification' in window) || Notification.permission !== 'granted') return;
    const snap = resinAt(resin, cap, Date.now());
    if (snap.capped) return;
    const delay = snap.fullAt - Date.now();
    if (delay > 2 ** 31 - 1) return;
    const timer = setTimeout(() => {
      try {
        new Notification('Waypoint', { body: translate(lang, 'resin.notifyBody', { n: cap }), icon: './favicon.svg' });
      } catch {
        /* some platforms only allow notifications from a service worker */
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [resin, cap, on, lang]);
}

export function App() {
  const t = useT();
  const route = useRoute();
  const theme = useTheme();
  const lang = useStore((s) => s.settings.lang);
  const collapsed = useStore((s) => s.settings.sidebarCollapsed);
  const animeId = useUI((s) => s.animeId);
  const characterId = useUI((s) => s.characterId);
  const custom = useStore((s) => s.customCharacters);
  const [discoverKey, setDiscoverKey] = useState(0);
  const goPending = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  useResinNotifier();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Scroll to top and move focus on navigation; set the document title.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const h1 = mainRef.current?.querySelector('h1');
    document.title = h1?.textContent && route !== '/' ? `${h1.textContent} · Waypoint` : 'Waypoint';
  }, [route, lang]);

  // Keep airing data fresh.
  useEffect(() => {
    syncAiring();
    const id = setInterval(() => syncAiring(), 30 * 60_000);
    const onVisible = () => document.visibilityState === 'visible' && syncAiring();
    document.addEventListener('visibilitychange', onVisible);
    const onDiscover = () => setDiscoverKey((k) => k + 1);
    window.addEventListener('waypoint:discover', onDiscover);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('waypoint:discover', onDiscover);
    };
  }, []);

  useHotkey(
    (e) => (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey),
    (e) => {
      e.preventDefault();
      setUI({ palette: true });
    },
    true,
  );
  useHotkey(
    (e) => !e.metaKey && !e.ctrlKey && !e.altKey,
    (e) => {
      if (document.querySelector('.sheet-root, .palette-root')) return;
      const k = e.key.toLowerCase();
      if (Date.now() - goPending.current < 1200 && GO_KEYS[k]) {
        e.preventDefault();
        goPending.current = 0;
        navigate(GO_KEYS[k]);
        return;
      }
      if (k === 'g') goPending.current = Date.now();
      else if (e.key === '/') {
        e.preventDefault();
        setUI({ palette: true });
      } else if (k === 'n') navigate('/discover');
      else if (e.key === '?') navigate('/settings');
    },
  );

  const character = characterId ? [...BASE_CHARACTERS, ...custom].find((c) => c.id === characterId) : undefined;
  const isActive = (r: Route) => (r === '/' ? route === '/' : route === r || (r !== '/anime' && r !== '/teyvat' && route.startsWith(r)));
  const inSection = (prefix: string) => route === prefix || route.startsWith(`${prefix}/`);

  const NavLink = ({ to, icon, label }: { to: Route; icon: ReactNode; label: string }) => (
    <a href={href(to)} className={`nav-link ${isActive(to) ? 'is-active' : ''}`} aria-current={isActive(to) ? 'page' : undefined} title={collapsed ? label : undefined}>
      {icon}
      <span className="nav-label">{label}</span>
    </a>
  );

  return (
    <div className={`app ${collapsed ? 'is-collapsed' : ''}`}>
      <a className="skip-link" href="#main">
        {t('nav.skip')}
      </a>
      <aside className="sidebar" aria-label="Primary">
        <a href={href('/')} className="brand">
          <Logo size={30} />
          <span className="brand-text">
            <strong>Waypoint</strong>
            <span>{t('app.tagline')}</span>
          </span>
        </a>

        <button type="button" className="search-trigger" onClick={() => setUI({ palette: true })}>
          <Search size={16} aria-hidden />
          <span className="nav-label">{t('nav.search')}</span>
          <span className="nav-label kbd-hint">
            <Kbd>/</Kbd>
          </span>
        </button>

        <nav className="nav">
          <NavLink to="/" icon={<House size={18} />} label={t('nav.overview')} />
          <div className="nav-group">{t('nav.teyvat')}</div>
          <NavLink to="/teyvat" icon={<ListChecks size={18} />} label={t('nav.today')} />
          <NavLink to="/teyvat/characters" icon={<Users size={18} />} label={t('nav.characters')} />
          <NavLink to="/teyvat/inventory" icon={<Package size={18} />} label={t('nav.inventory')} />
          <NavLink to="/teyvat/wishes" icon={<Sparkles size={18} />} label={t('nav.wishes')} />
          <NavLink to="/teyvat/planner" icon={<Calculator size={18} />} label={t('nav.planner')} />
          <NavLink to="/teyvat/import" icon={<Upload size={18} />} label={t('nav.import')} />
          <div className="nav-group">{t('nav.anime')}</div>
          <NavLink to="/anime" icon={<Library size={18} />} label={t('nav.library')} />
          <NavLink to="/anime/schedule" icon={<CalendarDays size={18} />} label={t('nav.schedule')} />
          <NavLink to="/anime/stats" icon={<ChartNoAxesColumn size={18} />} label={t('nav.stats')} />
          <NavLink to="/discover" icon={<Compass size={18} />} label={t('nav.discover')} />
        </nav>

        <div className="sidebar-foot">
          <NavLink to="/settings" icon={<SettingsIcon size={18} />} label={t('nav.settings')} />
          <div className="sidebar-tools">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSetting('theme', theme === 'dark' ? 'light' : 'dark')}
              aria-label={t('cmd.toggleTheme')}
              title={t('cmd.toggleTheme')}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSetting('sidebarCollapsed', !collapsed)}
              aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
              title={collapsed ? t('nav.expand') : t('nav.collapse')}
            >
              {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            </button>
          </div>
        </div>
      </aside>

      <header className="mobile-bar">
        <a href={href('/')} className="brand">
          <Logo size={26} />
          <strong>Waypoint</strong>
        </a>
        <div className="row gap-xs">
          <button type="button" className="icon-btn" onClick={() => setUI({ palette: true })} aria-label={t('nav.search')}>
            <Search size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSetting('theme', theme === 'dark' ? 'light' : 'dark')}
            aria-label={t('cmd.toggleTheme')}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <main id="main" ref={mainRef} className="main" tabIndex={-1}>
        <div key={route === '/discover' ? `${route}-${discoverKey}` : route} className="view">
          {VIEWS[route]()}
        </div>
      </main>

      <nav className="tabbar" aria-label="Primary">
        <a href={href('/')} className={route === '/' ? 'is-active' : ''} aria-current={route === '/' ? 'page' : undefined}>
          <House size={20} />
          <span>{t('nav.home')}</span>
        </a>
        <a href={href('/teyvat')} className={inSection('/teyvat') ? 'is-active' : ''}>
          <Sparkles size={20} />
          <span>{t('nav.teyvat')}</span>
        </a>
        <a href={href('/anime')} className={inSection('/anime') ? 'is-active' : ''}>
          <Tv size={20} />
          <span>{t('nav.anime')}</span>
        </a>
        <a href={href('/discover')} className={route === '/discover' ? 'is-active' : ''}>
          <Compass size={20} />
          <span>{t('nav.discover')}</span>
        </a>
        <a href={href('/settings')} className={route === '/settings' ? 'is-active' : ''}>
          <SettingsIcon size={20} />
          <span>{t('nav.settings')}</span>
        </a>
      </nav>

      <CommandPalette />
      {animeId && <AnimeSheet id={animeId} onClose={() => setUI({ animeId: null })} />}
      {character && <CharacterSheet c={character} onClose={() => setUI({ characterId: null })} />}
      <Toaster />
    </div>
  );
}

// Expose for debugging in the console.
if (import.meta.env.DEV) (window as unknown as { waypoint: unknown }).waypoint = { getState };
