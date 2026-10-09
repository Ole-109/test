/**
 * Import/export formats:
 *  - UIGF v3 and v4 (the community standard for wish history; used by most tools)
 *  - paimon.moe data backups
 *  - GOOD (Inventory Kamera, Genshin Optimizer, …)
 *  - Waypoint export bundles written by the CLI in tools/
 */
import { findCharacter, findWeapon } from '../data/characters';
import type { Account, GachaType, WishRecord } from '../lib/types';
import type { GoodData } from './good';
import { POOL_OF, recordTime, sortRecords } from './wishStats';

export interface Realtime {
  fetchedAt: string;
  resin?: { current: number; max: number; recoverySeconds: number };
  commissions?: { done: number; total: number; claimed: boolean };
  realmCurrency?: { current: number; max: number };
  transformerReadyInSeconds?: number | null;
  weeklyBossDiscountsLeft?: number;
}

export interface WaypointBundle {
  format: 'waypoint-export';
  version: 1;
  exportedAt: string;
  source: string;
  account?: Account;
  uigf?: UigfV4;
  good?: GoodData;
  realtime?: Realtime;
}

export interface ImportResult {
  kind: 'uigf' | 'paimon' | 'good' | 'waypoint';
  label: string;
  wishes?: { records: WishRecord[]; uid?: string };
  good?: GoodData;
  account?: Account;
  realtime?: Realtime;
}

export class ImportError extends Error {}

// ── UIGF ──────────────────────────────────────────────────────────────────

interface UigfItem {
  id: string;
  uid?: string;
  gacha_type: string;
  uigf_gacha_type?: string;
  item_id?: string;
  count?: string;
  time: string;
  name: string;
  item_type?: string;
  rank_type?: string;
}

export interface UigfV4 {
  info: { export_timestamp: number; export_app: string; export_app_version: string; version: string };
  hk4e: { uid: string; timezone: number; lang: string; list: UigfItem[] }[];
}

const GACHA_TYPES = new Set(['100', '200', '301', '400', '302', '500']);

function itemKind(name: string, itemType?: string, itemId?: string): 'character' | 'weapon' {
  if (itemId && /^1\d{7}$/.test(itemId)) return 'character';
  if (itemId && /^\d{5}$/.test(itemId)) return 'weapon';
  if (findCharacter(name)) return 'character';
  if (findWeapon(name)) return 'weapon';
  return /weapon|waffe|arme|arma|武器|무기/i.test(itemType ?? '') ? 'weapon' : 'character';
}

function rankOf(name: string, kind: 'character' | 'weapon', rank?: string): 3 | 4 | 5 {
  const n = Number(rank);
  if (n === 3 || n === 4 || n === 5) return n;
  if (kind === 'character') return (findCharacter(name)?.rarity ?? 4) as 4 | 5;
  const r = findWeapon(name)?.rarity ?? 3;
  return (r >= 5 ? 5 : r === 4 ? 4 : 3) as 3 | 4 | 5;
}

function fromUigfItem(i: UigfItem): WishRecord | null {
  const type = String(i.gacha_type ?? i.uigf_gacha_type);
  if (!GACHA_TYPES.has(type) || !i.name || !i.time) return null;
  const itemType = itemKind(i.name, i.item_type, i.item_id);
  return {
    id: String(i.id),
    gachaType: type as GachaType,
    name: i.name,
    itemType,
    rank: rankOf(i.name, itemType, i.rank_type),
    time: i.time,
    itemId: i.item_id || undefined,
  };
}

function parseUigf(json: Record<string, unknown>): ImportResult {
  // v4: { info, hk4e: [{ uid, list }] }
  if (Array.isArray(json.hk4e)) {
    const accounts = json.hk4e as UigfV4['hk4e'];
    if (!accounts.length) throw new ImportError('This UIGF file contains no Genshin Impact accounts.');
    // Pick the account with the most pulls when a file contains several.
    const acc = [...accounts].sort((a, b) => (b.list?.length ?? 0) - (a.list?.length ?? 0))[0];
    const records = (acc.list ?? []).map(fromUigfItem).filter((r): r is WishRecord => !!r);
    return { kind: 'uigf', label: 'UIGF v4', wishes: { records, uid: String(acc.uid) } };
  }
  // v2/v3: { info: { uid }, list }
  const info = (json.info ?? {}) as { uid?: string; uigf_version?: string };
  const list = (json.list ?? []) as UigfItem[];
  const records = list.map(fromUigfItem).filter((r): r is WishRecord => !!r);
  return {
    kind: 'uigf',
    label: `UIGF ${info.uigf_version ?? 'v3'}`,
    wishes: { records, uid: info.uid ?? list[0]?.uid },
  };
}

const UIGF_TIMEZONE = (uid?: string) => {
  const first = uid?.length === 10 ? uid.slice(0, 2) : uid?.[0];
  return first === '6' ? -5 : first === '7' ? 1 : 8;
};

