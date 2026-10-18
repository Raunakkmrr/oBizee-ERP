import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: null as null | { id: string; tenantId: string;
  name: string; role: string; level: null; mustChangePassword: boolean } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/data/use-session", () => ({ useCurrentUser: () => state.user,
  useSessionResolved: () => true }));
vi.mock("@/lib/api/session", () => ({ loadCaller: vi.fn(),
  sessionLoadFailure: () => null, subscribeToSession: () => () => {} }));
vi.mock("@/lib/api/client", () => ({ signOut: vi.fn() }));
import AccountCheckpoint from "./page";
beforeEach(() => { state.user = null; });
describe("real-identity-only account checkpoint", () => {
  it("renders no identity or activity while the server identity is unconfirmed", () => {
    const html = renderToStaticMarkup(createElement(AccountCheckpoint));
    expect(html).toContain("Checking your company account");
    expect(html).not.toContain("Role</dt>");
    expect(html).not.toContain("Company account ID</dt>");
  });
  it("renders only the server-confirmed identity, without business links, ratings, counters or fixture role", () => {
    state.user = { id: "unit-user", tenantId: "confirmed-tenant", name: "Confirmed person",
      role: "technician", level: null, mustChangePassword: false };
    const html = renderToStaticMarkup(createElement(AccountCheckpoint));
    expect(html).toContain("Confirmed person"); expect(html).toContain("confirmed-tenant");
    expect(html).toContain("Technician");
    expect(html).toContain("operational workspace is not available");
    for (const value of ["leads_overdue", "rating", "href=", "Create job", "Dispatch", "Owner</dd>"])
      expect(html).not.toContain(value);
  });
  it("does not invent a working password-change path", () => {
    state.user = { id: "unit-user", tenantId: "confirmed-tenant", name: "Confirmed person",
      role: "owner", level: null, mustChangePassword: true };
    const html = renderToStaticMarkup(createElement(AccountCheckpoint));
    expect(html).toContain("Password changes are not available");
    expect(html).not.toContain("href=");
  });
});
