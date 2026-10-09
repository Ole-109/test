import { mergeSynced } from './actions';
import { fetchByIds, mediaFields } from './anilist';
import { getState } from './store';
import { HOUR } from './time';

let inflight: Promise<boolean> | null = null;

/**
 * Refresh airing data for active AniList entries. Without `force`, only entries
 * not synced in the last 6 hours (or whose next airing has passed) are fetched.
 */
export function syncAiring(force = false): Promise<boolean> {
  if (inflight) return inflight;
  const now = Date.now();
  const stale = getState().anime.filter(
    (a) =>
      a.anilistId != null &&
      (a.status === 'watching' || a.status === 'planning') &&
      a.airStatus !== 'FINISHED' &&
      (force || !a.syncedAt || now - a.syncedAt > 6 * HOUR || (a.nextAiring && a.nextAiring.at < now)),
  );
  if (!stale.length) return Promise.resolve(true);
  inflight = fetchByIds(stale.map((a) => a.anilistId!))
    .then((media) => {
      // mediaFields sets nextAiring to undefined once a show stops airing, clearing stale data.
      mergeSynced(new Map(media.map((m) => [m.id, mediaFields(m)])));
      return true;
    })
    .catch(() => false)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
