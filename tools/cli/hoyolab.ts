/**
 * HoYoLAB Battle Chronicle: the same data the HoYoLAB app shows. Needs the
 * account's cookie (ltoken_v2 + ltuid_v2) and the Battle Chronicle set to public.
 *
 *  - character list + details → levels, constellations, talents, weapons, artifacts
 *  - real-time notes          → resin, commissions, realm currency, transformer
 *  - index                    → nickname, AR, world level
 */
import { createHash, randomBytes } from 'node:crypto';
import { findCharacter } from '../../src/data/characters';
import type { Realtime } from '../../src/core/formats';
import { ascensionForLevel, statKeyFromProp, toGoodKey, type GoodArtifact, type GoodCharacter, type GoodData, type GoodWeapon } from '../../src/core/good';
import type { Account, ArtifactSlot } from '../../src/lib/types';
import type { Http } from './http';

const BASE = 'https://bbs-api-os.hoyolab.com/game_record/genshin/api';
// Salt for the overseas Battle Chronicle web endpoints ("DS" header).
const DS_SALT = '6s25p5ox5y14umn1p61aqyyvbvvl3lrt';

export class HoyolabError extends Error {
  constructor(
    message: string,
    public retcode: number,
  ) {
    super(message);
  }
}

export function makeDS(now = Date.now(), rand = randomBytes(3).toString('hex')): string {
  const t = Math.floor(now / 1000);
  const r = rand.slice(0, 6);
  const sig = createHash('md5').update(`salt=${DS_SALT}&t=${t}&r=${r}`).digest('hex');
  return `${t},${r},${sig}`;
}

/** UID → Battle Chronicle server. */
export function serverForUid(uid: string): string {
  const head = uid.length === 10 ? uid.slice(0, 2) : uid[0];
  const map: Record<string, string> = { '6': 'os_usa', '7': 'os_euro', '8': 'os_asia', '18': 'os_asia', '9': 'os_cht' };
  const s = map[head];
  if (!s) throw new HoyolabError(`UID ${uid} is not on a global server (HoYoLAB only covers global accounts).`, -1);
  return s;
}

