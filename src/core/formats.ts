/**
 * Import/export formats:
 *  - UIGF v3 and v4 (the community standard for wish history; used by most tools)
 *  - paimon.moe data backups (wishes, achievements, characters, AR/WL, every account)
 *  - UIAF achievement files (Snap Hutao, YaeAchievement, Cocogoat, …)
 *  - GOOD (Inventory Kamera, Genshin Optimizer, …)
 *  - Waypoint export bundles written by the CLI in tools/
 */
import { characterByAvatarId, findCharacter, findWeapon } from '../data/characters';
import type { Account, GachaType, Server, WishRecord } from '../lib/types';
import { isUiaf, parsePaimonAchievements, parseUiaf, type Done, type UiafFile } from './achievements';
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
  kind: 'uigf' | 'paimon' | 'good' | 'waypoint' | 'uiaf';
  label: string;
  wishes?: { records: WishRecord[]; uid?: string };
  good?: GoodData;
  account?: Account;
  /** Game server, sets the reset times. */
  server?: Server;
  realtime?: Realtime;
  achievements?: Done;
  /** Owned characters by name with total copies (paimon.moe's character page). */
  roster?: { name: string; copies: number }[];
  /** When the source file was written (paimon.moe: last change). */
  savedAt?: string;
  /** Files with several game accounts (paimon.moe): one result per account. */
  accounts?: { key: string; label: string; result: ImportResult }[];
}

/** The independent parts of an import a user can pick from. */
export type ImportPart = 'wishes' | 'achievements' | 'roster' | 'good' | 'profile' | 'realtime';

export function partsOf(r: ImportResult): ImportPart[] {
  const parts: ImportPart[] = [];
  if (r.wishes?.records.length) parts.push('wishes');
  if (r.achievements && Object.keys(r.achievements).length) parts.push('achievements');
  if (r.roster?.length) parts.push('roster');
  if (r.good) parts.push('good');
  if ((r.account && Object.values(r.account).some((v) => v != null && v !== '')) || r.server) parts.push('profile');
  if (r.realtime) parts.push('realtime');
  return parts;
}

export type ImportErrorCode = 'uigfEmpty' | 'paimonEmpty' | 'notJson' | 'unknown' | 'waypointBackup';

/** Import failure with an English message (CLI) and a code the app translates. */
export class ImportError extends Error {
  constructor(
    message: string,
    public code: ImportErrorCode = 'unknown',
  ) {
    super(message);
  }
}

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
  // An explicit item type wins over guessing from the name.
  if (/weapon|waffe|arme|arma|武器|무기/i.test(itemType ?? '')) return 'weapon';
  if (/character|figur|personnage|personaje|角色|캐릭터/i.test(itemType ?? '')) return 'character';
  if (findCharacter(name)) return 'character';
  return findWeapon(name) ? 'weapon' : 'character';
}

function rankOf(name: string, kind: 'character' | 'weapon', rank?: string): 3 | 4 | 5 {
  const n = Number(rank);
  if (n === 3 || n === 4 || n === 5) return n;
  if (kind === 'character') return (findCharacter(name)?.rarity ?? 4) as 4 | 5;
  const r = findWeapon(name)?.rarity ?? 3;
  return (r >= 5 ? 5 : r === 4 ? 4 : 3) as 3 | 4 | 5;
}

/** Game item from a UIGF `item_id`: 8-digit ids starting with 1 are characters, 5-digit ids weapons. */
function itemById(itemId?: string): { name: string; kind: 'character' | 'weapon' } | undefined {
  if (!itemId) return undefined;
  if (/^1\d{7}$/.test(itemId)) {
    const c = characterByAvatarId(Number(itemId));
    return c && { name: c.name, kind: 'character' };
  }
  if (/^\d{5}$/.test(itemId)) {
    const w = findWeapon(Number(itemId));
    return w && { name: w.name, kind: 'weapon' };
  }
  return undefined;
}

function fromUigfItem(i: UigfItem): WishRecord | null {
  const type = String(i.gacha_type ?? i.uigf_gacha_type);
  // UIGF v4 makes `name` optional and files can be in any language: the item id is the reliable key.
  const known = itemById(i.item_id);
  const name = known?.name ?? i.name;
  if (!GACHA_TYPES.has(type) || !name || !i.time) return null;
  const itemType = known?.kind ?? itemKind(name, i.item_type, i.item_id);
  return {
    id: String(i.id),
    gachaType: type as GachaType,
    name,
    itemType,
    rank: rankOf(name, itemType, i.rank_type),
    time: i.time,
    itemId: i.item_id || undefined,
  };
}

