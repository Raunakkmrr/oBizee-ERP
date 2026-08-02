import type { ReactNode } from "react";
import type { Query } from "@/lib/data/result";
import { mayBlankScreen } from "@/lib/data/result";
import { LoadingState } from "./loading-state";
import { ConnectivityBanner, ErrorState } from "./error-state";
import { PartialNotice } from "./partial-notice";
import { EmptyState, type EmptyStateProps } from "./empty-state";

/**
 * Renders one of §6.3's four data states, exhaustively.
 *
 * §6.3 is a **global contract**: "Every screen implements all four." Routing
 * every screen through this component is how that stops being a promise and
 * becomes a property of the code — the `Query<T>` union has no fourth variant to
 * forget, and `empty` is required as a prop whenever a screen can be empty.
 *
 * Two behaviours worth stating because they are easy to "simplify" away:
 *
 * 1. **A stale ready result still renders its content**, with a freshness
 *    banner above it. §9.8 lists this as a *designed* degraded mode — "if the
 *    read replica is down, the board serves stale data with a freshness label".
 *    Blanking here would be a regression, not a safety measure.
 *
 * 2. **A connectivity failure never blanks the screen.** If it reaches this
 *    component as a `failed` result it means there was genuinely nothing cached
 *    to show, so the banner renders alone. When there *is* cached content, the
 *    query should be a `ready` result carrying `staleAsOf` — that is the
 *    difference between the two shapes, and it is deliberate.
 */
export type QueryBoundaryProps<T> = {
  query: Query<T>;
  /** What is loading, in the user's words. Feeds §6.3's labelled progress line. */
  label: string;
  children: (data: T) => ReactNode;
  /**
   * Supply when this screen can legitimately have nothing to show. Emptiness is
   * a property of the data, not of the fetch, so only the caller knows both
   * whether it is empty and *why* — "nothing exists" and "nothing matches your
   * filter" need different sentences and different buttons.
   */
  empty?: {
    when: (data: T) => boolean;
    render: EmptyStateProps;
  };
  loadingRows?: number;
  loadingRowHeight?: "today" | "leads" | "money" | "timeline";
};

export function QueryBoundary<T>({
  query,
  label,
  children,
  empty,
  loadingRows,
  loadingRowHeight,
}: QueryBoundaryProps<T>) {
  if (query.status === "loading") {
    return (
      <LoadingState
        label={label}
        rows={loadingRows}
        rowHeight={loadingRowHeight}
      />
    );
  }

  if (query.status === "failed") {
    if (!mayBlankScreen(query.error)) {
      // Connectivity with nothing cached: banner alone, no error page.
      return (
        <ConnectivityBanner
          lastKnownAsOf={
            query.error.kind === "connectivity"
              ? query.error.lastKnownAsOf
              : null
          }
        />
      );
    }
    return <ErrorState error={query.error} />;
  }

  const showEmpty = empty ? empty.when(query.data) : false;

  return (
    <div className="space-y-4">
      {query.staleAsOf ? (
        <ConnectivityBanner lastKnownAsOf={query.staleAsOf} />
      ) : null}

      {query.partialFailures.map((failure) => (
        <PartialNotice key={failure.code} failure={failure} />
      ))}

      {showEmpty && empty ? (
        <EmptyState {...empty.render} />
      ) : (
        children(query.data)
      )}
    </div>
  );
}
