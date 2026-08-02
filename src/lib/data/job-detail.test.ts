import { describe, expect, it } from "vitest";
import { primaryActionFor } from "./job-detail";

/**
 * §6.5.3 promises "exactly one [primary action], always the same colour and
 * position, so muscle memory works". Muscle memory only forms if the mapping is
 * stable, so it is pinned here rather than left to a switch nobody re-reads.
 */
describe("primaryActionFor — §6.5.3", () => {
  it("maps each state to the action the office can actually take", () => {
    expect(primaryActionFor("CREATED")?.label).toBe("Schedule");
    expect(primaryActionFor("SCHEDULED")?.label).toBe("Assign technician");
    expect(primaryActionFor("PARTS_AWAITED")?.label).toBe("Schedule revisit");
    expect(primaryActionFor("CUSTOMER_UNAVAILABLE")?.label).toBe("Reschedule");
    expect(primaryActionFor("WORK_DONE")?.label).toBe("Send sign-off link");
    expect(primaryActionFor("SIGNED_OFF")?.label).toBe("Create invoice");
    expect(primaryActionFor("INVOICED")?.label).toBe("Send payment reminder");
  });

  it("offers 'Call technician' for every in-flight state", () => {
    // While work is in progress the office cannot do the work — calling the
    // technician is its only useful action, so all four states agree.
    for (const state of ["ASSIGNED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS"]) {
      expect(primaryActionFor(state)?.label, state).toBe("Call technician");
    }
  });

  it("gives finished jobs NO primary action", () => {
    // §6.5.3: follow-up is "secondary only; no primary". Offering a primary
    // action on a finished job invents work.
    expect(primaryActionFor("PAID")).toBeNull();
    expect(primaryActionFor("CLOSED")).toBeNull();
  });

  it("returns null rather than guessing for an unknown state", () => {
    expect(primaryActionFor("NOT_A_STATE")).toBeNull();
  });

  it("never returns more than one action", () => {
    // The type makes this structural — there is no array to accidentally fill —
    // but the test documents why the type is shaped that way.
    const action = primaryActionFor("SIGNED_OFF");
    expect(action).not.toBeNull();
    expect(Array.isArray(action)).toBe(false);
  });
});
