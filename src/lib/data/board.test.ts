import { describe, expect, it } from "vitest";
import {
  assignCandidates,
  hasSkillFor,
  recommendTechnician,
  restOfDay,
  slotStartHour,
  triageJobs,
  triageReason,
  type JobRow,
  type Technician,
} from "./board";

function job(over: Partial<JobRow> = {}): JobRow {
  return {
    id: "j",
    jobNumber: "J-2608-0001",
    slot: "9-1",
    customer: "C",
    locality: "Okhla Phase II",
    serviceType: "AC breakdown",
    visit: null,
    status: "CREATED",
    technician: null,
    priority: "breakdown",
    sla: null,
    visitAttempt: 1,
    valuePaise: null,
    ...over,
  };
}

function tech(over: Partial<Technician> = {}): Technician {
  return {
    id: "t",
    name: "T",
    jobsToday: 0,
    status: { kind: "free", since: null },
    localities: [],
    skills: ["AC"],
    ...over,
  };
}

describe("skill matching", () => {
  it("matches a skill token inside the service type", () => {
    expect(hasSkillFor(tech({ skills: ["AC"] }), job())).toBe(true);
    expect(
      hasSkillFor(tech({ skills: ["Refrigeration"] }), job()),
    ).toBe(false);
  });

  it("is case-insensitive both ways", () => {
    expect(
      hasSkillFor(
        tech({ skills: ["water treatment"] }),
        job({ serviceType: "Water Treatment plant service" }),
      ),
    ).toBe(true);
  });
});

describe("recommendTechnician (§6.13.2, §6.4.2)", () => {
  it("never recommends someone on leave", () => {
    const onLeave = tech({
      id: "leave",
      status: { kind: "leave", since: null },
      jobsToday: 0,
    });
    // Only candidate, and still not recommended — leave is a hard exclusion.
    expect(recommendTechnician(job(), [onLeave])).toBeNull();
  });

  it("prefers the skilled busy technician over the free unskilled one", () => {
    // The case that makes load-only ranking wrong: sending the free generator
    // technician to an AC breakdown is a callback, not an assignment.
    const skilledBusy = tech({ id: "skilled", skills: ["AC"], jobsToday: 5 });
    const freeUnskilled = tech({
      id: "free",
      skills: ["Generator"],
      jobsToday: 0,
    });
    expect(recommendTechnician(job(), [skilledBusy, freeUnskilled])).toBe(
      "skilled",
    );
  });

  it("prefers a technician already working the job's locality", () => {
    // §6.4.2: clustering is most of a dispatcher's craft.
    const nearby = tech({
      id: "nearby",
      localities: ["Okhla Phase II"],
      jobsToday: 4,
    });
    const across = tech({ id: "across", localities: ["Rohini"], jobsToday: 1 });
    expect(recommendTechnician(job(), [nearby, across])).toBe("nearby");
  });

  it("falls back to the lighter load when locality does not separate them", () => {
    const busy = tech({ id: "busy", jobsToday: 5 });
    const light = tech({ id: "light", jobsToday: 1 });
    expect(recommendTechnician(job(), [busy, light])).toBe("light");
  });

  it("recommends nobody when no one has the skill", () => {
    // Honest silence: with no recommendation, no button is filled and the
    // coordinator is told this needs a human judgement.
    const wrong = tech({ id: "a", skills: ["Generator"] });
    expect(recommendTechnician(job(), [wrong])).toBeNull();
  });

  it("recommends nobody on a dead tie, rather than letting array order decide", () => {
    const a = tech({ id: "a", jobsToday: 2, localities: ["Okhla Phase II"] });
    const b = tech({ id: "b", jobsToday: 2, localities: ["Okhla Phase II"] });
    expect(recommendTechnician(job(), [a, b])).toBeNull();
  });

  it("still recommends when a tie is broken by locality", () => {
    const near = tech({ id: "near", jobsToday: 2, localities: ["Okhla Phase II"] });
    const far = tech({ id: "far", jobsToday: 2, localities: [] });
    expect(recommendTechnician(job(), [near, far])).toBe("near");
  });
});

describe("triage — what is actually on her plate", () => {
  it("returns null for a job that is simply going fine", () => {
    expect(
      triageReason(
        job({ technician: { id: "t", name: "T" }, status: "EN_ROUTE" }),
      ),
    ).toBeNull();
  });

  it("reads a late job as late even when it is also unassigned", () => {
    // The lateness is the fact that changes what she says on the phone, so it
    // wins over the missing assignment.
    expect(
      triageReason(
        job({ technician: null, sla: { word: "Late 2h", kind: "late" } }),
      ),
    ).toBe("late");
  });

  it("flags parts-blocked only when someone is already assigned", () => {
    expect(
      triageReason(
        job({ technician: { id: "t", name: "T" }, status: "PARTS_AWAITED" }),
      ),
    ).toBe("blocked");
  });

  it("does not flag a job that is done", () => {
    expect(
      triageReason(
        job({ technician: { id: "t", name: "T" }, status: "SIGNED_OFF" }),
      ),
    ).toBeNull();
  });

  it("sorts late before unassigned before blocked", () => {
    const late = job({
      id: "late",
      technician: { id: "t", name: "T" },
      sla: { word: "Late 1d", kind: "late" },
    });
    const unassigned = job({ id: "unassigned", technician: null });
    const blocked = job({
      id: "blocked",
      technician: { id: "t", name: "T" },
      status: "PARTS_AWAITED",
    });
    expect(triageJobs([blocked, unassigned, late]).map((e) => e.job.id)).toEqual(
      ["late", "unassigned", "blocked"],
    );
  });

  it("ranks a breakdown above an urgent within the same reason", () => {
    const normal = job({ id: "normal", priority: "normal", technician: null });
    const breakdown = job({
      id: "breakdown",
      priority: "breakdown",
      technician: null,
    });
    expect(triageJobs([normal, breakdown]).map((e) => e.job.id)).toEqual([
      "breakdown",
      "normal",
    ]);
  });

  it("keeps a late normal job above an unassigned breakdown", () => {
    // Reason outranks priority: the late one already has a customer waiting.
    const lateNormal = job({
      id: "late-normal",
      priority: "normal",
      technician: { id: "t", name: "T" },
      sla: { word: "Late 3h", kind: "late" },
    });
    const unassignedBreakdown = job({
      id: "unassigned-breakdown",
      priority: "breakdown",
      technician: null,
    });
    expect(
      triageJobs([unassignedBreakdown, lateNormal]).map((e) => e.job.id),
    ).toEqual(["late-normal", "unassigned-breakdown"]);
  });
});