/** Writes UIGF v4 (accepted by paimon.moe, Snap Hutao, Starward, …). */
export function toUigfV4(records: WishRecord[], uid = '0', app = 'Waypoint'): UigfV4 {
  return {
    info: { export_timestamp: Math.floor(Date.now() / 1000), export_app: app, export_app_version: '2.0', version: 'v4.0' },
    hk4e: [
      {
        uid,
        timezone: UIGF_TIMEZONE(uid),
        lang: 'en-us',
        list: sortRecords(records).map((r) => ({
          uigf_gacha_type: r.gachaType === '400' ? '301' : r.gachaType,
          gacha_type: r.gachaType,
          item_id: r.itemId ?? '',
          count: '1',
          time: r.time,
          name: r.name,
          item_type: r.itemType === 'weapon' ? 'Weapon' : 'Character',
          rank_type: String(r.rank),
          id: r.id,
        })),
      },
    ],
  };
}

// ── paimon.moe backup ─────────────────────────────────────────────────────

const PAIMON_KEYS: Record<string, GachaType> = {
  'wish-counter-beginners': '100',
  'wish-counter-standard': '200',
  'wish-counter-character-event': '301',
  'wish-counter-weapon-event': '302',
  'wish-counter-chronicled': '500',
};

interface PaimonPull {
  type?: string;
  code?: string;
  id: string;
  time: string;
  pity?: number;
}

function parsePaimon(json: Record<string, unknown>): ImportResult {
  const records: WishRecord[] = [];
  let seq = 0;
  for (const [key, type] of Object.entries(PAIMON_KEYS)) {
    const pulls = ((json[key] as { pulls?: PaimonPull[] } | undefined)?.pulls ?? []) as PaimonPull[];
    for (const p of pulls) {
      const name = p.id.replace(/_/g, ' ');
      const kind: 'character' | 'weapon' = p.type === 'weapon' ? 'weapon' : p.type === 'character' ? 'character' : itemKind(name);
      const def = kind === 'character' ? findCharacter(name) : findWeapon(name);
      const code = p.code && GACHA_TYPES.has(p.code) ? (p.code as GachaType) : type;
      // paimon.moe stores no record ids; build sortable synthetic ones from time + order.
      const ts = String(recordTime(p.time)).padStart(13, '0');
      records.push({
        id: `p${ts}${String(seq++).padStart(6, '0')}`,
        gachaType: code,
        name: def?.name ?? name.replace(/\b\w/g, (c) => c.toUpperCase()),
        itemType: kind,
        rank: rankOf(def?.name ?? name, kind),
        time: p.time,
      });
    }
  }
  if (!records.length) throw new ImportError('No wishes found in this paimon.moe backup.');
  return { kind: 'paimon', label: 'paimon.moe backup', wishes: { records, uid: (json['wish-uid'] as string) || undefined } };
}

// ── Detection ─────────────────────────────────────────────────────────────

export function parseImport(text: string): ImportResult {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new ImportError('This file is not valid JSON.');
  }
  if (!json || typeof json !== 'object') throw new ImportError('Unrecognised file.');

  if (json.format === 'waypoint-export') {
    const b = json as unknown as WaypointBundle;
    const wishes = b.uigf ? parseUigf(b.uigf as unknown as Record<string, unknown>).wishes : undefined;
    return { kind: 'waypoint', label: 'Waypoint export', wishes, good: b.good, account: b.account, realtime: b.realtime };
  }
  if (json.format === 'GOOD') return { kind: 'good', label: `GOOD (${String(json.source ?? 'unknown source')})`, good: json as unknown as GoodData };
  if (Array.isArray(json.hk4e) || (json.info && Array.isArray(json.list))) return parseUigf(json);
  if (Object.keys(PAIMON_KEYS).some((k) => k in json)) return parsePaimon(json);
  throw new ImportError('Unrecognised file. Supported: Waypoint export, UIGF v3/v4, paimon.moe backup, GOOD.');
}

// ── Merging ───────────────────────────────────────────────────────────────

const isSynthetic = (r: WishRecord) => r.id.startsWith('p');
const dedupeKey = (r: WishRecord) => `${POOL_OF[r.gachaType]}|${r.time}|${r.name.toLowerCase()}`;

/**
 * Merges imported records into existing ones. Real records (with HoYoverse ids)
 * replace matching synthetic ones from paimon.moe backups, and vice versa
 * synthetic records never duplicate real ones.
 */
export function mergeWishes(existing: WishRecord[], incoming: WishRecord[]): { list: WishRecord[]; added: number } {
  const ids = new Set(existing.map((r) => r.id));
  const byKey = new Map<string, WishRecord[]>();
  for (const r of existing) {
    const k = dedupeKey(r);
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const consumed = new Set<WishRecord>(); // existing records matched by an incoming twin
  const replaced = new Set<WishRecord>(); // synthetic records superseded by real ones
  const added: WishRecord[] = [];
  for (const r of incoming) {
    if (ids.has(r.id)) continue;
    const twin = (byKey.get(dedupeKey(r)) ?? []).find((c) => isSynthetic(c) !== isSynthetic(r) && !consumed.has(c));
    if (twin) {
      consumed.add(twin);
      if (isSynthetic(r)) continue; // the real record is already stored
      replaced.add(twin);
    }
    added.push(r);
    ids.add(r.id);
  }
  const list = sortRecords([...existing.filter((r) => !replaced.has(r)), ...added]);
  return { list, added: added.length - replaced.size };
}
