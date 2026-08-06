import { describe, expect, it } from "vitest";
import {
  assignable,
  fitFor,
  matchesQuery,
  nextPersonId,
  rankForJob,
  type Person,
} from "./people";

function person(over: Partial<Person> = {}): Person {
  return {
    id: "usr_0003",
    name: "Ramesh Yadav",
    phone: "9811000003",
    email: null,
    role: "technician",
    languageOverride: null,
    active: true,
    skills: ["AC", "Refrigeration"],
    localities: ["Okhla Phase II", "Saket"],
    ...over,
  };
}

const AC_IN_OKHLA = { serviceType: "AC repair", locality: "Okhla Phase II" };

describe("who can be assigned", () => {
  it("offers active technicians only", () => {
    const people = [
      person({ id: "a" }),
      person({ id: "b", active: false }),
      person({ id: "c", role: "coordinator" }),
      person({ id: "d", role: "owner" }),
    ];
    expect(assignable(people).map((p) => p.id)).toEqual(["a"]);
  });
});

describe("search — what a person actually types", () => {
  it("matches on name, skill and locality", () => {
    expect(matchesQuery(person(), "ramesh")).toBe(true);
    expect(matchesQuery(person(), "refriger")).toBe(true);
    expect(matchesQuery(person(), "okhla")).toBe(true);
  });

  it("matches a phone number however it is typed", () => {
    expect(matchesQuery(person({ phone: "98110 00003" }), "9811000003")).toBe(
      true,
    );
    expect(matchesQuery(person({ phone: "9811000003" }), "000003")).toBe(true);
  });

  it("ignores a one- or two-digit numeric fragment", () => {
    // Otherwise typing "1" matches nearly every number in the directory and the
    // filter appears not to work at all.
    expect(matchesQuery(person({ name: "Zed", skills: [], localities: [] }), "98")).toBe(
      false,
    );
  });

  it("an empty query matches everyone", () => {
    expect(matchesQuery(person(), "   ")).toBe(true);
  });
});

describe("fit — and why", () => {
  it("disqualifies someone who cannot do the work", () => {
    const fit = fitFor(person({ skills: ["Plumbing"] }), AC_IN_OKHLA, 0);
    expect(fit.score).toBeNull();
    expect(fit.reasons).toContain("cannot do this work");
  });

  it("treats no skills recorded as unknown, not unqualified", () => {
    // The office simply has not filled him in. Hiding him would hide a real
    // person from a real job.
    const fit = fitFor(person({ skills: [] }), AC_IN_OKHLA, 0);
    expect(fit.score).toBe(0);
    expect(fit.reasons).toContain("no skills recorded");
  });

  it("rewards someone already working that area", () => {
    const local = fitFor(person(), AC_IN_OKHLA, 0);
    const away = fitFor(person({ localities: ["Rohini"] }), AC_IN_OKHLA, 0);
    expect(local.score!).toBeGreaterThan(away.score!);
    expect(local.reasons).toContain("already in Okhla Phase II");
  });

  it("prefers the lighter day when skill and area are equal", () => {
    const free = fitFor(person(), AC_IN_OKHLA, 0);
    const loaded = fitFor(person(), AC_IN_OKHLA, 5);
    expect(free.score!).toBeGreaterThan(loaded.score!);
    expect(free.reasons).toContain("free today");
    expect(loaded.reasons).toContain("5 jobs today");
  });

  it("states a reason for every ranking it makes", () => {
    // A ranked list that will not say why is a list people stop trusting.
    for (const skills of [["AC"], ["Plumbing"], []]) {
      expect(fitFor(person({ skills }), AC_IN_OKHLA, 1).reasons.length)
        .toBeGreaterThan(0);
    }
  });
});

describe("ranking a real bench", () => {
  const bench = [
    person({ id: "loaded", name: "Loaded", skills: ["AC"], localities: [] }),
    person({ id: "local", name: "Local", skills: ["AC"] }),
    person({ id: "wrong", name: "Wrong skill", skills: ["Plumbing"] }),
    person({ id: "off", name: "Off strength", active: false }),
  ];
  const load = (id: string) => (id === "loaded" ? 6 : 0);

  it("puts the best fit first", () => {
    expect(rankForJob(bench, AC_IN_OKHLA, load)[0].person.id).toBe("local");
  });

  it("sinks someone who cannot do the work but never hides them", () => {
    const ranked = rankForJob(bench, AC_IN_OKHLA, load);
    // The dispatcher may know something the skill list does not.
    expect(ranked.at(-1)!.person.id).toBe("wrong");
    expect(ranked.map((f) => f.person.id)).toContain("wrong");
  });

  it("leaves inactive people out entirely", () => {
    expect(rankForJob(bench, AC_IN_OKHLA, load).map((f) => f.person.id))
      .not.toContain("off");
  });
});

describe("new ids continue the tenant's own numbering", () => {
  it("takes the highest and adds one", () => {
    expect(
      nextPersonId([person({ id: "usr_0003" }), person({ id: "usr_0011" })]),
    ).toBe("usr_0012");
  });

  it("starts at 1 for an empty directory", () => {
    expect(nextPersonId([])).toBe("usr_0001");
  });
});

describe("a bench of fifty", () => {
  // The question this whole change came from: the picker was a row of chips,
  // written against a fixture that happened to hold four people.
  const bench: Person[] = Array.from({ length: 50 }, (_, i) =>
    person({
      id: `usr_${String(i + 100).padStart(4, "0")}`,
      name: `Technician ${i + 1}`,
      phone: `98110${String(10000 + i)}`,
      skills: i % 3 === 0 ? ["AC"] : i % 3 === 1 ? ["Generator"] : [],
      localities: i % 5 === 0 ? ["Okhla Phase II"] : ["Rohini"],
    }),
  );

  it("ranks the whole bench without dropping anyone", () => {
    const ranked = rankForJob(bench, AC_IN_OKHLA, () => 0);
    expect(ranked).toHaveLength(50);
  });

  it("puts skill-plus-area at the top and the unqualified at the bottom", () => {
    const ranked = rankForJob(bench, AC_IN_OKHLA, () => 0);
    expect(ranked[0].reasons).toContain("already in Okhla Phase II");
    expect(ranked[0].reasons).toContain("has the skill");
    expect(ranked.at(-1)!.score).toBeNull();
  });

  it("narrows to a handful on a typed query", () => {
    // Ten rows are shown; the rest have to be reachable by typing, or a
    // fifty-person bench is a wall.
    const byName = bench.filter((p) => matchesQuery(p, "Technician 4"));
    expect(byName.length).toBeLessThan(15);
    const byPhone = bench.filter((p) => matchesQuery(p, "10007"));
    expect(byPhone).toHaveLength(1);
  });

  it("still surfaces someone with no skills recorded", () => {
    const ranked = rankForJob(bench, AC_IN_OKHLA, () => 0);
    const unknown = ranked.filter((f) => f.reasons.includes("no skills recorded"));
    expect(unknown.length).toBeGreaterThan(0);
    // Above the actively-unqualified, below the qualified.
    expect(unknown.every((f) => f.score === 0)).toBe(true);
  });
});
