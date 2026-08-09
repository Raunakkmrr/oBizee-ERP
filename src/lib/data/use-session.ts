"use client";

import { useSyncExternalStore } from "react";

import { callerResolved, getCaller, subscribeToSession, type Caller } from "../api/session";

/**
 * Who is signed in — read from the session and nothing else.
 *
 * **Why this is its own file.** These two hooks used to live in `use-store.ts`
 * alongside the bindings for the encrypted browser store. Six of the seven
 * files that imported that module wanted only `useCurrentUser`, and the
 * seventh — the app shell, which wraps every screen — wanted only these two as
 * well. But an import is of a module, not of a symbol: pulling `useCurrentUser`
 * from that file pulled `store.ts` with it, and `store.ts` pulls the crypto
 * module, the tax engine and every screen's seed fixture.
 *
 * So a subsystem the product had already stopped using was downloaded by every
 * user on every screen. `BACKEND.md` recorded it as retired because no screen
 * *reads* it, which was true and not the same as not shipping it.
 *
 * The store bindings stay in `use-store.ts` for the tests that still exercise
 * them. Nothing in the running product imports that file any more, and this
 * separation is what keeps it that way — a future `useCurrentUser` import
 * cannot accidentally drag it back.
 */
export function useCurrentUser(): Caller | null {
  /*
    From the token, never from a menu. This used to read `actingAs` out of the
    browser store and fall back to the first owner, which made the answer to
    "who am I" a value the browser held and anybody could change — beside a real
    sign-in that is not a fallback, it is a way for a technician to see every
    price in the firm.
  */
  return useSyncExternalStore(subscribeToSession, getCaller, () => null);
}

/**
 * False until `/api/me` has answered — "not yet" is not "nobody".
 *
 * The shell tells those two apart with this and sends only the second to the
 * sign-in screen. Without it a page renders with no user for a moment, which is
 * a page that has already leaked whatever it was about to check.
 */
export function useSessionResolved(): boolean {
  return useSyncExternalStore(subscribeToSession, callerResolved, () => false);
}
