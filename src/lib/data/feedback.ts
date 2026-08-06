import type { Paise } from "@/lib/money";

/**
 * A rating that needs a person, not a robot — FR-1205.
 *
 * The requirement has two halves and the second is the harder one: a 1★ or 2★
 * **escalates to a human within 60 seconds**, and there is **no automated
 * apology**. A product that auto-replies "we're sorry to hear that" to somebody
 * who has just had a bad service visit makes the complaint worse and tells them
 * nobody read it.
 *
 * So this produces a *worklist entry*, never a message. The clock is shown
 * because sixty seconds is the promise, and a promise nobody can see the state
 * of is not a promise.
 */
export const ESCALATION_SECONDS = 60;

export type LowRating = {
  jobNumber: string;
  customer: string;
  technician: string | null;
  rating: 1 | 2;
  /** What the customer actually said, where they said anything. */
  comment: string | null;
  ratedAt: Date;
  /** Set once somebody has picked it up — the escalation is then answered. */
  acknowledgedBy: string | null;
  valuePaise: Paise | null;
};

export type Escalation = {
  rating: LowRating;
  /** Seconds since the rating landed. */
  age: number;
  /** True once past the 60-second promise and still nobody has picked it up. */
  breached: boolean;
};

/**
 * Unacknowledged low ratings, worst first.
 *
 * Sorted by rating then by age: a 1★ that landed a minute ago outranks a 2★
 * from this morning, because the angrier customer is the one about to tell
 * somebody else.
 */
export function escalations(
  ratings: readonly LowRating[],
  now: Date,
): Escalation[] {
  return ratings
    .filter((rating) => rating.acknowledgedBy === null)
    .map((rating) => {
      const age = Math.max(
        0,
        Math.floor((now.getTime() - rating.ratedAt.getTime()) / 1000),
      );
      return { rating, age, breached: age > ESCALATION_SECONDS };
    })
    .sort((a, b) => a.rating.rating - b.rating.rating || b.age - a.age);
}

/** `4m 12s` — a countdown nobody has to do arithmetic on. */
export function ageWords(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