describe("the rest of the day", () => {
  const fine = (over: Partial<JobRow>) =>
    job({ technician: { id: "t", name: "T" }, status: "EN_ROUTE", ...over });

  it("excludes everything the triage band already shows", () => {
    const groups = restOfDay([
      fine({ id: "ok", slot: "9-1" }),
      job({ id: "unassigned", slot: "9-1", technician: null }),
    ]);
    expect(groups.flatMap((g) => g.jobs).map((j) => j.id)).toEqual(["ok"]);
  });

  it("orders slots by the shape of the working day, not alphabetically", () => {
    const groups = restOfDay([
      fine({ id: "e", slot: "5-8" }),
      fine({ id: "m", slot: "9-1" }),
      fine({ id: "a", slot: "1-5" }),
    ]);
    expect(groups.map((g) => g.slot)).toEqual(["9-1", "1-5", "5-8"]);
  });

  it("files an exact time among the windows by its own hour", () => {
    // 11:30 is a morning job and belongs with the morning, not in a bucket of
    // its own at the end of the day.
    const groups = restOfDay([
      fine({ id: "a", slot: "1-5" }),
      fine({ id: "x", slot: "11:30" }),
    ]);
    expect(groups.map((g) => g.slot)).toEqual(["11:30", "1-5"]);
  });

  it("reads 1-5 as the afternoon rather than one in the morning", () => {
    expect(slotStartHour("9-1")).toBe(9);
    expect(slotStartHour("1-5")).toBe(13);
    expect(slotStartHour("5-8")).toBe(17);
    expect(slotStartHour("11:30")).toBe(11);
  });
});

describe("assignment candidates, offered inside the row", () => {
  it("never offers someone on leave", () => {
    const away = tech({ id: "away", status: { kind: "leave", since: null } });
    expect(
      assignCandidates(job(), [away, tech({ id: "here" })]).map(
        (c) => c.tech.id,
      ),
    ).toEqual(["here"]);
  });

  it("puts the skilled technician first, then the one already in the area", () => {
    const wrongSkill = tech({ id: "wrong", skills: ["Plumbing"] });
    const skilledFar = tech({ id: "far", skills: ["AC"] });
    const skilledNear = tech({
      id: "near",
      skills: ["AC"],
      localities: ["Okhla Phase II"],
    });
    expect(
      assignCandidates(job(), [wrongSkill, skilledFar, skilledNear]).map(
        (c) => c.tech.id,
      ),
    ).toEqual(["near", "far", "wrong"]);
  });

  it("still offers the unskilled technician rather than hiding him", () => {
    // Sometimes he is the only body available; hiding him makes the product
    // look broken rather than opinionated.
    const only = tech({ id: "only", skills: ["Plumbing"] });
    const candidates = assignCandidates(job(), [only]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].skilled).toBe(false);
  });

  it("breaks a tie on the lighter load", () => {
    const busy = tech({ id: "busy", jobsToday: 5 });
    const light = tech({ id: "light", jobsToday: 1 });
    expect(
      assignCandidates(job(), [busy, light]).map((c) => c.tech.id),
    ).toEqual(["light", "busy"]);
  });
});

describe("skill coverage beyond the literal word", () => {
  // Regression: the triage board reported that nobody in the firm could do
  // three of the day's jobs, because a refrigeration technician did not
  // literally match the words "Chiller AMC".
  it("covers chillers, cold rooms and freezers with refrigeration", () => {
    const fridge = tech({ skills: ["Refrigeration"] });
    for (const serviceType of [
      "Chiller AMC",
      "Cold room AMC",
      "Deep freezer repair",
    ]) {
      expect(hasSkillFor(fridge, job({ serviceType }))).toBe(true);
    }
  });

  it("covers a water purifier with water treatment", () => {
    expect(
      hasSkillFor(
        tech({ skills: ["Water treatment"] }),
        job({ serviceType: "Water purifier service" }),
      ),
    ).toBe(true);
  });

  it("does not over-match — refrigeration is not an AC skill", () => {
    expect(
      hasSkillFor(
        tech({ skills: ["Refrigeration"] }),
        job({ serviceType: "AC breakdown" }),
      ),
    ).toBe(false);
  });

  it("does not read the 'ac' in 'AMC' as air conditioning", () => {
    expect(
      hasSkillFor(tech({ skills: ["AC"] }), job({ serviceType: "Generator AMC" })),
    ).toBe(false);
  });
});
