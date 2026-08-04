import { describe, expect, it } from "vitest";
import { reduce, seedState, type Action, type StoreState } from "./store";

/** 3 Aug 2026, a Monday, inside FY 26-27. */
const NOW = new Date("2026-08-03T10:00:00+05:30");

function run(actions: Action[], from: StoreState = seedState()): StoreState {
  return actions.reduce((state, action) => reduce(state, action, NOW), from);
}

describe("reducer is pure", () => {
  it("does not mutate the state it was given", () => {
    const before = seedState();
    const jobCount = before.board.jobs.length;
    reduce(before, { type: "CREATE_JOB", customer: "C", locality: "L", serviceType: "AC servicing", slot: "9-1", priority: "normal", technicianId: null, technicianName: null, fromLeadReference: null }, NOW);
    expect(before.board.jobs.length).toBe(jobCount);
  });

  it("seeds a fresh copy each time, so one test cannot poison another", () => {
    const a = seedState();
    a.board.jobs.pop();
    expect(seedState().board.jobs.length).toBeGreaterThan(a.board.jobs.length);
  });
});

describe("CREATE_JOB", () => {
  it("numbers the job from the branch series and the current month (FR-811)", () => {
    const state = run([
      { type: "CREATE_JOB", customer: "Grand Plaza Hotel", locality: "Connaught Place", serviceType: "AC servicing", slot: "9-1", priority: "normal", technicianId: null, technicianName: null, fromLeadReference: "L-2608-0151" },
    ]);
    // Branch prefix J, year 26, month 08, next in sequence.
    expect(state.board.jobs[0].jobNumber).toBe("J-2608-0441");
  });

  it("leaves value null rather than zero on a job nobody has quoted", () => {
    // A fabricated 0 renders as a free job on the Jobs list.
    const state = run([
      { type: "CREATE_JOB", customer: "C", locality: "L", serviceType: "S", slot: "9-1", priority: "normal", technicianId: null, technicianName: null, fromLeadReference: null },
    ]);
    expect(state.board.jobs[0].valuePaise).toBeNull();
  });

  it("increments the unassigned counter only when it is actually unassigned", () => {
    const before = seedState().board.counters.unassigned;
    const unassigned = run([
      { type: "CREATE_JOB", customer: "C", locality: "L", serviceType: "S", slot: "9-1", priority: "normal", technicianId: null, technicianName: null, fromLeadReference: null },
    ]);
    expect(unassigned.board.counters.unassigned).toBe(before + 1);

    const assigned = run([
      { type: "CREATE_JOB", customer: "C", locality: "L", serviceType: "S", slot: "9-1", priority: "normal", technicianId: "usr_0003", technicianName: "Ramesh Yadav", fromLeadReference: null },
    ]);
    expect(assigned.board.counters.unassigned).toBe(before);
    expect(assigned.board.jobs[0].status).toBe("ASSIGNED");
  });
});

describe("ASSIGN_JOB", () => {
  it("attaches the technician and moves CREATED to ASSIGNED", () => {
    const seeded = seedState();
    const target = seeded.board.jobs.find((job) => job.technician === null);
    const state = reduce(seeded, { type: "ASSIGN_JOB", jobId: target!.id, technicianId: "usr_0003", technicianName: "Ramesh Yadav" }, NOW);
    const after = state.board.jobs.find((job) => job.id === target!.id);
    expect(after?.technician?.name).toBe("Ramesh Yadav");
  });

  it("decrements the unassigned counter exactly once, never below zero", () => {
    const seeded = seedState();
    const target = seeded.board.jobs.find((job) => job.technician === null)!;
    const once = reduce(seeded, { type: "ASSIGN_JOB", jobId: target.id, technicianId: "t", technicianName: "T" }, NOW);
    const twice = reduce(once, { type: "ASSIGN_JOB", jobId: target.id, technicianId: "t2", technicianName: "T2" }, NOW);
    // Reassigning an already-assigned job must not decrement again — the
    // counter and the rows are not allowed to disagree (§6.4.1).
    expect(twice.board.counters.unassigned).toBe(
      seeded.board.counters.unassigned - 1,
    );
  });

  it("ignores an unknown job id rather than throwing", () => {
    const seeded = seedState();
    const state = reduce(seeded, { type: "ASSIGN_JOB", jobId: "nope", technicianId: "t", technicianName: "T" }, NOW);
    expect(state.board.counters.unassigned).toBe(seeded.board.counters.unassigned);
  });
});

