"use client";

import { useCallback, useRef, useState } from "react";

import type { AppError } from "../data/result";
import type { MutationResult } from "./mutations";

/**
 * A write in flight, and what happened to it.
 *
 * Writes used to be `dispatch()` — synchronous, `void`, incapable of failing.
 * A screen built on that shape has nowhere to put "the server refused this",
 * so this hook exists to make the two states a component cannot skip:
 * **pending**, and **refused**.
 *
 * `pending` is not cosmetic. Every one of these writes is a document: a second
 * click on `Raise invoice` is a second invoice, and a second invoice is a
 * statutory number burned on a duplicate somebody has to credit-note. The
 * in-flight guard here is the same reason the button it drives must be
 * disabled rather than merely spinning.
 */
export type Mutation<TArgs extends unknown[], TData> = {
  run: (...args: TArgs) => Promise<MutationResult<TData> | null>;
  pending: boolean;
  error: AppError | null;
  reset: () => void;
};

export function useMutation<TArgs extends unknown[], TData>(
  fn: (...args: TArgs) => Promise<MutationResult<TData>>,
): Mutation<TArgs, TData> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  /*
    A ref, not the state above. `pending` is a render away from being true,
    and two clicks inside one frame both read the stale `false` — which is
    precisely the double-submit this is here to stop.
  */
  const inFlight = useRef(false);

  const run = useCallback(
    async (...args: TArgs): Promise<MutationResult<TData> | null> => {
      // Returning null rather than throwing: a swallowed second click is not
      // an error, it is the guard working.
      if (inFlight.current) return null;
      inFlight.current = true;
      setPending(true);
      setError(null);

      try {
        const result = await fn(...args);
        if (!result.ok) setError(result.error);
        return result;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [fn],
  );

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
