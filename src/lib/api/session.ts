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
const REFRESH_KEY = "obizee.refresh";

let accessToken: string | null = null;
let caller: { name: string; role: string } | null = null;
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

export function getCaller(): { name: string; role: string } | null {
  return caller;
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function startSession(tokens: {
  accessToken: string;
  refreshToken: string;
  user?: { name: string; role: string };
}): void {
  accessToken = tokens.accessToken;
  caller = tokens.user ?? caller;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  }
  announce();
}

export function endSession(): void {
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
