import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Standard page header — copied from `obizee-dashboard/src/components/shared/
 * page-header.tsx` so pages in this product sit at the same rhythm as pages in
 * the dashboard: same `mb-6`, same `text-2xl font-semibold tracking-tight`, same
 * stacked-to-row behaviour, same right-aligned action slot.
 *
 * One deliberate difference: the title does **not** truncate. §9.6 requires that
 * amounts and statuses never truncate and permits it for names; a screen title
 * is closer to the former, and a truncated title is a wayfinding failure on the
 * exact narrow viewport (§6.2's sub-1024px tier) where it would trigger. It
 * wraps instead.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
