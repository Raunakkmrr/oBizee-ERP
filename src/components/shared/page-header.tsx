import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Standard page header — copied from `obizee-dashboard/src/components/shared/
 * page-header.tsx` so pages in this product sit at the same rhythm as pages in
 * the dashboard: same `mb-6`, same `text-2xl font-semibold tracking-tight`, same
 * stacked-to-row behaviour, same right-aligned action slot.
 *
 * Two deliberate differences from the dashboard's version:
 *
 * 1. **A breadcrumb above the title.** The dashboard is shallow; this product is
 *    not — Contracts, Jobs, Money and Parts all have create and detail screens
 *    beneath them, and until now no screen said where in the product it sat.
 * 2. The title does **not** truncate. §9.6 requires that
 * amounts and statuses never truncate and permits it for names; a screen title
 * is closer to the former, and a truncated title is a wayfinding failure on the
 * exact narrow viewport (§6.2's sub-1024px tier) where it would trigger. It
 * wraps instead.
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
}: {
  title: string;
  description?: string;
  /** Ancestors only — the current page is the title, never repeated here. */
  breadcrumb?: { label: string; href?: string }[];
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
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav
            aria-label="Breadcrumb"
            className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
          >
            {breadcrumb.map((crumb, index) => (
              <span key={crumb.label} className="flex items-center gap-1">
                {index > 0 ? (
                  <ChevronRight aria-hidden="true" className="size-3" />
                ) : null}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    className="rounded-sm hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {crumb.label}
                  </a>
                ) : (
                  crumb.label
                )}
              </span>
            ))}
          </nav>
        ) : null}
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
