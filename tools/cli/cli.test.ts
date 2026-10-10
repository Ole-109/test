import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gameDirFromLog, searchWishUrls } from './cache';
import { enkaToGood, type EnkaResponse } from './enka';
import { baseTalents, dailyNoteToRealtime, hoyolabToGood, makeDS, normaliseCookie, serverForUid } from './hoyolab';

const tmp = mkdtempSync(join(tmpdir(), 'waypoint-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('game cache', () => {
  it('reads the game folder from the log', () => {
    const log = 'Some line\r\nWarmup file D:/Games/Genshin Impact/Genshin Impact game/GenshinImpact_Data/StreamingAssets/x.blk\r\n';
    expect(gameDirFromLog(log)).toBe('D:/Games/Genshin Impact/Genshin Impact game/GenshinImpact_Data');
    expect(gameDirFromLog('C:\\Program Files\\Genshin Impact\\Genshin Impact game\\GenshinImpact_Data\\x')).toBe(
      'C:/Program Files/Genshin Impact/Genshin Impact game/GenshinImpact_Data',
    );
  });

  it('finds links in the newest webCaches version', () => {
    const data = join(tmp, 'GenshinImpact_Data');
    const write = (version: string, authkey: string) => {
      const dir = join(data, 'webCaches', version, 'Cache', 'Cache_Data');
      mkdirSync(dir, { recursive: true });
      const bytes = Buffer.concat([
        Buffer.from([0, 1, 2, 3]),
        Buffer.from(`1/0/https://public-operation-hk4e-sg.hoyoverse.com/gacha_info/api/getGachaLog?win_mode=fullscreen&authkey=${authkey}&gacha_type=301`),
        Buffer.from([0, 0, 0xff]),
      ]);
      writeFileSync(join(dir, 'data_2'), bytes);
    };
    write('2.30.0.0', 'OLD');
    write('2.38.0.0', 'NEW');
    // Make the newer version's file the most recently written one.
    const newer = join(data, 'webCaches', '2.38.0.0', 'Cache', 'Cache_Data', 'data_2');
    writeFileSync(newer, readFileSync(newer));
    const res = searchWishUrls({ gameDir: tmp });
    expect(res.gameDataDir).toBe(data);
    expect(res.urls).toHaveLength(1);
    expect(new URL(res.urls[0]).searchParams.get('authkey')).toBe('NEW');
  });

  it('reports where it looked when nothing is found', () => {
    const res = searchWishUrls({ home: join(tmp, 'nohome') });
    expect(res.urls).toEqual([]);
    expect(res.tried.some((p) => p.endsWith('output_log.txt'))).toBe(true);
  });
});

describe('Enka', () => {
  it('converts a showcase to GOOD', () => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/enka.json', import.meta.url), 'utf8')) as EnkaResponse;
    const skillOrder = { '10000049': [10491, 10492, 10495] };
    const { good, account, unknown } = enkaToGood(fixture, skillOrder);
    expect(unknown).toEqual([]);
    expect(account).toMatchObject({ uid: '700000000', nickname: 'Fixture', level: 60 });
    expect(good.characters?.[0]).toMatchObject({ key: 'Yoimiya', level: 90, ascension: 6, talent: { auto: 10, skill: 10, burst: 10 } });
    expect(good.characters?.[1].key).toBe('HuTao');
    expect(good.weapons?.[0]).toMatchObject({ key: 'ThunderingPulse', refinement: 1, location: 'Yoimiya' });
    const flower = good.artifacts?.find((a) => a.location === 'Yoimiya' && a.slotKey === 'flower');
    expect(flower).toMatchObject({ level: 20, rarity: 5, mainStatKey: 'hp' });
    expect(flower?.substats[0]).toEqual({ key: 'critRate_', value: 13.2 });
  });
});

