"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, MessageCircle, Phone, PhoneCall, Plus, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { TabBar } from "@/components/shared/controls";
import { PipelineBoard } from "@/components/board/pipeline-board";
import { MoneyText } from "@/components/shared/money-text";
import { StatusBadge } from "@/components/shared/status-badge";
import { LogOutcome } from "@/components/leads/log-outcome";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ColumnHeader, GroupHeader, Panel } from "@/components/shared/panel";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { asPaise } from "@/lib/money";
import { telHref, whatsappHref } from "@/lib/contact";
import { EM_DASH, loading, type Query } from "@/lib/data/result";
import { COLLAPSED_BY_DEFAULT, GROUP_LABEL, STALL_DAYS, pipelineColumns, getLeads, groupLeads, type Lead, type LeadGroup, type LeadsData } from "@/lib/data/leads";
import { moveLeadStage } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";

/**
 * Leads — PRD §6.6. **The one decision:** *who do I call right now?*
 *
 * **A dated follow-up queue, not a stage kanban.** §6.6.1: "a lead's stage does
 * not tell you who to call today. Only the follow-up date does." Pipeline exists
 * as a second **always-visible tab** — §6.6.1 is explicit that "the view choice
 * is never a dropdown".
 *
 * `UNASSIGNED` is pinned above `OVERDUE` because "a lead with no owner is a
 * worse failure than a lead whose owner is late — nobody is even responsible
 * for it".
 *
 * Rows are **52px**, not the board's 44px, "because the last-activity line earns
 * its space" (§6.6.2) — it is the element that stops her opening the record
 * before every call.
 */
