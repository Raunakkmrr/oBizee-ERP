import { describe, expect, it } from "vitest";
import {
  hasSkillFor,
  recommendTechnician,
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