/** Accepts a full cookie header or a "ltoken_v2=…; ltuid_v2=…" fragment. */
export function normaliseCookie(cookie: string): { header: string; ltuid?: string } {
  const parts = new Map<string, string>();
  for (const p of cookie.split(';')) {
    const i = p.indexOf('=');
    if (i > 0) parts.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  if (!parts.has('ltoken_v2') && !parts.has('ltoken')) {
    throw new HoyolabError('The cookie needs ltoken_v2 and ltuid_v2 (copy them from hoyolab.com while logged in).', -1);
  }
  return { header: [...parts].map(([k, v]) => `${k}=${v}`).join('; '), ltuid: parts.get('ltuid_v2') ?? parts.get('ltuid') };
}

const RETCODE_HELP: Record<number, string> = {
  10001: 'HoYoLAB says you are not logged in – the cookie is wrong or expired.',
  [-100]: 'HoYoLAB says you are not logged in – the cookie is wrong or expired.',
  10102: 'Your Battle Chronicle is private. On HoYoLAB: Battle Chronicle → Settings → make it public.',
  1034: 'HoYoLAB wants a captcha. Open the Battle Chronicle on hoyolab.com once, solve it, then retry.',
  10101: 'HoYoLAB rate limit (you can view 30 accounts per day). Try again tomorrow.',
};

export class Hoyolab {
  private cookie: string;
  constructor(
    private http: Http,
    cookie: string,
    private lang = 'en-us',
  ) {
    this.cookie = normaliseCookie(cookie).header;
  }

  private async call<T>(path: string, init: { method?: 'GET' | 'POST'; query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
    const url = new URL(path.startsWith('http') ? path : `${BASE}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    const res = await this.http.json<{ retcode: number; message: string; data: T }>(url.toString(), {
      method: init.method ?? 'GET',
      body: init.body ? JSON.stringify(init.body) : undefined,
      headers: {
        Cookie: this.cookie,
        DS: makeDS(),
        'Content-Type': 'application/json',
        'x-rpc-app_version': '1.5.0',
        'x-rpc-client_type': '5',
        'x-rpc-language': this.lang,
        Origin: 'https://act.hoyolab.com',
        Referer: 'https://act.hoyolab.com/',
      },
    });
    if (res.retcode !== 0) throw new HoyolabError(RETCODE_HELP[res.retcode] ?? `HoYoLAB error ${res.retcode}: ${res.message}`, res.retcode);
    return res.data;
  }

  /** Genshin accounts linked to the HoYoLAB account. */
  async accounts(ltuid: string): Promise<{ uid: string; server: string; nickname: string; level: number }[]> {
    const data = await this.call<{ list: { game_id: number; game_role_id: string; region: string; nickname: string; level: number }[] }>(
      'https://bbs-api-os.hoyolab.com/game_record/card/wapi/getGameRecordCard',
      { query: { uid: ltuid } },
    );
    return data.list
      .filter((g) => g.game_id === 2)
      .map((g) => ({ uid: g.game_role_id, server: g.region, nickname: g.nickname, level: g.level }));
  }

  async index(uid: string) {
    return this.call<{ role: { nickname: string; level: number; region: string }; stats: Record<string, unknown> }>('/index', {
      query: { server: serverForUid(uid), role_id: uid },
    });
  }

  async characters(uid: string): Promise<HoyoCharacterDetail[]> {
    const server = serverForUid(uid);
    const list = await this.call<{ list: { id: number }[] }>('/character/list', { method: 'POST', body: { role_id: uid, server, sort_type: 1 } });
    const ids = list.list.map((c) => c.id);
    const out: HoyoCharacterDetail[] = [];
    // The detail endpoint accepts batches; keep them small to stay under limits.
    for (let i = 0; i < ids.length; i += 8) {
      const d = await this.call<{ list: HoyoCharacterDetail[] }>('/character/detail', {
        method: 'POST',
        body: { role_id: uid, server, character_ids: ids.slice(i, i + 8) },
      });
      out.push(...d.list);
      await new Promise((r) => setTimeout(r, 300));
    }
    return out;
  }

  async dailyNote(uid: string): Promise<HoyoDailyNote> {
    return this.call<HoyoDailyNote>('/dailyNote', { query: { server: serverForUid(uid), role_id: uid } });
  }
}

export interface HoyoCharacterDetail {
  base: { id: number; name: string; level: number; actived_constellation_num: number };
  weapon?: { id: number; name: string; level: number; promote_level?: number; affix_level: number };
  relics?: {
    pos: number;
    rarity: number;
    level: number;
    set: { id?: number; name: string };
    main_property?: { property_type: number; value: string };
    sub_property_list?: { property_type: number; value: string }[];
  }[];
  skills?: { skill_id: number; skill_type: number; level: number }[];
}

export interface HoyoDailyNote {
  current_resin: number;
  max_resin: number;
  resin_recovery_time: string;
  finished_task_num: number;
  total_task_num: number;
  is_extra_task_reward_received: boolean;
  remain_resin_discount_num: number;
  current_home_coin: number;
  max_home_coin: number;
  transformer?: { obtained: boolean; recovery_time: { Day: number; Hour: number; Minute: number; Second: number; reached: boolean } };
}

const POS: Record<number, ArtifactSlot> = { 1: 'flower', 2: 'plume', 3: 'sands', 4: 'goblet', 5: 'circlet' };
const num = (v: string) => parseFloat(v.replace('%', ''));

/** Converts Battle Chronicle character details to GOOD. */
export function hoyolabToGood(list: HoyoCharacterDetail[]): GoodData {
  const characters: GoodCharacter[] = [];
  const weapons: GoodWeapon[] = [];
  const artifacts: GoodArtifact[] = [];
  for (const c of list) {
    const def = findCharacter(c.base.name);
    const key = toGoodKey(def?.name ?? c.base.name);
    // Active skills: normal attack first, burst last. HoYoLAB levels include
    // constellation boosts (+3), GOOD wants base levels.
    const active = (c.skills ?? []).filter((s) => s.skill_type === 1);
    const base = (l?: number) => (l == null ? 1 : l > 10 ? l - 3 : l);
    characters.push({
      key,
      level: c.base.level,
      ascension: ascensionForLevel(c.base.level),
      constellation: c.base.actived_constellation_num,
      talent: { auto: base(active[0]?.level), skill: base(active[1]?.level), burst: base(active[active.length - 1]?.level) },
    });
    if (c.weapon) {
      weapons.push({
        key: toGoodKey(c.weapon.name),
        level: c.weapon.level,
        ascension: c.weapon.promote_level ?? ascensionForLevel(c.weapon.level),
        refinement: c.weapon.affix_level,
        location: key,
        lock: false,
      });
    }
    for (const r of c.relics ?? []) {
      artifacts.push({
        setKey: toGoodKey(r.set.name),
        slotKey: POS[r.pos],
        level: r.level,
        rarity: r.rarity,
        mainStatKey: r.main_property ? statKeyFromProp(r.main_property.property_type) : '',
        location: key,
        lock: false,
        substats: (r.sub_property_list ?? []).map((s) => ({ key: statKeyFromProp(s.property_type), value: num(s.value) })),
      });
    }
  }
  return { format: 'GOOD', version: 2, source: 'Waypoint export (HoYoLAB)', characters, weapons, artifacts };
}

export function dailyNoteToRealtime(n: HoyoDailyNote, fetchedAt = new Date()): Realtime {
  const tr = n.transformer;
  const trSeconds = tr?.obtained
    ? tr.recovery_time.reached
      ? 0
      : ((tr.recovery_time.Day * 24 + tr.recovery_time.Hour) * 60 + tr.recovery_time.Minute) * 60 + tr.recovery_time.Second
    : null;
  return {
    fetchedAt: fetchedAt.toISOString(),
    resin: { current: n.current_resin, max: n.max_resin, recoverySeconds: Number(n.resin_recovery_time) || 0 },
    commissions: { done: n.finished_task_num, total: n.total_task_num, claimed: n.is_extra_task_reward_received },
    realmCurrency: { current: n.current_home_coin, max: n.max_home_coin },
    transformerReadyInSeconds: trSeconds,
    weeklyBossDiscountsLeft: n.remain_resin_discount_num,
  };
}

export function accountFromIndex(uid: string, idx: { role: { nickname: string; level: number; region: string } }): Account {
  return { uid, nickname: idx.role.nickname, level: idx.role.level, server: idx.role.region };
}
