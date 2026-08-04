"use client";

import { useEffect, useState } from "react";
import { PackageSearch } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ActionBar,
  ColumnHeader,
  GroupHeader,
  Panel,
  ValuePill,
} from "@/components/shared/panel";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Illustration } from "@/components/shared/illustration";
import { cn } from "@/lib/utils";
import { asPaise } from "@/lib/money";
import { EM_DASH, loading, type Query } from "@/lib/data/result";
import { usePersistedChoice } from "@/lib/persisted-choice";
import {
  EXCEPTION_LABEL,
  EXCEPTION_WHY,
  PARTS_TABS,
  PARTS_TAB_LABEL,
  URGENCY_WORD,
  byUrgency,
  getParts,
  suggestedOrderQty,
  urgencyFor,
  type PartsData,
  type PartsTab,
  type ReorderRow,
} from "@/lib/data/parts";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";

/**
 * Parts & stock — §6.14.
 *
 * **The one decision:** *what do I need to buy, and what is unaccounted for?*
 *
 * Three always-visible tabs, never a dropdown of views (§6.2). **Reorder is the
 * default because it is the only tab that produces an action** — the other two
 * answer questions, this one ends in a purchase order.
 */
const TAB_KEY = "obez.parts.tab";

function Reorder({ data }: { data: PartsData }) {
  const rows = [...data.reorder].sort(byUrgency);
  /**
   * Which parts are actually going on the order.
   *
   * The reference ERP's load screen is built around exactly this: a list you
   * *select from*, with a pinned bar showing what you are committing to. A
   * reorder screen without it is a report — you read it, then do the ordering
   * somewhere else.
   *
   * Everything below its reorder level starts selected, because that is what
   * the screen is recommending; unticking is the deliberate act.
   */
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(rows.filter((r) => urgencyFor(r) !== "at").map((r) => r.id)),
  );

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <Empty className="border">
        <Illustration name="stock" width={180} className="mx-auto mb-1" />
        <EmptyHeader>
          <EmptyTitle>Nothing needs reordering.</EmptyTitle>
          <EmptyDescription>
            Every part is at or above its reorder level.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline">See stock by location</Button>
        </EmptyContent>
      </Empty>
    );
  }

  const selected = rows.filter((row) => chosen.has(row.id));
  const orderValue = selected.reduce(
    (sum, row) =>
      sum + (row.unitCostPaise === null ? 0 : row.unitCostPaise * suggestedOrderQty(row)),
    0,
  );
  // A part with no cost on record cannot contribute to a total — and the total
  // must say so rather than quietly under-reporting what the order will cost.
  const unpriced = selected.filter((row) => row.unitCostPaise === null).length;

  const groups: { urgency: ReturnType<typeof urgencyFor>; rows: ReorderRow[] }[] =
    (["out", "below", "at"] as const)
      .map((urgency) => ({
        urgency,
        rows: rows.filter((row) => urgencyFor(row) === urgency),
      }))
      .filter((group) => group.rows.length > 0);

  return (
    <>
      <Panel
        title="Needs reordering"
        icon={PackageSearch}
        count={rows.length}
        caption="Grouped by how urgent it is, worst first"
        flush
      >
        <ColumnHeader>
          <span className="w-6 shrink-0" />
          <span className="min-w-0 flex-1">Part</span>
          <span className="hidden w-40 shrink-0 sm:block">Stock</span>
          <span className="hidden w-24 shrink-0 text-right md:block">Used /mo</span>
          <span className="w-20 shrink-0 text-right">Order</span>
          <span className="w-28 shrink-0 text-right">Value</span>
        </ColumnHeader>

        {groups.map((group) => (
          <div key={group.urgency}>
            {/* The word carries the state; the group is not colour alone. */}
            <GroupHeader
              label={URGENCY_WORD[group.urgency]}
              count={group.rows.length}
            />
            {group.rows.map((row) => {
              const qty = suggestedOrderQty(row);
              const on = chosen.has(row.id);
              return (
                <label
                  key={row.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-b px-4 py-2.5 text-sm transition-colors last:border-b-0",
                    on ? "bg-primary/[0.04]" : "hover:bg-muted/50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(row.id)}
                    className="size-4 shrink-0 accent-primary"
                    aria-label={`Include ${row.name} in this order`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate font-medium">{row.name}</span>
                      <span className="text-xs text-muted-foreground tnum-id">
                        HSN {row.hsn}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.preferredVendor ?? "No preferred vendor on record"}
                    </p>
                  </div>

                  <span className="hidden w-40 shrink-0 text-xs text-muted-foreground tabular-nums sm:block">
                    {row.onHand} on hand · level {row.reorderLevel}
                  </span>

                  <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums md:block">
                    {row.monthlyConsumption}
                  </span>

                  <span className="w-20 shrink-0 text-right">
                    {/* The number the screen exists to produce. */}
                    <ValuePill tone={on ? "brand" : "neutral"}>{qty}</ValuePill>
                  </span>

                  <span className="w-28 shrink-0 text-right tabular-nums">
                    {row.unitCostPaise === null ? (
                      <span className="text-muted-foreground">{EM_DASH}</span>
                    ) : (
                      <MoneyText amount={asPaise(row.unitCostPaise * qty)} />
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        ))}
      </Panel>

      {/*
        The commitment bar. An action in a page header tells you nothing about
        what you are about to buy; here the totals and the button are one object.
      */}
      <ActionBar
        primary={
          <>
            <Button variant="outline" size="sm">
              Save draft
            </Button>
            <Button size="sm" disabled={selected.length === 0}>
              Raise purchase order
            </Button>
          </>
        }
      >
        <div>
          <p className="text-xs text-muted-foreground">Parts selected</p>
          <p className="text-sm font-semibold tabular-nums">
            {selected.length}{" "}
            <span className="font-normal text-muted-foreground">
              of {rows.length}
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Units</p>
          <p className="text-sm font-semibold tabular-nums">
            {selected.reduce((sum, row) => sum + suggestedOrderQty(row), 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Order value</p>
          <p className="text-sm font-semibold">
            <MoneyText amount={asPaise(orderValue)} />
            {unpriced > 0 ? (
              // Honest rather than tidy: the figure excludes what it cannot price.
              <span className="ml-1.5 text-xs font-normal text-brand-brown">
                + {unpriced} unpriced
              </span>
            ) : null}
          </p>
        </div>
      </ActionBar>
    </>
  );
}

function Locations({ data }: { data: PartsData }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {data.locations.map((location) => (
        <Card key={location.id} className="gap-0 overflow-hidden py-0">
          <div className="border-b px-3 py-2">
            <p className="text-sm font-medium">{location.name}</p>
            {/*
              §6.14: a van is named **with its technician**. "Van 3" is not
              actionable; "Ramesh's van" is — you know who to call.
            */}
            <p className="text-xs text-muted-foreground">
              {location.kind === "VAN"
                ? (location.technicianName ?? "Unassigned van")
                : "Store"}
            </p>
          </div>
          {location.lines.map((line) => (
            <div
              key={line.partId}
              className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate">{line.partName}</span>
              <span
                className={cn(
                  "shrink-0 tabular-nums",
                  // A negative is shown as a negative, not clamped to zero —
                  // it is the evidence the Exceptions tab is built on.
                  line.qty < 0 && "font-medium text-destructive",
                )}
              >
                {line.qty}
              </span>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

function Exceptions({ data }: { data: PartsData }) {
  if (data.exceptions.length === 0) {
    return (
      <Empty className="border">
        <Illustration name="money" width={170} className="mx-auto mb-1" />
        <EmptyHeader>
          <EmptyTitle>Nothing unaccounted for.</EmptyTitle>
          <EmptyDescription>
            No negative stock, uncatalogued parts or undocumented issues.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {data.exceptions.map((exception) => (
        <div
          key={exception.id}
          className="border-b px-3 py-2.5 text-sm last:border-b-0"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{exception.partName}</span>
                <Badge variant="outline" className="text-xs">
                  {EXCEPTION_LABEL[exception.kind]}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {exception.detail} ·{" "}
                <span className="tabular-nums">{exception.raisedOn}</span>
                {exception.raisedBy ? ` · ${exception.raisedBy}` : null}
              </p>
            </div>
            {exception.qty !== null ? (
              <span
                className={cn(
                  "shrink-0 tabular-nums",
                  exception.qty < 0 && "font-medium text-destructive",
                )}
              >
                {exception.qty}
              </span>
            ) : null}
            <Button variant="outline" size="sm">
              {exception.kind === "UNCATALOGUED"
                ? "Catalogue part"
                : exception.kind === "ISSUE_WITHOUT_CHALLAN"
                  ? "Raise challan"
                  : "Reconcile"}
            </Button>
          </div>
          {/* Each kind says what it actually means. "Exception" alone tells
              nobody why it cannot be ignored. */}
          <p className="mt-1 text-xs text-muted-foreground">
            {EXCEPTION_WHY[exception.kind]}
          </p>
        </div>
      ))}
    </Card>
  );
}

export default function PartsPage() {
  const [query, setQuery] = useState<Query<PartsData>>(loading());
  const [tab, setTab] = usePersistedChoice<PartsTab>(
    TAB_KEY,
    PARTS_TABS,
    "reorder",
  );

  useEffect(() => {
    let cancelled = false;
    getParts().then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date();

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <PageHeader
          className="mb-3"
          title="Parts &amp; stock"
          description="What to buy, and what is unaccounted for."
        />

        <div className="mb-3 flex items-center gap-1 border-b">
          {PARTS_TABS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                tab === value
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {PARTS_TAB_LABEL[value]}
            </button>
          ))}
        </div>

        <QueryBoundary query={query} label="parts and stock" loadingRows={6}>
          {(data) =>
            tab === "reorder" ? (
              <Reorder data={data} />
            ) : tab === "locations" ? (
              <Locations data={data} />
            ) : (
              <Exceptions data={data} />
            )
          }
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
