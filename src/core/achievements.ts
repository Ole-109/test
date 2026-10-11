/**
 * Achievement data and progress logic. The data file is large (~150 KB gzipped),
 * so it is loaded on demand. Ids are the in-game achievement ids, shared by
 * paimon.moe backups and UIAF files (Snap Hutao, YaeAchievement, Cocogoat, …).
 */

export interface AchievementStep {
  id: number;
  desc: string;
  descDe: string;
  reward: number;
  progress?: number;
  /** Only set when a step's name differs from the achievement's. */
  title?: string;
  titleDe?: string;
}

export interface Achievement {
  id: number;
  order: number;
  ver: string;
  title: string;
  titleDe: string;
  quest?: string;
  questDe?: string;
  /** HoYoWiki entry page of the quest (HoYoWiki has no achievement pages). */
  wiki?: string;
  steps: AchievementStep[];
}

export interface AchievementCategory {
  id: number;
  order: number;
  name: string;
  nameDe: string;
  icon: string;
  items: Achievement[];
}

export interface AchievementData {
  updated: string;
  categories: AchievementCategory[];
}

let cache: Promise<AchievementData> | null = null;
export function loadAchievements(): Promise<AchievementData> {
  cache ??= import('../data/achievements.json').then((m) => m.default as AchievementData);
  return cache;
}

export type Done = Record<string, number>;

export const hoyowikiUrl = (entry: string, lang: string) =>
  `https://wiki.hoyolab.com/pc/genshin/entry/${entry}${lang === 'de' ? '?lang=de-de' : ''}`;

export interface Progress {
  steps: number;
  done: number;
  primos: number;
  primosDone: number;
}

const empty = (): Progress => ({ steps: 0, done: 0, primos: 0, primosDone: 0 });

export function progressOf(items: Achievement[], done: Done): Progress {
  const p = empty();
  for (const a of items) {
    for (const s of a.steps) {
      p.steps++;
      p.primos += s.reward;
      if (s.id in done) {
        p.done++;
        p.primosDone += s.reward;
      }
    }
  }
  return p;
}

/** Number of completed steps of one achievement. */
export const stepsDone = (a: Achievement, done: Done) => a.steps.filter((s) => s.id in done).length;

/**
 * Sets an achievement to `count` completed steps. Tiered achievements are
 * completed in order, so ticking tier 3 also ticks tiers 1–2 and unticking
 * tier 2 also unticks tier 3 (same behaviour as in-game and on paimon.moe).
 */
export function setStepsDone(done: Done, a: Achievement, count: number, now = Date.now()): Done {
  const next = { ...done };
  a.steps.forEach((s, i) => {
    if (i < count) next[s.id] ??= now;
    else delete next[s.id];
  });
  return next;
}

// ── UIAF (Unified Standardized Genshin Achievement Format) ────────────────

export interface UiafFile {
  info: { export_app: string; export_app_version?: string; uiaf_version: string; export_timestamp?: number };
  list: { id: number; current?: number; status?: number; timestamp?: number }[];
}

export const isUiaf = (json: Record<string, unknown>) =>
  !!json.info && typeof json.info === 'object' && 'uiaf_version' in (json.info as object) && Array.isArray(json.list);

/** Status 2 = finished, 3 = reward claimed. Files without a status (v1.0) list finished entries with a timestamp. */
export function parseUiaf(json: UiafFile): Done {
  const done: Done = {};
  for (const e of json.list) {
    const finished = e.status != null ? e.status >= 2 : (e.timestamp ?? 0) > 0;
    if (finished && Number.isFinite(e.id)) done[String(e.id)] = (e.timestamp ?? 0) * 1000;
  }
  return done;
}

export function toUiaf(data: AchievementData, done: Done): UiafFile {
  const list: UiafFile['list'] = [];
  for (const c of data.categories)
    for (const a of c.items)
      for (const s of a.steps)
        if (s.id in done) list.push({ id: s.id, current: s.progress ?? 1, status: 3, timestamp: Math.floor((done[s.id] || 0) / 1000) });
  return {
    info: { export_app: 'Waypoint', export_app_version: '2.0', uiaf_version: 'v1.1', export_timestamp: Math.floor(Date.now() / 1000) },
    list,
  };
}

// ── paimon.moe ───────────────────────────────────────────────────────────

/** Ids paimon.moe moved from "Wonders of the World" to "Meet the Locals" (it migrates old ticks on load). */
const PAIMON_MOVED = [84026, 84100, 84101, 84104, 84028, 84107, 84102, 84108, 84105, 84103, 84106, 84109, 84110, 84111, 84112, 84113, 84114, 84115];

/**
 * paimon.moe stores `{ [categoryId]: { [achievementId]: true } }`. Returns the
 * ticked ids and the categories they were ticked in: paimon.moe only counts a
 * tick inside the achievement's own category, so Waypoint does the same.
 */
export function parsePaimonAchievements(raw: unknown): { done: Done; categories: Record<string, number[]> } {
  const done: Done = {};
  const categories: Record<string, number[]> = {};
  if (!raw || typeof raw !== 'object') return { done, categories };
  for (const [catKey, cat] of Object.entries(raw as Record<string, unknown>)) {
    if (!cat || typeof cat !== 'object' || !/^\d+$/.test(catKey)) continue;
    for (const [key, v] of Object.entries(cat as Record<string, unknown>)) {
      if (v !== true || !/^\d+$/.test(key)) continue;
      // The same migrations paimon.moe applies to old backups.
      let catId = Number(catKey);
      let id = key;
      if (catId === 0 && PAIMON_MOVED.includes(Number(id))) catId = 17;
      if (catId === 0 && id === '81219') id = '81222';
      done[id] = 0;
      (categories[id] ??= []).push(catId);
    }
  }
  return { done, categories };
}

/**
 * Keeps only ticks of achievements that exist in the data (and, for paimon.moe,
 * were ticked in their own category), so totals match the source.
 */
export function listedOnly(done: Done, data: AchievementData, categories?: Record<string, number[]>): Done {
  const catOf = new Map<string, number>();
  for (const c of data.categories) for (const a of c.items) for (const s of a.steps) catOf.set(String(s.id), c.id);
  const out: Done = {};
  for (const [id, at] of Object.entries(done)) {
    const cat = catOf.get(id);
    if (cat == null || (categories && !categories[id]?.includes(cat))) continue;
    out[id] = at;
  }
  return out;
}

/**
 * Takes over a full export (paimon.moe, UIAF) as the new progress, so both
 * apps show the same totals. Keeps known completion dates.
 */
export function replaceDone(existing: Done, incoming: Done): { done: Done; added: number; removed: number } {
  const done: Done = {};
  let added = 0;
  for (const [id, at] of Object.entries(incoming)) {
    if (id in existing) done[id] = at || existing[id];
    else {
      done[id] = at;
      added++;
    }
  }
  const removed = Object.keys(existing).filter((id) => !(id in incoming)).length;
  return { done, added, removed };
}
