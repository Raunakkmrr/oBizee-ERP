import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: null as null | { id:string;tenantId:string;name:string;role:string;level:null;mustChangePassword:boolean } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/data/use-session", () => ({ useCurrentUser: () => state.user, useSessionResolved: () => true }));
vi.mock("@/lib/api/session", () => ({ loadCaller:vi.fn(),sessionLoadFailure:()=>null,subscribeToSession:()=>()=>{} }));
vi.mock("@/lib/api/client", () => ({ apiFetch:vi.fn(),signOut:vi.fn() }));
import { CoreWorkspace } from "./workspace";
describe("real operational shell, non-served component unit tests", () => {
  it("shows no company records before identity is verified", () => {
    state.user = null;
    const html = renderToStaticMarkup(createElement(CoreWorkspace,{view:"overview"}));
    expect(html).toContain("Checking your company account");
    expect(html).not.toContain("Open service jobs"); expect(html).not.toContain("Add customer");
  });
  it("keeps the same shipped navigation for every actual role without fixture identity", () => {
    for (const role of ["owner","coordinator","marketing","technician","accountant","readonly_ca"]) {
      state.user={id:"unit",tenantId:"unit-tenant",name:"Verified unit person",role,level:null,mustChangePassword:false};
      const html=renderToStaticMarkup(createElement(CoreWorkspace,{view:"customers"}));
      expect(html).toContain("Verified unit person");
      expect(html).toContain('href="/"'); expect(html).toContain('href="/customers"');
      expect(html).toContain('href="/account"'); expect(html).toContain("Upcoming");
      expect(html).not.toContain('href="/jobs"');
      expect(html).toContain("Loading your company workspace");
      expect(html).not.toContain("No open service jobs"); // Loading is never a false zero.
    }
  });
  it("has no direct fixture identity imports or browser-selected data source in the reachable cohort", () => {
    for (const path of ["src/app/page.tsx","src/app/customers/page.tsx","src/components/core/workspace.tsx"]) {
      const source=readFileSync(path,"utf8");
      for (const forbidden of ["SEED_TENANT","CURRENT_USER","/fixtures/","use-store","NEXT_PUBLIC_DATA_SOURCE","NEXT_PUBLIC_API_URL"])
        expect(source).not.toContain(forbidden);
    }
  });
});
