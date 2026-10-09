import { findCharacter, findWeapon } from '../data/characters';
import { fromGoodKey, setSummary, type GoodData } from '../core/good';
import { mergeWishes, type ImportResult, type Realtime } from '../core/formats';
import { analyzePool, BANNER_POOLS, POOL_OF } from '../core/wishStats';
import { newOwned } from './actions';
import { RESIN_INTERVAL } from './resin';
import { getState, setState } from './store';
import { HOUR } from './time';
import type { AppState, InvArtifact, InvWeapon, OwnedCharacter } from './types';

export interface ImportSummary {
  /** The import contained wish records. */
  hadWishes: boolean;
  wishesAdded: number;
  wishesTotal: number;
  characters: number;
  weapons: number;
  artifacts: number;
  unknown: string[];
  realtime: boolean;
}

/** Re-derives pity, totals, guarantee and 5★ history for banners that have imported records. */
export function recomputeBanners(s: AppState): AppState {
  const banners = { ...s.banners };
  for (const pool of BANNER_POOLS) {
    if (!s.wishes.some((r) => POOL_OF[r.gachaType] === pool)) continue;
    const st = analyzePool(pool, s.wishes, s.wishMeta.overrides);
    banners[pool] = {
      ...banners[pool],
      pity5: st.pity5,
      pity4: st.pity4,
      total: st.total,
      guaranteed: pool === 'character' ? st.guaranteed : banners[pool].guaranteed,
      history: st.fiveNewestFirst.map((f) => ({
        id: f.record.id,
        name: f.record.name,
        pity: f.pity,
        outcome: f.outcome,
        at: Date.parse(f.record.time.replace(' ', 'T')),
      })),
    };
  }
  return { ...s, banners };
}

function applyGood(s: AppState, good: GoodData, summary: ImportSummary): AppState {
  const characters = { ...s.characters };
  const now = Date.now();
  const keyToId = new Map<string, string>();

  for (const gc of good.characters ?? []) {
    const def = findCharacter(gc.key) ?? findCharacter(fromGoodKey(gc.key));
    if (!def) {
      summary.unknown.push(gc.key);
      continue;
    }
    keyToId.set(gc.key, def.id);
    const prev: OwnedCharacter = characters[def.id] ?? newOwned();
    characters[def.id] = {
      ...prev,
      level: gc.level || prev.level,
      ascension: gc.ascension,
      constellation: gc.constellation ?? prev.constellation,
      talents: [gc.talent?.auto ?? 1, gc.talent?.skill ?? 1, gc.talent?.burst ?? 1],
      updatedAt: now,
    };
    summary.characters++;
  }

  const weapons: InvWeapon[] = (good.weapons ?? []).map((w) => ({
    key: w.key,
    name: findWeapon(w.key)?.name ?? findWeapon(fromGoodKey(w.key))?.name ?? fromGoodKey(w.key),
    level: w.level,
    ascension: w.ascension,
    refinement: w.refinement,
    location: w.location ?? '',
    lock: !!w.lock,
  }));
  const artifacts: InvArtifact[] = (good.artifacts ?? []).map((a) => ({ ...a, location: a.location ?? '', lock: !!a.lock, substats: a.substats ?? [] }));

  // Equipped gear onto characters.
  const locId = (loc: string) => keyToId.get(loc) ?? findCharacter(loc)?.id ?? findCharacter(fromGoodKey(loc))?.id;
  for (const w of weapons) {
    const id = w.location && locId(w.location);
    if (id && characters[id]) characters[id] = { ...characters[id], weapon: w.name, refinement: w.refinement };
  }
  const byChar = new Map<string, InvArtifact[]>();
  for (const a of artifacts) {
    const id = a.location && locId(a.location);
    if (id) byChar.set(id, [...(byChar.get(id) ?? []), a]);
  }
  for (const [id, list] of byChar) if (characters[id]) characters[id] = { ...characters[id], artifacts: setSummary(list) };

  summary.weapons = weapons.length;
  summary.artifacts = artifacts.length;
  const hasInventory = weapons.length > 0 || artifacts.length > 0 || Object.keys(good.materials ?? {}).length > 0;
  return {
    ...s,
    characters,
    inventory: hasInventory
      ? { weapons, artifacts, materials: good.materials ?? {}, importedAt: now, source: good.source }
      : s.inventory,
  };
}

function applyRealtime(s: AppState, rt: Realtime, summary: ImportSummary): AppState {
  const at = Date.parse(rt.fetchedAt);
  if (!Number.isFinite(at) || Date.now() - at > 12 * HOUR) return s;
  let next = s;
  if (rt.resin) {
    const { current, max, recoverySeconds } = rt.resin;
    const value = current;
    // Anchor so the regen timer matches the game: full exactly at fetchedAt + recovery.
    const anchor = current >= max ? at : at + recoverySeconds * 1000 - (max - current) * RESIN_INTERVAL;
    next = { ...next, resin: { ...next.resin, value, at: anchor }, settings: { ...next.settings, resinCap: max } };
  }
  next = {
    ...next,
    tasks: next.tasks.map((t) => {
      if (t.id === 'commissions' && rt.commissions)
        return { ...t, doneAt: rt.commissions.done >= rt.commissions.total && rt.commissions.claimed ? at : undefined };
      if (t.id === 'transformer' && rt.transformerReadyInSeconds != null)
        return rt.transformerReadyInSeconds > 0
          ? { ...t, doneAt: at + rt.transformerReadyInSeconds * 1000 - (t.cooldownHours ?? 166) * HOUR }
          : { ...t, doneAt: undefined };
      if (t.id === 'bosses' && rt.weeklyBossDiscountsLeft != null)
        return { ...t, doneAt: rt.weeklyBossDiscountsLeft === 0 ? at : undefined };
      return t;
    }),
  };
  summary.realtime = true;
  return next;
}

/** Applies an import result to the store. Returns a summary for the UI. */
export function applyImport(result: ImportResult): ImportSummary {
  const summary: ImportSummary = { hadWishes: !!result.wishes?.records.length, wishesAdded: 0, wishesTotal: 0, characters: 0, weapons: 0, artifacts: 0, unknown: [], realtime: false };
  let s = getState();
  if (result.wishes?.records.length) {
    const { list, added } = mergeWishes(s.wishes, result.wishes.records);
    summary.wishesAdded = added;
    s = {
      ...s,
      wishes: list,
      wishMeta: { ...s.wishMeta, uid: result.wishes.uid ?? s.wishMeta.uid, importedAt: Date.now(), source: result.label },
    };
    s = recomputeBanners(s);
  }
  summary.wishesTotal = s.wishes.length;
  if (result.good) s = applyGood(s, result.good, summary);
  if (result.account) s = { ...s, account: { ...s.account, ...result.account } };
  if (result.realtime) s = applyRealtime(s, result.realtime, summary);
  setState(s);
  return summary;
}

export function setWishOverride(id: string, outcome: 'won' | 'lost' | null) {
  const s = getState();
  const overrides = { ...s.wishMeta.overrides };
  if (outcome) overrides[id] = outcome;
  else delete overrides[id];
  setState(recomputeBanners({ ...s, wishMeta: { ...s.wishMeta, overrides } }));
}

export function clearWishes() {
  const s = getState();
  setState({ ...s, wishes: [], wishMeta: { overrides: {} } });
}
