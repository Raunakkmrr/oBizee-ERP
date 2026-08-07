import { describe, expect, it } from "vitest";
import {
  LANDING,
  NAV_BY_ROLE,
  NAV_ITEMS,
  footerNavFor,
  navFor,
  navGroupsFor,
  type NavKey,
} from "./navigation";
import { ROLES, can } from "./roles";

/**
 * §6.2 makes navigation order a *requirement*. These tests pin the claims that
 * would otherwise erode one reasonable-sounding tweak at a time.
 */

describe("the ordering claims §6.2 refuses to compromise on", () => {
  const owner = NAV_BY_ROLE.owner;

  it("puts Today first — the only screen answering a question about now", () => {
    expect(owner[0]).toBe("today");
  });

  it("puts Jobs second — the object the business produces", () => {
    expect(owner[1]).toBe("jobs");
  });

  it("puts Leads adjacent to Jobs, because the same person does both", () => {
    expect(owner.indexOf("leads") - owner.indexOf("jobs")).toBe(1);
  });

  it("keeps Parts below everything that earns money — the thesis test", () => {
    /*
      §6.2: "if this ever creeps upward, the product has drifted off its
      thesis." A generic ERP puts inventory at 2.

      Pinned by relation rather than by index. The absolute position was 7 until
      Vendors was added above it; asserting the number would have failed on a
      change that honours the thesis exactly — inventory still sits below every
      screen that brings money in or sends it out.
    */
    for (const above of ["today", "jobs", "leads", "contracts", "customers", "money", "vendors"] as const) {
      expect(owner.indexOf("parts"), above).toBeGreaterThan(owner.indexOf(above));
    }
  });

  it("keeps Settings last — never a place a daily task lives", () => {
    expect(owner[owner.length - 1]).toBe("settings");
  });

  it("gives the owner every primary destination", () => {
    // Eleven since Vendors arrived with the payables block (decision D1).
    expect(owner).toHaveLength(11);
  });
});

describe("the accountant's inversion — §3.4 and defect D10", () => {
  it("puts Invoices & Payments at position 1, not 2", () => {
    // §6.2's prose said "promoted to position 2"; its own role table and
    // landing-screen column both said 1, and §3.4 agrees. The prose was stale.
    expect(NAV_BY_ROLE.accountant[0]).toBe("money");
    expect(LANDING.accountant.web).toBe(NAV_ITEMS.money.href);
  });

  it("gives the accountant no dispatch surface", () => {
    expect(NAV_BY_ROLE.accountant).not.toContain("today");
    expect(NAV_BY_ROLE.accountant).not.toContain("leads");
  });
});

describe("the technician's three tabs — §6.2", () => {
  it("has exactly three, and they are the three questions he has", () => {
    // "not a reduced version of the coordinator's navigation... a fourth item
    // would only give him something to get lost in."
    expect(NAV_BY_ROLE.technician).toEqual(["my_day", "upcoming", "sync"]);
  });

  it("gives him no global search, no customer directory, no reports", () => {
    const forbidden: NavKey[] = [
      "customers",
      "reports",
      "money",
      "leads",
      "contracts",
      "settings",
      "today",
      "jobs",
    ];
    for (const key of forbidden) {
      expect(NAV_BY_ROLE.technician, key).not.toContain(key);
    }
  });
});

describe("badges — §6.2's prohibition, enforced structurally", () => {
  it("badges only the three items whose count demands action", () => {
    const badged = (Object.keys(NAV_ITEMS) as NavKey[]).filter(
      (key) => NAV_ITEMS[key].badge !== null,
    );
    expect(badged.sort()).toEqual(["leads", "money", "today"]);
  });

  it("carries the right badge on each", () => {
    expect(NAV_ITEMS.today.badge).toBe("unassigned_today");
    expect(NAV_ITEMS.leads.badge).toBe("leads_overdue");
    expect(NAV_ITEMS.money.badge).toBe("invoices_overdue");
  });

  it("never badges a directory, because that would be a total", () => {
    // "A badge that shows a total (e.g. '1,482 customers') is decoration and is
    // forbidden."
    expect(NAV_ITEMS.customers.badge).toBeNull();
    expect(NAV_ITEMS.parts.badge).toBeNull();
    expect(NAV_ITEMS.contracts.badge).toBeNull();
    expect(NAV_ITEMS.jobs.badge).toBeNull();
    expect(NAV_ITEMS.reports.badge).toBeNull();
    expect(NAV_ITEMS.settings.badge).toBeNull();
  });
});

describe("navigation and permissions agree", () => {
  it("never shows a role a destination its permissions forbid", () => {
    // The inverse of the real control — but a nav item a role cannot use is a
    // dead end, and §6.3 wants dead ends replaced by next steps.
    for (const role of ROLES) {
      for (const item of navFor(role)) {
        expect(
          can(role, item.requires),
          `${role} sees "${item.label}" but lacks ${item.requires}`,
        ).toBe(true);
      }
    }
  });

  it("lands every role somewhere it can actually reach", () => {
    for (const role of ROLES) {
      const items = navFor(role);
      const hrefs = items.map((item) => item.href);
      const landingWeb = LANDING[role].web;
      // The Owner's mobile landing is Owner Home, which is not a nav item — it
      // is the powerhouse screen the rail sits beside. Web landings must be
      // reachable from the rail.
      expect(hrefs, `${role} web landing ${landingWeb}`).toContain(landingWeb);
    }
  });

  it("gives every role at least one destination", () => {
    for (const role of ROLES) {
      expect(navFor(role).length, role).toBeGreaterThan(0);
    }
  });
});

describe("depth and reachability — §6.2's max depth of 2", () => {
  it("keeps every primary destination at a single path segment", () => {
    // "Maximum depth is two. Any screen is reachable in <= 2 clicks from the
    // primary nav." A nav href with two segments has already spent the budget.
    for (const key of Object.keys(NAV_ITEMS) as NavKey[]) {
      const segments = NAV_ITEMS[key].href.split("/").filter(Boolean);
      expect(segments, NAV_ITEMS[key].href).toHaveLength(1);
    }
  });

  it("gives every item a rationale", () => {
    for (const key of Object.keys(NAV_ITEMS) as NavKey[]) {
      expect(NAV_ITEMS[key].rationale.trim(), key).not.toBe("");
    }
  });

  it("defends each of the nine primary positions at length", () => {
    // Only the primary rail is held to this. The technician's three tabs have
    // deliberately terse rationales — "What is coming." — because §6.2 says his
    // tabs ARE his three questions, and padding them would be noise.
    for (const key of NAV_BY_ROLE.owner) {
      expect(NAV_ITEMS[key].rationale.length, key).toBeGreaterThan(60);
    }
  });
});

describe("every permitted destination is actually reachable", () => {
  it("puts each role's nav keys into a group or the footer", () => {
    // The bug this exists for: `team` was added to the owner's permitted set
    // and to NAV_ITEMS, but not to any GROUP_DEFINITIONS entry — so it passed
    // every type check and simply never rendered. A destination nobody can
    // click is the same as one that does not exist.
    // Technician is excluded: §2.2 declines a desktop technician workflow
    // entirely, so his three tabs live in the React Native app and have no web
    // group by design — not by omission.
    for (const role of ROLES.filter((r) => r !== "technician")) {
      const rendered = new Set([
        ...navGroupsFor(role).flatMap((group) => group.items.map((i) => i.key)),
        ...footerNavFor(role).map((item) => item.key),
      ]);
      for (const key of NAV_BY_ROLE[role]) {
        expect(rendered.has(key), `${role} cannot reach ${key}`).toBe(true);
      }
    }
  });
});
