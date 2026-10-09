/** Browser side of "paste your wish link": calls the wish API through a CORS proxy. */
import { fetchWishHistory, GachaApiError, parseWishUrl, validateWishUrl, type FetchProgress, type Fetcher } from '../core/gachaApi';
import { getState } from './store';
import type { WishRecord } from './types';

/** HoYoverse sends no CORS headers, so requests go through a proxy (see tools/proxy). */
export function proxyWrap(proxyUrl: string): (u: string) => string {
  const base = proxyUrl.trim() || './__hoyo';
  return (u) => `${base}${base.includes('?') ? '&' : '?'}url=${encodeURIComponent(u)}`;
}

const browserFetch: Fetcher = async (url) => {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new GachaApiError('network', 'network');
  }
  // A static host without the proxy answers 404 or serves the app's HTML.
  if (res.status === 404 || (res.headers.get('content-type') ?? '').includes('text/html')) {
    throw new GachaApiError('no-proxy', 'no-proxy');
  }
  return res;
};

export async function importFromLink(
  link: string,
  onProgress: (p: FetchProgress) => void,
  signal?: AbortSignal,
): Promise<{ records: WishRecord[]; uid?: string }> {
  const info = parseWishUrl(link);
  const opts = {
    fetch: browserFetch,
    wrapUrl: proxyWrap(getState().settings.proxyUrl),
    knownIds: new Set(getState().wishes.map((r) => r.id)),
    onProgress,
    signal,
  };
  await validateWishUrl(info, opts);
  return fetchWishHistory(info, opts);
}
