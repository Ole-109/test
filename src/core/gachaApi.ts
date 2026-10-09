/**
 * Client for the in-game wish history API (the same one the game's "History"
 * page uses). Shared by the web app and the CLI exporter, so it takes an
 * injected `fetch` and has no DOM or Node dependencies.
 */
import type { GachaType, WishRecord } from '../lib/types';

export const GACHA_HOSTS = {
  global: 'https://public-operation-hk4e-sg.hoyoverse.com',
  china: 'https://public-operation-hk4e.mihoyo.com',
} as const;
export const GACHA_PATH = '/gacha_info/api/getGachaLog';

/** gacha_type values to query. 301 also returns 400 (second character banner). */
export const QUERY_TYPES: GachaType[] = ['301', '302', '500', '200', '100'];

export interface WishUrlInfo {
  region: 'global' | 'china';
  params: URLSearchParams;
}

export class GachaApiError extends Error {
  constructor(
    message: string,
    public code: 'invalid-url' | 'authkey-expired' | 'authkey-invalid' | 'rate-limit' | 'http' | 'network' | 'api' | 'no-proxy',
    public retcode?: number,
  ) {
    super(message);
  }
}

/** Extracts the authkey and related parameters from a wish history link. */
export function parseWishUrl(input: string): WishUrlInfo {
  const text = input.trim();
  const match = text.match(/https?:\/\/\S+/);
  if (!match) throw new GachaApiError('No link found in the pasted text.', 'invalid-url');
  let url: URL;
  try {
    // Some links carry the query after a hash fragment (#/log); normalise that.
    url = new URL(match[0].replace('#/log', '').replace(/#\/?$/, ''));
  } catch {
    throw new GachaApiError('That does not look like a valid link.', 'invalid-url');
  }
  const params = new URLSearchParams(url.search || url.hash.split('?')[1] || '');
  if (!params.get('authkey')) {
    throw new GachaApiError('The link has no authkey. Open the wish history in game, then get the link again.', 'invalid-url');
  }
  const host = url.hostname;
  const region =
    host.endsWith('mihoyo.com') || (params.get('region') ?? '').startsWith('cn_') ? 'china' : 'global';
  return { region, params };
}

/** Builds the API URL for one page. */
export function pageUrl(info: WishUrlInfo, gachaType: GachaType, endId: string, size = 20): string {
  const p = new URLSearchParams(info.params);
  p.set('gacha_type', gachaType);
  p.set('page', '1');
  p.set('size', String(size));
  p.set('end_id', endId);
  p.set('lang', 'en-us');
  p.delete('timestamp');
  return `${GACHA_HOSTS[info.region]}${GACHA_PATH}?${p.toString()}`;
}

interface RawItem {
  id: string;
  uid?: string;
  gacha_type: string;
  item_id?: string;
  name: string;
  item_type: string;
  rank_type: string;
  time: string;
}

interface ApiResponse {
  retcode: number;
  message: string;
  data: { list: RawItem[]; region?: string } | null;
}

export function toRecord(r: RawItem): WishRecord {
  return {
    id: String(r.id),
    gachaType: String(r.gacha_type) as GachaType,
    name: r.name,
    itemType: /weapon|waffe|武器/i.test(r.item_type) ? 'weapon' : 'character',
    rank: Number(r.rank_type) as 3 | 4 | 5,
    time: r.time,
    itemId: r.item_id || undefined,
  };
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface FetchProgress {
  gachaType: GachaType;
  page: number;
  fetched: number;
}

export interface FetchOptions {
  fetch: Fetcher;
  /** Rewrites the target URL, e.g. to go through a CORS proxy. */
  wrapUrl?: (url: string) => string;
  /** Stop paging a banner once one of these ids is reached (incremental import). */
  knownIds?: Set<string>;
  delayMs?: number;
  onProgress?: (p: FetchProgress) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function getPage(info: WishUrlInfo, type: GachaType, endId: string, o: FetchOptions): Promise<ApiResponse> {
  const target = pageUrl(info, type, endId);
  const url = o.wrapUrl ? o.wrapUrl(target) : target;
  const sleep = o.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    let res;
    try {
      res = await o.fetch(url);
    } catch {
      throw new GachaApiError('Could not reach the wish history server.', 'network');
    }
    if (!res.ok) throw new GachaApiError(`Wish history server answered HTTP ${res.status}.`, 'http');
    const body = (await res.json()) as ApiResponse;
    // -110: "visit too frequently" – back off and retry a few times.
    if (body.retcode === -110 && attempt < 5) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    return body;
  }
}

function check(body: ApiResponse) {
  if (body.retcode === 0 && body.data) return;
  if (body.retcode === -101) throw new GachaApiError('The link has expired (they last about a day). Open the wish history in game and get a new link.', 'authkey-expired', -101);
  if (body.retcode === -100) throw new GachaApiError('The link is not valid. Get a fresh link from the game.', 'authkey-invalid', -100);
  if (body.retcode === -110) throw new GachaApiError('The wish history server is rate-limiting requests. Try again in a minute.', 'rate-limit', -110);
  throw new GachaApiError(`Wish history server error: ${body.message} (${body.retcode})`, 'api', body.retcode);
}

/** Quick validity check of a link (one tiny request). Returns the account uid if known. */
export async function validateWishUrl(info: WishUrlInfo, o: FetchOptions): Promise<string | undefined> {
  const target = pageUrl(info, '301', '0', 1);
  const res = await o.fetch(o.wrapUrl ? o.wrapUrl(target) : target);
  if (!res.ok) throw new GachaApiError(`Wish history server answered HTTP ${res.status}.`, 'http');
  const body = (await res.json()) as ApiResponse;
  check(body);
  return body.data?.list?.[0]?.uid;
}

/**
 * Downloads the full wish history (newest first per banner, as the API returns it).
 * Returns records and the account uid.
 */
export async function fetchWishHistory(info: WishUrlInfo, o: FetchOptions): Promise<{ records: WishRecord[]; uid?: string }> {
  const sleep = o.sleep ?? defaultSleep;
  const delay = o.delayMs ?? 350;
  const records: WishRecord[] = [];
  let uid: string | undefined;
  for (const type of QUERY_TYPES) {
    let endId = '0';
    let page = 1;
    let fetched = 0;
    for (;;) {
      const body = await getPage(info, type, endId, o);
      check(body);
      const list = body.data!.list ?? [];
      let reachedKnown = false;
      for (const item of list) {
        if (o.knownIds?.has(String(item.id))) {
          reachedKnown = true;
          break;
        }
        uid ??= item.uid;
        records.push(toRecord(item));
        fetched++;
      }
      o.onProgress?.({ gachaType: type, page, fetched });
      if (reachedKnown || list.length < 20) break;
      endId = list[list.length - 1].id;
      page++;
      await sleep(delay);
    }
    await sleep(delay);
  }
  return { records, uid };
}

/** Finds wish history links in arbitrary text or binary cache content (latest last). */
export function findWishUrls(text: string): string[] {
  const out: string[] = [];
  const re = /https:\/\/[^\s"'<>\0]+?(?:getGachaLog|e20190909gacha|gacha-v\d|webview_gacha)[^\s"'<>\0]*/g;
  for (const m of text.matchAll(re)) {
    const url = m[0].replace(/[\x00-\x1f]+.*$/s, '');
    if (url.includes('authkey=')) out.push(url);
  }
  return out;
}
