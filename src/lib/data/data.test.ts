import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  EM_DASH,
  computed,
  isFailed,
  isReady,
  loading,
  mayBlankScreen,
  ready,
  renderComputed,
  uncomputable,
  type AppError,
} from "./result";
import { DataSourceError, defineQuery } from "./source";
import { asPaise, formatMoney } from "../money";

/**
 * Reads the support code off a failure.
 *
 * Written as a helper because TypeScript correctly refuses `error.code` on a
 * bare `AppError`: the connectivity and permission variants genuinely have no
 * code, and §6.3 only wants a code in the copyable small print of the two kinds
 * that have one. The union is doing its job by making the naive access fail.
 */
function codeOf(error: AppError): string | null {
  return "code" in error ? error.code : null;
}

describe("Computed — §6.3's em-dash rule, made structural", () => {
  it("renders an em-dash for an uncomputable figure, never a zero", () => {
    const total = uncomputable<number>("Receivables service unavailable");
    expect(renderComputed(total, String)).toBe(EM_DASH);
    expect(renderComputed(total, String)).not.toBe("0");
  });

  it("never passes a failure to a money formatter at all", () => {
    // The point of the type: there is no numeric value in the failure branch,
    // so no code path exists where formatMoney receives a stand-in zero.
    // §6.3 calls showing ₹0 for a figure that failed "the worst defect class
    // this product can ship", and §3.1 says the owner abandons the product when
    // a home-screen number disagrees with his accountant.
    let formatterCalls = 0;
    const spyFormat = (paise: ReturnType<typeof asPaise>) => {
      formatterCalls += 1;
      return formatMoney(paise);
    };

    const missing = uncomputable<ReturnType<typeof asPaise>>("Ledger timed out");
    expect(renderComputed(missing, spyFormat)).toBe(EM_DASH);
    expect(formatterCalls).toBe(0);

    const present = computed(asPaise(571100));
    expect(renderComputed(present, spyFormat)).toBe("₹5,711.00");
    expect(formatterCalls).toBe(1);
  });

  it("renders a genuine zero as a zero — the distinction that matters", () => {
    // A real ₹0.00 balance and a failed lookup must not look the same.
    expect(renderComputed(computed(asPaise(0)), formatMoney)).toBe("₹0.00");
    expect(renderComputed(uncomputable<number>("down"), String)).toBe(EM_DASH);
  });
});

describe("error taxonomy — §6.3's three kinds", () => {
  it("refuses to blank the screen on a connectivity failure", () => {
    // "Never blank the screen." The coordinator is on a call and the board she
    // was reading is still true.
    const connectivity: AppError = {
      kind: "connectivity",
      lastKnownAsOf: new Date("2026-07-30T05:12:00Z"),
    };
    expect(mayBlankScreen(connectivity)).toBe(false);
  });

  it("allows permission and validation failures to replace the content", () => {
    expect(
      mayBlankScreen({
        kind: "permission",
        permission: "invoice:finalise",
        rolesWhoCan: ["owner", "accountant"],
        suggestedApprover: "Suresh",
      }),
    ).toBe(true);
    expect(
      mayBlankScreen({
        kind: "validation",
        subject: "gstin",
        message: "That GSTIN has 14 characters; it needs 15.",
        fix: "Check the customer's registration certificate.",
        code: "GSTIN_LENGTH",
      }),
    ).toBe(true);
  });

  it("carries who can act, so the message is a next step not a dead end", () => {
    const error: AppError = {
      kind: "permission",
      permission: "invoice:finalise",
      rolesWhoCan: ["owner", "accountant"],
      suggestedApprover: "Suresh",
    };
    expect(error.kind === "permission" && error.rolesWhoCan).toContain(
      "accountant",
    );
    expect(error.kind === "permission" && error.suggestedApprover).toBe("Suresh");
  });
});

