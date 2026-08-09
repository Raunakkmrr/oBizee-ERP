"use client";

import { DataSourceError, type Fetched } from "@/lib/data/source";
import { rolesWith, type Permission } from "@/lib/roles";
import {
  endSession,
  getAccessToken,
  hasSessionHint,
  loadCaller,
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

/**
 * Every call that must carry or receive the refresh cookie.
 *
 * The app and the API are different origins even on one domain, and a browser
 * will neither store nor send a cookie across that boundary unless the request
 * asks. Omitting it on sign-in is the quiet failure: the response arrives with
 * a `Set-Cookie` the browser throws away, and the session lasts fifteen minutes
 * and then ends. Ordinary API calls deliberately go without — the cookie is
 * scoped to `/auth` and has no business on four hundred other requests.
 */
const WITH_COOKIE = "include" as const;

/** In flight, so ten simultaneous 401s cause one refresh rather than ten. */
let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  // Nothing to send: the token is a cookie this code cannot read. The hint only
  // saves a round trip for a visitor who has never signed in.
  if (!hasSessionHint()) return false;

  refreshing ??= (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: WITH_COOKIE,
        body: "{}",
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
    credentials: WITH_COOKIE,
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) return { ok: false, message: body.error ?? "Could not sign in" };
  startSession(body);
  /*
    Fetch the identity as part of signing in, not afterwards.

    The tokens alone are not a session the app can render: the shell reads
    `useCurrentUser`, and a caller that is still null when the board mounts
    gets redirected straight back to this screen. Whoever starts the session
    is responsible for completing it.
  */
  await loadCaller();
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
    credentials: WITH_COOKIE,
    body: JSON.stringify({ phone, code }),
  });
  const body = await response.json();
  if (!response.ok) return { ok: false, message: body.error ?? "That code is not right" };
  startSession(body);
  await loadCaller();
  return { ok: true };
}

/**
 * End the session at the register, not just in this tab.
 *
 * Clearing local state alone left the refresh token valid for thirty days —
 * on a shared machine, closing the door and leaving the key in it.
 */
export async function signOut(): Promise<void> {
  // Best effort: a network failure must not trap somebody in a session they are
  // trying to leave. The local state goes either way. Sent unconditionally now
  // — this code cannot see the cookie, so it cannot know there is nothing to
  // revoke, and the endpoint answers the same either way by design.
  await fetch(`${BASE}/auth/sign-out`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: WITH_COOKIE,
    body: "{}",
  }).catch(() => undefined);
  endSession();
}

/**
 * Replace a password an owner chose.
 *
 * Returns the new tokens, because the old access token still carries the
 * must-change claim — without swapping them the caller stays locked out
 * having just done what was asked.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch(`${BASE}/api/me/password`, {
    method: "POST",
    // Changing a password reissues the refresh cookie and revokes every other
    // session; without this the browser discards the replacement.
    credentials: WITH_COOKIE,
    headers: {
      "content-type": "application/json",
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = (await response.json().catch(() => null)) as
    | (ApiFailure & { accessToken?: string })
    | null;

  if (!response.ok || !body?.accessToken) {
    return { ok: false, message: body?.error ?? "Could not change that password" };
  }

  startSession({ accessToken: body.accessToken });
  await loadCaller();
  return { ok: true };
}
