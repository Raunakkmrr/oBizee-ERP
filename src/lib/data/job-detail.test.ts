import { describe, expect, it } from "vitest";
import {
  canBillNow,
  primaryActionFor,
  stageFor,
  type JobDetail,
} from "./job-detail";

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

function detail(over: Partial<JobDetail> = {}): JobDetail {
  return {
    id: "j",
    jobNumber: "J-2608-0421",
    status: "WORK_DONE",
    statusSince: "2 hours",
    priority: "normal",
    customer: "Deshmukh Hospital",
    serviceType: "Generator AMC",
    visit: null,
    technician: { id: "u3", name: "Ramesh Yadav" },
    valuePaise: 1085600,
    site: {
      addressLine: "Block C",
      landmark: null,
      locality: "Saket",
      pincode: "110017",
      mapQuery: "",
      accessNotes: null,
      contacts: [],
    },
    asset: null,
    timeline: [],
    parts: [],
    signOff: null,
    invoiceNumber: null,
    ...over,
  };
}

const STRICT = { allowBillingWithoutSignoff: false };
const LENIENT = { allowBillingWithoutSignoff: true };

describe("stageFor — the screen reshapes with the job", () => {
  it("asks who is going when nobody is assigned", () => {
    const stage = stageFor(
      detail({ status: "SCHEDULED", technician: null }),
      STRICT,
    );
    expect(stage.key).toBe("unassigned");
    expect(stage.question).toBe("Who is going?");
    // The address is the job before anyone is on their way to it.
    expect(stage.lead[0]).toBe("where");
  });

  it("leads with the address before the visit and with the timeline after", () => {
    expect(stageFor(detail({ status: "ASSIGNED" }), STRICT).lead[0]).toBe(
      "where",
    );
    expect(stageFor(detail({ status: "WORK_DONE" }), STRICT).lead[0]).toBe(
      "timeline",
    );
  });

  it("asks whether it can be billed once the work is finished", () => {
    const stage = stageFor(detail({ status: "WORK_DONE" }), STRICT);
    expect(stage.key).toBe("to_bill");
    expect(stage.question).toBe("Can you bill this?");
  });

  it("treats an unsigned job as pending, never as failed", () => {
    // A customer who has not signed yet has not refused.
    const stage = stageFor(detail({ status: "WORK_DONE" }), STRICT);
    const signature = stage.checks.find((c) => c.label.includes("sign"));
    expect(signature?.state).toBe("pending");
  });

  it("says what the tenant's own policy means for the signature", () => {
    const strict = stageFor(detail(), STRICT).checks.at(-1);
    const lenient = stageFor(detail(), LENIENT).checks.at(-1);
    expect(strict?.detail).toMatch(/Required/);
    expect(lenient?.detail).toMatch(/allow billing anyway/);
  });

  it("puts a blocked job's question ahead of its status", () => {
    const stage = stageFor(detail({ status: "PARTS_AWAITED" }), STRICT);
    expect(stage.key).toBe("blocked");
    expect(stage.checks[0].state).toBe("blocked");
  });

  it("stops asking anything once the job is billed", () => {
    const stage = stageFor(
      detail({ status: "SIGNED_OFF", invoiceNumber: "SVC/26-27/0150" }),
      STRICT,
    );
    expect(stage.key).toBe("billed");
    expect(stage.checks[0].detail).toBe("SVC/26-27/0150");
  });
});

describe("canBillNow — never offer what the settings forbid", () => {
  it("allows billing a signed job under either policy", () => {
    const signed = detail({
      status: "SIGNED_OFF",
      signOff: {
        signerName: "Dr. Rao",
        at: "5 Aug, 11:40 am",
        rating: 5,
        signatureUploaded: true,
      },
    });
    expect(canBillNow(signed, STRICT)).toBe(true);
    expect(canBillNow(signed, LENIENT)).toBe(true);
  });

  it("refuses an unsigned job when the tenant requires a sign-off", () => {
    expect(canBillNow(detail({ status: "WORK_DONE" }), STRICT)).toBe(false);
  });

  it("allows an unsigned job when the tenant permits it (FR-1303)", () => {
    expect(canBillNow(detail({ status: "WORK_DONE" }), LENIENT)).toBe(true);
  });

  it("never offers to bill a job twice", () => {
    const billed = detail({ invoiceNumber: "SVC/26-27/0150" });
    expect(canBillNow(billed, LENIENT)).toBe(false);
  });

  it("refuses a job that is still in progress", () => {
    expect(canBillNow(detail({ status: "ON_SITE" }), LENIENT)).toBe(false);
  });
});
