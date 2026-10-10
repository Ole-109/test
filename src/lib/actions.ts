import { setStepsDone, type Achievement } from '../core/achievements';
import { withProgress, withStatus } from './anime';
import { resinAt, setResin } from './resin';
import { findCharacter } from '../data/characters';
import { getState, setState, uid, update } from './store';
import type {
  FarmTarget,
  AnimeEntry,
  AnimeStatus,
  AppState,
  BannerKey,
  FiveStarRecord,
  OwnedCharacter,
  Settings,
  Task,
} from './types';

/** Snapshot to restore with `restore()` for undo. */
export const snapshot = () => getState();
export const restore = (s: AppState) => setState(s);

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  update('settings', (s) => ({ ...s, [key]: value }));
}

// ── Resin ────────────────────────────────────────────────────────────────

export function setResinValue(value: number) {
  const s = getState();
  update('resin', (r) => setResin(r, s.settings.resinCap, value, Date.now()));
}

export function spendResin(amount: number): boolean {
  const s = getState();
  const now = Date.now();
  const { current } = resinAt(s.resin, s.settings.resinCap, now);
  if (current < amount) return false;
  update('resin', (r) => setResin(r, s.settings.resinCap, current - amount, now));
  return true;
}

export function consumeCondensed(): boolean {
  const { resin } = getState();
  if (resin.condensed <= 0) return false;
  update('resin', (r) => ({ ...r, condensed: r.condensed - 1 }));
  return true;
}

export function craftCondensed(): boolean {
  const s = getState();
  if (s.resin.condensed >= 5) return false;
  if (!spendResin(40)) return false;
  update('resin', (r) => ({ ...r, condensed: r.condensed + 1 }));
  return true;
}

export function consumeFragile(): boolean {
  const s = getState();
  if (s.resin.fragile <= 0) return false;
  const { current } = resinAt(s.resin, s.settings.resinCap, Date.now());
  update('resin', (r) => ({ ...setResin(r, s.settings.resinCap, current + 60, Date.now()), fragile: r.fragile - 1 }));
  return true;
}

export function setResinStock(key: 'condensed' | 'fragile', n: number) {
  update('resin', (r) => ({ ...r, [key]: Math.max(0, n) }));
}

// ── Tasks ────────────────────────────────────────────────────────────────

export function toggleTask(id: string, done: boolean) {
  update('tasks', (ts) => ts.map((t) => (t.id === id ? { ...t, doneAt: done ? Date.now() : undefined } : t)));
}

export function addTask(task: Omit<Task, 'id'>) {
  update('tasks', (ts) => [...ts, { ...task, id: uid() }]);
}

