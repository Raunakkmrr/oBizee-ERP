import { describe, expect, it } from "vitest";
import {
  OUTCOMES,
  PIPELINE_STAGES,
  STALL_DAYS,
  daysSinceContact,
  isStalled,
  isTerminalOutcome,
  pipelineColumns,
  type Lead,
} from "./leads";

const TODAY = new Date("2026-08-04T10:00:00+05:30");

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "l",
    reference: "L-1",
    name: "Customer",
    locality: "Okhla",
    phone: "9",
    stage: "QUOTED",
    dueWord: "Due today",
    group: "today",
    daysOverdue: 0,
    lastActivity: { date: "1 Aug", text: "Sent quote" },
    quotedPaise: 1_000_00,
    quotedUnavailable: false,
    owner: "Priya",
    source: "Referral",
    takenBy: "Priya",
    ...over,
  };
}

describe("terminal outcomes (FR-104, FR-106)", () => {
  it("treats Won and Lost as leaving the queue", () => {
    expect(isTerminalOutcome("Won")).toBe(true);
    expect(isTerminalOutcome("Lost")).toBe(true);
  });

  it("keeps every other outcome in the queue, so a date is still demanded", () => {
    // FR-104's block must survive: any outcome that leaves the lead live still
    // requires a next follow-up date.
    const live = OUTCOMES.filter((o) => !isTerminalOutcome(o));
    expect(live).toEqual([
      "Spoke",
      "No answer",
      "Busy",
      "Asked to call later",
      "Sent quote",
    ]);
  });

  it("does not treat 'Sent quote' as terminal", () => {
    // The trap: a quote sent is the moment follow-up matters most.
    expect(isTerminalOutcome("Sent quote")).toBe(false);
  });
});


describe("pipeline board (§6.6.1's second tab)", () => {
  it("has no WON or LOST column", () => {
    // A board whose right-hand column grows forever stops being a board. Closed
    // deals belong in reporting, and they have already left the queue.
    expect(PIPELINE_STAGES).not.toContain("WON");
    expect(PIPELINE_STAGES).not.toContain("LOST");
  });

  it("keeps PARKED, because that is where deals die quietly", () => {
    expect(PIPELINE_STAGES).toContain("PARKED");
    expect(PIPELINE_STAGES[PIPELINE_STAGES.length - 1]).toBe("PARKED");
  });

  it("totals only the leads that carry a value, and nulls a column with none", () => {
    const columns = pipelineColumns(
      [
        lead({ id: "a", stage: "QUOTED", quotedPaise: 1_000_00 }),
        lead({ id: "b", stage: "QUOTED", quotedPaise: 2_500_00 }),
        // No value on record — must not be counted as zero.
        lead({ id: "c", stage: "NEW", quotedPaise: null }),
      ],
      TODAY,
    );
    const quoted = columns.find((c) => c.stage === "QUOTED");
    const fresh = columns.find((c) => c.stage === "NEW");
    expect(quoted?.valuePaise).toBe(3_500_00);
    // Null, not 0 — an unpriced column has no total, it does not have a zero one.
    expect(fresh?.valuePaise).toBeNull();
  });

  it("orders each column by value, highest first", () => {
    const columns = pipelineColumns(
      [
        lead({ id: "small", quotedPaise: 10_00 }),
        lead({ id: "big", quotedPaise: 90_000_00 }),
      ],
      TODAY,
    );
    const quoted = columns.find((c) => c.stage === "QUOTED");
    expect(quoted?.rows.map((r) => r.id)).toEqual(["big", "small"]);
  });
});

describe("staleness", () => {
  it("measures days since contact, not days until the next follow-up", () => {
    // The trap: `daysOverdue` is the follow-up clock. A lead due in four days
    // can still have been silent for a fortnight, and using the wrong clock
    // reports the healthiest-looking leads as the freshest.
    const silent = lead({
      daysOverdue: -4,
      lastActivity: { date: "20 Jul", text: "Sent quote" },
    });
    expect(isStalled(silent, TODAY)).toBe(true);
  });

  it("does not flag a lead contacted within the window", () => {
    expect(isStalled(lead({ lastActivity: { date: "1 Aug", text: "x" } }), TODAY)).toBe(false);
  });

  it("treats unknown activity as unknown, not as stalled", () => {
    // Flagging a failed lookup sends the owner chasing a data problem.
    expect(daysSinceContact(lead({ lastActivity: null }), TODAY)).toBeNull();
    expect(isStalled(lead({ lastActivity: null }), TODAY)).toBe(false);
  });

  it("flags exactly at the threshold", () => {
    const at = new Date("2026-08-08T10:00:00+05:30");
    const l = lead({ lastActivity: { date: "1 Aug", text: "x" } });
    expect(daysSinceContact(l, at)).toBe(STALL_DAYS);
    expect(isStalled(l, at)).toBe(true);
  });
});

