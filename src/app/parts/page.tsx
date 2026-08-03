"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
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

  if (rows.length === 0) {
    return (
      <Empty className="border">
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

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {rows.map((row, index) => {
        const urgency = urgencyFor(row);
        const qty = suggestedOrderQty(row);
        return (
          <div
            key={row.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2.5 text-sm last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{row.name}</span>
                <span className="text-xs text-muted-foreground tnum-id">
                  HSN {row.hsn}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {/* The vendor is the next step, so its absence is stated
                    rather than left blank. */}
                {row.preferredVendor ?? "No preferred vendor on record"}
                {" · "}
                <span className="tabular-nums">
                  {row.monthlyConsumption} used last month
                </span>
              </p>
            </div>

            {/* The word, not the colour (§6.13.4). */}
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 text-xs",
                urgency === "out" && "border-destructive/40 text-destructive",
                urgency === "below" && "text-brand-brown",
              )}
            >
              {URGENCY_WORD[urgency]}
            </Badge>

            <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {row.onHand} on hand · level {row.reorderLevel}
            </span>

            <span className="w-24 shrink-0 text-right tabular-nums">
              {/* Cost unknown renders an em-dash — never ₹0, which would read
                  as a free part and size the order wrongly. */}
              {row.unitCostPaise === null ? (
                <span className="text-muted-foreground">{EM_DASH}</span>
              ) : (
                <MoneyText amount={asPaise(row.unitCostPaise * qty)} />
              )}
            </span>

            <Button
              size="sm"
              // §6.13.2: one primary, on the most urgent row.
              variant={index === 0 ? "default" : "outline"}
            >
              Order {qty}
            </Button>
          </div>
        );
      })}
    </Card>
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
