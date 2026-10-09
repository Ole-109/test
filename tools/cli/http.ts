import type { Fetcher } from '../../src/core/gachaApi';

export const USER_AGENT = 'waypoint-export/2.0 (+https://github.com/Ole-109/test)';

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface Http {
  json<T>(url: string, init?: RequestInit): Promise<T>;
  fetcher: Fetcher;
}

/** Small wrapper around Node's fetch with a timeout, a user agent and retries on 5xx. */
export function createHttp(opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Http {
  const f = opts.fetchImpl ?? fetch;
  const timeout = opts.timeoutMs ?? 20_000;

  async function raw(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await f(url, {
          ...init,
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(init.headers as Record<string, string>) },
          signal: ctrl.signal,
        });
        if (res.status >= 500 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return res;
      } catch (e) {
        if (attempt >= 2) throw new HttpError(`Request failed: ${(e as Error).message} (${new URL(url).host})`, 0);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
  }

  return {
    async json<T>(url: string, init?: RequestInit): Promise<T> {
      const res = await raw(url, init);
      if (!res.ok) throw new HttpError(`HTTP ${res.status} from ${new URL(url).host}`, res.status);
      return (await res.json()) as T;
    },
    fetcher: (url) => raw(url),
  };
}
