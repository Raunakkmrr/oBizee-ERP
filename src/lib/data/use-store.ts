"use client";

import {
  callerResolved,
  getCaller,
  subscribeToSession,
  type Caller,
} from "../api/session";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { dispatch, getState, getStatus, hydrate, seedState, subscribe, type Action, type HydrationStatus, type StoreState } from "./store";

/**
 * React binding for the local store.
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

/**
 * The person whose session this is — from the token, never from a menu.
 *
 * This used to read `actingAs` out of the browser store and fall back to the
 * first owner, which meant the answer to "who am I" was a value the browser
 * held and anybody could change. Beside a real sign-in that is not a fallback,
 * it is a way for a technician to see every price in the firm.
 *
 * `null` while the identity is still being fetched, and `null` when nobody is
 * signed in. The shell tells those two apart with `useSessionResolved` and
 * sends the second case to the sign-in screen rather than rendering a page
 * with no user.
 */
export function useCurrentUser(): Caller | null {
  return useSyncExternalStore(subscribeToSession, getCaller, () => null);
}

/** False until `/api/me` has answered — "not yet" is not "nobody". */
export function useSessionResolved(): boolean {
  return useSyncExternalStore(subscribeToSession, callerResolved, () => false);
}
