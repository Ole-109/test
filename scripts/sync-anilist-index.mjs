#!/usr/bin/env node
/**
 * Builds src/data/anilist-catalog.json: where each letter starts in every
 * popularity range of the unfiltered AniList catalog (sorted by romaji title).
 * The A–Z jump uses it as a starting point, so a jump needs one or two requests
 * instead of a binary search over deep (slow) pages. Positions drift a little
 * as AniList grows; the app corrects small drifts on its own.
 *
 * Built twice: without and with titles AniList marks as adult (18+), which
 * Waypoint only shows when the user opts in.
 *
 * Takes a few minutes: it pages through all ~22k entries twice within the rate limit.
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
      console.log(`\nrate limited, waiting ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
  }
}

const args = ([lo, hi], adult) =>
  [
    'type: ANIME',
    adult ? '' : 'isAdult: false',
    'sort: [TITLE_ROMAJI, ID]',
    lo > 0 ? `popularity_greater: ${lo - 1}` : '',
    hi != null ? `popularity_lesser: ${hi}` : '',
  ]
    .filter(Boolean)
    .join(', ');

/** Titles of every range in AniList's order. */
async function scan(adult) {
  const titles = ranges.map(() => []);
  const done = ranges.map(() => false);
  for (let page = 1; done.some((d) => !d); page++) {
    const open = ranges.map((_, i) => i).filter((i) => !done[i]);
    const data = await gql(
      `query { ${open
        .map((i) => `r${i}: Page(page: ${page}, perPage: ${PER_PAGE}) { pageInfo { hasNextPage } media(${args(ranges[i], adult)}) { title { romaji } } }`)
        .join(' ')} }`,
    );
    for (const i of open) {
      const p = data[`r${i}`];
      titles[i].push(...p.media.map((m) => m.title.romaji));
      if (!p.pageInfo.hasNextPage || p.media.length === 0) done[i] = true;
      if (page >= 100 && p.pageInfo.hasNextPage) throw new Error(`range ${ranges[i]} is over 5,000 entries – split it`);
    }
    process.stdout.write(`\r${adult ? 'with 18+' : 'without 18+'}: page ${page}, ${titles.reduce((n, t) => n + t.length, 0)} titles`);
  }
  console.log();
  return titles.map((list) => ({
    total: list.length,
    // Entries before the letter (A–Z) and entries up to the end of the letter (for Z–A).
    before: Object.fromEntries(LETTERS.map((l) => [l, list.filter((t) => collator.compare(t, l) < 0).length])),
    upto: Object.fromEntries(LETTERS.map((l) => [l, list.filter((t) => collator.compare(t, l + '\uffff') <= 0).length])),
  }));
}

const streams = await scan(false);
const adultStreams = await scan(true);
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), ranges, streams, adultStreams }) + '\n', 'utf8');
const total = (list) => list.reduce((n, s) => n + s.total, 0);
console.log(`Wrote ${streams.length} ranges (${total(streams)} titles, ${total(adultStreams)} with 18+) to ${OUT}`);
