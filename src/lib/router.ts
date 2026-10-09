import { useSyncExternalStore } from 'react';

export type Route =
  | '/'
  | '/teyvat'
  | '/teyvat/characters'
  | '/teyvat/wishes'
  | '/anime'
  | '/anime/schedule'
  | '/anime/stats'
  | '/discover'
  | '/settings';

const ROUTES: Route[] = [
  '/',
  '/teyvat',
  '/teyvat/characters',
  '/teyvat/wishes',
  '/anime',
  '/anime/schedule',
  '/anime/stats',
  '/discover',
  '/settings',
];

function read(): Route {
  const path = window.location.hash.replace(/^#/, '') || '/';
  return (ROUTES as string[]).includes(path) ? (path as Route) : '/';
}

function subscribe(fn: () => void) {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, read, () => '/' as Route);
}

export function navigate(to: Route) {
  if (read() !== to) window.location.hash = to;
}

export const href = (to: Route) => `#${to}`;
