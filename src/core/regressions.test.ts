/**
 * Regression tests for bugs found in the review of state transitions,
 * imports and saved data.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { addFarmTarget, removeAnime, removeOwned, restoreAnime, setOwned, setSetting } from '../lib/actions';
import { applyImport, setWishOverride } from '../lib/importActions';
import { resinAt } from '../lib/resin';
import { defaultState, getState, hydrate, isWaypointBackup, setState } from '../lib/store';
import { HOUR } from '../lib/time';
import type { WishRecord } from '../lib/types';
import { MATERIALS, requirementFor } from './farming';
import { mergeWishes, parseImport } from './formats';
import type { GoodData } from './good';

const pull = (id: string, time: string, extra: Record<string, string> = {}) => ({ type: 'character', id, time, ...extra });

/** A paimon.moe backup with the given standard and character-event pulls. */
const backup = (standard: ReturnType<typeof pull>[], character: ReturnType<typeof pull>[]) =>
  JSON.stringify({
    'wish-counter-standard': { pulls: standard },
    'wish-counter-character-event': { pulls: character },
  });

const charPulls = Array.from({ length: 20 }, (_, i) => pull('bennett', `2024-03-01 10:00:${String(i).padStart(2, '0')}`));

beforeEach(() => setState(defaultState()));

describe('wish imports', () => {
  it('re-importing a newer paimon.moe backup adds only the new pulls', () => {
    const five = Array.from({ length: 5 }, (_, i) => pull('amber', `2024-01-0${i + 1} 10:00:00`));
    applyImport(parseImport(backup(five, charPulls)));
    expect(getState().wishes).toHaveLength(25);
    // One more standard pull shifts nothing else.
    const summary = applyImport(parseImport(backup([...five, pull('kaeya', '2024-01-09 10:00:00')], charPulls)));
    expect(summary.wishesAdded).toBe(1);
    expect(getState().wishes).toHaveLength(26);
    expect(getState().banners.character.total).toBe(20);
  });

  it('keeps identical pulls from one 10-pull apart', () => {
    const same = [pull('bennett', '2024-03-01 10:00:00'), pull('bennett', '2024-03-01 10:00:00')];
    applyImport(parseImport(backup([], same)));
    applyImport(parseImport(backup([], same)));
    expect(getState().wishes).toHaveLength(2);
  });

  it('moves a 50/50 correction to the real record that replaces a paimon.moe one', () => {
    const synthetic: WishRecord = { id: 'p00017093000000003010000', gachaType: '301', name: 'Diluc', itemType: 'character', rank: 5, time: '2024-03-01 10:00:00' };
    const real: WishRecord = { ...synthetic, id: '1709300000000123456' };
    const { remap, list } = mergeWishes([synthetic], [real]);
    expect(list.map((r) => r.id)).toEqual([real.id]);
    expect(remap.get(synthetic.id)).toBe(real.id);
  });

  it('correcting a 50/50 keeps pulls added by hand', () => {
    applyImport(parseImport(backup([], [...charPulls, pull('diluc', '2024-03-02 10:00:00')])));
    const s = getState();
    // +30 pulls logged by hand.
    setState({ ...s, banners: { ...s.banners, character: { ...s.banners.character, pity5: 30, total: s.banners.character.total + 30 } } });
    const id = getState().banners.character.history[0].id;
    setWishOverride(id, 'won');
    expect(getState().banners.character.pity5).toBe(30);
    expect(getState().banners.character.history[0].outcome).toBe('won');
  });
});

describe('GOOD imports', () => {
  const good = (data: Partial<GoodData>) => ({ kind: 'good' as const, label: 'GOOD', good: { format: 'GOOD', version: 2, source: 'test', ...data } as GoodData });

  it('a partial scan keeps the inventory sections it does not contain', () => {
    applyImport(good({ weapons: [{ key: 'SkywardHarp', level: 90, ascension: 6, refinement: 1, location: '', lock: false }], materials: { MysticEnhancementOre: 50 } }));
    applyImport(good({ artifacts: [] }));
    expect(getState().inventory.materials.MysticEnhancementOre).toBe(50);
    expect(getState().inventory.weapons).toHaveLength(1);
  });

  it('does not store 1–3★ weapons in the inventory, but still equips them', () => {
    applyImport(
      good({
        characters: [{ key: 'Bennett', level: 80, constellation: 6, ascension: 6, talent: { auto: 8, skill: 8, burst: 8 } }],
        weapons: [
          { key: 'SkywardHarp', level: 90, ascension: 6, refinement: 1, location: '', lock: false },
          { key: 'CoolSteel', level: 90, ascension: 6, refinement: 5, location: 'Bennett', lock: false },
        ],
      }),
    );
    expect(getState().inventory.weapons.map((w) => w.name)).toEqual(['Skyward Harp']);
    expect(getState().characters.bennett.weapon).toBe('Cool Steel');
    expect(hydrate({ inventory: { weapons: [{ key: 'CoolSteel', name: 'Cool Steel' }] } }).inventory.weapons).toEqual([]);
  });

  it('keeps the most developed Traveler and does not reset missing talents', () => {
    applyImport(
      good({
        characters: [
          { key: 'TravelerAnemo', level: 90, constellation: 6, ascension: 6, talent: { auto: 9, skill: 9, burst: 9 } },
          { key: 'TravelerPyro', level: 20, constellation: 0, ascension: 1, talent: { auto: 1, skill: 1, burst: 1 } },
        ],
      }),
    );
    expect(getState().characters.traveler.talents).toEqual([9, 9, 9]);
    applyImport(good({ characters: [{ key: 'Bennett', level: 80, constellation: 6, ascension: 6, talent: { auto: 8, skill: 8, burst: 8 } }] }));
    applyImport(good({ characters: [{ key: 'Bennett', level: 90, constellation: 6, ascension: 6 } as never] }));
    expect(getState().characters.bennett.talents).toEqual([8, 8, 8]);
  });
});