describe("Query states", () => {
  it("defaults a ready result to fresh and complete", () => {
    const q = ready({ rows: [] });
    expect(isReady(q) && q.staleAsOf).toBeNull();
    expect(isReady(q) && q.partialFailures).toEqual([]);
  });

  it("carries partial failures inside ready, not as an error", () => {
    // §6.3: "a failed secondary source never blocks the screen's primary
    // action" — so a partial failure must not collapse the query.
    const q = ready(
      { rows: [1, 2, 3] },
      {
        partialFailures: [
          {
            region: "Technician status",
            stillWorks: "Jobs and assignment",
            code: "PRESENCE_DOWN",
          },
        ],
      },
    );
    expect(isReady(q)).toBe(true);
    expect(isFailed(q)).toBe(false);
    expect(isReady(q) && q.partialFailures).toHaveLength(1);
  });

  it("carries a freshness label for the designed stale mode (§9.8)", () => {
    const asOf = new Date("2026-07-30T05:12:00Z");
    const q = ready({ rows: [] }, { staleAsOf: asOf });
    expect(isReady(q) && q.staleAsOf).toEqual(asOf);
  });

  it("has a loading state distinct from empty data", () => {
    expect(loading().status).toBe("loading");
    // Emptiness is a property of the data, not a fetch state — the screen needs
    // to tell "nothing exists" from "nothing matches your filter", and only the
    // component knows which.
    expect(isReady(ready({ rows: [] }))).toBe(true);
  });
});

describe("defineQuery — the contract boundary", () => {
  const JobCountSchema = z.object({
    unassigned: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  });

  it("validates the fixture against the same schema the API will use", async () => {
    const run = defineQuery({
      key: "today.counts",
      schema: JobCountSchema,
      fixture: () => ({ raw: { unassigned: 4, total: 37 } }),
    });
    const result = await run(undefined);
    expect(isReady(result) && result.data.unassigned).toBe(4);
  });

  it("turns a contract violation into a named validation error, not a crash", async () => {
    const run = defineQuery({
      key: "today.counts",
      schema: JobCountSchema,
      // A fixture that drifted from the contract — later, an API that drifted.
      fixture: () => ({ raw: { unassigned: "four", total: 37 } }),
    });
    const result = await run(undefined);
    expect(isFailed(result)).toBe(true);
    expect(isFailed(result) && result.error.kind).toBe("validation");
    expect(isFailed(result) ? codeOf(result.error) : null).toBe(
      "CONTRACT:today.counts",
    );
  });

  it("never throws — every outcome is one of the four states", async () => {
    const run = defineQuery({
      key: "boom",
      schema: z.object({}),
      fixture: () => {
        throw new Error("something unexpected");
      },
    });
    await expect(run(undefined)).resolves.toBeDefined();
    const result = await run(undefined);
    expect(isFailed(result) && result.error.kind).toBe("server");
  });

  it("classifies network-shaped throws as connectivity, so content survives", async () => {
    const run = defineQuery({
      key: "board",
      schema: z.object({}),
      fixture: () => {
        throw new Error("fetch failed");
      },
    });
    const result = await run(undefined);
    expect(isFailed(result) && result.error.kind).toBe("connectivity");
    expect(
      isFailed(result) ? mayBlankScreen(result.error) : true,
    ).toBe(false);
  });

  it("lets a fixture request a specific state, so all four are reachable in review", async () => {
    // S10 requires fixtures that exercise 403 and partial-failure paths rather
    // than only the happy one — otherwise those states ship unlooked-at.
    const run = defineQuery({
      key: "invoice.finalise",
      schema: z.object({}),
      fixture: () => {
        throw new DataSourceError({
          kind: "permission",
          permission: "invoice:finalise",
          rolesWhoCan: ["owner", "accountant"],
          suggestedApprover: "Suresh",
        });
      },
    });
    const result = await run(undefined);
    expect(isFailed(result) && result.error.kind).toBe("permission");
  });
});

describe("api safety", () => {
  it("refuses to serve fixtures when the build believes it has a backend", async () => {
    const previous = process.env.NEXT_PUBLIC_DATA_SOURCE;
    process.env.NEXT_PUBLIC_DATA_SOURCE = "api";
    try {
      const run = defineQuery({
        key: "jobs.list",
        schema: z.object({}),
        fixture: () => ({ raw: {} }),
        // no api implementation
      });
      const result = await run(undefined);
      // Silently falling back to fixtures here would be the most dangerous
      // behaviour this module could have: a production build rendering invented
      // numbers that look real.
      expect(isFailed(result)).toBe(true);
      expect(isFailed(result) ? codeOf(result.error) : null).toBe(
        "NO_API_IMPL:jobs.list",
      );
    } finally {
      process.env.NEXT_PUBLIC_DATA_SOURCE = previous;
    }
  });
});
