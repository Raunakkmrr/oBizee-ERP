"use client";

import { useState } from "react";
import {
  Building2,
  Clock,
  Landmark,
  Lock,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { MagicCard } from "@/components/ui/magic-card";
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
 * Settings & people — attempt 2.
 *
 * **Dropped permanently from attempt 1** (the rule is drop, never refine): the
 * section rail and focused pane, and — the thing named hardest — **every
 * separator**. No `divide-y`, no `border-b` between rows, no ruled tables.
 *
 * Raunak: *"I hate the separators so much… It's making it look like a 2D
 * design."* He is describing something real. A ruled row is a 2012 data grid:
 * the line does the work of saying "these are different things", which means
 * the things themselves are doing none of it. Research into current dashboard
 * work says the same in the positive — separate with **card modules, spacing
 * and elevation**, never with lines.
 *
 * So the unit here is not a row. **Every person, branch, slot and policy is its
 * own object with its own surface**, lifted off the ground by shadow and held
 * apart by space. Nothing is ruled, because nothing needs to be: two floating
 * objects are self-evidently two objects.
 *
 * Depth is doing the work that lines used to:
 *
 * - the page carries a soft radial wash, so surfaces sit *on* something
 * - cards use layered shadow that deepens on hover — elevation as a live
 *   property, not a static border
 * - **`@magicui/magic-card`** puts a spotlight that tracks the cursor on the two
 *   surfaces that matter most, so the screen responds to being looked at
 * - **`@magicui/number-ticker`** counts the turnover up, in Indian grouping
 *
 * The dark rail stays. It was the one thing that worked.
 */
const SECTIONS = [
  { key: "business", label: "Business", icon: Landmark },
  { key: "people", label: "People", icon: Users },
  { key: "branches", label: "Branches", icon: Building2 },
  { key: "policy", label: "Policy", icon: ShieldCheck },
  { key: "data", label: "Data", icon: Lock },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

/** Soft, layered elevation. The shadow is the separator now. */
const FLOAT =
  "rounded-2xl bg-card shadow-[0_1px_2px_rgba(74,64,56,0.06),0_8px_24px_-12px_rgba(74,64,56,0.18)] transition-all duration-300 hover:shadow-[0_2px_4px_rgba(74,64,56,0.08),0_16px_40px_-16px_rgba(74,64,56,0.28)] hover:-translate-y-0.5";

export default function SettingsPage() {
  const [section, setSection] = useState<SectionKey>("business");
  const today = new Date();

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      {/* A wash, so cards sit on something rather than on a flat fill. */}
      <div className="relative min-h-full">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(209,124,69,0.10),transparent_60%),radial-gradient(900px_500px_at_100%_0%,rgba(124,99,58,0.08),transparent_55%)]"
        />

        <div className="relative p-5 md:p-8">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {SEED_TENANT.businessName}
          </p>

          {/* Pill switcher — floating, not a tab bar with a rule under it. */}
          <div className="mt-5 inline-flex flex-wrap gap-1.5 rounded-2xl bg-card/70 p-1.5 shadow-[0_1px_2px_rgba(74,64,56,0.06),0_8px_24px_-16px_rgba(74,64,56,0.2)] backdrop-blur">
            {SECTIONS.map((item) => {
              const on = item.key === section;
              const Icon: LucideIcon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSection(item.key)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-all duration-200",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    on
                      ? "bg-gradient-to-b from-primary to-primary/85 font-medium text-primary-foreground shadow-[0_2px_8px_-2px_rgba(209,124,69,0.6)]"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            {section === "business" ? <Business /> : null}
            {section === "people" ? <People /> : null}
            {section === "branches" ? <Branches /> : null}
            {section === "policy" ? <Policy /> : null}
            {section === "data" ? <LocalDataPanel /> : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------- business */

function Business() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* The identity surface — cursor-tracked spotlight, so the screen
          responds to being looked at. */}
      <MagicCard
        gradientColor="#f3e9e0"
        gradientFrom="#d17c45"
        gradientTo="#e6a93c"
        gradientOpacity={0.5}
        className="rounded-2xl shadow-[0_1px_2px_rgba(74,64,56,0.06),0_16px_40px_-20px_rgba(74,64,56,0.35)] lg:col-span-2"
      >
        <div className="p-7">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Registered business
          </p>
          <h2 className="mt-2 text-2xl leading-tight font-semibold tracking-tight">
            {SEED_TENANT.legalName}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Trading as {SEED_TENANT.businessName} · GSTIN{" "}
            <span className="tnum-id">{SEED_TENANT.branches[0].gstin}</span>
          </p>
        </div>
      </MagicCard>

      {/* The number that drives two statutory rules, given its own object. */}
      <div className={cn(FLOAT, "p-7")}>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Turnover declared
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
          ₹
          <NumberTicker
            value={SEED_TENANT.aatoPaise / 100}
            decimalPlaces={0}
            locale="en-IN"
            className="tabular-nums"
          />
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Sets SAC/HSN digit count and whether e-invoicing applies.
        </p>
      </div>

      <Tile label="Tax scheme" value={SEED_TENANT.taxScheme === "REGULAR" ? "Regular" : "Composition 6%"} />
      <Tile label="Regional language" value={SEED_TENANT.regionalLanguage.toUpperCase()} />
      <Tile label="Financial year" value="1 Apr – 31 Mar" />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(FLOAT, "p-5")}>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-lg font-medium">{value}</p>
    </div>
  );
}

/* --------------------------------------------------------------- people */

function People() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {SEED_USERS.filter((u) => u.active).length}
          </span>{" "}
          people can sign in
        </p>
        <Button size="sm">
          <Users className="size-4" />
          Invite person
        </Button>
      </div>

      {/* Every person is an object, not a ruled row. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SEED_USERS.map((user) => (
          <div
            key={user.id}
            className={cn(
              FLOAT,
              "p-5",
              !user.active && "opacity-70 hover:opacity-100",
            )}
          >
            <div className="flex items-start gap-3.5">
              <span
                className={cn(
                  "grid size-12 shrink-0 place-items-center rounded-2xl text-sm font-semibold",
                  user.active
                    ? "bg-gradient-to-br from-primary/25 to-primary/5 text-primary"
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
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground tabular-nums">
                  {/* §7.3: phone is the login identity in this market. */}
                  {user.phone}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {ROLE_LABELS[user.role as Role]}
              </span>
              {user.languageOverride ? (
                // FR-1304: a per-user override of the tenant default.
                <span className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground uppercase">
                  {user.languageOverride}
                </span>
              ) : null}
              {!user.active ? (
                <span className="rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                  Disabled
                </span>
              ) : null}
              <Button variant="outline" size="sm" className="ml-auto">
                {user.active ? "Edit" : "Restore"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- branches */

function Branches() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {SEED_TENANT.branches.map((branch) => (
        <MagicCard
          key={branch.gstin}
          gradientColor="#f3e9e0"
          gradientFrom="#d17c45"
          gradientTo="#e6a93c"
          gradientOpacity={0.4}
          className="rounded-2xl shadow-[0_1px_2px_rgba(74,64,56,0.06),0_12px_32px_-18px_rgba(74,64,56,0.3)]"
        >
          <div className="p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary">
                <Building2 className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{branch.name}</p>
                <p className="truncate text-xs text-muted-foreground tnum-id">
                  {branch.gstin}
                </p>
              </div>
            </div>
            {/* FR-811: numbering is per branch, doc type and financial year. */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip label="State" value={branch.stateCode} />
              <Chip label="Invoices" value={branch.invoiceSeriesPrefix} />
              <Chip label="Jobs" value={branch.jobSeriesPrefix} />
            </div>
          </div>
        </MagicCard>
      ))}

      <div className={cn(FLOAT, "p-6 lg:col-span-2")}>
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary">
            <Clock className="size-5" />
          </span>
          <div>
            <p className="font-medium">Working slots</p>
            {/* FR-203: the reason slots exist at all. */}
            <p className="text-xs text-muted-foreground">
              Customers are told a window, never a single time we cannot honour.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {SEED_TENANT.slots.map((slot) => (
            <div
              key={slot.label}
              className="rounded-xl bg-gradient-to-b from-muted to-muted/40 p-4"
            >
              <p className="text-sm font-medium">{slot.label}</p>
              <p className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">
                {slot.from}–{slot.to}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg bg-muted px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground">{label} </span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

/* --------------------------------------------------------------- policy */

function Policy() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <PolicyCard
        label="Technicians can see job values"
        on={SEED_TENANT.toggles.technicianSeesPrices}
        consequence="When off, a technician sees the work and the parts but not what the customer is charged. Off is the common choice where technicians are paid per job."
      />
      <PolicyCard
        label="Billing without a sign-off"
        on={SEED_TENANT.toggles.allowBillingWithoutSignoff}
        dangerWhenOn
        consequence="Off by default. Turning it on lets an invoice be raised for a job the customer never confirmed, and every such invoice is recorded in the audit trail with the person who raised it."
      />
      <PolicyCard
        label="Coordinators can raise invoices"
        on={SEED_TENANT.toggles.coordinatorCanBill}
        consequence="When off, only the Accountant or Owner can finalise an invoice. The coordinator can still prepare one."
      />
    </div>
  );
}

/**
 * A policy is its own card, and it states its consequence rather than its name.
 * A switch with a label is a preference; a switch with what it does beside it is
 * a decision — and two of these change what this business can legally bill.
 */
function PolicyCard({
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
    <div className={cn(FLOAT, "flex flex-col p-6")}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{label}</p>
        <span
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold",
            on && dangerWhenOn
              ? "bg-destructive/12 text-destructive"
              : on
                ? "bg-success/12 text-success"
                : "bg-muted text-muted-foreground",
          )}
        >
          {on ? "On" : "Off"}
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {consequence}
      </p>
    </div>
  );
}
