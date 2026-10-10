import { describe, expect, it } from 'vitest';
import { ascensionForTarget, bookSeriesOf, heroWitTo, isOpenOn, keyMaterials, MATERIALS, requirementFor, resinEstimate } from './farming';

const byKind = (items: Map<string, number>, kind: string, rank?: number) =>
  [...items].filter(([id]) => MATERIALS[id]?.kind === kind && (rank == null || MATERIALS[id].rank === rank)).reduce((s, [, n]) => s + n, 0);

describe('farming costs', () => {
  it('matches the well-known totals for 1 → 90 with 10/10/10', () => {
    const r = requirementFor('furina', { level: 1, talents: [1, 1, 1] }, { id: 'furina', level: 90, talents: [10, 10, 10] });
    // Ascension: 46 boss drops, 168 local specialties, gems 1/9/9/6.
    expect(byKind(r.items, 'boss')).toBe(46);
    expect(byKind(r.items, 'local')).toBe(168);
    expect(byKind(r.items, 'gem', 2)).toBe(1);
    expect(byKind(r.items, 'gem', 5)).toBe(6);
    // Talents ×3: 9 / 63 / 114 books, 18 weekly boss drops, 3 Crowns.
    expect(byKind(r.items, 'book', 2)).toBe(9);
    expect(byKind(r.items, 'book', 3)).toBe(63);
    expect(byKind(r.items, 'book', 4)).toBe(114);
    expect(byKind(r.items, 'weekly')).toBe(18);
    expect(byKind(r.items, 'crown')).toBe(3);
    expect(r.heroWit).toBe(420);
    // 420k ascension + 3 × 1,652,500 talents + EXP levelling.
    expect(r.mora).toBe(420_000 + 3 * 1_652_500 + 420 * 4000);
  });

  it('only counts what is still missing', () => {
    const r = requirementFor('furina', { level: 80, ascension: 6, talents: [9, 9, 9] }, { id: 'furina', level: 90, talents: [9, 9, 10] });
    expect(byKind(r.items, 'boss')).toBe(0);
    expect(byKind(r.items, 'book', 4)).toBe(16);
    expect(byKind(r.items, 'crown')).toBe(1);
    expect(r.heroWit).toBe(213);
  });

  it('maps levels to ascension phases and EXP', () => {
    expect(ascensionForTarget(20)).toBe(0);
    expect(ascensionForTarget(21)).toBe(1);
    expect(ascensionForTarget(80)).toBe(5);
    expect(ascensionForTarget(90)).toBe(6);
    expect(heroWitTo(1)).toBe(0);
    expect(heroWitTo(90)).toBe(420);
  });

  it('knows domain days and key materials', () => {
    const [green] = bookSeriesOf('furina');
    expect(MATERIALS[green].name).toBe('Teachings of Justice');
    expect(isOpenOn(MATERIALS[green], 2)).toBe(true); // Tuesday
    expect(isOpenOn(MATERIALS[green], 3)).toBe(false);
    expect(isOpenOn(MATERIALS[green], 0)).toBe(true); // Sunday: everything
    expect(keyMaterials('furina').map((m) => m.kind)).toEqual(['book', 'boss', 'weekly', 'gem', 'local']);
  });

  it('estimates resin from missing materials', () => {
    const missing = new Map([
      ['104343', 9], // 9 purple = 81 green-equivalents → 8 runs
      ['113057', 13], // 13 boss drops → 5 runs
    ]);
    const e = resinEstimate(missing, 58);
    expect(e.bookRuns).toBe(8);
    expect(e.bossRuns).toBe(5);
    expect(e.leyRuns).toBe(11);
    expect(e.resin).toBe(8 * 20 + 5 * 40 + 11 * 20);
  });
});
