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

// ── Level-up materials (ascension + talent costs, domain days) ─────────────
const [matEn, matDe] = await Promise.all([get('en/material'), get('de/material')]);
const DAY = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const pack = (costItems, coin) => [Object.fromEntries(Object.entries(costItems ?? {}).map(([k, v]) => [k, v])), coin ?? 0];
const usedIds = new Set();
await pool(characters.filter((c) => c.id !== 'traveler'), 6, async (c) => {
  const d = (await (await fetch(`${API}/en/avatar/${c.avatarId}`, { headers: { 'User-Agent': 'waypoint-data-sync' } })).json()).data;
  const asc = (d.upgrade?.promote ?? []).filter((p) => p.promoteLevel > 0).map((p) => pack(p.costItems, p.coinCost));
  // All three talents cost the same; take the normal attack's level 2–10 costs.
  const na = Object.values(d.talent ?? {}).find((t) => t.type === 0 && t.promote);
  const talent = na ? [2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => pack(na.promote[l]?.costItems, na.promote[l]?.coinCost)) : [];
  for (const [items] of [...asc, ...talent]) for (const id of Object.keys(items)) usedIds.add(id);
  c.mats = { asc, talent };
});

const materials = {};
for (const id of usedIds) {
  const m = matEn[id];
  if (!m) continue;
  materials[id] = { name: m.name, nameDe: matDe[id]?.name ?? m.name, rank: m.rank, icon: m.icon, type: m.type };
}
// Domain days for talent books (one request per book series), drop sources for boss materials.
const books = Object.entries(materials).filter(([, m]) => m.type === 'characterTalentMaterial' && m.rank === 2);
const bosses = Object.entries(materials).filter(
  // Normal boss drops (rank 4) and weekly boss drops (rank 5, typed either way), not the Crown.
  ([id, m]) => (m.type === 'characterLevelUpMaterial' && m.rank >= 4) || (m.type === 'characterTalentMaterial' && m.rank === 5 && id !== '104319'),
);
await pool([...books, ...bosses], 6, async ([id, m]) => {
  const d = (await (await fetch(`${API}/en/material/${id}`, { headers: { 'User-Agent': 'waypoint-data-sync' } })).json()).data;
  const domain = (d.source ?? []).find((s) => s.type === 'domain' && s.days);
  if (m.type === 'characterTalentMaterial' && m.rank === 2 && domain) {
    // The whole series (green/blue/purple ids follow each other) shares the domain.
    for (const sid of [Number(id), Number(id) + 1, Number(id) + 2]) {
      if (materials[sid]) {
        materials[sid].days = domain.days.map((x) => DAY[x]);
        materials[sid].domain = domain.name.replace(/^Domain of Mastery: /, '');
      }
    }
  } else {
    const by = d.additions?.droppedBy?.[0]?.name;
    if (by) materials[id].from = by;
  }
});

characters.sort((a, b) => a.name.localeCompare(b.name));
artifactSets.sort((a, b) => b.id - a.id);
weapons.sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), characters, weapons, artifactSets, materials }, null, 0) + '\n', 'utf8');
console.log(`Wrote ${characters.length} characters, ${weapons.length} weapons, ${artifactSets.length} artifact sets, ${Object.keys(materials).length} materials to ${OUT}`);
