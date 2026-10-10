import { describe, expect, it } from 'vitest';
import { findCharacter, findWeapon } from '../data/characters';
import type { WishRecord } from '../lib/types';
import { fetchWishHistory, findWishUrls, GachaApiError, pageUrl, parseWishUrl } from './gachaApi';
import { critValue, fromGoodKey, setSummary, toGoodKey } from './good';
import { mergeWishes, parseImport, toUigfV4 } from './formats';
import { analyzePool, weaponCopies } from './wishStats';

const rec = (id: string, name: string, rank: 3 | 4 | 5, gachaType: WishRecord['gachaType'] = '301', time = '2024-01-01 10:00:00'): WishRecord => ({
  id,
  gachaType,
  name,
  itemType: findWeapon(name) ? 'weapon' : 'character',
  rank,
  time,
});

describe('game data lookups', () => {
  it('matches names from different sources', () => {
    expect(findCharacter('RaidenShogun')?.id).toBe('raiden-shogun');
    expect(findCharacter('raiden_shogun')?.id).toBe('raiden-shogun');
    expect(findCharacter('Shougun Raiden')?.id).toBe('raiden-shogun'); // German name
    expect(findCharacter('TravelerAnemo')?.id).toBe('traveler');
    expect(findCharacter('KaedeharaKazuha')?.name).toBe('Kaedehara Kazuha');
    expect(findWeapon('FreedomSworn')?.name).toBe('Freedom-Sworn');
    expect(findWeapon('the_catch')?.rarity).toBe(4);
    expect(findCharacter("Traveler's Handy Sword")).toBeUndefined();
    expect(findWeapon("Traveler's Handy Sword")?.rarity).toBe(3);
  });
});

describe('wish link parsing', () => {
  const link =
    'https://gs.hoyoverse.com/genshin/event/e20190909gacha-v3/index.html?win_mode=fullscreen&authkey_ver=1&sign_type=2&auth_appid=webview_gacha&init_type=301&lang=de&device_type=pc&region=os_euro&authkey=abc%2Bdef%3D&game_biz=hk4e_global#/log';
  it('extracts authkey and region', () => {
    const info = parseWishUrl(`some text before ${link} after`);
    expect(info.region).toBe('global');
    expect(info.params.get('authkey')).toBe('abc+def=');
    const u = new URL(pageUrl(info, '302', '123'));
    expect(u.host).toBe('public-operation-hk4e-sg.hoyoverse.com');
    expect(u.searchParams.get('gacha_type')).toBe('302');
    expect(u.searchParams.get('end_id')).toBe('123');
    expect(u.searchParams.get('authkey')).toBe('abc+def=');
    expect(u.searchParams.get('lang')).toBe('en-us');
  });
  it('detects China links', () => {
    expect(parseWishUrl('https://webstatic.mihoyo.com/hk4e/event/e20190909gacha-v3/index.html?authkey=x&region=cn_gf01').region).toBe('china');
  });
  it('rejects links without authkey', () => {
    expect(() => parseWishUrl('https://example.com/?a=1')).toThrow(GachaApiError);
  });
  it('finds the latest link in cache bytes', () => {
    const blob = `junk\0\x01https://gs.hoyoverse.com/genshin/event/e20190909gacha-v3/index.html?authkey=OLD&lang=en\0more 1/0/https://gs.hoyoverse.com/genshin/event/e20190909gacha-v3/index.html?authkey=NEW&lang=en\0\x02tail https://example.com/?authkey=nope`;
    const urls = findWishUrls(blob);
    expect(urls.map((u) => new URL(u).searchParams.get('authkey'))).toEqual(['OLD', 'NEW']);
  });
});

