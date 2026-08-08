"use client";

import { DataSourceError, type Fetched } from "@/lib/data/source";
import { rolesWith, type Permission } from "@/lib/roles";
import {
  endSession,
  getAccessToken,
  getRefreshToken,
  startSession,
} from "./session";

/**
 * Talking to the API, in the shape the screens already understand.
 *
 * Every failure becomes a `DataSourceError` carrying one of §6.3's four states,
 * so no screen needs to learn about HTTP. A 403 is a *permission* error naming
 * the role, which is what turns a dead end into "ask Suresh" — the whole reason
 * that state exists.
 *
 * **Refresh happens once, transparently.** A 401 on a real request means the
 * fifteen-minute access token expired mid-session; the refresh token is
 * exchanged and the request replayed. If that fails the session ends, because
 * two failures in a row is a session that is genuinely over rather than stale.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

/** In flight, so ten simultaneous 401s cause one refresh rather than ten. */
let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const token = getRefreshToken();
  if (!token) return false;

  refreshing ??= (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!response.ok) return false;
      startSession(await response.json());
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

type ApiFailure = { error?: string; needs?: string; role?: string; constraint?: string };

function toDataSourceError(status: number, body: ApiFailure): DataSourceError {
  if (status === 403 && body.needs) {
    /*
      §6.3 requires naming *who can act* — "the difference between a dead end
      and a next step". The API answers with the permission it wanted, and
      `rolesWith` turns that into the list of people to ask. The screen never
      has to know an HTTP status existed.
    */
    const permission = body.needs as Permission;
    const rolesWhoCan = rolesWith(permission);
    return new DataSourceError({
      kind: "permission",
      permission,
      rolesWhoCan,
      // Which named colleague to ask needs the tenant's staff list, which this
      // layer does not have. Null is honest; the screen falls back to the role.
      suggestedApprover: null,
    });
  }

  if (status >= 400 && status < 500) {
    /*
      A 4xx is the caller being told something is wrong with what they asked
      for — including the constraint refusals, which already answer with the
      rule they enforce. That is a validation state, not a server fault.
    */
    return new DataSourceError({
      kind: "validation",
      subject: body.constraint ?? "request",
      message: body.error ?? "That request was refused",
      fix: null,
      code: `HTTP_${status}`,
    });
  }

  return new DataSourceError({
    kind: "server",
    message: body.error ?? "Something went wrong at our end",
    code: `HTTP_${status}`,
  });
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<Fetched<T>> {
  const token = getAccessToken();

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    // Offline or the server is unreachable. §6.3: keep the last-known content
    // on screen with a banner — never blank it.
    throw new DataSourceError({ kind: "connectivity", lastKnownAsOf: null });
  }

  if (response.status === 401 && !retried) {
    if (await refresh()) return apiFetch<T>(path, init, true);
    endSession();
  }

  if (!response.ok) {
    let body: ApiFailure = {};
    try {
      body = (await response.json()) as ApiFailure;
    } catch {
      // A non-JSON error body is still an error; it just has less to say.
    }
    throw toDataSourceError(response.status, body);
  }

  return { raw: (await response.json()) as T, staleAsOf: null };
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch(`${BASE}/auth/password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) return { ok: false, message: body.error ?? "Could not sign in" };
  startSession(body);
  return { ok: true };
}

/**
 * Ask for a code.
 *
 * The success answer is deliberately the same whether or not the number is on
 * file — that is what stops the endpoint being a directory of who works here,
 * and the screen advances either way.
 *
 * A refusal is different and must be shown. This used to return `void` and
 * ignore the response entirely, so once the endpoint gained a rate limit a
 * blocked request advanced to the code box and left somebody waiting for an
 * SMS that was never sent. Neither a 429 nor a malformed-number 400 says
 * anything about whether the account exists, so both are safe to surface.
 */
export async function requestOtp(
  phone: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch(`${BASE}/auth/otp/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (response.ok) return { ok: true };

  const body = (await response.json().catch(() => null)) as ApiFailure | null;
  return {
    ok: false,
    message: body?.error ?? "Could not send a code just now",
  };
}

export async function signInWithOtp(
  phone: string,
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch(`${BASE}/auth/otp/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  const body = await response.json();
  if (!response.ok) return { ok: false, message: body.error ?? "That code is not right" };
  startSession(body);
  return { ok: true };
}
