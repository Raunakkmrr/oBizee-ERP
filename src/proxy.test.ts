import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("authentication-checkpoint release boundary", () => {
  const origin = "https://web.example.test";
  it("redirects every inherited business page before it can render sample state", () => {
    for (const path of ["/", "/today", "/home", "/jobs", "/jobs/42", "/leads", "/money", "/settings", "/team", "/change-password", "/unknown"] ) {
      const result = proxy(new NextRequest(origin + path));
      expect(result.status).toBe(307);
      expect(result.headers.get("location")).toBe(origin + "/account");
      expect(result.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("allows only checkpoint/auth paths and necessary framework/brand assets", () => {
    for (const path of ["/account", "/sign-in", "/api/me", "/api/health", "/auth/refresh", "/_next/static/chunk.js", "/brand/obizee-mark.svg"]) {
      expect(proxy(new NextRequest(origin + path)).headers.get("x-middleware-next")).toBe("1");
    }
  });
  it("does not treat cookies, forwarded headers or query flags as permission to open a business page", () => {
    const result = proxy(new NextRequest(origin + "/today?role=owner&preview=true", {
      headers: { cookie: "obizee_refresh=synthetic", "x-forwarded-for": "forged", "x-middleware-subrequest": "proxy" },
    }));
    expect(result.headers.get("location")).toBe(origin + "/account");
  });
});