describe("CREATE_CONTRACT", () => {
  it("derives committed visits from the recurrence, not the billing frequency", () => {
    // FR-501 and FR-505 together: alternate monthly is six visits, and billing
    // monthly does not turn it into twelve.
    const state = run([
      { type: "CREATE_CONTRACT", customer: "Grand Plaza Hotel", site: "Connaught Place", annualValuePaise: 3_60_000_00, coverage: "COMPREHENSIVE", recurrence: "ALTERNATE_MONTHLY", billing: "MONTHLY", anchorDay: 15, fromLeadReference: "L-2608-0151" },
    ]);
    expect(state.contracts[0].schedules[0].visitsCommitted).toBe(6);
    expect(state.contracts[0].billing).toBe("MONTHLY");
  });

  it("references the contract against the financial year, not the calendar year", () => {
    // August 2026 is FY 26-27.
    const state = run([
      { type: "CREATE_CONTRACT", customer: "C", site: "S", annualValuePaise: 1_00_000_00, coverage: "LABOUR_ONLY", recurrence: "MONTHLY", billing: "QUARTERLY", anchorDay: 1, fromLeadReference: null },
    ]);
    expect(state.contracts[0].reference).toBe("AMC-2627-0033");
  });

  it("starts a new contract with a full term remaining, so it is never born behind", () => {
    const state = run([
      { type: "CREATE_CONTRACT", customer: "C", site: "S", annualValuePaise: 1_00_000_00, coverage: "COMPREHENSIVE", recurrence: "MONTHLY", billing: "MONTHLY", anchorDay: 1, fromLeadReference: null },
    ]);
    const contract = state.contracts[0];
    expect(contract.daysRemaining).toBe(contract.termDays);
    expect(contract.schedules[0].visitsDone).toBe(0);
  });
});

describe("CREATE_INVOICE_FROM_JOB", () => {
  it("produces an invoice whose parts foot exactly to the grand total (FR-812)", () => {
    const seeded = seedState();
    const job = seeded.board.jobs[0];
    const state = reduce(seeded, { type: "CREATE_INVOICE_FROM_JOB", jobId: job.id }, NOW);
    const invoice = state.invoices[0];
    expect(
      invoice.taxablePaise + invoice.totalTaxPaise + invoice.roundOffPaise,
    ).toBe(invoice.grandTotalPaise);
  });

  it("rounds the grand total to whole rupees", () => {
    const seeded = seedState();
    const state = reduce(seeded, { type: "CREATE_INVOICE_FROM_JOB", jobId: seeded.board.jobs[0].id }, NOW);
    expect(state.invoices[0].grandTotalPaise % 100).toBe(0);
  });

  it("numbers invoices in the financial-year series (FR-811)", () => {
    const seeded = seedState();
    const state = reduce(seeded, { type: "CREATE_INVOICE_FROM_JOB", jobId: seeded.board.jobs[0].id }, NOW);
    expect(state.invoices[0].number).toBe("SVC/26-27/0150");
  });

  it("writes the billed total back onto the job", () => {
    // The Jobs list showed an em-dash for every unbilled job; billing one has
    // to be visible there, or the two screens disagree.
    const seeded = seedState();
    const job = seeded.board.jobs[0];
    const state = reduce(seeded, { type: "CREATE_INVOICE_FROM_JOB", jobId: job.id }, NOW);
    const after = state.board.jobs.find((candidate) => candidate.id === job.id);
    expect(after?.valuePaise).toBe(state.invoices[0].grandTotalPaise);
  });

  it("carries a plain-language place-of-supply derivation (FR-802)", () => {
    const seeded = seedState();
    const state = reduce(seeded, { type: "CREATE_INVOICE_FROM_JOB", jobId: seeded.board.jobs[0].id }, NOW);
    expect(state.invoices[0].explanation.length).toBeGreaterThan(0);
  });

  it("returns the state untouched for an unknown job", () => {
    const seeded = seedState();
    const state = reduce(seeded, { type: "CREATE_INVOICE_FROM_JOB", jobId: "nope" }, NOW);
    expect(state).toBe(seeded);
  });
});

describe("LOG_LEAD_OUTCOME", () => {
  it("takes a won lead out of the working queue", () => {
    const seeded = seedState();
    const lead = seeded.board ? seeded.leads.leads[0] : seeded.leads.leads[0];
    const state = reduce(seeded, { type: "LOG_LEAD_OUTCOME", leadId: lead.id, outcome: "Won", note: "Signed AMC", followUp: null }, NOW);
    const after = state.leads.leads.find((candidate) => candidate.id === lead.id);
    expect(after?.stage).toBe("WON");
    expect(after?.group).toBe("later");
  });

  it("keeps a live lead in its group and records the note", () => {
    const seeded = seedState();
    const lead = seeded.leads.leads[1];
    const state = reduce(seeded, { type: "LOG_LEAD_OUTCOME", leadId: lead.id, outcome: "Spoke", note: "Wants revised quote", followUp: "2026-08-05" }, NOW);
    const after = state.leads.leads.find((candidate) => candidate.id === lead.id);
    expect(after?.group).toBe(lead.group);
    expect(after?.lastActivity?.text).toBe("Wants revised quote");
  });

  it("falls back to the outcome when no note was typed", () => {
    const seeded = seedState();
    const lead = seeded.leads.leads[1];
    const state = reduce(seeded, { type: "LOG_LEAD_OUTCOME", leadId: lead.id, outcome: "No answer", note: "   ", followUp: "2026-08-05" }, NOW);
    const after = state.leads.leads.find((candidate) => candidate.id === lead.id);
    expect(after?.lastActivity?.text).toBe("No answer");
  });
});

