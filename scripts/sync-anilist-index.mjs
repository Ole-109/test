#!/usr/bin/env node
/**
 * Builds src/data/anilist-catalog.json: where each letter starts in every
 * popularity range of the unfiltered AniList catalog (sorted by romaji title).
 * The A–Z jump uses it as a starting point, so a jump needs one or two requests
 * instead of a binary search over deep (slow) pages. Positions drift a little
 * as AniList grows; the app corrects small drifts on its own.
 *
 * Takes a few minutes: it pages through all ~21k entries within the rate limit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/data/anilist-catalog.json', import.meta.url));
const PER_PAGE = 50;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: false });

const current = JSON.parse(readFileSync(OUT, 'utf8'));
const ranges = current.ranges;

async function gql(query) {
  for (;;) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'waypoint-data-sync' },
      body: JSON.stringify({ query }),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After')) || 30;
      console.log(`rate limited, waiting ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
  }
}

const args = ([lo, hi]) =>
  ['type: ANIME', 'isAdult: false', 'sort: [TITLE_ROMAJI, ID]', lo > 0 ? `popularity_greater: ${lo - 1}` : '', hi != null ? `popularity_lesser: ${hi}` : '']
    .filter(Boolean)
    .join(', ');

const titles = ranges.map(() => []);
const done = ranges.map(() => false);
for (let page = 1; done.some((d) => !d); page++) {
  const open = ranges.map((_, i) => i).filter((i) => !done[i]);
  const data = await gql(
    `query { ${open.map((i) => `r${i}: Page(page: ${page}, perPage: ${PER_PAGE}) { pageInfo { hasNextPage } media(${args(ranges[i])}) { title { romaji } } }`).join(' ')} }`,
  );
  for (const i of open) {
    const p = data[`r${i}`];
    titles[i].push(...p.media.map((m) => m.title.romaji));
    if (!p.pageInfo.hasNextPage || p.media.length === 0) done[i] = true;
    if (page >= 100 && p.pageInfo.hasNextPage) throw new Error(`range ${ranges[i]} is over 5,000 entries – split it`);
  }
  process.stdout.write(`\rpage ${page}, ${titles.reduce((n, t) => n + t.length, 0)} titles`);
}
console.log();

const streams = titles.map((list) => ({
  total: list.length,
  // Entries before the letter (A–Z) and entries up to the end of the letter (for Z–A).
  before: Object.fromEntries(LETTERS.map((l) => [l, list.filter((t) => collator.compare(t, l) < 0).length])),
  upto: Object.fromEntries(LETTERS.map((l) => [l, list.filter((t) => collator.compare(t, l + '￿') <= 0).length])),
}));

writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), ranges, streams }) + '\n', 'utf8');
console.log(`Wrote ${streams.length} ranges, ${titles.reduce((n, t) => n + t.length, 0)} titles to ${OUT}`);
