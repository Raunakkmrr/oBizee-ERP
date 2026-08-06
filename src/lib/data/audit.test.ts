import { describe, expect, it } from "vitest";
import { reduce, seedState } from "./store";
import { AUDIT_LIMIT, append, isAuditable, summarise, whenWords } from "./audit";

const NOW = new Date("2026-08-06T18:04:00.000Z");

describe("the trail records every mutation — FR-1305", () => {
  it("records a write nobody wrote a logging line for", () => {
    // The point of auditing in the wrapper: a new action is covered the day it
    // is added, whether or not its author remembered.
    const after = reduce(
      seedState(),
      { type: "GENERATE_CONTRACT_VISITS", contractId: seedState().contracts[0].id },
      NOW,
    );
    expect(after.audit).toHaveLength(1);
    expect(after.audit[0].action).toBe("GENERATE_CONTRACT_VISITS");
  });

  it("names a person, never 'system'", () => {
    const after = reduce(
      seedState(),
      { type: "MARK_PAYABLE_PAID", billId: seedState().money.payables[0].id },
      NOW,
    );
    expect(after.audit[0].actor).toBe("Priya Sharma");
  });

  it("writes nothing when the action changed nothing", () => {
    // A trail full of no-ops is a trail nobody reads.
    const before = seedState();
    const after = reduce(before, { type: "ASSIGN_JOB", jobId: "nope", technicianId: "x", technicianName: "X" }, NOW);
    expect(after.audit).toHaveLength(0);
  });

  it("only ever appends — an earlier entry is never rewritten", () => {
    let state = seedState();
    state = reduce(state, { type: "MARK_PAYABLE_PAID", billId: state.money.payables[0].id }, NOW);
    const first = state.audit[0];
    state = reduce(
      state,
      { type: "RECORD_ADVANCE", customer: "Nirmal Foods", receiptPaise: 1_18_000_00, head: "CGST_SGST", contractId: null },
      NOW,
    );
    expect(state.audit).toHaveLength(2);
    // Newest first, and the older entry is byte-identical to what it was.
    expect(state.audit[1]).toEqual(first);
  });

  it("carries an origin, so an offline write is distinguishable later", () => {
    const after = reduce(
      seedState(),
      { type: "RECORD_ADVANCE", customer: "X", receiptPaise: 100_00, head: "IGST", contractId: null },
      NOW,
    );
    expect(after.audit[0].origin).toBe("web");
  });

  it("does not record switching who you are acting as", () => {
    // Not a mutation of the business's records.
    const after = reduce(seedState(), { type: "ACT_AS", personId: "usr_0001" }, NOW);
    expect(after.audit).toHaveLength(0);
    expect(isAuditable("ACT_AS")).toBe(false);
  });
});

describe("summaries a non-engineer can read", () => {
  it("says what happened, not which reducer ran", () => {
    expect(
      summarise({ type: "RECORD_ADVANCE", customer: "Shakti Industries" }),
    ).toContain("Shakti Industries");
    expect(summarise({ type: "SET_PERSON_ACTIVE", active: false })).toBe(
      "Deactivated a person",
    );
  });

  it("falls back to the action type rather than dropping the entry", () => {
    // A gap is what an auditor asks about, so an unrecognised action still
    // appears — badly labelled beats absent.
    expect(summarise({ type: "SOMETHING_NEW" })).toBe("SOMETHING_NEW");
  });

  it("never prints an empty value as a blank", () => {
    expect(summarise({ type: "CREATE_JOB", customer: "  " })).toContain("—");
  });
});

describe("the cap is stated rather than silent", () => {
  it("keeps the newest entries and drops the oldest", () => {
    let trail = [] as ReturnType<typeof append>;
    for (let n = 0; n < AUDIT_LIMIT + 10; n += 1) {
      trail = append(trail, {
        id: `a${n}`,
        at: NOW.toISOString(),
        actor: "Priya Sharma",
        action: "X",
        summary: String(n),
        origin: "web",
        occurredAt: null,
      });
    }
    expect(trail).toHaveLength(AUDIT_LIMIT);
    expect(trail[0].summary).toBe(String(AUDIT_LIMIT + 9));
  });
});

describe("whenWords", () => {
  it("reads as a date and time, not an ISO string", () => {
    expect(whenWords(NOW.toISOString())).toMatch(/Aug/);
  });

  it("returns the input rather than 'Invalid Date' when unparseable", () => {
    expect(whenWords("not a date")).toBe("not a date");
  });
});
