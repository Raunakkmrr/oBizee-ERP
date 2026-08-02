/**
 * The data-access boundary — DR-9.
 *
 * The client suspended the backend, not the contract. So:
 *
 * - **No component ever imports a fixture, or calls `fetch`.** Every screen goes
 *   through a query defined here.
 * - **The zod schema is written first and is the single source of truth**, used
 *   to validate the fixture today and the API response tomorrow. A fixture that
 *   does not satisfy the contract fails loudly right now, which is the entire
 *   reason later wiring is a swap rather than a rewrite.
 * - **Errors are mapped into §6.3's taxonomy at this boundary**, so no screen
 *   ever sees a raw exception and every screen can render the right one of the
 *   three error kinds.
 *
 * The honest limit of this arrangement, restated because it is easy to forget:
 * a fixture returns instantly and always succeeds. It cannot validate FR-102's
 * 500ms duplicate-detection budget, the Today board at 5,000 jobs, or anything
 * about §9.1. Those are Phase 14 concerns and are recorded as such in the
 * registry rather than quietly counted as met.
 */
import type { ZodType } from "zod";
import { failed, loading, ready, type AppError, type Query } from "./result";
import type { PartialFailure } from "./result";

export type DataSourceKind = "fixture" | "api";

/**
 * Which implementation backs the queries.
 *
 * Defaults to `fixture` because that is the only one that exists while DR-9
 * stands. When the API implementation lands, flipping `NEXT_PUBLIC_DATA_SOURCE`
 * is the whole migration for a screen whose contract has not changed.
 */
export function resolveDataSourceKind(): DataSourceKind {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === "api" ? "api" : "fixture";
}

/** Thrown by a fixture to produce a specific §6.3 error state on demand. */
export class DataSourceError extends Error {
  readonly appError: AppError;

  constructor(appError: AppError) {
    super(
      appError.kind === "permission"
        ? `Permission required: ${appError.permission}`
        : "message" in appError
          ? appError.message
          : appError.kind,
    );
    this.name = "DataSourceError";
    this.appError = appError;
  }
}

/**
 * What an implementation returns: the raw payload, plus anything the screen
 * needs to know about how complete or fresh it is.
 */
export type Fetched<TRaw> = {
  raw: TRaw;
  staleAsOf?: Date | null;
  partialFailures?: readonly PartialFailure[];
};

export type QueryDefinition<TParams, TData> = {
  /** Stable identifier, used in error codes and later as a cache key prefix. */
  key: string;
  /** The contract. Validates the fixture now and the API response later. */
  schema: ZodType<TData>;
  fixture: (params: TParams) => Promise<Fetched<unknown>> | Fetched<unknown>;
  api?: (params: TParams) => Promise<Fetched<unknown>>;
};

/**
 * Bind a contract to its implementations and return a callable query.
 *
 * The returned function never throws. Everything resolves to a `Query<TData>`,
 * because §6.3 requires every screen to render one of the four states and a
 * thrown exception is not one of them.
 */
export function defineQuery<TParams, TData>(
  definition: QueryDefinition<TParams, TData>,
) {
  return async function run(params: TParams): Promise<Query<TData>> {
    const kind = resolveDataSourceKind();

    if (kind === "api" && !definition.api) {
      // Fail loudly rather than silently serving fixtures in a build that
      // believes it is talking to a real backend. Silent fallback here would be
      // the single most dangerous behaviour this module could have.
      return failed<TData>({
        kind: "server",
        message: `This screen is not wired to the backend yet.`,
        code: `NO_API_IMPL:${definition.key}`,
      });
    }

    try {
      const impl = kind === "api" && definition.api ? definition.api : definition.fixture;
      const fetched = await impl(params);

      const parsed = definition.schema.safeParse(fetched.raw);
      if (!parsed.success) {
        // A contract violation. Today that means a bad fixture; later it means
        // the API drifted from the schema. Both must be loud, because a silently
        // coerced payload renders wrong numbers.
        const first = parsed.error.issues[0];
        return failed<TData>({
          kind: "validation",
          subject: first?.path.join(".") || definition.key,
          message:
            first?.message ??
            "The data did not match the shape this screen expects.",
          fix: null,
          code: `CONTRACT:${definition.key}`,
        });
      }

      return ready<TData>(parsed.data, {
        staleAsOf: fetched.staleAsOf ?? null,
        partialFailures: fetched.partialFailures ?? [],
      });
    } catch (error) {
      if (error instanceof DataSourceError) {
        return failed<TData>(error.appError);
      }
      return failed<TData>(mapUnknownError(error, definition.key));
    }
  };
}

/**
 * Map an unrecognised throw into the taxonomy.
 *
 * Network-shaped failures become `connectivity`, because §6.3 treats those
 * differently from everything else: keep the content, add a banner, never blank
 * the screen. Getting this classification wrong is what makes a coordinator's
 * board disappear when her wifi flickers mid-call.
 */
function mapUnknownError(error: unknown, key: string): AppError {
  const message = error instanceof Error ? error.message : String(error);
  const looksLikeNetwork =
    /network|fetch failed|econnrefused|etimedout|offline|aborted/i.test(message);

  if (looksLikeNetwork) {
    return { kind: "connectivity", lastKnownAsOf: null };
  }

  return {
    kind: "server",
    message: "Something went wrong loading this screen.",
    code: `UNHANDLED:${key}`,
  };
}

export { loading };
