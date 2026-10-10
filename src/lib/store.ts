import { useSyncExternalStore } from 'react';
import { DEFAULT_TASKS } from '../data/tasks';
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
  };
}

/** Merge persisted (possibly older or partial) data over defaults. */
export function hydrate(raw: unknown): AppState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  const banners = { ...base.banners };
  for (const k of Object.keys(banners) as BannerKey[]) {
    if (r.banners?.[k]) banners[k] = { ...emptyBanner(), ...r.banners[k] };
  }
  // Keep user task state but add any new built-in tasks.
  const tasks = Array.isArray(r.tasks) ? [...r.tasks] : base.tasks;
  for (const t of DEFAULT_TASKS) if (!tasks.some((x) => x.id === t.id)) tasks.push({ ...t });
  return {
    ...base,
    ...r,
    version: 1,
    settings: { ...base.settings, ...r.settings },
    resin: { ...base.resin, ...r.resin },
    tasks,
    characters: r.characters ?? {},
    customCharacters: r.customCharacters ?? [],
    banners,
    plan: { ...base.plan, ...r.plan },
    anime: Array.isArray(r.anime) ? r.anime : [],
    wishes: Array.isArray(r.wishes) ? r.wishes : [],
    wishMeta: { ...base.wishMeta, ...r.wishMeta, overrides: { ...r.wishMeta?.overrides } },
    inventory: { ...base.inventory, ...r.inventory },
    account: { ...r.account },
  };
}

function load(): AppState {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return hydrate(text ? JSON.parse(text) : null);
  } catch {
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
