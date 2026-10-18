import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
const origin = "https://web.example.test";
describe("operational cohort release manifest (not auth)", () => {
  it("opens root, customer deep links, account and required auth/assets only", () => {
    for (const path of ["/","/customers","/account","/sign-in","/api/core/workspace","/api/core/customers","/auth/refresh","/_next/static/a.js","/brand/obizee-mark.svg"])
      expect(proxy(new NextRequest(origin + path)).headers.get("x-middleware-next")).toBe("1");
  });
  it("sends unclosed inherited modules to the real landing, never their old sample screens", () => {
    for (const path of ["/today","/home","/jobs","/jobs/42","/leads","/money","/settings","/team","/reports/gst","/unknown"]) {
      const result = proxy(new NextRequest(origin + path + "?preview=true&role=owner"));
      expect(result.status).toBe(307); expect(result.headers.get("location")).toBe(origin + "/");
      expect(result.headers.get("cache-control")).toBe("no-store");
    }
  });
});
