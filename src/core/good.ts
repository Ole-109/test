/**
 * GOOD – the "Genshin Open Object Description" format used by Inventory Kamera,
 * Genshin Optimizer and other scanners. https://frzyc.github.io/genshin-optimizer/#/doc
 */
import type { ArtifactSlot } from '../lib/types';

export interface GoodCharacter {
  key: string;
  level: number;
  constellation: number;
  ascension: number;
  talent: { auto: number; skill: number; burst: number };
}

export interface GoodWeapon {
  key: string;
  level: number;
  ascension: number;
  refinement: number;
  location: string;
  lock: boolean;
}

export interface GoodArtifact {
  setKey: string;
  slotKey: ArtifactSlot;
  level: number;
  rarity: number;
  mainStatKey: string;
  location: string;
  lock: boolean;
  substats: { key: string; value: number }[];
}

export interface GoodData {
  format: 'GOOD';
  version: number;
  source: string;
  characters?: GoodCharacter[];
  weapons?: GoodWeapon[];
  artifacts?: GoodArtifact[];
  materials?: Record<string, number>;
}

/** "Raiden Shogun" / "Freedom-Sworn" → "RaidenShogun" / "FreedomSworn" (GOOD keys). */
export function toGoodKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/'/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
}

/** "GladiatorsFinale" → "Gladiators Finale" for display. */
export function fromGoodKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
}

/** FightProp ids (numeric, as used by HoYoLAB) and names (as used by Enka) → GOOD stat keys. */
const PROP_BY_ID: Record<number, string> = {
  2: 'hp',
  3: 'hp_',
  5: 'atk',
  6: 'atk_',
  8: 'def',
  9: 'def_',
  20: 'critRate_',
  22: 'critDMG_',
  23: 'enerRech_',
  26: 'heal_',
  28: 'eleMas',
  30: 'physical_dmg_',
  40: 'pyro_dmg_',
  41: 'electro_dmg_',
  42: 'hydro_dmg_',
  43: 'dendro_dmg_',
  44: 'anemo_dmg_',
  45: 'geo_dmg_',
  46: 'cryo_dmg_',
};

const PROP_BY_NAME: Record<string, string> = {
  FIGHT_PROP_HP: 'hp',
  FIGHT_PROP_HP_PERCENT: 'hp_',
  FIGHT_PROP_ATTACK: 'atk',
  FIGHT_PROP_ATTACK_PERCENT: 'atk_',
  FIGHT_PROP_DEFENSE: 'def',
  FIGHT_PROP_DEFENSE_PERCENT: 'def_',
  FIGHT_PROP_CRITICAL: 'critRate_',
  FIGHT_PROP_CRITICAL_HURT: 'critDMG_',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'enerRech_',
  FIGHT_PROP_HEAL_ADD: 'heal_',
  FIGHT_PROP_ELEMENT_MASTERY: 'eleMas',
  FIGHT_PROP_PHYSICAL_ADD_HURT: 'physical_dmg_',
  FIGHT_PROP_FIRE_ADD_HURT: 'pyro_dmg_',
  FIGHT_PROP_ELEC_ADD_HURT: 'electro_dmg_',
  FIGHT_PROP_WATER_ADD_HURT: 'hydro_dmg_',
  FIGHT_PROP_GRASS_ADD_HURT: 'dendro_dmg_',
  FIGHT_PROP_WIND_ADD_HURT: 'anemo_dmg_',
  FIGHT_PROP_ROCK_ADD_HURT: 'geo_dmg_',
  FIGHT_PROP_ICE_ADD_HURT: 'cryo_dmg_',
};

export const statKeyFromProp = (p: number | string) =>
  (typeof p === 'number' ? PROP_BY_ID[p] : PROP_BY_NAME[p]) ?? String(p);

/** Short English labels for GOOD stat keys. */
export const STAT_LABEL: Record<string, string> = {
  hp: 'HP',
  hp_: 'HP%',
  atk: 'ATK',
  atk_: 'ATK%',
  def: 'DEF',
  def_: 'DEF%',
  eleMas: 'EM',
  enerRech_: 'ER%',
  heal_: 'Heal%',
  critRate_: 'CR%',
  critDMG_: 'CD%',
  physical_dmg_: 'Phys%',
  anemo_dmg_: 'Anemo%',
  geo_dmg_: 'Geo%',
  electro_dmg_: 'Electro%',
  hydro_dmg_: 'Hydro%',
  pyro_dmg_: 'Pyro%',
  cryo_dmg_: 'Cryo%',
  dendro_dmg_: 'Dendro%',
};

export const isPercentStat = (k: string) => k.endsWith('_');

/** Crit value: 2 × CR + CD from substats – the usual quick artifact quality metric. */
export function critValue(a: Pick<GoodArtifact, 'substats'>): number {
  let cv = 0;
  for (const s of a.substats) {
    if (s.key === 'critRate_') cv += 2 * s.value;
    if (s.key === 'critDMG_') cv += s.value;
  }
  return Math.round(cv * 10) / 10;
}

/** "4pc Emblem of Severed Fate" / "2pc A + 2pc B" for a character's equipped artifacts. */
export function setSummary(artifacts: Pick<GoodArtifact, 'setKey'>[]): string {
  const counts = new Map<string, number>();
  for (const a of artifacts) counts.set(a.setKey, (counts.get(a.setKey) ?? 0) + 1);
  const parts = [...counts]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n >= 4 ? 4 : 2}pc ${fromGoodKey(k)}`);
  return parts.join(' + ');
}

/** Ascension phase for a level (assumes the character/weapon is ascended at the cap). */
export function ascensionForLevel(level: number): number {
  const caps = [20, 40, 50, 60, 70, 80];
  return caps.filter((c) => level > c).length;
}
