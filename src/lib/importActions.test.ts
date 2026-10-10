import { describe, expect, it } from 'vitest';
import { defaultState } from './store';
import { syncCharactersFromWishes } from './importActions';
import type { AppState, WishRecord } from './types';

let id = 1000;
const pull = (name: string, rank: 4 | 5 = 5, gachaType: WishRecord['gachaType'] = '301'): WishRecord => ({
  id: String(id++),
  gachaType,
  name,
  itemType: 'character',
  rank,
  time: `2025-01-01 10:00:${String(id % 60).padStart(2, '0')}`,
});

describe('roster sync from wish history', () => {
  it('adds pulled characters with constellations from duplicate copies', () => {
    const s: AppState = {
      ...defaultState(),
      wishes: [
        pull('Furina'),
        pull('Furina', 5, '400'),
        pull('Furina'),
        pull('Bennett', 4),
        pull('Amber', 4, '200'),
        ...Array.from({ length: 9 }, () => pull('Xingqiu', 4, '200')),
        { ...pull('Cool Steel', 4), itemType: 'weapon' },
      ],
    };
    const { state, added } = syncCharactersFromWishes(s);
    expect(state.characters.furina).toMatchObject({ constellation: 2, wishCopies: 3, detailsKnown: false });
    expect(state.characters.bennett.constellation).toBe(0);
    expect(state.characters.xingqiu.constellation).toBe(6); // capped
    expect(state.characters.traveler).toBeDefined();
    expect(state.characters.amber).toMatchObject({ constellation: 1, wishCopies: 1 }); // free story copy + 1 pull
    expect(state.characters.kaeya.constellation).toBe(0);
    expect(added).toBe(7);
    expect(state.wishMeta.charSync).toBe(s.wishes.length);
  });

  it('never lowers constellations or overwrites known details', () => {
    const base = defaultState();
    const s: AppState = {
      ...base,
      characters: {
        furina: { ...syncCharactersFromWishes({ ...base, wishes: [pull('Furina')] }).state.characters.furina, level: 90, constellation: 4, detailsKnown: true },
      },
      wishes: [pull('Furina'), pull('Furina')],
    };
    const { state, raised } = syncCharactersFromWishes(s);
    expect(state.characters.furina).toMatchObject({ level: 90, constellation: 4, detailsKnown: true, wishCopies: 2 });
    expect(raised).toBe(0);
  });
});
