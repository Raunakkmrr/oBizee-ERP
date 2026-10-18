import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tenantProxy } from "./tenant-proxy";
const origin = "https://main.unit-test.amplifyapp.com";
const api = "https://unittest.execute-api.ap-south-1.amazonaws.com";
const cookie = "obizee_refresh=synthetic-refresh; Path=/auth; HttpOnly; Secure; SameSite=Lax";
function request(path: string, method = "POST", headers: Record<string,string> = {}, body = "{}") {
  return new Request(origin + path, { method, headers: { origin,
    "content-type": "application/json", ...headers }, ...(method === "POST" ? { body } : {}) });
}
beforeEach(() => {
  vi.stubEnv("ERP_TENANT_API_URL", api); vi.stubEnv("ERP_WEB_ORIGIN", origin);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true}',
    { headers: { "content-type": "application/json", "set-cookie": cookie } })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("real HTTPS tenant API proxy", () => {
  it("forwards only reviewed cohort methods, tenant bearer and directory page; no cookies/actor overrides", async () => {
    for (const [path,method] of [["/api/core/workspace","GET"],["/api/core/customers?page=2","GET"],["/api/core/customers","POST"]]) {
      await tenantProxy(request(path!, method!, { authorization: "Bearer unit-access",
        cookie: "obizee_refresh=do-not-forward", "x-tenant-id": "foreign" }));
      const [url,init] = vi.mocked(fetch).mock.calls.at(-1)!;
      expect(String(url)).toBe(api + path);
      const headers = new Headers(init!.headers);
      expect(headers.get("authorization")).toBe("Bearer unit-access");
      expect(headers.has("cookie")).toBe(false); expect(headers.has("x-tenant-id")).toBe(false);
    }
  });
  it("refuses arbitrary methods/paths and query-based backend or tenant overrides", async () => {
    for (const path of ["/api/core/workspace?tenantId=foreign","/api/core/customers?api=http://localhost",
      "/api/core/customers?page=0&page=1","/api/core/customers?page=-1"]) {
      expect((await tenantProxy(request(path,"GET"))).status).toBe(400);
    }
    expect((await tenantProxy(request("/api/core/customers","DELETE"))).status).toBe(404);
    expect((await tenantProxy(request("/api/core/jobs","GET"))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses one fixed upstream and preserves the host-only auth cookie", async () => {
    const res = await tenantProxy(request("/auth/refresh", "POST", {
      cookie: "admin_session=do-not-forward; obizee_refresh=synthetic-refresh",
      "x-token-delivery": "body", "x-forwarded-for": "forged", "x-erp-platform-secret": "do-not-forward",
    }));
    expect(res.status).toBe(200); expect(res.headers.get("set-cookie")).toBe(cookie);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe(api + "/auth/refresh");
    const headers = new Headers(init!.headers);
    expect(headers.get("cookie")).toBe("obizee_refresh=synthetic-refresh");
    for (const key of ["x-token-delivery", "x-forwarded-for", "x-erp-platform-secret"])
      expect(headers.has(key)).toBe(false);
    expect(init!.redirect).toBe("error"); expect(init!.cache).toBe("no-store");
  });
  it("does not forward refresh cookies to identity reads", async () => {
    await tenantProxy(request("/api/me", "GET", {
      authorization: "Bearer synthetic-access", cookie: "obizee_refresh=synthetic-refresh" }));
    const headers = new Headers(vi.mocked(fetch).mock.calls[0]![1]!.headers);
    expect(headers.get("authorization")).toBe("Bearer synthetic-access");
    expect(headers.has("cookie")).toBe(false);
  });
  it("fails closed when configuration is absent or targets an insecure/synthetic backend", async () => {
    for (const value of ["", "http://127.0.0.1:3538", "https://foreign.example.test", api + "/bad", api + "?bad=1"]) {
      vi.stubEnv("ERP_TENANT_API_URL", value);
      const res = await tenantProxy(request("/auth/password"));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "Sign-in service is unavailable" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses cross-origin, missing-origin, non-JSON, oversized, and arbitrary routes", async () => {
    expect((await tenantProxy(request("/auth/password", "POST", { origin: "https://evil.example.test" }))).status).toBe(403);
    const absent = request("/auth/password"); absent.headers.delete("origin");
    expect((await tenantProxy(absent)).status).toBe(403);
    expect((await tenantProxy(request("/auth/password", "POST", { "content-type": "text/plain" }))).status).toBe(415);
    expect((await tenantProxy(request("/auth/password", "POST", {}, "x".repeat(16385)))).status).toBe(413);
    expect((await tenantProxy(request("/auth/otp/request"))).status).toBe(404);
    expect((await tenantProxy(request("/api/jobs", "GET"))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses unsafe upstream cookie scope and does not leak internal failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { headers: {
      "set-cookie": cookie + "; Domain=.example.test" } }));
    expect((await tenantProxy(request("/auth/password"))).status).toBe(503);
    vi.mocked(fetch).mockRejectedValueOnce(new Error("DO-NOT-EXPOSE"));
    const res = await tenantProxy(request("/auth/password"));
    expect(await res.text()).not.toContain("DO-NOT-EXPOSE");
  });
  it("preserves generic upstream refusal and retry guidance", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"error":"That email and password do not match"}',
      { status: 401, headers: { "retry-after": "60" } }));
    const res = await tenantProxy(request("/auth/password"));
    expect(res.status).toBe(401); expect(res.headers.get("retry-after")).toBe("60");
    expect(await res.json()).toEqual({ error: "That email and password do not match" });
  });
});