describe('HoYoLAB', () => {
  it('signs requests', () => {
    const ds = makeDS(1_700_000_000_000, 'abcdef');
    const [t, r, sig] = ds.split(',');
    expect(t).toBe('1700000000');
    expect(r).toBe('abcdef');
    expect(sig).toMatch(/^[0-9a-f]{32}$/);
  });

  it('maps UIDs to servers and validates cookies', () => {
    expect(serverForUid('712345678')).toBe('os_euro');
    expect(serverForUid('1812345678')).toBe('os_asia');
    expect(() => serverForUid('112345678')).toThrow(/global/);
    expect(normaliseCookie(' ltoken_v2=abc ; ltuid_v2=42; mi18nLang=en-us').ltuid).toBe('42');
    expect(() => normaliseCookie('foo=bar')).toThrow(/ltoken_v2/);
  });

  it('converts character details and notes', () => {
    const good = hoyolabToGood([
      {
        base: { id: 10000089, name: 'Furina', level: 90, actived_constellation_num: 3 },
        weapon: { id: 11426, name: 'Splendor of Tranquil Waters', level: 90, promote_level: 6, affix_level: 1 },
        relics: [
          {
            pos: 3,
            rarity: 5,
            level: 20,
            set: { name: 'Golden Troupe' },
            main_property: { property_type: 3, value: '46.6%' },
            sub_property_list: [{ property_type: 20, value: '10.5%' }],
          },
        ],
        skills: [
          { skill_id: 1, skill_type: 1, level: 6 },
          { skill_id: 2, skill_type: 1, level: 13 },
          { skill_id: 3, skill_type: 2, level: 1 },
          { skill_id: 4, skill_type: 1, level: 10 },
        ],
      },
    ]);
    expect(good.characters?.[0]).toMatchObject({ key: 'Furina', constellation: 3, talent: { auto: 6, skill: 10, burst: 10 } });
    expect(good.weapons?.[0].key).toBe('SplendorOfTranquilWaters');
    expect(good.artifacts?.[0]).toMatchObject({ setKey: 'GoldenTroupe', slotKey: 'sands', mainStatKey: 'hp_', substats: [{ key: 'critRate_', value: 10.5 }] });

    const rt = dailyNoteToRealtime(
      {
        current_resin: 120,
        max_resin: 200,
        resin_recovery_time: '38400',
        finished_task_num: 4,
        total_task_num: 4,
        is_extra_task_reward_received: true,
        remain_resin_discount_num: 1,
        current_home_coin: 100,
        max_home_coin: 2400,
        transformer: { obtained: true, recovery_time: { Day: 1, Hour: 2, Minute: 0, Second: 0, reached: false } },
      },
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(rt.resin).toEqual({ current: 120, max: 200, recoverySeconds: 38400 });
    expect(rt.transformerReadyInSeconds).toBe(26 * 3600);
  });

  it('removes constellation boosts from talent levels', () => {
    const ayaka = {
      base: { id: 10000002, name: 'Kamisato Ayaka', level: 90, actived_constellation_num: 3 },
      skills: [
        { skill_id: 10024, skill_type: 1, level: 9, name: 'Normal Attack: Kamisato Art: Kabuki' },
        { skill_id: 10018, skill_type: 1, level: 10, name: 'Kamisato Art: Hyouka' },
        { skill_id: 10019, skill_type: 1, level: 13, name: 'Kamisato Art: Soumetsu' },
        { skill_id: 10013, skill_type: 1, level: 1, name: 'Kamisato Art: Senho' },
      ],
      constellations: [
        { pos: 3, is_actived: true, effect: 'Increases the Level of <color=#FFD780FF>Kamisato Art: Soumetsu</color> by 3. Maximum upgrade level is 15.' },
        { pos: 5, is_actived: false, effect: 'Increases the Level of Kamisato Art: Hyouka by 3. Maximum upgrade level is 15.' },
      ],
    };
    // Skill order from the game data: the sprint must not be mistaken for the burst.
    expect(baseTalents(ayaka, [10024, 10018, 10019])).toEqual({ auto: 9, skill: 10, burst: 10 });
    // C5 active: a boosted 10 is really a 7.
    const c5 = { ...ayaka, constellations: ayaka.constellations.map((c) => ({ ...c, is_actived: true })) };
    expect(baseTalents(c5, [10024, 10018, 10019])).toEqual({ auto: 9, skill: 7, burst: 10 });
  });
});
