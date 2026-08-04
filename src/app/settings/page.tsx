"use client";

import { useState } from "react";
import {
  Building2,
  Landmark,
  Lock,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BorderBeam } from "@/components/ui/border-beam";
import { GridPattern } from "@/components/ui/grid-pattern";
import { NumberTicker } from "@/components/ui/number-ticker";
import { LocalDataPanel } from "@/components/shared/local-data-panel";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import {
  CURRENT_USER,
  SEED_TENANT,
  SEED_USERS,
} from "@/lib/data/fixtures/tenant";

/**
 * Settings & people — rebuilt.
 *
 * **What this replaces and why.** The previous version was eight full-width
 * panels stacked down the page, every one the same width, the same weight and
 * the same head band. Raunak's words: *"the structure and how the weight of the
 * separate lines has been used"*. Uniform stacking gives the eye no rank — a
 * seven-person table and a three-row policy list occupied identical visual
 * space, so the screen read as a list of boxes rather than a place with
 * priorities.
 *
 * The structure now is **a section rail plus one focused pane**. Only one
 * section is on screen at a time, so it gets the full width and the full
 * attention, and the rail carries the map. That is the shape settings actually
 * has — a handful of unrelated concerns — rather than a scroll.
 *
 * Registry components, each named with the artefact it produces:
 *
 * - **`@magicui/number-ticker`** — the turnover figure counts up on arrival.
 *   The one number here that drives two statutory rules (SAC/HSN digit count,
 *   e-invoicing threshold) now announces itself instead of sitting in a row of
 *   static text.
 * - **`@magicui/border-beam`** — a light travels the border of the active pane,
 *   marking which section you are in without another static highlight.
 * - **`@magicui/grid-pattern`** — texture behind the identity block, so the one
 *   surface carrying the business name is not another flat rectangle.
 */
