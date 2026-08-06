"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * An action that cannot work yet, saying so.
 *
 * **Why this exists.** An audit found 39 of this product's 91 buttons had no
 * handler and no destination — they looked identical to the ones that worked
 * and did nothing when pressed. That is worse than omitting them: a dead
 * control teaches the user that pressing things here has no effect, and then
 * they stop pressing the ones that do.
 *
 * Some of those actions genuinely cannot be built while the backend is
 * suspended (DR-9) — you cannot verify a Udyam registration or store an
 * uploaded agreement against fixtures. Those become this: visibly disabled,
 * with the reason attached to the control rather than hidden in a title
 * attribute.
 *
 * The reason is in the **accessible name**, not only the tooltip. A disabled
 * button is skipped by most screen readers' tab order, so a tooltip that only
 * appears on hover tells a keyboard user nothing at all.
 */
export function Unavailable({
  label,
  reason,
  icon: Icon,
  size = "sm",
  className,
}: {
  label: string;
  /** Stated as the cause, not as an apology. */
  reason: string;
  icon?: typeof Lock;
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size={size}
            disabled
            aria-label={`${label} — unavailable: ${reason}`}
            className={cn("cursor-not-allowed", className)}
          />
        }
      >
        {Icon ? (
          <Icon className="size-4" aria-hidden="true" />
        ) : (
          <Lock className="size-3.5 opacity-60" aria-hidden="true" />
        )}
        {label}
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

/** The two reasons anything in this product is currently unavailable. */
export const NEEDS_BACKEND =
  "Needs the server — this build runs on local data only";
export const NEEDS_UPLOAD =
  "Needs file storage — this build runs on local data only";