export default function LeadsPage() {
  const [query, setQuery] = useState<Query<LeadsData>>(loading());
  const [tab, setTab] = useState<"queue" | "pipeline">("queue");
  const [collapsed, setCollapsed] = useState<Set<LeadGroup>>(
    new Set(COLLAPSED_BY_DEFAULT),
  );
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // FR-101: an 8-second Undo toast showing the new lead reference.
  const [savedRef, setSavedRef] = useState<string | null>(null);

  // Re-reads whenever any surface writes to the store.
  const reload = useCallback(() => {
    void getLeads().then(setQuery);
  }, []);
  useEffect(reload, [reload]);

  /*
    Dragging a card is a stage change and nothing else — no outcome, no date.
    The register keeps whatever follow-up the lead already had, because moving
    a card is not the same act as making a call, and clearing the date here
    would lose the lead (FR-104).
  */
  const moveStage = useMutation(
    useCallback(
      async (leadId: string, stage: string) => {
        const result = await moveLeadStage(leadId, stage);
        if (result.ok) reload();
        return result;
      },
      [reload],
    ),
  );

  /**
   * §6.6.5: `[+ New lead]` carries the keyboard shortcut `N`. This is "the one
   * screen where the create action outranks anything in the list, because a
   * lead not captured is revenue that never existed".
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (!typing && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        document.getElementById("new-lead")?.click();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const today = new Date();

  function toggle(group: LeadGroup) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  /** §6.6.3: saving an outcome returns focus to the next row in the queue. */
  function focusNext(order: Lead[], index: number) {
    const next = order[index + 1];
    if (next) rowRefs.current[next.id]?.focus();
  }

  return (
    <AppShell
      today={today}
      freshness={{ kind: "fresh", at: today }}
      badges={{ leads_overdue: 2 }}
    >
      {savedRef ? (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-[var(--z-toast)] flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-md"
        >
          <span className="text-sm">
            Lead saved · <span className="tnum-id">{savedRef}</span>
          </span>
          <Button variant="outline" size="sm" onClick={() => setSavedRef(null)}>
            Undo
          </Button>
        </div>
      ) : null}

      <div className="p-4 md:p-6">
        {/*
          Moving a card between stages could be refused with nothing shown, so
          the card sprang back and the reader was left guessing whether they
          had dragged it wrong.
        */}
        {moveStage.error ? (
          <div className="mb-4">
            <ErrorState error={moveStage.error} onRetry={moveStage.reset} />
          </div>
        ) : null}

        <PageHeader
          className="mb-4"
          breadcrumb={[{ label: "Work" }]}
          title="Leads"
          description="Who to call right now, in follow-up order."
          actions={
            <Button
              id="new-lead"
              render={<Link href="/leads/new" />}
              nativeButton={false}
            >
              <Plus className="size-4" />
              New lead
              {/* The shortcut is shown, not hidden in a help page. */}
              <kbd className="ml-1 rounded border border-primary-foreground/30 px-1 text-[10px]">
                N
              </kbd>
            </Button>
          }
        />

        {/* §6.6.1: every view visible at once, never a dropdown of views. */}
        <TabBar
          className="mb-3"
          value={tab}
          onChange={setTab}
          items={[
            { value: "queue", label: "Follow-up queue" },
            { value: "pipeline", label: "Pipeline" },
          ]}
        />

        <QueryBoundary query={query} label="the follow-up queue" loadingRows={8}>
          {(data) => {
            if (tab === "pipeline") {
              const columns = pipelineColumns(data.leads, today);
              const totalStalled = columns.reduce((n, c) => n + c.stalled, 0);
              // Count what is actually *on the board*, not what is in the
              // queue: a terminal lead has left the queue and has no column, so
              // reusing the queue's count would overstate the pipeline.
              const onBoard = columns.reduce((n, c) => n + c.rows.length, 0);
              const priced = columns.filter((c) => c.valuePaise !== null);
              const pipelineValue =
                priced.length === 0
                  ? null
                  : priced.reduce((sum, c) => sum + (c.valuePaise ?? 0), 0);

              return (
                <div className="space-y-3">
                  {/*
                    §6.6.1: this tab is "for the owner's Monday review", which is
                    a different question from the queue's. So it opens on the two
                    facts an owner reviews for — what the pipeline is worth, and
                    what has stopped moving — rather than on who to call.
                  */}
                  <Card className="gap-0 py-0">
                    <div className="flex flex-wrap items-center gap-4 p-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <TrendingUp className="size-5" />
                      </span>
                      <div className="min-w-0">
                        {pipelineValue === null ? (
                          <span className="block text-2xl font-semibold text-muted-foreground">
                            {EM_DASH}
                          </span>
                        ) : (
                          <MoneyText
                            amount={asPaise(pipelineValue)}
                            className="block text-2xl font-semibold tracking-tight"
                          />
                        )}
                        <p className="text-xs text-muted-foreground tabular-nums">
                          quoted and open across {onBoard} leads
                          {totalStalled > 0 ? (
                            <>
                              {" · "}
                              <span className="font-medium text-brand-brown">
                                {totalStalled} silent {STALL_DAYS}+ days
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  </Card>

                  <PipelineBoard
                    columns={columns}
                    today={today}
                    onMove={(leadId, stage) => void moveStage.run(leadId, stage)}
                  />
                </div>
              );
            }

            const sections = groupLeads(data.leads);
            const flat = sections.flatMap((s) => s.rows);

            if (flat.length === 0) {
              return (
                <Empty className="border">
                  <EmptyHeader>
                    {/* Never celebratory — this is a work screen (§6.6.4). */}
                    <EmptyTitle>Nothing due today.</EmptyTitle>
                    <EmptyDescription>
                      {data.tomorrowCount} follow-ups are due tomorrow.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <div className="flex gap-2">
                      <Button
                        render={<Link href="/leads/new" />}
                        nativeButton={false}
                      >
                        New lead
                      </Button>
                    </div>
                  </EmptyContent>
                </Empty>
              );
            }

            return (
              <Panel
                title="Follow-up queue"
                icon={PhoneCall}
                count={flat.length}
                caption="Unassigned first, then by how late — a lead with no owner is the worse failure"
                flush
              >
                <ColumnHeader>
                  <span className="min-w-0 flex-1">Lead</span>
                  <span className="w-20 shrink-0 text-right">Quoted</span>
                  <span className="hidden w-28 shrink-0 lg:block">Source</span>
                  <span className="hidden w-28 shrink-0 xl:block">Owner</span>
                  <span className="w-[268px] shrink-0 text-right">Act</span>
                </ColumnHeader>

                {sections.map((section) => {
                  const isCollapsed = collapsed.has(section.group);
                  return (
                    <div key={section.group}>
                      {/* The group band replaces a bare heading: it belongs to
                          the table, not to the page above it. */}
                      <GroupHeader
                        label={GROUP_LABEL[section.group]}
                        count={section.rows.length}
                        right={
                          <button
                            type="button"
                            onClick={() => toggle(section.group)}
                            aria-expanded={!isCollapsed}
                            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${GROUP_LABEL[section.group]}`}
                            className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </button>
                        }
                      />

                      {!isCollapsed ? (
                        <>
                          {section.rows.map((lead) => {
                            const index = flat.findIndex((l) => l.id === lead.id);
                            return (
                              <div
                                key={lead.id}
                                ref={(el) => {
                                  rowRefs.current[lead.id] = el;
                                }}
                                tabIndex={-1}
                                className="flex h-[52px] items-center gap-3 px-4 text-sm transition-colors odd:bg-white/[0.018] hover:bg-accent focus:bg-accent focus:outline-none"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 leading-[18px]">
                                    <span className="truncate font-medium">
                                      {lead.name}
                                    </span>
                                    <StatusBadge
                                      status={lead.stage}
                                      kind="lead"
                                      className="shrink-0 text-[11px]"
                                    />
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                      {lead.dueWord}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs leading-4 text-muted-foreground">
                                    <span className="shrink-0">
                                      {lead.locality}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    {/* The highest-value element in the row. */}
                                    <span className="min-w-0 truncate">
                                      {lead.lastActivity ? (
                                        <>
                                          <span className="tabular-nums">
                                            {lead.lastActivity.date}
                                          </span>{" "}
                                          — {lead.lastActivity.text}
                                        </>
                                      ) : (
                                        "Activity unavailable"
                                      )}
                                    </span>
                                  </div>
                                </div>

                                {/* Quoted value — `—` when unavailable, never ₹0. */}
                                <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                                  {lead.quotedUnavailable ? (
                                    <span className="text-muted-foreground">
                                      {EM_DASH}
                                    </span>
                                  ) : lead.quotedPaise !== null ? (
                                    <MoneyText amount={asPaise(lead.quotedPaise)} />
                                  ) : null}
                                </span>

                                {/* Source chip — a WhatsApp lead is answered
                                    differently from a walk-in. */}
                                <span className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground lg:block">
                                  {lead.source}
                                </span>

                                {/*
                                  Owner, with **taken-by shown only when it
                                  differs** — defect D6.

                                  §6.6.2 suggested putting taken-by behind hover;
                                  §6.13.9 forbids hover-only affordances outright
                                  and §3.2's coordinator is on a touch laptop, so
                                  it must be a real column at ≥1280px. But a
                                  second always-on column would crowd the row for
                                  no gain: FR-103 keeps both fields because
                                  "MSMEs pay incentives on the first and manage on
                                  the second", and that distinction only carries
                                  information when the two disagree. When they
                                  match, the second column is noise.
                                */}
                                <span className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground xl:block">
                                  {lead.owner ?? "Unassigned"}
                                  {/*
                                    Only when there IS an owner and they differ.
                                    An unassigned lead's own message is that
                                    nobody owns it — appending "took System" to
                                    that is noise, and it was overflowing the
                                    column to say nothing.
                                  */}
                                  {lead.owner && lead.takenBy !== lead.owner ? (
                                    <span title="Taken by — used for incentive reporting">
                                      {" "}
                                      · took {lead.takenBy}
                                    </span>
                                  ) : null}
                                </span>

                                {/* The action IS the phone number (§6.6.2) —
                                    no navigation required to work the queue. */}
                                <div className="flex shrink-0 items-center gap-1">
                                  {/*
                                    Labelled, not icon-only. §6.6.3 specifies
                                    "three **labelled** controls: [Call]
                                    [WhatsApp] [Log outcome]", and §6.13.10 only
                                    permits a bare icon "on repeated row-level
                                    accelerators whose meaning is already
                                    established by a labelled equivalent
                                    elsewhere on the same screen" — there is no
                                    such equivalent here. Shipped icon-only until
                                    it was seen at full resolution in Chrome.
                                  */}
                                  {/*
                                    Routed through `telHref`/`whatsappHref`
                                    rather than interpolated. Hand-built hrefs
                                    produced `tel:` on a lead with no number and
                                    `wa.me/91+91…` on one written internationally
                                    — both live controls that go nowhere, which
                                    is worse than an absent one because it fails
                                    in front of a customer.
                                  */}
                                  {telHref(lead.phone) === null ? (
                                    <span className="text-xs text-muted-foreground">
                                      No number yet — open the lead to add one
                                    </span>
                                  ) : (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        aria-label={`Call ${lead.name} on ${lead.phone}`}
                                        render={<a href={telHref(lead.phone) ?? undefined} />}
                                        nativeButton={false}
                                      >
                                        <Phone className="size-3.5" />
                                        Call
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        aria-label={`WhatsApp ${lead.name}`}
                                        render={
                                          <a
                                            href={whatsappHref(lead.phone) ?? undefined}
                                            target="_blank"
                                            rel="noreferrer"
                                          />
                                        }
                                        nativeButton={false}
                                      >
                                        <MessageCircle className="size-3.5" />
                                        WhatsApp
                                      </Button>
                                    </>
                                  )}
                                  <LogOutcome
                                    lead={lead}
                                    onSaved={() => focusNext(flat, index)}
                                  />
                                  {/*
                                    Visible on every row, not gated behind an
                                    outcome. Converting a lead is the moment an
                                    AMC business lives or dies on, and it used
                                    to be two clicks deep inside a popover.
                                  */}
                                  <Button
                                    size="sm"
                                    aria-label={`Convert ${lead.name}`}
                                    render={
                                      <Link
                                        href={`/leads/convert?${new URLSearchParams({
                                          leadId: lead.id,
                                          fromLead: lead.reference,
                                          customer: lead.name,
                                          site: lead.locality,
                                          ...(lead.quotedPaise !== null
                                            ? {
                                                value: String(
                                                  Math.round(lead.quotedPaise / 100),
                                                ),
                                              }
                                            : {}),
                                        }).toString()}`}
                                      />
                                    }
                                    nativeButton={false}
                                  >
                                    Convert
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </Panel>
            );
          }}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
