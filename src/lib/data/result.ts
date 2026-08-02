/**
 * The four data states, as types — PRD §6.3.
 *
 * §6.3 is a *global contract*: "Every screen implements all four." Making them
 * a discriminated union rather than a convention means a screen physically
 * cannot forget one — the compiler refuses an unhandled branch — and the two
 * rules §6.3 cares most about become unrepresentable rather than merely
 * discouraged:
 *
 * 1. **A number that could not be computed shows an em-dash and a footnote,
 *    never a zero.** §6.3 calls showing ₹0 for a figure that failed to load
 *    "the worst defect class this product can ship". So a possibly-uncomputable
 *    number is modelled as `Computed<T>`, which has no numeric value in its
 *    failure branch. There is nothing to accidentally render as 0.
 *
 * 2. **A failed secondary source never blocks the screen's primary action.**
 *    So partial failures ride along *inside* the ready state as data, rather
 *    than collapsing the whole query into an error.
 *
 * Note what is deliberately NOT a state here: **Empty**. Emptiness is a
 * property of the data (zero rows), not of the fetch, and §6.3 needs the
 * distinction between "nothing exists" and "nothing matches your filter" —
 * which only the rendering component knows. Modelling empty as a fetch state
 * would throw that distinction away.
 */
import type { Permission, Role } from "../roles";

/* ------------------------------------------------------------------ errors */

/**
 * §6.3 distinguishes three kinds of error "because the user's next action
 * differs". Collapsing them into one `Error` is what produces the generic
 * "Something went wrong" screen that tells a coordinator nothing.
 */
export type AppError =
  /**
   * Connectivity. §6.3: keep the last-known content on screen, add a top
   * banner, offer Retry. **Never blank the screen.** `lastKnownAsOf` is what
   * lets the banner say "Showing data from 10:42 am" rather than something
   * vague.
   */
  | {
      kind: "connectivity";
      lastKnownAsOf: Date | null;
    }
  /**
   * Permission. §6.3 requires naming *who can act*: "Only the Accountant or
   * Owner can finalise an invoice. Ask Suresh to approve." — "Naming the person
   * who can act is the difference between a dead end and a next step."
   */
  | {
      kind: "permission";
      permission: Permission;
      rolesWhoCan: readonly Role[];
      /** The specific person to ask, when the tenant's membership is known. */
      suggestedApprover: string | null;
    }
  /**
   * Validation. Names the field or record, states the problem in plain
   * language, offers the fix. The error code appears only in copyable small
   * print for support — §6.3: error codes "never as the message".
   */
  | {
      kind: "validation";
      /** Field name or record reference the message is about. */
      subject: string;
      message: string;
      fix: string | null;
      code: string;
    }
  /** Server. Same rules as validation: plain message, code in small print. */
  | {
      kind: "server";
      message: string;
      code: string;
    };

/**
 * A named region of a screen whose secondary data source failed, while the
 * primary loaded. §6.3: the failed region is "replaced by a bordered inline
 * notice naming what is missing and what still works".
 */
export type PartialFailure = {
  /** The region, in the user's words — "Asset history", "Technician status". */
  region: string;
  /** What still works, so the notice can say it. */
  stillWorks: string;
  code: string;
};

/* ----------------------------------------------------------------- results */

export type Query<T> =
  | { status: "loading" }
  | {
      status: "ready";
      data: T;
      /**
       * Set when the data is known to be stale — §9.8's designed degraded mode
       * where "the board serves stale data with a freshness label". Null means
       * fresh.
       */
      staleAsOf: Date | null;
      /** Empty array means everything on the screen loaded. */
      partialFailures: readonly PartialFailure[];
    }
  | { status: "failed"; error: AppError };

export const loading = <T,>(): Query<T> => ({ status: "loading" });

export const ready = <T,>(
  data: T,
  options: {
    staleAsOf?: Date | null;
    partialFailures?: readonly PartialFailure[];
  } = {},
): Query<T> => ({
  status: "ready",
  data,
  staleAsOf: options.staleAsOf ?? null,
  partialFailures: options.partialFailures ?? [],
});

export const failed = <T,>(error: AppError): Query<T> => ({
  status: "failed",
  error,
});

/* ---------------------------------------------------------------- computed */

/**
 * A value that might not be computable — the type that makes §6.3's
 * "em-dash, never zero" rule structural.
 *
 * Use this for **every derived number a screen displays**: totals, counts,
 * balances, ageing figures, KPI numerals. If the source failed, there is no
 * numeric value to render by mistake, because the failure branch does not
 * carry one.
 *
 * The temptation this defends against is real and specific: a component that
 * takes `total: number` will be handed `0` by some caller on failure, and ₹0.00
 * on an owner's home screen is indistinguishable from a genuinely zero balance.
 * §3.1 says the owner abandons the product when "the number on the home screen
 * disagrees with the number his accountant read out" — this is that failure.
 */
export type Computed<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export const computed = <T,>(value: T): Computed<T> => ({ ok: true, value });

export const uncomputable = <T,>(reason: string): Computed<T> => ({
  ok: false,
  reason,
});

/** The em-dash §6.3 mandates for an uncomputable figure. */
export const EM_DASH = "—";

/**
 * Render a computed value, or the em-dash. The formatter is only ever called
 * on the success branch, so there is no code path where a failure reaches a
 * money or number formatter at all.
 */
export function renderComputed<T>(
  value: Computed<T>,
  format: (value: T) => string,
): string {
  return value.ok ? format(value.value) : EM_DASH;
}

/* ------------------------------------------------------------------ guards */

export const isLoading = <T,>(q: Query<T>): q is { status: "loading" } =>
  q.status === "loading";

export const isReady = <T,>(
  q: Query<T>,
): q is Extract<Query<T>, { status: "ready" }> => q.status === "ready";

export const isFailed = <T,>(
  q: Query<T>,
): q is Extract<Query<T>, { status: "failed" }> => q.status === "failed";

/**
 * Whether a ready result should still show its content. Always true — stated
 * as a function so the §6.3 rule is greppable and testable: a connectivity
 * failure with cached content must keep rendering it, and a partial failure
 * must never blank the primary region.
 */
export function shouldRenderContent<T>(q: Query<T>): boolean {
  return q.status === "ready";
}

/**
 * Whether a failure is allowed to blank the screen.
 *
 * Connectivity failures are not: §6.3 says keep the last-known content and add
 * a banner. This is the guard that stops a well-meaning error boundary from
 * replacing a coordinator's board with an error page the moment her wifi
 * flickers — she is on a call, and the board she was reading is still true.
 */
export function mayBlankScreen(error: AppError): boolean {
  return error.kind !== "connectivity";
}
