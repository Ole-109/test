import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const ALLOWED = new Set(['public-operation-hk4e-sg.hoyoverse.com', 'public-operation-hk4e.mihoyo.com']);

/**
 * Same contract as tools/proxy/worker.js: `/__hoyo?url=<wish API URL>`.
 * Lets "paste your wish link" work out of the box with `npm run dev` / `npm run preview`.
 */
function hoyoProxy(): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/__hoyo')) return next();
    try {
      const target = new URL(new URL(req.url, 'http://localhost').searchParams.get('url') ?? '');
      if (target.protocol !== 'https:' || !ALLOWED.has(target.hostname) || target.pathname !== '/gacha_info/api/getGachaLog') {
        res.statusCode = 403;
        return res.end('Only the wish history API can be proxied');
      }
      const upstream = await fetch(target);
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (e) {
      res.statusCode = 502;
      res.end(JSON.stringify({ retcode: -1, message: `Proxy error: ${(e as Error).message}`, data: null }));
    }
  };
  return {
    name: 'waypoint-hoyo-proxy',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

// Relative base so the build works from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react(), hoyoProxy()],
  build: {
    // The achievement list (~570 KB, 150 KB gzipped) is its own lazily loaded chunk.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // Game data and React change on different schedules than app code; split them for caching.
        manualChunks(id) {
          if (id.includes('/src/data/game.json')) return 'game-data';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
        },
      },
    },
  },
});
