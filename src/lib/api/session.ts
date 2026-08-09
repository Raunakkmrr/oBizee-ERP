"use client";

/**
 * The signed-in session.
 *
 * **Where the tokens live, and the honest trade-off.** The access token is held
 * in memory only, so a cross-site script cannot read it from storage and it
 * dies with the tab. The refresh token is in `localStorage`, because a
 * coordinator closing her laptop at six and opening it at nine should not have
 * to sign in again — and a technician on a phone certainly should not.
 *
 * That means a successful XSS could lift the refresh token. The better answer
 * is an httpOnly cookie set by the API, which needs the API on the same site or
 * a CORS credential setup. **Recorded as a known limitation rather than
 * pretended away**: it is on the B5 list, and refresh rotation already makes a
 * stolen token visible the moment the real one is used.
 */
import type { Role } from "../roles";
import { apiFetch } from "./client";

const REFRESH_KEY = "obizee.refresh";

/**
 * Who is signed in — the whole of it, from `/api/me`.
 *
 * This replaces `actingAs` in the browser store, which was a menu that let
 * anybody become the owner by choosing them. It was the right shape for a
 * fixture and is unthinkable beside a real sign-in: a technician could have
 * picked "Owner" and seen every price in the firm.
 */
export type Caller = {
  id: string;
  name: string;
  role: Role;
  level: string | null;
  tenantId: string;
};

let accessToken: string | null = null;
let caller: Caller | null = null;
/** Distinguishes "nobody is signed in" from "we have not asked yet". */
let resolved = false;
const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getCaller(): Caller | null {
  return caller;
}

export function callerResolved(): boolean {
  return resolved;
}

/**
 * Ask the API who this token belongs to.
 *
 * The token is the only thing that decides. A caller cannot be chosen, typed
 * or remembered from last time — which is the entire difference between this
 * and the switcher it replaces.
 */
export async function loadCaller(): Promise<Caller | null> {
  if (!accessToken && !getRefreshToken()) {
    resolved = true;
    announce();
    return null;
  }

  try {
    const { raw } = await apiFetch<Caller>("/api/me");
    caller = raw;
  } catch {
    // A token we cannot exchange for an identity is not a session.
    caller = null;
  }
  resolved = true;
  announce();
  return caller;
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function startSession(tokens: {
  accessToken: string;
  refreshToken: string;
}): void {
  accessToken = tokens.accessToken;
  /*
    The identity is not taken from the sign-in response. That reply carries a
    name and a role for the greeting, and half an identity is worse than none —
    a screen reading `caller.id` would get `undefined` and compare it against
    somebody. `loadCaller()` asks `/api/me` for all of it.
  */
  if (typeof window !== "undefined") {
    window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  }
  announce();
}

export function endSession(): void {
  caller = null;
  resolved = true;
  accessToken = null;
  caller = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(REFRESH_KEY);
  }
  announce();
}

export function isSignedIn(): boolean {
  return accessToken !== null || getRefreshToken() !== null;
}