const SECTIONS = [
  { key: "business", label: "Business & tax", icon: Landmark },
  { key: "people", label: "People & roles", icon: Users },
  { key: "branches", label: "Branches & slots", icon: Building2 },
  { key: "policy", label: "Policy", icon: ShieldCheck },
  { key: "data", label: "Local data", icon: Lock },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

const BLURB: Record<SectionKey, string> = {
  business: "What this business is registered as, and what it bills as.",
  people: "Everyone who can sign in, and what each one may do.",
  branches: "Where invoices are raised from, and when work happens.",
  policy: "Each of these has a money consequence.",
  data: "What is stored in this browser, and how to destroy it.",
};

export default function SettingsPage() {
  const [section, setSection] = useState<SectionKey>("business");
  const today = new Date();
  const active = SECTIONS.find((s) => s.key === section)!;

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="flex min-h-full flex-col lg:flex-row">
        {/* ---------------- Section rail ---------------- */}
        <nav
          aria-label="Settings sections"
          className="shrink-0 border-b bg-card/60 p-3 lg:w-60 lg:border-r lg:border-b-0"
        >
          <p className="px-2 pb-2 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Settings
          </p>
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECTIONS.map((item) => {
              const on = item.key === section;
              const Icon: LucideIcon = item.icon;
              return (
                <li key={item.key} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => setSection(item.key)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      on
                        ? "bg-primary/12 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ---------------- Focused pane ---------------- */}
        <div className="min-w-0 flex-1 p-4 md:p-6">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {active.label}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {BLURB[section]}
            </p>
          </div>

          {/* One pane, full width, and the beam says which one is live. */}
          <div className="relative overflow-hidden rounded-xl border bg-card">
            <BorderBeam
              size={220}
              duration={14}
              className="from-transparent via-primary to-transparent"
            />

            {section === "business" ? <BusinessSection /> : null}
            {section === "people" ? <PeopleSection /> : null}
            {section === "branches" ? <BranchesSection /> : null}
            {section === "policy" ? <PolicySection /> : null}
            {section === "data" ? (
              <div className="p-4">
                <LocalDataPanel />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------- business */

function BusinessSection() {
  return (
    <div>
      {/* The identity block gets texture, so the one surface carrying the
          business name is not another flat rectangle. */}
      <div className="relative overflow-hidden border-b bg-secondary/40 px-6 py-7">
        <GridPattern
          width={28}
          height={28}
          className="absolute inset-0 h-full w-full stroke-primary/25 [mask-image:radial-gradient(320px_circle_at_left,white,transparent)]"
        />
        <div className="relative">
          <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Registered business
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            {SEED_TENANT.legalName}
          </h2>
          <p className="text-sm text-muted-foreground">
            Trading as {SEED_TENANT.businessName}
          </p>
        </div>
      </div>

      <dl className="divide-y">
        <Row label="Tax scheme">
          {SEED_TENANT.taxScheme === "REGULAR"
            ? "Regular"
            : "Composition — services, 6%"}
        </Row>
        <Row
          label="Annual turnover declared"
          note="Drives SAC/HSN digit count and whether e-invoicing applies"
        >
          {/* The number that silently drives two statutory rules. It counts up,
              so it is the thing you look at first on this pane. */}
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            ₹
            <NumberTicker
              value={SEED_TENANT.aatoPaise / 100}
              decimalPlaces={0}
              // Indian grouping: ₹4,20,00,000, never ₹42,000,000.
              locale="en-IN"
              className="tabular-nums"
            />
          </span>
        </Row>
        <Row label="Regional language">
          {SEED_TENANT.regionalLanguage.toUpperCase()}
        </Row>
      </dl>
    </div>
  );
}

function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-6 py-4">
      <dt className="w-56 shrink-0">
        <span className="text-sm font-medium">{label}</span>
        {note ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {note}
          </span>
        ) : null}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

/* --------------------------------------------------------------- people */

function PeopleSection() {
  const activeCount = SEED_USERS.filter((u) => u.active).length;
  const disabledCount = SEED_USERS.length - activeCount;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {activeCount}
          </span>{" "}
          active ·{" "}
          <span className="tabular-nums">{disabledCount}</span> disabled
        </p>
        <Button size="sm">
          <Users className="size-4" />
          Invite person
        </Button>
      </div>

      <ul className="divide-y">
        {SEED_USERS.map((user) => (
          <li
            key={user.id}
            className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-muted/40"
          >
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold",
                user.active
                  ? "bg-primary/12 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {user.name
                .split(" ")
                .slice(0, 2)
                .map((p) => p[0])
                .join("")}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cn(
                    "truncate font-medium",
                    !user.active && "text-muted-foreground",
                  )}
                >
                  {user.name}
                </span>
                {!user.active ? (
                  <Badge
                    variant="outline"
                    className="border-destructive/25 bg-destructive/10 text-xs text-destructive"
                  >
                    Disabled
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {/* §7.3: the phone is the login identity in this market. */}
                {user.phone}
                {user.email ? ` · ${user.email}` : " · no email on record"}
              </p>
            </div>

            <span className="hidden w-32 shrink-0 text-sm text-muted-foreground sm:block">
              {ROLE_LABELS[user.role as Role]}
            </span>

            <span className="hidden w-28 shrink-0 text-xs text-muted-foreground md:block">
              {user.languageOverride ? (
                <>
                  Override{" "}
                  <span className="font-medium text-foreground uppercase">
                    {user.languageOverride}
                  </span>
                </>
              ) : (
                "Tenant default"
              )}
            </span>

            <Button variant="outline" size="sm">
              {user.active ? "Edit" : "Restore"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- branches */

function BranchesSection() {
  return (
    <div className="divide-y">
      {SEED_TENANT.branches.map((branch) => (
        <div key={branch.gstin} className="px-6 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-medium">{branch.name}</span>
            <span className="text-xs text-muted-foreground tnum-id">
              {branch.gstin}
            </span>
          </div>
          {/* FR-811: numbering is per branch, doc type and financial year. */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            State {branch.stateCode} · invoices numbered{" "}
            <span className="font-medium text-foreground">
              {branch.invoiceSeriesPrefix}
            </span>{" "}
            · jobs numbered{" "}
            <span className="font-medium text-foreground">
              {branch.jobSeriesPrefix}
            </span>
          </p>
        </div>
      ))}

      <div className="px-6 py-4">
        <p className="text-sm font-medium">Working slots</p>
        <p className="mb-3 text-xs text-muted-foreground">
          {/* FR-203: the reason slots exist at all. */}
          Customers are told a window, never a single time we cannot honour.
        </p>
        <div className="flex flex-wrap gap-2">
          {SEED_TENANT.slots.map((slot) => (
            <span
              key={slot.label}
              className="rounded-lg border bg-muted px-3 py-1.5 text-sm"
            >
              {slot.label}{" "}
              <span className="text-muted-foreground tabular-nums">
                {slot.from}–{slot.to}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- policy */

function PolicySection() {
  return (
    <div className="divide-y">
      <PolicyRow
        label="Technicians can see job values"
        on={SEED_TENANT.toggles.technicianSeesPrices}
        consequence="When off, a technician sees the work and the parts but not what the customer is charged. Off is the common choice where technicians are paid per job."
      />
      <PolicyRow
        label="Allow billing without a customer sign-off"
        on={SEED_TENANT.toggles.allowBillingWithoutSignoff}
        dangerWhenOn
        consequence="Off by default. Turning it on lets an invoice be raised for a job the customer never confirmed, and every such invoice is recorded in the audit trail with the person who raised it."
      />
      <PolicyRow
        label="Coordinators can raise invoices"
        on={SEED_TENANT.toggles.coordinatorCanBill}
        consequence="When off, only the Accountant or Owner can finalise an invoice. The coordinator can still prepare one."
      />
    </div>
  );
}

/**
 * A policy row states its consequence, not its name.
 *
 * A switch with a label is a preference. A switch with what it does beside it is
 * a decision — and the first two change what this business can legally bill.
 */
function PolicyRow({
  label,
  on,
  consequence,
  dangerWhenOn = false,
}: {
  label: string;
  on: boolean;
  consequence: string;
  dangerWhenOn?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-2 px-6 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          {consequence}
        </p>
      </div>
      <Badge
        variant="outline"
        className={cn(
          "shrink-0 text-xs",
          on && dangerWhenOn
            ? "border-destructive/25 bg-destructive/10 text-destructive"
            : on
              ? "border-success/25 bg-success/12 text-success"
              : "bg-muted text-muted-foreground",
        )}
      >
        {on ? "On" : "Off"}
      </Badge>
    </div>
  );
}
