#!/usr/bin/env node
// Regenerates src/data/game.json from the public Project Amber (gi.yatta.moe) API.
// Run with `npm run sync-data` whenever a new game version adds characters or weapons.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://gi.yatta.moe/api/v2';
const OUT = fileURLToPath(new URL('../src/data/game.json', import.meta.url));

const ELEMENT = { Fire: 'pyro', Water: 'hydro', Wind: 'anemo', Electric: 'electro', Grass: 'dendro', Ice: 'cryo', Rock: 'geo' };
const WEAPON = {
  WEAPON_SWORD_ONE_HAND: 'sword',
  WEAPON_CLAYMORE: 'claymore',
  WEAPON_POLE: 'polearm',
  WEAPON_BOW: 'bow',
  WEAPON_CATALYST: 'catalyst',
};
const REGION = {
  MONDSTADT: 'mondstadt',
  LIYUE: 'liyue',
  INAZUMA: 'inazuma',
  SUMERU: 'sumeru',
  FONTAINE: 'fontaine',
  NATLAN: 'natlan',
  NODKRAI: 'nodkrai',
  NODKRAI_ZIBAI: 'nodkrai',
  SNEZHNAYA: 'snezhnaya',
  SNEZHNAYA_STAR: 'snezhnaya',
  FATUI: 'snezhnaya',
};

export const slug = (name) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

async function get(path) {
  const res = await fetch(`${API}/${path}`, { headers: { 'User-Agent': 'waypoint-data-sync' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()).data.items;
}

const [avEn, avDe, wpEn, wpDe, relEn, relDe] = await Promise.all(
  ['en/avatar', 'de/avatar', 'en/weapon', 'de/weapon', 'en/reliquary', 'de/reliquary'].map(get),
);

const characters = [
  // The Traveler is listed once per element and gender; keep a single adaptive entry.
  {
    id: 'traveler',
    avatarId: 10000005,
    name: 'Traveler',
    nameDe: 'Reisende(r)',
    element: 'adaptive',
    weapon: 'sword',
    rarity: 5,
    region: 'other',
    release: 1601424000,
    icon: 'UI_AvatarIcon_PlayerBoy',
  },
];
for (const [key, a] of Object.entries(avEn)) {
  // Skip Traveler variants (non-numeric keys) and other main-actor entries (e.g. Miliastra mannequins).
  if (!/^\d+$/.test(key) || a.region === 'MAINACTOR') continue;
  characters.push({
    id: slug(a.name),
    avatarId: Number(key),
    name: a.name,
    nameDe: avDe[key]?.name ?? a.name,
    element: ELEMENT[a.element] ?? 'adaptive',
    weapon: WEAPON[a.weaponType],
    rarity: a.rank === 105 ? 5 : a.rank, // Aloy uses a special "105" quality
    region: REGION[a.region] ?? 'other',
    release: a.release ?? 0,
    icon: a.icon,
  });
}

const weapons = [];
for (const [key, w] of Object.entries(wpEn)) {
  if (w.isWeaponSkin) continue;
  weapons.push({
    id: Number(key),
    key: slug(w.name),
    name: w.name,
    nameDe: wpDe[key]?.name ?? w.name,
    rarity: w.rank,
    type: WEAPON[w.type],
    icon: w.icon,
  });
}

const artifactSets = Object.entries(relEn).map(([key, r]) => ({
  id: Number(key),
  name: r.name,
  nameDe: relDe[key]?.name ?? r.name,
  maxRarity: Math.max(...(r.levelList ?? [5])),
  icon: r.icon,
}));

characters.sort((a, b) => a.name.localeCompare(b.name));
artifactSets.sort((a, b) => b.id - a.id);
weapons.sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), characters, weapons, artifactSets }, null, 0) + '\n', 'utf8');
console.log(`Wrote ${characters.length} characters, ${weapons.length} weapons, ${artifactSets.length} artifact sets to ${OUT}`);
