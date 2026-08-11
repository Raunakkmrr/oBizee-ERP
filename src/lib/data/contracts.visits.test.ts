import { describe, expect, it } from "vitest";
import {
  RENEWAL_SOURCE,
  renewalsDue,
  visitSchedule,
  visitsToGenerate,
  type Contract,
} from "./contracts";

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: "ctr_x",
    reference: "AMC-2627-0099",
    customer: "Shakti Industries",
    site: "Okhla Phase II",
    annualValuePaise: 3_60_000_00,
    coverage: "COMPREHENSIVE",
    billing: "MONTHLY",
    startDate: "1 Apr 2026",
    endDate: "31 Mar 2027",
    termDays: 365,
    daysRemaining: 240,
    status: "ACTIVE",
    reschedulePolicy: "SHIFT_SUBSEQUENT",
    schedules: [
      {
        id: "sch_1",
        scope: "Shakti — Okhla",
        recurrence: "MONTHLY",
        anchorDay: 15,
        visitsDone: 0,
        visitsCommitted: 12,
      },
    ],
    ...over,
  };
}

describe("visitSchedule — FR-502", () => {
  it("stops at the 90-day horizon rather than filling the board with a year", () => {
    const visits = visitSchedule(contract(), new Date("2026-04-01"), 90);
    // 15 Apr, 15 May, 15 Jun — 15 Jul is day 105 and falls outside.
    expect(visits).toHaveLength(3);
    expect(visits.map((v) => v.on.getDate())).toEqual([15, 15, 15]);
  });

  it("honours the anchor day, clamping in a shorter month", () => {
    const visits = visitSchedule(
      contract({
        startDate: "1 Jan 2026",
        schedules: [
          {
            id: "sch_1",
            scope: "s",
            recurrence: "MONTHLY",
            anchorDay: 31,
            visitsDone: 0,
            visitsCommitted: 12,
          },
        ],
      }),
      new Date("2026-01-01"),
      90,
    );
    const february = visits.find((v) => v.on.getMonth() === 1)!;
    // 28 Feb, not 3 March — spilling would put the visit in the wrong month.
    expect(february.on.getDate()).toBe(28);
  });

  it("numbers each visit against its committed total", () => {
    const visits = visitSchedule(contract(), new Date("2026-04-01"), 90);
    expect(visits[0].number).toBe(1);
    expect(visits[0].of).toBe(12);
  });

  it("steps alternate-monthly by two months, not one", () => {
    const visits = visitSchedule(
      contract({
        schedules: [
          {
            id: "sch_1",
            scope: "s",
            recurrence: "ALTERNATE_MONTHLY",
            anchorDay: 15,
            visitsDone: 0,
            visitsCommitted: 6,
          },
        ],
      }),
      new Date("2026-04-01"),
      // 150 days reaches 15 Aug; 120 stops on 30 Jul and would exclude it.
      150,
    );
    expect(visits.map((v) => v.on.getMonth())).toEqual([3, 5, 7]);
  });

  it("steps weekly by days rather than months", () => {
    const visits = visitSchedule(
      contract({
        schedules: [
          {
            id: "sch_1",
            scope: "s",
            recurrence: "WEEKLY",
            anchorDay: 1,
            visitsDone: 0,
            visitsCommitted: 52,
          },
        ],
      }),
      new Date("2026-04-01"),
      21,
    );
    expect(visits).toHaveLength(3);
    expect(visits[1].on.getTime() - visits[0].on.getTime()).toBe(7 * 86_400_000);
  });

  it("returns nothing rather than guessing when the start date is unreadable", () => {
    expect(visitSchedule(contract({ startDate: "whenever" }), new Date())).toEqual([]);
  });
});

describe("visitsToGenerate — idempotency", () => {
  it("generates nothing the second time", () => {
    const from = new Date("2026-04-01");
    const first = visitsToGenerate(contract(), new Set(), from, 90);
    expect(first).toHaveLength(3);

    const keys = new Set(first.map((v) => v.key));
    // The regression this prevents: running generation twice doubling the AMC's
    // visits, which is a board nobody trusts and an invoice run nobody can fix.
    expect(visitsToGenerate(contract(), keys, from, 90)).toEqual([]);
  });

  it("generates only what is missing when the horizon moves", () => {
    const keys = new Set(["sch_1:1"]);
    const later = visitsToGenerate(contract(), keys, new Date("2026-04-01"), 90);
    expect(later.map((v) => v.number)).toEqual([2, 3]);
  });

  it("keys a visit the way the database keys it", () => {
    /*
      **The one this file was missing.** It asserted the key against a literal
      it had written itself — `ctr_x:sch_1:1` — so it agreed with the browser
      and nobody noticed the API was writing `scheduleId:n`. The two formats
      could never match, and the contracts screen reported "none on the board
      yet" over visits that had genuinely been generated, offering to raise
      them again for ever.

      `jobs_tenant_visitkey_uq` is what actually enforces FR-502's idempotency,
      and it holds the server's format. This pins the shape so the next
      divergence fails here instead of on a screen.
    */
    const [first] = visitsToGenerate(contract(), new Set(), new Date("2026-04-01"), 90);
    expect(first!.key).toBe(`${first!.scheduleId}:${first!.number}`);
    expect(first!.key).not.toContain(first!.contractId);
  });
});

describe("renewalsDue — FR-506", () => {
  const near = contract({ id: "a", daysRemaining: 12 });
  const nearer = contract({ id: "b", daysRemaining: 3 });
  const far = contract({ id: "c", daysRemaining: 200 });
  const expired = contract({ id: "d", daysRemaining: -5 });
  const suspended = contract({ id: "e", daysRemaining: 10, status: "SUSPENDED" });

  it("lists the soonest first — that is the call to make today", () => {
    const due = renewalsDue([near, nearer, far], new Set());
    expect(due.map((r) => r.contract.id)).toEqual(["b", "a"]);
  });

  it("ignores contracts that already lapsed or are not active", () => {
    expect(renewalsDue([expired, suspended], new Set())).toEqual([]);
  });

  it("marks one already worked so the action is not offered twice", () => {
    const due = renewalsDue([near], new Set(["a"]));
    expect(due[0].worked).toBe(true);
  });

  it("names the source FR-506 requires", () => {
    expect(RENEWAL_SOURCE).toBe("AMC renewal");
  });
});