export function patchTask(id: string, patch: Partial<Task>) {
  update('tasks', (ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

export function removeTask(id: string) {
  update('tasks', (ts) => ts.filter((t) => t.id !== id));
}

// ── Characters ───────────────────────────────────────────────────────────

export const newOwned = (): OwnedCharacter => ({
  level: 1,
  constellation: 0,
  talents: [1, 1, 1],
  friendship: 1,
  weapon: '',
  refinement: 1,
  artifacts: '',
  build: 'planned',
  favorite: false,
  notes: '',
  updatedAt: Date.now(),
});

export function setOwned(id: string, owned: boolean) {
  update('characters', (cs) => {
    const next = { ...cs };
    if (owned) next[id] = cs[id] ?? newOwned();
    else delete next[id];
    return next;
  });
}

export function patchCharacter(id: string, patch: Partial<OwnedCharacter>) {
  update('characters', (cs) => ({ ...cs, [id]: { ...(cs[id] ?? newOwned()), detailsKnown: true, ...patch, updatedAt: Date.now() } }));
}

// ── Wishes ───────────────────────────────────────────────────────────────

export function addPulls(banner: BannerKey, n: number) {
  update('banners', (b) => {
    const cur = b[banner];
    return {
      ...b,
      [banner]: {
        ...cur,
        pity5: Math.max(0, cur.pity5 + n),
        pity4: Math.max(0, Math.min(9, cur.pity4 + n)),
        total: Math.max(0, cur.total + n),
      },
    };
  });
}

export function patchBanner(banner: BannerKey, patch: Partial<AppState['banners'][BannerKey]>) {
  update('banners', (b) => ({ ...b, [banner]: { ...b[banner], ...patch } }));
}

export function logFour(banner: BannerKey) {
  update('banners', (b) => ({
    ...b,
    [banner]: { ...b[banner], pity4: 0, pity5: b[banner].pity5 + 1, total: b[banner].total + 1 },
  }));
}

/**
 * Record a 5★ obtained at `pity`. Pulls beyond what was already counted are
 * added to the total; pity resets and the guarantee state follows the outcome.
 */
export function logFive(banner: BannerKey, rec: Omit<FiveStarRecord, 'id' | 'at'>) {
  update('banners', (b) => {
    const cur = b[banner];
    const extra = Math.max(0, rec.pity - cur.pity5);
    const lost = rec.outcome === 'lost';
    return {
      ...b,
      [banner]: {
        ...cur,
        pity5: 0,
        pity4: 0,
        total: cur.total + extra,
        guaranteed: banner === 'standard' ? false : lost,
        fatePoints: banner === 'weapon' ? (lost ? 1 : 0) : cur.fatePoints,
        history: [{ ...rec, id: uid(), at: Date.now() }, ...cur.history],
      },
    };
  });
  // A logged character is now owned (level and talents still unknown).
  const c = findCharacter(rec.name);
  if (c && !getState().characters[c.id]) {
    update('characters', (cs) => ({ ...cs, [c.id]: { ...newOwned(), detailsKnown: false, wishCopies: 1 } }));
  }
}

export function removeFive(banner: BannerKey, id: string) {
  update('banners', (b) => ({ ...b, [banner]: { ...b[banner], history: b[banner].history.filter((h) => h.id !== id) } }));
}

// ── Anime ────────────────────────────────────────────────────────────────

export function addAnime(data: Partial<AnimeEntry> & { title: AnimeEntry['title'] }, status: AnimeStatus): AnimeEntry {
  const now = Date.now();
  const entry: AnimeEntry = {
    id: uid(),
    genres: [],
    progress: 0,
    score: 0,
    rewatches: 0,
    favorite: false,
    notes: '',
    addedAt: now,
    updatedAt: now,
    ...data,
    status,
  };
  const final = status === 'completed' ? withStatus(entry, 'completed', now) : status === 'watching' ? { ...entry, startedAt: now } : entry;
  update('anime', (list) => [final, ...list]);
  return final;
}

export function patchAnime(id: string, patch: Partial<AnimeEntry>) {
  update('anime', (list) => list.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)));
}

/** Returns the updated entry so callers can react to completion. */
export function stepEpisode(id: string, delta: number): AnimeEntry | undefined {
  let result: AnimeEntry | undefined;
  update('anime', (list) =>
    list.map((a) => {
      if (a.id !== id) return a;
      result = withProgress(a, a.progress + delta);
      return result;
    }),
  );
  return result;
}

export function setAnimeStatus(id: string, status: AnimeStatus) {
  update('anime', (list) => list.map((a) => (a.id === id ? withStatus(a, status) : a)));
}

export function removeAnime(id: string) {
  update('anime', (list) => list.filter((a) => a.id !== id));
}

export function mergeSynced(patches: Map<number, Partial<AnimeEntry>>) {
  update('anime', (list) =>
    list.map((a) => {
      const p = a.anilistId != null ? patches.get(a.anilistId) : undefined;
      return p ? { ...a, ...p } : a;
    }),
  );
}

// ── Farming plan ─────────────────────────────────────────────────────────

export function addFarmTarget(id: string) {
  const s = getState();
  if (s.farming.some((f) => f.id === id)) return;
  const c = s.characters[id];
  // Sensible default goal: level 90 and 9/9/9, never below what you already have.
  const talents = (c?.talents ?? [1, 1, 1]).map((t) => Math.max(t, 9)) as [number, number, number];
  update('farming', (list) => [...list, { id, level: Math.max(c?.level ?? 1, 90), talents }]);
}

export function patchFarmTarget(id: string, patch: Partial<FarmTarget>) {
  update('farming', (list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
}

export function removeFarmTarget(id: string) {
  update('farming', (list) => list.filter((f) => f.id !== id));
}

// ── Achievements ──────────────────────────────────────────────────────────

/** Sets how many tiers of an achievement are completed (0 = none). */
export function setAchievementSteps(a: Achievement, count: number) {
  setState((s) => ({ ...s, achievements: { ...s.achievements, done: setStepsDone(s.achievements.done, a, count) } }));
}

export function resetAchievements() {
  setState((s) => ({ ...s, achievements: { done: {} } }));
}