function parseUigf(json: Record<string, unknown>): ImportResult {
  // v4: { info, hk4e: [{ uid, list }] }
  if (Array.isArray(json.hk4e)) {
    const accounts = json.hk4e as UigfV4['hk4e'];
    if (!accounts.length) throw new ImportError('This UIGF file contains no Genshin Impact accounts.', 'uigfEmpty');
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
// The backup is a dump of paimon.moe's local storage. Extra accounts store the
// same keys with a prefix ("account2-wish-counter-standard", …), listed in "accounts".

const PAIMON_KEYS: Record<string, GachaType> = {
  'wish-counter-beginners': '100',
  'wish-counter-standard': '200',
  'wish-counter-character-event': '301',
  'wish-counter-weapon-event': '302',
  'wish-counter-chronicled': '500',
};

const PAIMON_SERVER: Record<string, Server> = { Asia: 'asia', China: 'asia', America: 'america', Europe: 'europe' };

interface PaimonPull {
  type?: string;
  code?: string;
  id: string;
  time: string;
  pity?: number;
}

const isPaimonKey = (k: string) => /^(account\d+-)?(wish-counter-|achievement$|characters$|wish-uid$)/.test(k);

function paimonWishes(json: Record<string, unknown>, prefix: string): WishRecord[] {
  const records: WishRecord[] = [];
  for (const [key, type] of Object.entries(PAIMON_KEYS)) {
    // Position among pulls of this banner in the same second: keeps ids stable when another
    // banner gains pulls in a newer backup (a global counter would shift every later id).
    const sameSecond = new Map<string, number>();
    const pulls = ((json[prefix + key] as { pulls?: PaimonPull[] } | undefined)?.pulls ?? []) as PaimonPull[];
    for (const p of pulls) {
      if (!p?.id || !p.time) continue;
      const name = p.id.replace(/_/g, ' ');
      const kind: 'character' | 'weapon' = p.type === 'weapon' ? 'weapon' : p.type === 'character' ? 'character' : itemKind(name);
      const def = kind === 'character' ? findCharacter(name) : findWeapon(name);
      const code = p.code && GACHA_TYPES.has(p.code) ? (p.code as GachaType) : type;
      // paimon.moe stores no record ids; build sortable synthetic ones from time, banner and order.
      const ts = String(recordTime(p.time)).padStart(13, '0');
      const n = sameSecond.get(ts) ?? 0;
      sameSecond.set(ts, n + 1);
      records.push({
        id: `p${ts}${type}${String(n).padStart(3, '0')}`,
        gachaType: code,
        name: def?.name ?? name.replace(/\b\w/g, (c) => c.toUpperCase()),
        itemType: kind,
        rank: rankOf(def?.name ?? name, kind),
        time: p.time,
      });
    }
  }
  return records;
}

function paimonAccount(json: Record<string, unknown>, prefix: string): ImportResult {
  const records = paimonWishes(json, prefix);
  const uid = (json[`${prefix}wish-uid`] as string) || undefined;
  const chars = json[`${prefix}characters`];
  const roster =
    chars && typeof chars === 'object' && !Array.isArray(chars)
      ? Object.entries(chars as Record<string, { default?: number; wish?: number; manual?: number }>)
          .map(([id, c]) => ({ name: id.replace(/_/g, ' '), copies: (c?.default ?? 0) + (c?.wish ?? 0) + (c?.manual ?? 0) }))
          .filter((c) => c.copies > 0)
      : undefined;
  const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
  const serverName = json[`${prefix}server`] as string | undefined;
  const account: Account = {};
  if (uid) account.uid = uid;
  if (num(json[`${prefix}ar`]) != null) account.level = num(json[`${prefix}ar`]);
  if (num(json[`${prefix}wl`]) != null) account.worldLevel = num(json[`${prefix}wl`]);
  if (serverName) account.server = serverName;
  return {
    kind: 'paimon',
    label: 'paimon.moe backup',
    wishes: records.length ? { records, uid } : undefined,
    achievements: parsePaimonAchievements(json[`${prefix}achievement`]),
    roster: roster?.length ? roster : undefined,
    account,
    server: serverName ? PAIMON_SERVER[serverName] : undefined,
  };
}

function parsePaimon(json: Record<string, unknown>): ImportResult {
  const extra = String(json.accounts ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Also pick up prefixed accounts that are missing from the list.
  for (const k of Object.keys(json)) {
    const m = /^(account\d+)-/.exec(k);
    if (m && !extra.includes(m[1])) extra.push(m[1]);
  }
  const savedAt = typeof json['update-time'] === 'string' ? (json['update-time'] as string) : undefined;
  const accounts = [
    { key: 'main', label: 'Main', result: paimonAccount(json, '') },
    ...extra.map((a) => ({ key: a, label: `Account ${a.replace(/^account/, '')}`, result: paimonAccount(json, `${a}-`) })),
  ]
    .filter((a) => partsOf(a.result).some((p) => p !== 'profile'))
    .map((a) => ({ ...a, result: { ...a.result, savedAt } }));
  if (!accounts.length) throw new ImportError('This paimon.moe backup contains no wishes, achievements or characters.', 'paimonEmpty');
  return { ...accounts[0].result, accounts: accounts.length > 1 ? accounts : undefined };
}

// ── Detection ─────────────────────────────────────────────────────────────

export function parseImport(text: string): ImportResult {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new ImportError('This file is not valid JSON.', 'notJson');
  }
  if (!json || typeof json !== 'object') throw new ImportError('Unrecognised file.');

  if ((json.app === 'waypoint' && json.data) || ('settings' in json && 'tasks' in json)) {
    throw new ImportError('This is a Waypoint backup. Restore it under Settings → Import backup.', 'waypointBackup');
  }
  if (json.format === 'waypoint-export') {
    const b = json as unknown as WaypointBundle;
    const wishes = b.uigf ? parseUigf(b.uigf as unknown as Record<string, unknown>).wishes : undefined;
    return { kind: 'waypoint', label: 'Waypoint export', wishes, good: b.good, account: b.account, realtime: b.realtime };
  }
  if (json.format === 'GOOD') return { kind: 'good', label: `GOOD (${String(json.source ?? 'unknown source')})`, good: json as unknown as GoodData };
  if (isUiaf(json)) {
    const info = (json as unknown as UiafFile).info;
    const at = info.export_timestamp ? new Date(info.export_timestamp * 1000).toISOString() : undefined;
    return { kind: 'uiaf', label: `UIAF (${info.export_app ?? 'unknown app'})`, achievements: parseUiaf(json as unknown as UiafFile), savedAt: at };
  }
  if (Array.isArray(json.hk4e) || (json.info && Array.isArray(json.list))) return parseUigf(json);
  if (Object.keys(json).some(isPaimonKey)) return parsePaimon(json);
  throw new ImportError('Unrecognised file. Supported: Waypoint export, UIGF v3/v4, paimon.moe backup, GOOD, UIAF.');
}

// ── Merging ───────────────────────────────────────────────────────────────

const isSynthetic = (r: WishRecord) => r.id.startsWith('p');
const dedupeKey = (r: WishRecord) => `${POOL_OF[r.gachaType]}|${r.time}|${r.name.toLowerCase()}`;

/**
 * Merges imported records into existing ones. A pull is recognised by banner,
 * time and name whenever one side is a synthetic paimon.moe record (those have
 * no real ids): real records replace synthetic ones, synthetic records never
 * duplicate what is stored. Each stored record matches at most one incoming
 * one, so identical pulls in one 10-pull are kept apart. `remap` lists ids
 * that were replaced (old → new), for moving 50/50 corrections along.
 */
export function mergeWishes(
  existing: WishRecord[],
  incoming: WishRecord[],
): { list: WishRecord[]; added: number; remap: Map<string, string> } {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const byKey = new Map<string, WishRecord[]>();
  for (const r of existing) {
    const k = dedupeKey(r);
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const consumed = new Set<WishRecord>(); // stored records matched by an incoming twin
  const replaced = new Set<WishRecord>(); // synthetic records superseded by real ones
  const remap = new Map<string, string>();
  const added: WishRecord[] = [];
  for (const r of incoming) {
    const same = byId.get(r.id);
    if (same) {
      consumed.add(same);
      continue;
    }
    const twin = (byKey.get(dedupeKey(r)) ?? []).find((c) => !consumed.has(c) && (isSynthetic(c) || isSynthetic(r)));
    if (twin) {
      consumed.add(twin);
      if (isSynthetic(r) || !isSynthetic(twin)) continue; // already stored
      replaced.add(twin);
      remap.set(twin.id, r.id);
    }
    added.push(r);
    byId.set(r.id, r);
  }
  const list = sortRecords([...existing.filter((r) => !replaced.has(r)), ...added]);
  return { list, added: added.length - replaced.size, remap };
}
