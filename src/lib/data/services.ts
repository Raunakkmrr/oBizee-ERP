/**
 * What this firm sells, as a list rather than a typed sentence.
 *
 * **Why a list.** The service type was a free-text box defaulting to
 * `"AC servicing"`, which is wrong twice over for a pest-control firm: every
 * job starts with the wrong answer and has to be retyped, and the field that
 * decides *which technicians the board offers* ends up holding "Cockroach
 * treatment", "cockroach treat." and "COCKROACH" as three unrelated strings.
 * Nothing can be counted by service, no skill can be matched to one, and a
 * report by service type is arithmetic over spelling.
 *
 * **Why free text is still allowed.** A trade always has a job nobody
 * anticipated, and a closed list turns that into a job recorded under the
 * nearest wrong label — which is worse than an unusual string, because it is a
 * wrong string that looks right. The list is what the field *offers*; it is not
 * what the field *permits*.
 *
 * **Why pest control only.** Raunak's call, and the correct one for now: the
 * live firm is a pest-control business, and a menu padded with chillers and
 * cold rooms makes the six things somebody actually picks harder to find. The
 * seed data is an HVAC firm, so `HVAC_SERVICES` is kept beside it — the
 * decision that needs revisiting when a second trade signs up is *which list a
 * tenant gets*, not whether the other list exists.
 */

/**
 * The Indian pest-control trade's own vocabulary.
 *
 * Ordered by how often a firm actually sells them rather than alphabetically:
 * a picker is read from the top, and cockroach and rodent work is the bulk of
 * the book. "General disinfestation" is last because it is the honest label for
 * a call that has not been diagnosed yet, not a service anybody advertises.
 */
export const PEST_SERVICES = [
  "Cockroach treatment",
  "Rodent control",
  "Termite treatment",
  "Mosquito treatment",
  "Flies control",
  "Bed bug treatment",
  "Ant control",
  "Lizard control",
  "Wood borer treatment",
  "Fumigation",
  "Sanitisation & disinfection",
  "General disinfestation",
] as const;

/** Kept for the seeded HVAC tenant, and for whenever a second trade arrives. */
export const HVAC_SERVICES = [
  "AC servicing",
  "AC repair",
  "AC installation",
  "Chiller AMC",
  "Cold room service",
  "Refrigerator repair",
  "Deep freezer repair",
  "Water purifier service",
] as const;

/**
 * What the pickers offer today.
 *
 * A single export so the job form and the contract form cannot drift apart —
 * a contract whose scope is not a service the jobs it generates can be filtered
 * by is the bug that made every one of Rani Kumari's visits read
 * "All equipment".
 */
export const SERVICES: readonly string[] = PEST_SERVICES;

/** The default a new job starts on. Deliberately the most common, not the first alphabetically. */
export const DEFAULT_SERVICE = "Cockroach treatment";
