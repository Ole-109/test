import { describe, expect, it } from 'vitest';
import data from '../data/achievements.json';
import { applyImport } from '../lib/importActions';
import { getState, setState, defaultState } from '../lib/store';
import { hoyowikiUrl, mergeDone, parseUiaf, progressOf, setStepsDone, stepsDone, toUiaf, type Achievement, type AchievementData } from './achievements';
import { parseImport, partsOf } from './formats';

const DATA = data as AchievementData;
const all = DATA.categories.flatMap((c) => c.items);
const tiered = all.find((a) => a.steps.length === 3)!;

/** A paimon.moe "Export data" file with a main and a second account. */
const backup = {
  'update-time': '2026-09-30T18:12:00.000Z',
  accounts: 'account2',
  server: 'Europe',
  ar: 58,
  wl: '8',
  'wish-uid': '700000001',
  'wish-counter-standard': {
    total: 2,
    pulls: [
      { type: 'character', id: 'bennett', time: '2024-02-01 10:00:00', pity: 1 },
      { type: 'weapon', id: 'cool_steel', time: '2024-03-05 10:00:00', pity: 2 },
    ],
  },
  achievement: { '0': { '80091': true, '80127': true, '80128': false }, '1': { '80001': true } },
  'achievement-checklist': {},
  characters: { kamisato_ayaka: { default: 0, wish: 2, manual: 1 }, amber: { default: 1, wish: 0, manual: 0 }, nobody_known: { default: 0, wish: 0, manual: 0 } },
  'account2-achievement': { '0': { '80092': true } },
  'account2-server': 'Asia',
};

describe('achievement data', () => {
  it('has categories with in-game ids, German text and rewards', () => {
    expect(DATA.categories.length).toBeGreaterThan(60);
    expect(all.length).toBeGreaterThan(1500);
    const first = DATA.categories.find((c) => c.id === 0)!;
    expect(first.nameDe).toBe('Wunder der Welt');
    expect(all.find((a) => a.id === 80091)?.steps[0].reward).toBeGreaterThan(0);
    // No raw game markup left in any text.
    const text = JSON.stringify(DATA);
    expect(text).not.toMatch(/\{[FM]#|\{param0\}|<color/);
  });

  it('links quest achievements to HoYoWiki quest pages', () => {
    const linked = all.filter((a) => a.wiki);
    expect(linked.length).toBeGreaterThan(400);
    expect(linked.every((a) => /^\d+$/.test(a.wiki!) && a.quest)).toBe(true);
    expect(all.find((a) => a.id === 81010)?.wiki).toBe('5246'); // Break the Sword Cemetery Seal
    expect(hoyowikiUrl('5246', 'de')).toBe('https://wiki.hoyolab.com/pc/genshin/entry/5246?lang=de-de');
  });
});

describe('tiered progress', () => {
  it('ticks earlier tiers and unticks later ones', () => {
    let done = setStepsDone({}, tiered, 2, 5);
    expect(stepsDone(tiered, done)).toBe(2);
    expect(done[tiered.steps[0].id]).toBe(5);
    done = setStepsDone(done, tiered, 3, 9);
    expect(done[tiered.steps[0].id]).toBe(5); // keeps the original date
    done = setStepsDone(done, tiered, 1);
    expect(Object.keys(done)).toEqual([String(tiered.steps[0].id)]);
  });

  it('merges without unticking and counts only new completions', () => {
    const { done, added } = mergeDone({ '1': 10, '2': 0 }, { '2': 7, '3': 0 });
    expect(done).toEqual({ '1': 10, '2': 7, '3': 0 });
    expect(added).toBe(1);
  });

  it('sums progress and primogems', () => {
    const a: Achievement = { id: 1, order: 1, ver: '1.0', title: 'x', titleDe: 'x', steps: [{ id: 1, desc: '', descDe: '', reward: 5 }, { id: 2, desc: '', descDe: '', reward: 10 }] };
    expect(progressOf([a], { '2': 0 })).toEqual({ steps: 2, done: 1, primos: 15, primosDone: 10 });
  });
});

describe('paimon.moe backup', () => {
  it('reads every account with achievements, characters, profile and the save date', () => {
    const r = parseImport(JSON.stringify(backup));
    expect(r.kind).toBe('paimon');
    expect(r.accounts?.map((a) => a.key)).toEqual(['main', 'account2']);
    expect(partsOf(r)).toEqual(['wishes', 'achievements', 'roster', 'profile']);
    expect(Object.keys(r.achievements!).sort()).toEqual(['80001', '80091', '80127']);
    expect(r.roster).toEqual([
      { name: 'kamisato ayaka', copies: 3 },
      { name: 'amber', copies: 1 },
    ]);
    expect(r.account).toEqual({ uid: '700000001', level: 58, worldLevel: 8, server: 'Europe' });
    expect(r.server).toBe('europe');
    expect(r.savedAt).toBe('2026-09-30T18:12:00.000Z');
    const second = r.accounts![1].result;
    expect(partsOf(second)).toEqual(['achievements', 'profile']);
    expect(second.server).toBe('asia');
  });

  it('accepts achievement-only backups', () => {
    const r = parseImport(JSON.stringify({ achievement: { '0': { '80091': true } } }));
    expect(partsOf(r)).toEqual(['achievements']);
  });

  it('imports only the selected parts', () => {
    setState(defaultState());
    const r = parseImport(JSON.stringify(backup));
    const summary = applyImport(r, ['achievements', 'roster']);
    const s = getState();
    expect(s.wishes).toHaveLength(0);
    expect(s.account.level).toBeUndefined();
    expect(Object.keys(s.achievements.done)).toHaveLength(3);
    expect(summary.achievements).toEqual({ added: 3, total: 3 });
    expect(s.characters['kamisato-ayaka'].constellation).toBe(2);
    expect(summary.roster).toBe(2);
    // Importing again adds nothing new.
    expect(applyImport(r, ['achievements']).achievements).toEqual({ added: 0, total: 3 });
  });
});

describe('UIAF', () => {
  it('round-trips finished achievements with their dates', () => {
    const done = setStepsDone({}, tiered, 2, 1_700_000_000_000);
    const file = toUiaf(DATA, done);
    expect(file.info.uiaf_version).toBe('v1.1');
    expect(file.list).toHaveLength(2);
    const r = parseImport(JSON.stringify(file));
    expect(r.kind).toBe('uiaf');
    expect(r.achievements).toEqual(done);
  });

  it('skips unfinished entries', () => {
    const done = parseUiaf({
      info: { export_app: 'x', uiaf_version: 'v1.1' },
      list: [
        { id: 1, status: 1, timestamp: 0 },
        { id: 2, status: 2, timestamp: 100 },
        { id: 3, status: 3, timestamp: 200 },
      ],
    });
    expect(done).toEqual({ '2': 100_000, '3': 200_000 });
  });
});
