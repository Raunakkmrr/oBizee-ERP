"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A remembered UI choice, backed by `localStorage`.
 *
 * §6.12.4 wants the Money toggle to remember the last-used side per user,
 * "because the accountant lives on one side and the owner on the other". That
 * makes the stored preference an **external store**, not component state — so
 * this uses `useSyncExternalStore` rather than an effect that calls `setState`
 * on mount. The effect version renders once with the wrong tab and then
 * corrects itself, which is a visible flicker on every load, and React flags it.
 *
 * `getServerSnapshot` returns the fallback, so the server and the first client
 * render agree; the stored value is picked up in the same commit.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab changing the preference should move this one too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePersistedChoice<T extends string>(
  key: string,
  options: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const getSnapshot = useCallback((): T => {
    const stored = window.localStorage.getItem(key);
    // The stored string is untrusted — a value no longer offered falls back
    // rather than putting the UI into a state it cannot render.
    return options.includes(stored as T) ? (stored as T) : fallback;
  }, [key, options, fallback]);

  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback(
    (next: T) => {
      window.localStorage.setItem(key, next);
      for (const listener of listeners) listener();
    },
    [key],
  );

  return [value, set];
}
