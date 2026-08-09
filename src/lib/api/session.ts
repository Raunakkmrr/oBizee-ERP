"use client";

/**
 * The signed-in session.
 *
 * **Where the tokens live.** The access token is held in memory only, so it
 * dies with the tab and no script can read it out of storage. The refresh token
 * is not here at all — it is an httpOnly cookie set by the API, which script
 * cannot read even in principle. It used to sit in `localStorage`, where a
 * single injected script could lift a working thirty-day session.
 *
 * What remains in `localStorage` is one boolean. It is not a credential and
 * proves nothing; it exists so that a visitor who has never signed in is not
 * made to wait for a pointless refresh attempt on every cold load. Forged, it
 * buys an attacker one 401.
 */
import type { Role } from "../roles";
import { apiFetch } from "./client";

/** A hint, not a key. See the note above — the credential is a cookie. */
const SESSION_HINT = "obizee.session";

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
  /** True while the password in use was chosen by somebody else. */
  mustChangePassword: boolean;
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
  if (!accessToken && !hasSessionHint()) {
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

/**
 * Whether this browser believes it has a session to resume.
 *
 * It cannot know for certain: the refresh cookie is httpOnly and invisible from
 * here. Only the API can settle it, by being asked. This decides whether asking
 * is worth a round trip.
 */
export function hasSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SESSION_HINT) === "1";
}

export function startSession(tokens: { accessToken: string }): void {
  accessToken = tokens.accessToken;
  /*
    The identity is not taken from the sign-in response. That reply carries a
    name and a role for the greeting, and half an identity is worse than none —
    a screen reading `caller.id` would get `undefined` and compare it against
    somebody. `loadCaller()` asks `/api/me` for all of it.
  */
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SESSION_HINT, "1");
  }
  announce();
}

export function endSession(): void {
  caller = null;
  resolved = true;
  accessToken = null;
  caller = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_HINT);
  }
  announce();
}

export function isSignedIn(): boolean {
  return accessToken !== null || hasSessionHint();
}
