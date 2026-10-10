#!/usr/bin/env node
/**
 * Fetches all achievements (English + German) from gi.yatta.moe and writes
 * src/data/achievements.json. Category ids match paimon.moe's, achievement ids
 * are the in-game ids (also used by UIAF), so imports line up exactly.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://gi.yatta.moe/api/v2';
const OUT = fileURLToPath(new URL('../src/data/achievements.json', import.meta.url));

async function get(path) {
  const res = await fetch(`${API}/${path}`, { headers: { 'User-Agent': 'waypoint-data-sync' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()).data;
}

/** Strips the game's rich-text markup and platform placeholders. */
const clean = (s, progress) =>
  String(s ?? '')
    // German gendered text: "{F#Repräsentantin}{M#Repräsentant}" → "Repräsentant/Repräsentantin".
    .replace(/\{F#([^}]*)\}\{M#([^}]*)\}/g, (_, f, m) => (f && m ? `${m}/${f}` : `${m}${f ? `(${f})` : ''}`))
    .replace(/\{M#([^}]*)\}\{F#([^}]*)\}/g, (_, m, f) => (f && m ? `${m}/${f}` : `${m}${f ? `(${f})` : ''}`))
    .replace(/\{F#([^}]*)\}/g, '($1)')
    .replace(/\{M#([^}]*)\}/g, '$1')
    .replace(/\{NON_BREAK_SPACE\}/g, '\u00a0')
    .replace(/\{param0\}/g, String(progress ?? ''))
    .replace(/<\/?color[^>]*>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\{LAYOUT_PC#([^}]*)\}\{LAYOUT_PS#[^}]*\}\{LAYOUT_MOBILE#[^}]*\}/g, '$1')
    .replace(/\{NICKNAME\}/g, 'Traveler')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const [en, de] = await Promise.all([get('en/achievement'), get('de/achievement')]);

let groups = 0;
let steps = 0;
const categories = Object.values(en)
  .map((c) => {
    const cDe = de[c.id] ?? {};
    const items = Object.values(c.achievementList)
      .map((a) => {
        const aDe = cDe.achievementList?.[a.id] ?? {};
        const quest = a.tasks?.find((t) => t.questList?.length)?.questList[0];
        const questDe = aDe.tasks?.find((t) => t.questList?.length)?.questList[0];
        const title = clean(a.details[0].title);
        const titleDe = clean(aDe.details?.[0]?.title) || title;
        groups++;
        return {
          id: a.id,
          order: a.order,
          ver: a.version,
          title,
          titleDe,
          ...(quest ? { quest: clean(quest.questTitle), questDe: clean(questDe?.questTitle) || clean(quest.questTitle) } : {}),
          steps: a.details.map((d, i) => {
            steps++;
            const dDe = aDe.details?.[i] ?? {};
            const st = clean(d.title);
            return {
              id: d.id,
              desc: clean(d.description, d.progress),
              descDe: clean(dDe.description, d.progress) || clean(d.description, d.progress),
              reward: Object.values(d.rewards ?? {}).reduce((n, r) => n + (r.count ?? 0), 0),
              ...(d.progress > 1 ? { progress: d.progress } : {}),
              // Only when a step is named differently from the first one.
              ...(st !== title ? { title: st, titleDe: clean(dDe.title) || st } : {}),
            };
          }),
        };
      })
      .sort((a, b) => a.order - b.order);
    return { id: c.id, order: c.order, name: clean(c.name), nameDe: clean(cDe.name) || clean(c.name), icon: c.icon, items };
  })
  .sort((a, b) => a.order - b.order);

writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), categories }) + '\n', 'utf8');
console.log(`Wrote ${categories.length} categories, ${groups} achievements (${steps} steps) to ${OUT}`);
