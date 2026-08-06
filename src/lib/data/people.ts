import { z } from "zod";
import { LEVELS_BY_ROLE, ROLES, type Role } from "@/lib/roles";

/**
 * One record per human — FR-1301, and the fix for a split that could silently
 * lie.
 *
 * **What was wrong.** The same person existed twice, in two different shapes:
 * `SeedUser` in the tenant fixture (id, name, phone, role, active) and
 * `Technician` on the board (skills, localities, jobsToday, status). Nothing
 * joined them. Adding a technician through Settings would not have put them on
 * the board at all, because the board read a different list — and the phone
 * lookup that Call technician depends on matched them by `id` and worked by
 * luck rather than by design.
 *
 * So there is one `Person`. Skills and localities live here, because they are
 * facts about the human and not about today. Everything the board shows that is
 * *about today* — how many jobs, where he is right now — is derived, never
 * stored twice.
 */

export const SKILLS = [
  "AC",
  "Refrigeration",
  "Generator",
  "Electrical",
  "Water treatment",
  "Plumbing",
  "Fire safety",
] as const;

export type Skill = (typeof SKILLS)[number];

/**
 * Where somebody sits inside their role — **one dropdown, not more roles.**
 *
 * The ladders live in `LEVELS_BY_ROLE` beside the permissions they affect, so
 * "which level?" is answered once, inside the role, rather than by adding a
 * role tag per rung. A department has one tag; the rungs are a question you
 * answer after picking it.
 *
 * `null` where the role has no ladder, and for anyone nobody has placed yet —
 * which is unknown, not the bottom rung.
 */
export function levelsFor(role: string): readonly string[] {
  return LEVELS_BY_ROLE[role as Role] ?? [];
}

/**
 * Work an apprentice should not be sent to on their own.
 *
 * A breakdown is unplanned and usually in front of an unhappy customer; it is
 * the visit where being alone and inexperienced costs the most. Urgent work is
 * the same problem with a clock on it. Routine servicing is exactly how an
 * apprentice learns, so it is not restricted.
 */
export function needsSupervision(
  level: string | null,
  priority: "normal" | "urgent" | "breakdown",
): boolean {
  return level === "apprentice" && priority !== "normal";
}

export const personSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  /**
   * Phone is the primary credential — §9.4 makes phone + OTP the main method,
   * because this market's users do not reliably have or remember email.
   */
  phone: z.string().min(1),
  /** Optional: only desktop roles reliably have one (§9.4). */
  email: z.string().nullable(),
  role: z.enum(ROLES),
  /** Per-user override on the role default (FR-1304). Null = role default. */
  languageOverride: z.string().nullable(),
  active: z.boolean(),
  /**
   * What this person can be sent to. Empty for office roles, and empty for a
   * technician nobody has filled in yet — which is a real state the assignment
   * picker has to handle rather than pretend away.
   */
  skills: z.array(z.string()),
  /** Areas they normally cover. Used to cluster a day's work, not to restrict. */
  localities: z.array(z.string()),
  /** The rung inside the role. See `LEVELS_BY_ROLE`. */
  level: z.string().nullable(),
});

export type Person = z.infer<typeof personSchema>;

export function isTechnician(person: Person): boolean {
  return person.role === "technician";
}

/** Assignable today: a technician who is on the strength. */
export function assignable(people: readonly Person[]): Person[] {
  return people.filter((person) => isTechnician(person) && person.active);
}

/**
 * Free-text match across the fields somebody would actually type.
 *
 * Name, phone and skill — not email, because nobody searches a colleague by
 * email in a phone-first product, and matching it would surface confusing hits
 * on a shared domain.
 */
export function matchesQuery(person: Person, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  const digits = needle.replace(/\D/g, "");
  return (
    person.name.toLowerCase().includes(needle) ||
    (digits.length >= 3 && person.phone.replace(/\D/g, "").includes(digits)) ||
    person.skills.some((skill) => skill.toLowerCase().includes(needle)) ||
    person.localities.some((place) => place.toLowerCase().includes(needle))
  );
}

/**
 * How well one technician fits one job, and **why** — the reason is returned
 * with the score because a ranked list that will not say why it ranked is a
 * list people stop trusting.
 *
 * Scoring, in the order a dispatcher actually thinks:
 *  1. Can he do it at all? A missing skill is disqualifying, not a penalty.
 *  2. Is he already in that area? Clustering saves the most time in a city.
 *  3. How loaded is he today? Ties break toward the lighter day.
 */
export type Fit = {
  person: Person;
  /** Higher is better. `null` when the person cannot do this work at all. */
  score: number | null;
  reasons: string[];
};

