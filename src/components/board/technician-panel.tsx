"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/design/tokens";
import { recommendTechnician, type JobRow, type Technician } from "@/lib/data/board";

/**
 * The technician panel — PRD §6.4.3.
 *
 * **Assignment is a matching decision, so both sides are on screen at once.**
 * That is the whole reason this panel exists rather than a modal: FR-204
 * requires the technician panel "visible in the same viewport" as the
 * unassigned job, because choosing *who* depends on where they already are.
 *
 * Per technician, and every field earns its place:
 * - **today's job count** — load
 * - **live status with a duration** (`On site since 11:42`) — §6.4.3 is explicit
 *   that "the duration is what tells her whether he is nearly free"
 * - **the localities of his other jobs today** — this is what makes clustering
 *   possible, and clustering is most of a dispatcher's craft
 * - **skill tags** — qualification
 *
 * FR-204's overload rule is honoured at the point of assignment: a technician
 * who already has five jobs in the slot produces a **non-blocking warning**, not
 * a refusal. "MSME dispatchers routinely and correctly overload a technician who
 * is already in that building."
 */

const STATUS_TONE = {
  free: "success",
  en_route: "info",
  on_site: "primary",
  leave: "muted",
} as const;

const STATUS_WORD = {
  free: "Free",
  en_route: "En route",
  on_site: "On site",
  leave: "On leave",
} as const;

export function TechnicianPanel({
  technicians,
  selectedJob,
  onAssign,
}: {
  technicians: Technician[];
  selectedJob: JobRow | null;
  onAssign: (technician: Technician) => void;
}) {
  const recommendedId = selectedJob
    ? recommendTechnician(selectedJob, technicians)
    : null;

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="text-base">
          Technicians
          {selectedJob ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              assigning {selectedJob.jobNumber}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      {/* Scrolls independently of the job list (§6.4.1) — the coordinator
          compares a job at the top of one column with a technician at the
          bottom of the other. */}
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        <ul className="space-y-2">
          {technicians.map((tech) => {
            const onLeave = tech.status.kind === "leave";
            const overloaded = tech.jobsToday >= 5;
            return (
              <li
                key={tech.id}
                className="rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{tech.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-px font-medium",
                          toneClasses[STATUS_TONE[tech.status.kind]],
                        )}
                      >
                        {STATUS_WORD[tech.status.kind]}
                        {tech.status.since ? (
                          <span className="tabular-nums">
                            {" "}
                            since {tech.status.since}
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular-nums">
                        {tech.jobsToday} today
                      </span>
                      {/* The word, not just the fill — §6.13.4 forbids colour
                          as the only channel, and a filled button is colour. */}
                      {tech.id === recommendedId ? (
                        <span className="font-medium text-primary">
                          Recommended
                        </span>
                      ) : null}
                    </p>
                  </div>

                  {selectedJob ? (
                    <Button
                      size="sm"
                      // Exactly one filled button in this panel, on the
                      // recommended technician (§6.13.2). When nothing is
                      // recommended, nothing is filled — see
                      // `recommendTechnician`.
                      variant={tech.id === recommendedId ? "default" : "outline"}
                      disabled={onLeave}
                      onClick={() => onAssign(tech)}
                      aria-label={`Assign ${selectedJob.jobNumber} to ${tech.name}`}
                    >
                      Assign
                    </Button>
                  ) : null}
                </div>

                {tech.localities.length > 0 ? (
                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    Today in {tech.localities.join(" · ")}
                  </p>
                ) : null}

                {tech.skills.length > 0 ? (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {tech.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground"
                      >
                        {skill}
                      </span>
                    ))}
                  </p>
                ) : null}

                {selectedJob && overloaded && !onLeave ? (
                  // FR-204: warn, never prevent.
                  <p className="mt-2 text-xs text-brand-brown">
                    {tech.name.split(" ")[0]} already has {tech.jobsToday} jobs
                    today.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
