const ROUTES: Record<string, string> = {
  "POST /auth/password": "/auth/password",
  "POST /auth/refresh": "/auth/refresh",
  "POST /auth/sign-out": "/auth/sign-out",
  "GET /api/me": "/api/me",
  "GET /api/health": "/health",
};
const LIMIT = 16_384;
const unavailable = () => Response.json({ error: "Sign-in service is unavailable" },
  { status: 503, headers: { "cache-control": "no-store" } });

function configuration() {
  const upstream = new URL(process.env.ERP_TENANT_API_URL ?? "");
  const origin = new URL(process.env.ERP_WEB_ORIGIN ?? "");
  if (upstream.protocol !== "https:" || origin.protocol !== "https:" ||
      upstream.username || upstream.password || upstream.port || upstream.search || upstream.hash ||
      upstream.pathname !== "/" || origin.origin !== process.env.ERP_WEB_ORIGIN ||
      !/^[a-z0-9]+\.execute-api\.ap-south-1\.amazonaws\.com$/.test(upstream.hostname)) {
    throw new Error("Invalid tenant runtime configuration");
  }
  return { upstream, origin: origin.origin };
}

async function limitedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > LIMIT) { await reader.cancel(); return null; }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

/** Browser credentials stay on /auth at the served web origin, never cross-site. */
export async function tenantProxy(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const targetPath = ROUTES[`${request.method} ${path}`];
  if (!targetPath) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const config = configuration();
    const incomingOrigin = request.headers.get("origin");
    if ((incomingOrigin && incomingOrigin !== config.origin) ||
        request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.method === "POST" && incomingOrigin !== config.origin)) {
      return Response.json({ error: "Origin is not allowed" }, { status: 403 });
    }
    const headers = new Headers({ origin: config.origin });
    let body: string | undefined;
    if (request.method === "POST") {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
        return Response.json({ error: "JSON is required" }, { status: 415 });
      }
      const content = await limitedBody(request);
      if (content === null) return Response.json({ error: "Request is too large" }, { status: 413 });
      body = content;
      headers.set("content-type", "application/json");
    }
    if (path.startsWith("/auth/")) {
      const cookie = request.headers.get("cookie")?.split(";").map(x => x.trim())
        .find(x => /^obizee_refresh=[A-Za-z0-9_-]+$/.test(x));
      if (cookie) headers.set("cookie", cookie);
    }
    if (path === "/api/me") {
      const authorization = request.headers.get("authorization");
      if (authorization) headers.set("authorization", authorization);
    }
    config.upstream.pathname = targetPath;
    const response = await fetch(config.upstream, { method: request.method, headers,
      ...(body !== undefined ? { body } : {}), cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(10_000) });
    const outgoing = new Headers({ "cache-control": "no-store",
      "content-type": response.headers.get("content-type") ?? "application/json" });
    const retry = response.headers.get("retry-after");
    if (retry) outgoing.set("retry-after", retry);
    const cookies = response.headers.getSetCookie();
    if (response.ok && (path === "/auth/password" || path === "/auth/refresh") && !cookies.length)
      return unavailable();
    for (const cookie of cookies) {
      if (!/^obizee_refresh=/i.test(cookie) || /;\s*domain=/i.test(cookie) ||
          !/;\s*path=\/auth(?:;|$)/i.test(cookie)) return unavailable();
      const deleting = /;\s*max-age=0(?:;|$)/i.test(cookie);
      if (!deleting && (!/;\s*httponly(?:;|$)/i.test(cookie) ||
          !/;\s*secure(?:;|$)/i.test(cookie) || !/;\s*samesite=lax(?:;|$)/i.test(cookie))) return unavailable();
      outgoing.append("set-cookie", cookie);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch { return unavailable(); }
}