export function fitFor(
  person: Person,
  job: { serviceType: string; locality: string; priority?: "normal" | "urgent" | "breakdown" },
  jobsToday: number,
): Fit {
  const reasons: string[] = [];
  const supervise = needsSupervision(person.level, job.priority ?? "normal");

  const hasSkill =
    person.skills.length > 0 &&
    person.skills.some(
      (skill) =>
        job.serviceType.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(job.serviceType.toLowerCase()),
    );

  // A technician with no skills recorded is *unknown*, not unqualified — the
  // office has simply not filled him in, and refusing to offer him would hide a
  // real person from a real job.
  if (person.skills.length === 0) {
    reasons.push("no skills recorded");
    return { person, score: 0, reasons };
  }

  if (!hasSkill) {
    return { person, score: null, reasons: ["cannot do this work"] };
  }
  reasons.push("has the skill");

  let score = 10;
  if (person.localities.includes(job.locality)) {
    score += 5;
    reasons.push(`already in ${job.locality}`);
  }

  // Each job already on his plate costs a point, so a free technician outranks
  // a loaded one of equal skill.
  score -= Math.min(jobsToday, 8);
  reasons.push(jobsToday === 0 ? "free today" : `${jobsToday} jobs today`);

  if (supervise) {
    // Ranked down rather than removed: sending an apprentice with a senior is
    // normal and is how they learn. The picker's job is to say so, not to
    // decide for the dispatcher.
    score -= 12;
    reasons.push("apprentice — not to be sent alone");
  }

  return { person, score, reasons };
}

/** Best fit first; people who cannot do the work sink but are not removed. */
export function rankForJob(
  people: readonly Person[],
  job: {
    serviceType: string;
    locality: string;
    priority?: "normal" | "urgent" | "breakdown";
  },
  loadFor: (personId: string) => number,
): Fit[] {
  return assignable(people)
    .map((person) => fitFor(person, job, loadFor(person.id)))
    .sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      // Unqualified always last, never hidden — the dispatcher may still know
      // something the skill list does not.
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    });
}