describe("RESET", () => {
  it("returns to seed, discarding everything created", () => {
    const dirty = run([
      { type: "CREATE_JOB", customer: "C", locality: "L", serviceType: "S", slot: "9-1", priority: "normal", technicianId: null, technicianName: null, fromLeadReference: null },
      { type: "CREATE_CONTRACT", customer: "C", site: "S", annualValuePaise: 1, coverage: "COMPREHENSIVE", recurrence: "MONTHLY", billing: "MONTHLY", anchorDay: 1, fromLeadReference: null },
    ]);
    const clean = reduce(dirty, { type: "RESET" }, NOW);
    expect(clean.contracts.length).toBe(seedState().contracts.length);
    expect(clean.board.jobs.length).toBe(seedState().board.jobs.length);
    expect(clean.invoices).toEqual([]);
  });
});

describe("the full flow, end to end, as data", () => {
  it("carries a lead through contract, job, assignment and invoice", () => {
    // This is the flow Raunak asked to walk. It was previously a click-through
    // of screens that changed nothing; here it is asserted as state.
    const seeded = seedState();
    const lead = seeded.leads.leads[0];

    const state = run(
      [
        { type: "LOG_LEAD_OUTCOME", leadId: lead.id, outcome: "Won", note: "Signed annual AMC", followUp: null },
        { type: "CREATE_CONTRACT", customer: lead.name, site: lead.locality, annualValuePaise: 3_60_000_00, coverage: "COMPREHENSIVE", recurrence: "MONTHLY", billing: "QUARTERLY", anchorDay: 15, fromLeadReference: lead.reference },
        { type: "CREATE_JOB", customer: lead.name, locality: lead.locality, serviceType: "AC servicing", slot: "9-1", priority: "normal", technicianId: null, technicianName: null, fromLeadReference: lead.reference },
      ],
      seeded,
    );

    const job = state.board.jobs[0];
    const assigned = reduce(state, { type: "ASSIGN_JOB", jobId: job.id, technicianId: "usr_0003", technicianName: "Ramesh Yadav" }, NOW);
    const billed = reduce(assigned, { type: "CREATE_INVOICE_FROM_JOB", jobId: job.id }, NOW);

    expect(billed.leads.leads.find((l) => l.id === lead.id)?.stage).toBe("WON");
    expect(billed.contracts[0].customer).toBe(lead.name);
    expect(billed.contracts[0].schedules[0].visitsCommitted).toBe(12);
    expect(billed.board.jobs[0].technician?.name).toBe("Ramesh Yadav");
    expect(billed.invoices[0].jobNumber).toBe(job.jobNumber);
    expect(billed.invoices[0].grandTotalPaise).toBeGreaterThan(0);
  });
});


describe("actions dispatched before hydration are not lost", () => {
  it("replays onto the stored state rather than being overwritten by it", () => {
    // The bug this pins, exactly as it happened: a create form uses
    // `useDispatch` only, so nothing on that screen opened the vault. The
    // action applied to the SEED, then the next screen hydrated and replaced
    // the whole state with what was stored — and the work order vanished
    // between the form and the board.
    //
    // The fix replays pending actions on top of the decrypted state, which is
    // what this asserts as pure reduction: an earlier write (the contract) and
    // a later one (the job) must both survive.
    const stored = reduce(
      seedState(),
      { type: "CREATE_CONTRACT", customer: "Grand Plaza Hotel", site: "Connaught Place", annualValuePaise: 3_60_000_00, coverage: "COMPREHENSIVE", recurrence: "MONTHLY", billing: "QUARTERLY", anchorDay: 15, fromLeadReference: "L-2608-0151" },
      NOW,
    );

    // Dispatched against the seed while the vault was still opening.
    const optimistic: Action = { type: "CREATE_JOB", customer: "Grand Plaza Hotel", locality: "Connaught Place", serviceType: "AC servicing", slot: "9-1", priority: "normal", technicianId: null, technicianName: null, fromLeadReference: "L-2608-0151" };

    const replayed = reduce(stored, optimistic, NOW);

    expect(replayed.contracts.length).toBe(seedState().contracts.length + 1);
    expect(replayed.board.jobs.length).toBe(seedState().board.jobs.length + 1);
    expect(replayed.board.jobs[0].customer).toBe("Grand Plaza Hotel");
  });
});