describe('wish history download', () => {
  const info = parseWishUrl('https://gs.hoyoverse.com/x/index.html?authkey=k&region=os_euro');
  const item = (id: number, type: string, rank = '3') => ({
    id: String(id), uid: '700000001', gacha_type: type, item_id: '', name: 'Cool Steel', item_type: 'Weapon', rank_type: rank, time: '2024-01-01 00:00:00',
  });

  it('pages with end_id, retries on rate limit and stops at known ids', async () => {
    const calls: string[] = [];
    let rateLimited = false;
    const fetch = async (url: string) => {
      const u = new URL(url);
      calls.push(`${u.searchParams.get('gacha_type')}:${u.searchParams.get('end_id')}`);
      const type = u.searchParams.get('gacha_type')!;
      const end = Number(u.searchParams.get('end_id'));
      let body: unknown = { retcode: 0, message: 'OK', data: { list: [] } };
      if (type === '301' && !rateLimited) {
        rateLimited = true;
        body = { retcode: -110, message: 'visit too frequently', data: null };
      } else if (type === '301') {
        // 25 records: ids 1025..1001, newest first, 20 per page.
        const all = Array.from({ length: 25 }, (_, i) => item(1025 - i, i % 2 ? '301' : '400'));
        const start = end === 0 ? 0 : all.findIndex((x) => Number(x.id) === end) + 1;
        body = { retcode: 0, message: 'OK', data: { list: all.slice(start, start + 20) } };
      } else if (type === '302') {
        body = { retcode: 0, message: 'OK', data: { list: [item(2003, '302', '5'), item(2002, '302'), item(2001, '302')] } };
      }
      return { ok: true, status: 200, json: async () => body };
    };
    const { records, uid } = await fetchWishHistory(info, { fetch, sleep: async () => {}, knownIds: new Set(['2002']) });
    expect(uid).toBe('700000001');
    expect(records.filter((r) => r.gachaType === '301' || r.gachaType === '400')).toHaveLength(25);
    expect(records.filter((r) => r.gachaType === '302').map((r) => r.id)).toEqual(['2003']);
    expect(calls.slice(0, 3)).toEqual(['301:0', '301:0', '301:1006']);
  });

  it('reports expired links clearly', async () => {
    const fetch = async () => ({ ok: true, status: 200, json: async () => ({ retcode: -101, message: 'authkey timeout', data: null }) });
    await expect(fetchWishHistory(info, { fetch, sleep: async () => {} })).rejects.toMatchObject({ code: 'authkey-expired' });
  });
});

describe('pity and 50/50 analysis', () => {
  it('counts pity and detects lost 50/50 and guarantees', () => {
    const list: WishRecord[] = [];
    let id = 1000;
    const pull = (name: string, rank: 3 | 4 | 5, n = 1) => {
      for (let i = 0; i < n; i++) list.push(rec(String(id++), name, rank, '301', `2024-01-0${1 + Math.floor(id / 1000)} 10:00:00`));
    };
    pull('Cool Steel', 3, 75);
    pull('Qiqi', 5); // 76: lost
    pull('Cool Steel', 3, 9);
    pull('Bennett', 4); // 4★ at 10
    pull('Furina', 5, 1); // guaranteed at 11
    pull('Cool Steel', 3, 30);
    pull('Nahida', 5); // won at 31
    pull('Cool Steel', 3, 5);
    const st = analyzePool('character', list);
    expect(st.five.map((f) => [f.record.name, f.pity, f.outcome])).toEqual([
      ['Qiqi', 76, 'lost'],
      ['Furina', 11, 'guaranteed'],
      ['Nahida', 31, 'won'],
    ]);
    expect(st.pity5).toBe(5);
    expect(st.guaranteed).toBe(false);
    expect(st.fiftyWon).toBe(1);
    expect(st.fiftyLost).toBe(1);
    expect(st.four[0].pity).toBe(10);
  });

  it('treats Tighnari as a win on his own banner and a loss later', () => {
    const early = analyzePool('character', [rec('1', 'Tighnari', 5, '301', '2022-08-30 10:00:00')]);
    const late = analyzePool('character', [rec('1', 'Tighnari', 5, '301', '2023-05-01 10:00:00')]);
    expect(early.five[0].outcome).toBe('won');
    expect(late.five[0].outcome).toBe('lost');
    expect(late.guaranteed).toBe(true);
  });

  it('honours manual overrides', () => {
    const st = analyzePool('character', [rec('1', 'Dehya', 5, '301', '2024-01-01 00:00:00')], { '1': 'won' });
    expect(st.five[0].outcome).toBe('won');
  });
});

