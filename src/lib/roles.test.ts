import { describe, expect, it } from "vitest";
import {
  DEFAULT_TENANT_TOGGLES,
  ROLES,
  can,
  rolesWith,
  type Role,
} from "./roles";

/**
 * These are mostly NEGATIVE tests, on purpose. A permission matrix rarely breaks
 * by forgetting to grant something — that gets noticed the first time someone
 * uses the screen. It breaks by quietly granting something, which nobody
 * notices until it matters. Every assertion below quotes the PRD constraint it
 * defends.
 */

describe("technician — §3.3, FR-306, FR-1302", () => {
  it("sees only his own jobs, never the full job list", () => {
    expect(can("technician", "job:read_own")).toBe(true);
    expect(can("technician", "job:read")).toBe(false);
  });

  it("has no customer directory at all (§6.2: three tabs, no global search)", () => {
    expect(can("technician", "customer:read")).toBe(false);
    expect(can("technician", "customer:write")).toBe(false);
  });

  it("sees no prices by default — the toggle is OFF (FR-1302)", () => {
    expect(DEFAULT_TENANT_TOGGLES.technicianSeesPrices).toBe(false);
    expect(can("technician", "price:view_selling")).toBe(false);
    expect(can("technician", "price:view_cost")).toBe(false);
  });

  it("sees selling prices only when the tenant turns the toggle on", () => {
    const on = { ...DEFAULT_TENANT_TOGGLES, technicianSeesPrices: true };
    expect(can("technician", "price:view_selling", on)).toBe(true);
    // Cost price and margin stay owner-only even then (§3.1).
    expect(can("technician", "price:view_cost", on)).toBe(false);
  });

  it("is the only non-owner role that can assert what happened at site (§4.2 rule 1)", () => {
    // "A dispatcher marking a job done from the office is how field data
    // becomes fiction." The dispatcher's escape hatch is a separate audited
    // force_close, not this permission.
    const holders = rolesWith("job:transition_field");
    expect(holders).toContain("technician");
    expect(holders).not.toContain("coordinator");
    expect(holders).not.toContain("accountant");
    expect(holders).not.toContain("readonly_ca");
  });

  it("cannot reach reports, settings or the audit log", () => {
    expect(can("technician", "report:read")).toBe(false);
    expect(can("technician", "settings:read")).toBe(false);
    expect(can("technician", "audit:read")).toBe(false);
  });
});

describe("coordinator — §3.2", () => {
  it("owns dispatch", () => {
    expect(can("coordinator", "job:dispatch")).toBe(true);
    expect(can("coordinator", "lead:write")).toBe(true);
    expect(can("coordinator", "contract:write")).toBe(true);
  });

  it("is read-only on invoices", () => {
    expect(can("coordinator", "invoice:read")).toBe(true);
    expect(can("coordinator", "invoice:write")).toBe(false);
    expect(can("coordinator", "invoice:finalise")).toBe(false);
  });

  it("can bill only when the tenant enables it (§4.2 INVOICED)", () => {
    const on = { ...DEFAULT_TENANT_TOGGLES, coordinatorCanBill: true };
    expect(DEFAULT_TENANT_TOGGLES.coordinatorCanBill).toBe(false);
    expect(can("coordinator", "invoice:write", on)).toBe(true);
  });

  it("never sees cost prices — §3.2 says so outright", () => {
    expect(can("coordinator", "price:view_cost")).toBe(false);
    const on = { ...DEFAULT_TENANT_TOGGLES, coordinatorCanBill: true };
    expect(can("coordinator", "price:view_cost", on)).toBe(false);
  });

  it("can issue parts to a van but not purchase them (§6.2 role table)", () => {
    expect(can("coordinator", "part:issue_to_van")).toBe(true);
    expect(can("coordinator", "part:purchase")).toBe(false);
  });
});

describe("accountant — §3.4", () => {
  it("finalises invoices and works the GST workspace", () => {
    expect(can("accountant", "invoice:finalise")).toBe(true);
    expect(can("accountant", "gst:write")).toBe(true);
    expect(can("accountant", "payment:write")).toBe(true);
  });

  it("has NO dispatch — §3.4 states it explicitly", () => {
    expect(can("accountant", "job:dispatch")).toBe(false);
  });

  it("is read-only on jobs, so the evidence behind a line stays visible", () => {
    expect(can("accountant", "job:read")).toBe(true);
    expect(can("accountant", "job:write")).toBe(false);
  });
});

describe("read-only CA — FR-1003", () => {
  it("can read money and generate exports", () => {
    expect(can("readonly_ca", "invoice:read")).toBe(true);
    expect(can("readonly_ca", "payment:read")).toBe(true);
    expect(can("readonly_ca", "gst:read")).toBe(true);
    expect(can("readonly_ca", "export:generate")).toBe(true);
  });

  it("can alter no operational data whatsoever — FR-1003's whole point", () => {
    const writes = [
      "lead:write",
      "job:write",
      "job:dispatch",
      "customer:write",
      "contract:write",
      "invoice:write",
      "invoice:finalise",
      "payment:write",
      "gst:write",
      "settings:write",
      "people:manage",
    ] as const;
    for (const permission of writes) {
      expect(can("readonly_ca", permission), permission).toBe(false);
    }
  });
});

describe("owner — §3.1", () => {
  it("holds every permission, including cost prices and technician performance", () => {
    expect(can("owner", "price:view_cost")).toBe(true);
    expect(can("owner", "report:technician_performance")).toBe(true);
    expect(can("owner", "people:manage")).toBe(true);
    expect(can("owner", "audit:read")).toBe(true);
  });

  it("is the only role that can see cost price and margin", () => {
    expect(rolesWith("price:view_cost")).toEqual(
      expect.arrayContaining(["owner"]),
    );
    expect(rolesWith("price:view_cost")).not.toContain("coordinator");
    expect(rolesWith("price:view_cost")).not.toContain("technician");
  });
});

describe("matrix integrity", () => {
  it("defines every role", () => {
    expect(ROLES).toHaveLength(5);
    for (const role of ROLES) {
      expect(() => can(role, "job:read")).not.toThrow();
    }
  });

  it("gives every permission at least one holder — an orphan permission is dead code", () => {
    const orphans = (
      [
        "lead:read",
        "job:dispatch",
        "job:transition_field",
        "invoice:finalise",
        "gst:write",
        "price:view_cost",
        "people:manage",
        "audit:read",
        "part:purchase",
        "part:consume",
      ] as const
    ).filter((permission) => rolesWith(permission).length === 0);
    expect(orphans).toEqual([]);
  });

  it("names who can act, for §6.3's permission-error state", () => {
    // "Only the Accountant or Owner can finalise an invoice. Ask Suresh to
    // approve." — the message needs this list to exist.
    const holders: Role[] = rolesWith("invoice:finalise");
    expect(holders).toEqual(["owner", "accountant"]);
  });
});
