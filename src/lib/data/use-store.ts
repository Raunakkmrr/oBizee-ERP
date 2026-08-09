"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { dispatch, getState, getStatus, hydrate, seedState, subscribe, type Action, type HydrationStatus, type StoreState } from "./store";

/**
 * React binding for the local store.
 *
 * **Nothing in the running product imports this file.** The store was retired
 * when the screens moved onto the API; the two session hooks that used to live
 * here — and that every screen did import — are in `use-session.ts`, because an
 * import is of a module rather than of a symbol, and pulling `useCurrentUser`
 * from here pulled the store, the crypto module, the tax engine and every seed
 * fixture into the bundle of every page.
 *
 * Kept for the tests that still exercise the store. Deleting it and `store.ts`
 * is a separate, mechanical change.
 *
 * `useSyncExternalStore` rather than an effect that calls `setState`: the store
 * is genuinely external, and the effect version renders the seed once and then
 * corrects itself, which is a visible flash on every load.
 *
 * `getServerSnapshot` returns a **fresh seed**, so the server and the first
 * client render agree; the decrypted state arrives in a later commit once
 * `hydrate()` resolves. That is why hydration is a state screens can see rather
 * than a gap they render through.
 */
const serverSnapshot = seedState();

/**
 * Module-level, not an inline literal.
 *
 * `getServerSnapshot` must return a **cached** value: an object literal in the
 * callback is a new reference on every call, React sees the snapshot as always
 * changed, and it warns about an infinite render loop. Same reason
 * `serverSnapshot` above is built once.
 */
const SERVER_STATUS: HydrationStatus = { kind: "ready", restored: false };

export function useStoreState(): StoreState {
  useEffect(() => {
    void hydrate();
  }, []);
  return useSyncExternalStore(subscribe, getState, () => serverSnapshot);
}

export function useHydrationStatus(): HydrationStatus {
  return useSyncExternalStore(
    subscribe,
    getStatus,
    // The server never has stored data, so it is never mid-hydration.
    () => SERVER_STATUS,
  );
}

export function useDispatch(): (action: Action) => void {
  return useCallback((action: Action) => dispatch(action), []);
}
