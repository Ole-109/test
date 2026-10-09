import { useSyncExternalStore } from 'react';

/** Transient, app-wide UI state (not persisted). */
interface UIState {
  palette: boolean;
  animeId: string | null;
  characterId: string | null;
}

let ui: UIState = { palette: false, animeId: null, characterId: null };
const listeners = new Set<() => void>();

export function setUI(patch: Partial<UIState>) {
  ui = { ...ui, ...patch };
  listeners.forEach((l) => l());
}

export function useUI<T>(sel: (s: UIState) => T): T {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => sel(ui),
  );
}
