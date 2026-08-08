import { describe, expect, it } from "vitest";

import type { MutationResult } from "./mutations";

/**
 * The in-flight guard, tested without React.
 *
 * The guard is a `useRef`, not the `pending` state, and the distinction is the
 * whole point: state is a render away from being true, so two clicks inside
 * one frame both read a stale `false`. On this screen that is two invoices,
 * two statutory numbers, and a credit note somebody has to write.
 *
 * `useMutation` is a thin wrapper over this rule, so the rule is what gets
 * asserted — a hook test would need a renderer to prove less.
 */
function guarded<TArgs extends unknown[], TData>(
  fn: (...args: TArgs) => Promise<MutationResult<TData>>,
) {
  let inFlight = false;
  return async (...args: TArgs): Promise<MutationResult<TData> | null> => {
    if (inFlight) return null;
    inFlight = true;
    try {
      return await fn(...args);
    } finally {
      inFlight = false;
    }
  };
}

describe("the write guard", () => {
  it("lets one of two same-frame calls through", async () => {
    let issued = 0;
    const run = guarded(async () => {
      issued += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ok: true as const, data: { number: `SVC/26-27/${issued}` } };
    });

    // Two clicks before the first resolves — the double-submit case.
    const [first, second] = await Promise.all([run(), run()]);

    expect(issued, "a second document was issued").toBe(1);
    expect(first?.ok).toBe(true);
    // Null, not an error: a swallowed second click is the guard working.
    expect(second).toBeNull();
  });

  it("reopens after the first settles, so a retry is possible", async () => {
    let issued = 0;
    const run = guarded(async () => {
      issued += 1;
      return { ok: true as const, data: issued };
    });

    await run();
    await run();

    expect(issued).toBe(2);
  });

  it("reopens after a refusal, so a corrected resubmit works", async () => {
    let attempts = 0;
    const run = guarded(async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          ok: false as const,
          error: { kind: "validation" as const, subject: "invoice", message: "no", fix: null, code: "X" },
        };
      }
      return { ok: true as const, data: "issued" };
    });

    const refused = await run();
    const accepted = await run();

    expect(refused?.ok).toBe(false);
    expect(accepted?.ok).toBe(true);
  });

  it("reopens after a throw, so one network drop does not wedge the button", async () => {
    let attempts = 0;
    const run = guarded(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return { ok: true as const, data: "issued" };
    });

    await expect(run()).rejects.toThrow("offline");
    // The finally block is what makes this pass; without it the screen is dead.
    await expect(run()).resolves.toEqual({ ok: true, data: "issued" });
  });
});