describe('farming', () => {
  it('talent goals require the ascension they need', () => {
    const r = requirementFor('furina', { level: 1, talents: [1, 1, 1] }, { id: 'furina', level: 40, talents: [9, 9, 9] });
    const boss = [...r.items].filter(([id]) => MATERIALS[id]?.kind === 'boss').reduce((n, [, c]) => n + c, 0);
    expect(boss).toBe(46); // all six ascensions
  });

  it('a stale imported ascension does not inflate the plan after a level edit', () => {
    const a = requirementFor('furina', { level: 80, ascension: 1, talents: [1, 1, 1] }, { id: 'furina', level: 90, talents: [1, 1, 1] });
    const b = requirementFor('furina', { level: 80, talents: [1, 1, 1] }, { id: 'furina', level: 90, talents: [1, 1, 1] });
    expect(a.mora).toBe(b.mora);
  });

  it('removing a character drops it from the plan, and undo brings both back', () => {
    setOwned('furina', true);
    addFarmTarget('furina');
    const undo = removeOwned('furina');
    expect(getState().farming).toHaveLength(0);
    undo();
    expect(getState().characters.furina).toBeDefined();
    expect(getState().farming).toHaveLength(1);
  });
});

describe('resin cap', () => {
  it('raising the cap does not credit resin that was capped', () => {
    const now = Date.now();
    setState({ ...getState(), settings: { ...getState().settings, resinCap: 160 }, resin: { value: 100, at: now - 10 * HOUR, condensed: 0, fragile: 0 } });
    expect(resinAt(getState().resin, 160, now).current).toBe(160);
    setSetting('resinCap', 200);
    expect(resinAt(getState().resin, 200, Date.now()).current).toBe(160);
  });
});

describe('saved data', () => {
  it('a damaged or foreign file cannot break the app', () => {
    const s = hydrate({ settings: { lang: 'fr', theme: 'neon', resinCap: 'x' }, tasks: [null], anime: [null, 5], inventory: { weapons: null }, banners: { character: { history: null } } });
    expect(s.settings.lang).toMatch(/^(en|de)$/);
    expect(s.settings.theme).toBe('system');
    expect(s.settings.resinCap).toBe(200);
    expect(s.anime).toEqual([]);
    expect(s.inventory.weapons).toEqual([]);
    expect(s.banners.character.history).toEqual([]);
  });

  it('only accepts Waypoint backups for restore', () => {
    expect(isWaypointBackup({ anime: [] })).toBe(false);
    expect(isWaypointBackup({ settings: {} })).toBe(false);
    expect(isWaypointBackup({ settings: {}, tasks: [] })).toBe(true);
    expect(isWaypointBackup({ app: 'waypoint', data: { settings: {}, tasks: [] } })).toBe(true);
  });
});

describe('undo', () => {
  it('undoing one deletion does not bring back or remove another', () => {
    const show = (id: string) => ({ ...(defaultState().anime[0] ?? {}), id, title: { romaji: id }, genres: [], status: 'planning', progress: 0, score: 0, rewatches: 0, favorite: false, notes: '', addedAt: 0, updatedAt: 0 }) as never;
    setState({ ...getState(), anime: [show('a'), show('b'), show('c')] });
    const ia = removeAnime('a');
    const ib = removeAnime('b');
    restoreAnime(show('a'), ia);
    expect(getState().anime.map((x) => x.id)).toEqual(['a', 'c']);
    restoreAnime(show('b'), ib);
    expect(getState().anime.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
    // Undo twice is harmless.
    restoreAnime(show('b'), ib);
    expect(getState().anime).toHaveLength(3);
  });
});