describe('import formats', () => {
  it('reads UIGF v3', () => {
    const r = parseImport(JSON.stringify({
      info: { uid: '700000001', uigf_version: 'v3.0' },
      list: [{ id: '1', gacha_type: '400', uigf_gacha_type: '301', name: 'Furina', item_type: 'Character', rank_type: '5', time: '2024-01-01 00:00:00' }],
    }));
    expect(r.kind).toBe('uigf');
    expect(r.wishes?.uid).toBe('700000001');
    expect(r.wishes?.records[0]).toMatchObject({ gachaType: '400', itemType: 'character', rank: 5 });
  });

  it('reads UIGF v4 and round-trips our export', () => {
    const records = [rec('5', 'Furina', 5), rec('6', 'Cool Steel', 3, '302')];
    const r = parseImport(JSON.stringify(toUigfV4(records, '700000001')));
    expect(r.wishes?.records).toHaveLength(2);
    expect(r.wishes?.records.find((x) => x.id === '6')).toMatchObject({ itemType: 'weapon', rank: 3, gachaType: '302' });
  });

  it('reads paimon.moe backups (localised names not needed)', () => {
    const r = parseImport(JSON.stringify({
      'wish-counter-character-event': { total: 2, pulls: [
        { type: 'weapon', code: '301', id: 'cool_steel', time: '2023-01-01 10:00:00', pity: 1 },
        { type: 'character', code: '400', id: 'raiden_shogun', time: '2023-01-01 10:00:00', pity: 2 },
      ] },
    }));
    expect(r.kind).toBe('paimon');
    expect(r.wishes?.records.map((x) => [x.name, x.rank, x.gachaType])).toEqual([
      ['Cool Steel', 3, '301'],
      ['Raiden Shogun', 5, '400'],
    ]);
  });

  it('detects GOOD and Waypoint bundles', () => {
    expect(parseImport(JSON.stringify({ format: 'GOOD', version: 2, source: 'Inventory_Kamera', characters: [] })).kind).toBe('good');
    const bundle = parseImport(JSON.stringify({ format: 'waypoint-export', version: 1, exportedAt: '', source: 'x', uigf: toUigfV4([rec('1', 'Furina', 5)], '7') }));
    expect(bundle.kind).toBe('waypoint');
    expect(bundle.wishes?.records).toHaveLength(1);
  });

  it('keeps explicit weapon types even when the name looks like a character', () => {
    const r = parseImport(JSON.stringify({
      info: { uid: '1', uigf_version: 'v3.0' },
      list: [{ id: '1', gacha_type: '200', name: "Traveler's Handy Sword", item_type: 'Weapon', rank_type: '3', time: '2024-01-01 00:00:00' }],
    }));
    expect(r.wishes?.records[0].itemType).toBe('weapon');
  });

  it('points Waypoint backups to Settings', () => {
    expect(() => parseImport(JSON.stringify({ app: 'waypoint', data: { settings: {} } }))).toThrow(/Settings/);
    expect(() => parseImport(JSON.stringify({ version: 1, settings: {}, tasks: [] }))).toThrow(/Settings/);
  });

  it('rejects unknown files', () => {
    expect(() => parseImport('{"hello":1}')).toThrow(/Unrecognised/);
    expect(() => parseImport('nope')).toThrow(/not valid JSON/);
  });
});

describe('merging', () => {
  it('dedupes by id and replaces paimon.moe records with real ones', () => {
    const synthetic = { ...rec('p1704103200000000001', 'Furina', 5), time: '2024-01-01 10:00:00' };
    const real = { ...rec('1700000000000000001', 'Furina', 5), time: '2024-01-01 10:00:00' };
    const a = mergeWishes([synthetic], [real, real]);
    expect(a.list.map((r) => r.id)).toEqual([real.id]);
    expect(a.added).toBe(0);
    const b = mergeWishes([real], [synthetic]);
    expect(b.list).toHaveLength(1);
    expect(b.added).toBe(0);
  });
});

describe('GOOD helpers', () => {
  it('converts keys and summarises sets', () => {
    expect(toGoodKey("Kamisato Ayaka")).toBe('KamisatoAyaka');
    expect(toGoodKey("Wolf's Gravestone")).toBe('WolfsGravestone');
    expect(fromGoodKey('GladiatorsFinale')).toBe('Gladiators Finale');
    expect(setSummary([{ setKey: 'A' }, { setKey: 'A' }, { setKey: 'A' }, { setKey: 'A' }, { setKey: 'B' }])).toBe('4pc A');
    expect(setSummary([{ setKey: 'A' }, { setKey: 'A' }, { setKey: 'B' }, { setKey: 'B' }])).toBe('2pc A + 2pc B');
    expect(critValue({ substats: [{ key: 'critRate_', value: 10.5 }, { key: 'critDMG_', value: 21 }] })).toBe(42);
  });
});

describe('weapon copies', () => {
  it('counts 4★/5★ weapon copies for refinements', () => {
    const list = weaponCopies([
      rec('1', 'The Flute', 4, '302'),
      rec('2', 'The Flute', 4, '200'),
      rec('3', 'Skyward Harp', 5, '302'),
      rec('4', 'Cool Steel', 3, '302'),
      rec('5', 'Furina', 5),
    ]);
    expect(list.map((w) => [w.name, w.copies])).toEqual([
      ['Skyward Harp', 1],
      ['The Flute', 2],
    ]);
  });
});
