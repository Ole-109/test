import { useSyncExternalStore } from 'react';
import { DEFAULT_TASKS } from '../data/tasks';
import { repairAnime } from './anime';
import { findWeapon } from '../data/characters';
import type { AppState, BannerKey, BannerState } from './types';

export const STORAGE_KEY = 'waypoint:v1';

const emptyBanner = (): BannerState => ({
  pity5: 0,
  pity4: 0,
  guaranteed: false,
  fatePoints: 0,
  total: 0,
  history: [],
});

export function defaultState(): AppState {
  const lang = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
  return {
    version: 1,
    settings: {
      lang,
      theme: 'system',
      server: lang === 'de' ? 'europe' : 'america',
      titleLang: 'romaji',
      resinCap: 200,
      resinNotify: false,
      sidebarCollapsed: false,
      proxyUrl: '',
      showAdult: false,
    },
    resin: { value: 0, at: Date.now(), condensed: 0, fragile: 0 },
    tasks: DEFAULT_TASKS.map((t) => ({ ...t })),
    characters: {},
    customCharacters: [],
    banners: {
      character: emptyBanner(),
      weapon: emptyBanner(),
      standard: emptyBanner(),
      chronicled: emptyBanner(),
    },
    plan: {
      primogems: 0,
      fates: 0,
      starglitter: 0,
      banner: 'character',
      copies: 1,
      rate: 0.5,
      targetDate: '',
      dailyPrimos: 60,
      welkin: false,
      monthlyPrimos: 1600,
    },
    anime: [],
    wishes: [],
    wishMeta: { overrides: {} },
    inventory: { weapons: [], artifacts: [], materials: {} },
    account: {},
    farming: [],
    achievements: { done: {} },
  };
}

/** Inventory weapons worth storing: 4★ and 5★ (unknown weapons are kept). */
const isWorthKeeping = (w: { key: string; name: string }) => (findWeapon(w.name)?.rarity ?? findWeapon(w.key)?.rarity ?? 5) >= 4;

/** Plain object or undefined (arrays, null and primitives are rejected). */
const obj = <T,>(v: unknown): Partial<T> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Partial<T>) : undefined);
/** Array of objects; anything else (null entries from a damaged file) is dropped. */
const list = <T,>(v: unknown): T[] | undefined => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/**
 * Merge persisted (possibly older, partial or hand-edited) data over defaults.
 * Values the app switches on (language, theme, server…) are checked, so a bad
 * file can't leave the app unable to render.
 */
export function hydrate(raw: unknown): AppState {
  const base = defaultState();
  const r = obj<AppState>(raw);
  if (!r) return base;
  const banners = { ...base.banners };
  for (const k of Object.keys(banners) as BannerKey[]) {
    const b = obj<BannerState>(r.banners?.[k]);
    if (b) banners[k] = { ...emptyBanner(), ...b, history: list(b.history) ?? [] };
  }
  // Keep user task state but add any new built-in tasks.
  const tasks = list<AppState['tasks'][number]>(r.tasks) ?? base.tasks;
  for (const t of DEFAULT_TASKS) if (!tasks.some((x) => x.id === t.id)) tasks.push({ ...t });
  const st = { ...base.settings, ...obj<AppState['settings']>(r.settings) };
  const inv = obj<AppState['inventory']>(r.inventory) ?? {};
  return {
    ...base,
    ...r,
    version: 1,
    settings: {
      ...st,
      lang: oneOf(st.lang, ['en', 'de'] as const, base.settings.lang),
      theme: oneOf(st.theme, ['system', 'light', 'dark'] as const, 'system'),
      server: oneOf(st.server, ['america', 'europe', 'asia'] as const, base.settings.server),
      titleLang: oneOf(st.titleLang, ['romaji', 'english', 'native'] as const, 'romaji'),
      resinCap: Number.isFinite(st.resinCap) ? Math.min(400, Math.max(60, st.resinCap)) : base.settings.resinCap,
    },
    resin: { ...base.resin, ...obj<AppState['resin']>(r.resin) },
    tasks,
    characters: (obj<AppState['characters']>(r.characters) ?? {}) as AppState['characters'],
    customCharacters: list(r.customCharacters) ?? [],
    banners,
    plan: { ...base.plan, ...obj<AppState['plan']>(r.plan) },
    anime: (list<AppState['anime'][number]>(r.anime) ?? []).map(repairAnime),
    wishes: list(r.wishes) ?? [],
    wishMeta: { ...base.wishMeta, ...obj<AppState['wishMeta']>(r.wishMeta), overrides: { ...(obj(r.wishMeta?.overrides) as AppState['wishMeta']['overrides']) } },
    inventory: {
      ...base.inventory,
      ...inv,
      // Older saves kept 1–3★ weapons too; drop them to save space.
      weapons: (list<{ key: string; name: string }>(inv.weapons) ?? []).filter(isWorthKeeping),
      artifacts: list(inv.artifacts) ?? [],
      materials: obj<Record<string, number>>(inv.materials) ?? {},
    } as AppState['inventory'],
    account: { ...obj<AppState['account']>(r.account) },
    farming: list(r.farming) ?? [],
    achievements: { ...obj<AppState['achievements']>(r.achievements), done: { ...(obj(r.achievements?.done) as AppState['achievements']['done']) } },
  };
}

/** A Waypoint backup (Settings → Export): `{ app: 'waypoint', data }` or the bare state. */
export function isWaypointBackup(json: unknown): json is { app: 'waypoint'; data: unknown } | AppState {
  const j = obj<Record<string, unknown>>(json);
  if (!j) return false;
  const data = j.app === 'waypoint' ? obj<Record<string, unknown>>(j.data) : j;
  return !!data && !!obj(data.settings) && Array.isArray(data.tasks);
}

function load(): AppState {
  let text: string | null = null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
    return hydrate(text ? JSON.parse(text) : null);
  } catch {
    // Keep the unreadable data aside instead of overwriting it with defaults on the next save.
    try {
      if (text) localStorage.setItem(`${STORAGE_KEY}:corrupt-${Date.now()}`, text);
    } catch {
      /* storage full or blocked */
    }
    return defaultState();
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveFailed = false;
const persistErrorListeners = new Set<() => void>();

/** Called once when saving fails (usually: browser storage is full). */
export function onPersistError(fn: () => void) {
  persistErrorListeners.add(fn);
  return () => {
    persistErrorListeners.delete(fn);
  };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveFailed = false;
  } catch {
    // Keep working in memory, but tell the user once so they can export a backup.
    if (!saveFailed) persistErrorListeners.forEach((l) => l());
    saveFailed = true;
  }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 150);
}

export function getState(): AppState {
  return state;
}

export function setState(next: AppState | ((s: AppState) => AppState)) {
  state = typeof next === 'function' ? next(state) : next;
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Keep multiple open tabs in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      state = hydrate(JSON.parse(e.newValue));
      listeners.forEach((l) => l());
    } catch {
      /* ignore malformed */
    }
  });
  window.addEventListener('beforeunload', () => {
    clearTimeout(saveTimer);
    save();
  });
}

/** Subscribe to a slice. The selector must return a stable reference or primitive. */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export function update<K extends keyof AppState>(key: K, fn: (v: AppState[K]) => AppState[K]) {
  setState((s) => ({ ...s, [key]: fn(s[key]) }));
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
