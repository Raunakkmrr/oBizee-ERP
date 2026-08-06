"use client";

import { GripVertical } from "lucide-react";
import { MoneyText } from "@/components/shared/money-text";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { asPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { EM_DASH } from "@/lib/data/result";
import { PIPELINE_STAGES, STAGE_LABEL, daysSinceContact, isStalled, type Lead, type PipelineColumn, type PipelineStage } from "@/lib/data/leads";
import { useDraggableCard, useDropColumn } from "./pipeline-dnd";

/**
 * The pipeline board — §6.6.1's second tab, "for the owner's Monday review".
 *
 * Extracted from the page because drag and drop needs a ref per card and per
 * column, and hooks cannot be called inside a `map` in the page body.
 *
 * **Two ways to move a lead, on purpose.** The drag is the fast one. The
 * `Move to` menu on every card is the one that works without a mouse —
 * Pragmatic DnD deliberately ships no keyboard drag, and a board that can only
 * be operated by pointer is a control with no keyboard path, which the house
 * rules forbid. Both dispatch the identical action, so neither is a second-
 * class route to a different outcome.
 */

function LeadCard({
  lead,
  today,
  onMove,
}: {
  lead: Lead;
  today: Date;
  onMove: (leadId: string, stage: string) => void;
}) {
  const { ref, dragging } = useDraggableCard(lead.id);
  const silent = isStalled(lead, today);
  const days = daysSinceContact(lead, today);

  return (
    <div
      ref={ref}
      className={cn(
        "group/card rounded-lg p-2 text-sm transition-opacity",
        // Nothing drawn: a silent lead is a tinted surface, the rest are the
        // page ground.
        silent ? "bg-warning-bg" : "bg-muted-bg",
        // The card stays in place and fades — the browser is already painting a
        // drag image, and hiding the original as well loses the reader's place
        // in a column they are about to drop back into.
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-1">
        <GripVertical
          aria-hidden="true"
          className="mt-0.5 size-3.5 shrink-0 cursor-grab text-muted-foreground/50 transition-colors group-hover/card:text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{lead.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {lead.locality} · {lead.source}
          </p>
        </div>

        {/* The keyboard route. Same action, no pointer required. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 shrink-0 opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100"
                aria-label={`Move ${lead.name} to another stage`}
              />
            }
          >
            <span aria-hidden="true" className="text-xs">
              ⋯
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PIPELINE_STAGES.filter((stage) => stage !== lead.stage).map(
              (stage) => (
                <DropdownMenuItem
                  key={stage}
                  onClick={() => onMove(lead.id, stage)}
                >
                  Move to {STAGE_LABEL[stage]}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-semibold tabular-nums">
          {lead.quotedUnavailable || lead.quotedPaise === null ? (
            <span className="text-muted-foreground">{EM_DASH}</span>
          ) : (
            <MoneyText amount={asPaise(lead.quotedPaise)} />
          )}
        </span>
        {/*
          Age since contact, not the follow-up date — this tab is about what has
          stopped moving. A word, so the tint is never the only channel
          (§6.13.4).
        */}
        <span
          className={cn(
            "text-xs tabular-nums",
            silent ? "font-medium text-brand-brown" : "text-muted-foreground",
          )}
        >
          {days === null
            ? "no contact logged"
            : days === 0
              ? "today"
              : `silent ${days}d`}
        </span>
      </div>
    </div>
  );
}

function Column({
  column,
  today,
  onMove,
}: {
  column: PipelineColumn;
  today: Date;
  onMove: (leadId: string, stage: string) => void;
}) {
  const { ref, over } = useDropColumn(column.stage, onMove);

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-56 shrink-0 flex-col rounded-xl bg-card shadow-[var(--shadow-card)] transition-colors xl:w-auto xl:min-w-0",
        column.stage === "PARKED" &&
          "sticky right-0 shadow-[var(--shadow-raised)] xl:static xl:shadow-[var(--shadow-card)]",
        // Says so *while* the card is held, not after it is released. A drop
        // target that gives no feedback until the mouse comes up is a guess.
        over && "bg-primary-bg ring-2 ring-primary/40",
      )}
    >
      <div className="rounded-t-xl bg-muted px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold">
            {STAGE_LABEL[column.stage as PipelineStage]}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {column.rows.length}
          </span>
        </div>
        {/* A column with nothing priced has no total — it does not have a zero
            one (§6.6.4). */}
        <p className="text-xs text-muted-foreground">
          {column.valuePaise === null ? (
            <span>{EM_DASH} not quoted</span>
          ) : (
            <MoneyText amount={asPaise(column.valuePaise)} />
          )}
          {column.stalled > 0 ? (
            <span className="ml-1.5 text-brand-brown">
              · {column.stalled} silent
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2">
        {column.rows.length === 0 ? (
          <p className="px-1 py-3 text-xs text-muted-foreground">
            {over ? "Drop to move here" : "Nothing at this stage."}
          </p>
        ) : null}

        {column.rows.map((lead) => (
          <LeadCard key={lead.id} lead={lead} today={today} onMove={onMove} />
        ))}
      </div>
    </div>
  );
}

export function PipelineBoard({
  columns,
  today,
  onMove,
}: {
  columns: PipelineColumn[];
  today: Date;
  onMove: (leadId: string, stage: string) => void;
}) {
  return (
    /*
      All stages fit at xl, and scroll below it.

      The board used to be a fixed strip of 256px columns, which at 1280px hid
      620px of itself — 39% — behind a scroll nothing announced. The column that
      disappeared was `Parked`, which exists (see `PIPELINE_STAGES`) precisely
      because "an owner reviewing on Monday needs to see the pile". The one
      column that had to be seen was the one you could not.

      Below xl the strip scrolls and `Parked` is pinned to the right edge, so it
      is never the column that falls off — the rest slide underneath it.
    */
    <div
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 xl:grid xl:overflow-x-visible"
      style={{
        // Tied to the stage list, so adding a stage can never silently push one
        // onto a second row.
        ["--pipeline-cols" as string]: columns.length,
        gridTemplateColumns: "repeat(var(--pipeline-cols), minmax(0, 1fr))",
      }}
    >
      {columns.map((column) => (
        <Column
          key={column.stage}
          column={column}
          today={today}
          onMove={onMove}
        />
      ))}
    </div>
  );
}
