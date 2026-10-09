/**
 * Minimal CORS proxy for importing wish history from a link in the browser.
 * HoYoverse's wish API sends no CORS headers, so a static site can't call it
 * directly. Deploy this as a Cloudflare Worker (free tier is plenty), then put
 * its URL into Waypoint → Settings → Wish import proxy.
 *
 * Only the wish history endpoint is forwarded; anything else is rejected.
 * Usage: GET https://<worker>/?url=<encoded getGachaLog URL>
 */
const ALLOWED = new Set(['public-operation-hk4e-sg.hoyoverse.com', 'public-operation-hk4e.mihoyo.com']);
const PATH = '/gacha_info/api/getGachaLog';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });
    let target;
    try {
      target = new URL(new URL(request.url).searchParams.get('url') ?? '');
    } catch {
      return new Response('Missing or invalid ?url=', { status: 400, headers: cors });
    }
    if (target.protocol !== 'https:' || !ALLOWED.has(target.hostname) || target.pathname !== PATH) {
      return new Response('Only the wish history API can be proxied', { status: 403, headers: cors });
    }
    const upstream = await fetch(target.toString(), { headers: { Accept: 'application/json' } });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
};
