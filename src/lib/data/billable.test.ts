import { describe, expect, it } from "vitest";
import { alreadyBilled, billableJobs, nothingToBillReason } from "./billable";
import { latestInvoice, reduce, seedState } from "./store";
import type { JobRow } from "./board";

const NOW = new Date("2026-08-07T09:00:00");

const job = (over: Partial<JobRow> = {}): JobRow => ({
  id: "job_x",
  jobNumber: "J-2608-0500",
  slot: "9-1",
  customer: "Shakti Industries",
  locality: "Okhla Phase II",
  serviceType: "AC repair",
  visit: null,
  status: "SIGNED_OFF",
  technician: null,
  priority: "normal",
  sla: null,
  visitAttempt: 1,
  valuePaise: 5_000_00,
  visitKey: null,
  ...over,
});

describe("billableJobs", () => {
  it("offers work that is finished", () => {
    expect(billableJobs([job()], [])).toHaveLength(1);
    expect(billableJobs([job({ status: "WORK_DONE" })], [])).toHaveLength(1);
  });

  it("does not offer work still in progress", () => {
    for (const status of ["CREATED", "ASSIGNED", "EN_ROUTE", "ON_SITE", "PARTS_AWAITED"]) {
      expect(billableJobs([job({ status })], []), status).toHaveLength(0);
    }
  });

  it("drops a job once an invoice points at it", () => {
    // The duplicate the customer notices before the office does.
    const state = reduce(seedState(), { type: "CREATE_INVOICE_FROM_JOB", jobId: seedState().board.jobs[0].id }, NOW);
    const billedJob = state.board.jobs[0];
    expect(billableJobs([billedJob], state.invoices)).toHaveLength(0);
  });

  it("says why each job is on the list", () => {
    expect(billableJobs([job({ status: "SIGNED_OFF" })], [])[0].reason).toContain(
      "Signed off",
    );
    expect(billableJobs([job({ status: "WORK_DONE" })], [])[0].reason).toContain(
      "not yet signed",
    );
  });
});

describe("alreadyBilled", () => {
  it("counts finished work that has an invoice", () => {
    const seeded = seedState();
    const target = seeded.board.jobs.find((row) => row.status === "SIGNED_OFF");
    if (!target) return;
    const state = reduce(seeded, { type: "CREATE_INVOICE_FROM_JOB", jobId: target.id }, NOW);
    expect(alreadyBilled(state.board.jobs, state.invoices)).toBeGreaterThan(0);
  });
});

describe("nothingToBillReason", () => {
  it("distinguishes 'no work' from 'all of it billed'", () => {
    // An empty state that does not say which kind of empty is a dead end.
    expect(nothingToBillReason(0, 0)).toContain("No completed jobs");
    expect(nothingToBillReason(0, 4)).toContain("already billed — 4");
  });
});

describe("CREATE_ADHOC_INVOICE", () => {
  const lines = [
    {
      description: "Counter sale — 2 kg R32 refrigerant",
      code: "3824",
      kind: "goods" as const,
      qty: 2,
      ratePaise: 1_200_00,
      ratePercent: 18,
    },
  ];

  it("derives its tax head from the customer's site like any other invoice", () => {
    // Sunrise is registered in Haryana against a Delhi branch.
    const state = reduce(
      seedState(),
      { type: "CREATE_ADHOC_INVOICE", customer: "Sunrise Apartments RWA", lines },
      NOW,
    );
    const invoice = latestInvoice(state)!;
    expect(invoice.head).toBe("IGST");
    expect(invoice.jobId).toBeNull();
    expect(invoice.contractId).toBeNull();
  });

  it("takes a number from the same statutory series", () => {
    const state = reduce(
      seedState(),
      { type: "CREATE_ADHOC_INVOICE", customer: "Shakti Industries", lines },
      NOW,
    );
    expect(latestInvoice(state)!.number).toBe("SVC/26-27/0150");
  });

  it("refuses to create an invoice with no lines", () => {
    const before = seedState();
    const after = reduce(
      before,
      { type: "CREATE_ADHOC_INVOICE", customer: "Shakti Industries", lines: [] },
      NOW,
    );
    expect(after).toBe(before);
  });

  it("foots exactly, like every other invoice", () => {
    const state = reduce(
      seedState(),
      { type: "CREATE_ADHOC_INVOICE", customer: "Shakti Industries", lines },
      NOW,
    );
    const invoice = latestInvoice(state)!;
    expect(
      invoice.taxablePaise + invoice.totalTaxPaise + invoice.roundOffPaise,
    ).toBe(invoice.grandTotalPaise);
    expect(invoice.grandTotalPaise % 100).toBe(0);
  });
});

describe("a customer with two sites in two states", () => {
  const raise = (locality: string) => {
    const withJob = reduce(
      seedState(),
      {
        type: "CREATE_JOB",
        customer: "Shakti Industries",
        locality,
        serviceType: "AC servicing",
        slot: "9-1",
        priority: "normal",
        technicianId: null,
        technicianName: null,
        fromLeadReference: null,
      },
      NOW,
    );
    const created = withJob.board.jobs[0];
    return latestInvoice(
      reduce(withJob, { type: "CREATE_INVOICE_FROM_JOB", jobId: created.id }, NOW),
    )!;
  };

  it("bills the Delhi plant as CGST+SGST", () => {
    expect(raise("Okhla Phase II").head).toBe("CGST_SGST");
  });

  it("bills the Maharashtra unit as IGST", () => {
    /*
      The same customer, the same branch, a different site — and a different
      return. This is why the job form picks a site rather than accepting a
      typed locality: the site is what carries the state.
    */
    const invoice = raise("Butibori");
    expect(invoice.head).toBe("IGST");
    expect(invoice.billTo?.siteStateCode).toBe("27");
    expect(invoice.explanation).toContain("Maharashtra");
  });
});