/** `usr_0009` — continues the tenant fixture's own numbering. */
export function nextPersonId(people: readonly Person[]): string {
  const highest = people.reduce((max, person) => {
    const n = Number.parseInt(person.id.replace(/\D/g, ""), 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `usr_${String(highest + 1).padStart(4, "0")}`;
}

export type { Role };

/* ------------------------------------------------------------------ guards */

/**
 * Whether a change to the directory is safe, and what to say about it.
 *
 * Three outcomes, not two. `block` is for a change with **no way back through
 * the product** — the reader would have to clear browser storage or call
 * support. `warn` is for a change that is recoverable but has a consequence
 * they cannot see from the form they are looking at. Collapsing the two into a
 * single "are you sure" trains people to click through both.
 */
export type Guard =
  | { kind: "allow" }
  | { kind: "warn"; message: string }
  | { kind: "block"; reason: string };

function activeOwnersExcluding(
  people: readonly Person[],
  excludeId: string,
): Person[] {
  return people.filter(
    (person) =>
      person.role === "owner" && person.active && person.id !== excludeId,
  );
}

/**
 * Changing somebody's role.
 *
 * The blocking case is the **last active owner** losing the role — by any
 * route, not only by editing themselves. `owner` is the only role holding
 * `settings:write` and `people:manage`, so a tenant with none has nobody who
 * can put one back: Settings is gone from every remaining navigation and the
 * routes refuse everyone. That is unrecoverable inside the product.
 *
 * Demoting yourself while another owner exists is merely a surprise, so it
 * warns: you lose Settings the moment you save, and someone else has to undo it.
 */
export function guardRoleChange(
  people: readonly Person[],
  id: string,
  nextRole: Role,
  actingAs: string,
): Guard {
  const person = people.find((candidate) => candidate.id === id);
  if (!person || person.role === nextRole) return { kind: "allow" };

  if (person.role === "owner" && nextRole !== "owner") {
    if (activeOwnersExcluding(people, id).length === 0) {
      return {
        kind: "block",
        reason:
          "This is the only active owner. Making them anything else would leave nobody who can manage people or settings, and there would be no way back.",
      };
    }
    if (id === actingAs) {
      return {
        kind: "warn",
        message:
          "You are changing your own role. You will lose Settings and People as soon as you save, and another owner will have to change it back.",
      };
    }
  }
  return { kind: "allow" };
}

/**
 * Taking somebody off the strength.
 *
 * Two separate concerns, deliberately not merged: the last owner is a block for
 * the same reason as above, and a technician holding today's work is a warning
 * — the jobs do not vanish, they stay assigned to somebody the board will now
 * draw as on leave, which is exactly the silent state a dispatcher would not
 * catch until the customer rang.
 */
export function guardDeactivate(
  people: readonly Person[],
  id: string,
  openJobsToday: number,
): Guard {
  const person = people.find((candidate) => candidate.id === id);
  if (!person || !person.active) return { kind: "allow" };

  if (person.role === "owner" && activeOwnersExcluding(people, id).length === 0) {
    return {
      kind: "block",
      reason:
        "This is the only active owner. Deactivating them would leave nobody who can manage people or settings.",
    };
  }

  if (openJobsToday > 0) {
    return {
      kind: "warn",
      message: `${person.name} still holds ${openJobsToday} job${openJobsToday === 1 ? "" : "s"} today. They stay assigned and will show as on leave on the board — reassign them first, or they will be missed.`,
    };
  }

  return { kind: "allow" };
}

/* ------------------------------------------------------------------- seed */

/**
 * The directory, merged from what used to be two lists.
 *
 * `usr_0008` (Imran) existed only on the board's technician array and was
 * missing from the user list entirely — so the People screen showed six people
 * while the board could assign to seven. That is the drift this type exists to
 * end.
 */
export const SEED_PEOPLE: Person[] = [
  {
    id: "usr_0001",
    name: "Manish Agarwal",
    phone: "9811000001",
    email: "manish@shakticooling.example",
    role: "owner",
    languageOverride: null,
    active: true,
    skills: [],
    level: null,
    localities: [],
  },
  {
    id: "usr_0002",
    name: "Priya Sharma",
    phone: "9811000002",
    // No email: §3.2's coordinator is a phone-first user.
    email: null,
    role: "coordinator",
    languageOverride: null,
    active: true,
    skills: [],
    level: null,
    localities: [],
  },
  {
    id: "usr_0003",
    name: "Ramesh Yadav",
    phone: "9811000003",
    email: null,
    role: "technician",
    // Overrides the tenant default (hi) — FR-1304's per-user override.
    languageOverride: "mr",
    active: true,
    skills: ["AC", "Refrigeration"],
    level: "senior",
    localities: ["Okhla Phase II", "Saket", "Karol Bagh"],
  },
  {
    id: "usr_0004",
    name: "Lakshminarayanan Subramaniam",
    phone: "9811000004",
    email: null,
    role: "technician",
    languageOverride: null,
    active: true,
    skills: ["AC", "Water treatment"],
    level: "standard",
    localities: ["Vasant Kunj", "Greater Kailash", "Green Park"],
  },
  {
    id: "usr_0009",
    name: "Neha Bansal",
    phone: "9811000009",
    email: null,
    role: "marketing",
    languageOverride: null,
    active: true,
    level: "support",
    skills: [],
    localities: [],
  },
  {
    id: "usr_0010",
    name: "Farhan Khan",
    phone: "9811000010",
    email: null,
    role: "marketing",
    languageOverride: null,
    active: true,
    level: "leads",
    skills: [],
    localities: [],
  },
  {
    id: "usr_0011",
    name: "Anjali Mehta",
    phone: "9811000011",
    email: "anjali@shakticooling.example",
    role: "marketing",
    languageOverride: null,
    active: true,
    // The only marketing level that may price — the one who goes and looks.
    level: "senior",
    skills: [],
    localities: [],
  },
  {
    id: "usr_0005",
    name: "Suresh Gupta",
    phone: "9811000005",
    email: "suresh@shakticooling.example",
    role: "accountant",
    languageOverride: null,
    active: true,
    skills: [],
    level: null,
    localities: [],
  },
  {
    id: "usr_0006",
    name: "M. K. Rao & Associates",
    phone: "9811000006",
    email: "mkrao@ca.example",
    role: "readonly_ca",
    languageOverride: null,
    active: true,
    skills: [],
    level: null,
    localities: [],
  },
  {
    id: "usr_0007",
    name: "Deepak Verma",
    phone: "9811000007",
    email: null,
    role: "technician",
    languageOverride: null,
    // On leave, not removed — the board shows him greyed so a dispatcher does
    // not keep looking for him.
    active: false,
    skills: ["AC"],
    level: "apprentice",
    localities: [],
  },
  {
    id: "usr_0008",
    name: "Imran Qureshi",
    phone: "9811000008",
    email: null,
    role: "technician",
    languageOverride: null,
    active: true,
    skills: ["Generator", "Electrical"],
    level: "standard",
    localities: [],
  },
];
