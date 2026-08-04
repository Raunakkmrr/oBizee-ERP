"use client";

import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LocalDataPanel } from "@/components/shared/local-data-panel";
import { ColumnHeader, Panel, ValuePill } from "@/components/shared/panel";
import { Building2, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import {
  CURRENT_USER,
  SEED_TENANT,
  SEED_USERS,
} from "@/lib/data/fixtures/tenant";

/**
 * Settings & People — §6.2's last destination, and deliberately so: "never a
 * place a daily task lives."
 *
 * **The one decision:** *who can do what, and what does this business bill as?*
 *
 * Two settings on this screen are not preferences — they are policy with a
 * money consequence, so each states its consequence rather than presenting a
 * bare switch:
 *
 * - `technician_sees_prices` (FR-1302) decides whether a technician can read
 *   the value of the job he is standing in.
 * - `allow_billing_without_signoff` (§4.2) is **off by default and audited when
 *   used** — it is the setting that lets an invoice exist for work nobody
 *   confirmed happened.
 */
/**
 * A policy row: the state, and what turning it on actually does.
 *
 * A switch with a label is a preference. A switch with its consequence beside it
 * is a decision — and both of these change what the business can legally bill.
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
    <div className="border-b px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
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
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {consequence}
      </p>
    </div>
  );
}

export default function SettingsPage() {
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
          className="mb-4"
          breadcrumb={[{ label: "oBizee Service ERP" }]}
          title="Settings &amp; people"
          description="Who can do what, and what this business bills as."
        />

        <div className="space-y-4">
          {/*
            The registered business, at the weight an admin screen deserves.

            This was a 112px full-bleed gradient slab with its two facts set at
            11px white-on-orange — a marketing banner bolted to the top of a
            table. The mistake was mine and it was specific: GATE V2 puts the
            tenant's identity on the masthead of their PRIMARY screen, and that
            already exists on the home screen. Repeating it here turned Settings
            into a landing page and made the figures unreadable at the one size
            that matters.

            Same four facts, legible, on the same surface as everything else.
          */}
          <Panel title="Registered business" icon={Building2}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Legal name</p>
                <p className="mt-0.5 font-medium">{SEED_TENANT.legalName}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Trading as</p>
                <p className="mt-0.5 font-medium">{SEED_TENANT.businessName}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  Annual turnover declared
                </p>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {formatMoney(SEED_TENANT.aatoPaise)}
                </p>
                {/* The two rules this number silently drives, named so a change
                    to it is never made casually. */}
                <p className="text-xs text-muted-foreground">
                  Drives SAC/HSN digits and e-invoicing
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Tax scheme</p>
                <p className="mt-0.5 font-medium">
                  {SEED_TENANT.taxScheme === "REGULAR"
                    ? "Regular"
                    : "Composition — services, 6%"}
                </p>
              </div>
            </div>
          </Panel>

          <Panel
            title="People &amp; roles"
            icon={Users}
            count={SEED_USERS.filter((u) => u.active).length}
            caption="Everyone who can sign in, and what each one may do"
            flush
            actions={
              <Button size="sm">
                <Users className="size-4" />
                Invite person
              </Button>
            }
          >
            <ColumnHeader>
              <span className="min-w-0 flex-1">Person</span>
              <span className="hidden w-40 shrink-0 sm:block">Role</span>
              <span className="hidden w-36 shrink-0 md:block">Language</span>
              <span className="w-20 shrink-0 text-right">Access</span>
            </ColumnHeader>

            {SEED_USERS.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 border-b px-4 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-muted/50"
              >
                {/*
                  An avatar gives every row an anchor and a shape. Inactive
                  members stay visible and legible — hiding them is how a
                  departed technician quietly keeps a login.
                */}
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    user.active
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {user.name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
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
                    {/* §7.3: the phone is the login identity in this market;
                        email is optional and its absence is normal. */}
                    {user.phone}
                    {user.email ? ` · ${user.email}` : " · no email on record"}
                  </p>
                </div>

                <div className="hidden w-40 shrink-0 sm:block">
                  <Badge
                    variant="outline"
                    className="border-primary/25 bg-primary/12 text-xs text-primary"
                  >
                    {ROLE_LABELS[user.role as Role]}
                  </Badge>
                </div>

                <div className="hidden w-36 shrink-0 md:block">
                  {user.languageOverride ? (
                    // FR-1304: a per-user override of the tenant default.
                    <span className="text-xs text-muted-foreground">
                      Override:{" "}
                      <span className="font-medium text-foreground uppercase">
                        {user.languageOverride}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Tenant default
                    </span>
                  )}
                </div>

                <div className="w-20 shrink-0 text-right">
                  <Button variant="outline" size="sm">
                    {user.active ? "Edit" : "Restore"}
                  </Button>
                </div>
              </div>
            ))}
          </Panel>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Branches &amp; GSTINs" icon={Building2} flush>
                <ColumnHeader>
                  <span className="min-w-0 flex-1">Branch</span>
                  <span className="w-44 shrink-0">GSTIN</span>
                  <span className="w-24 shrink-0 text-right">Series</span>
                </ColumnHeader>
                {SEED_TENANT.branches.map((branch) => (
                  <div
                    key={branch.gstin}
                    className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{branch.name}</p>
                      <p className="text-xs text-muted-foreground">
                        State {branch.stateCode}
                      </p>
                    </div>
                    <span className="w-44 shrink-0 text-xs tnum-id">
                      {branch.gstin}
                    </span>
                    {/* FR-811: numbering is per branch, doc type and financial
                        year — so the series belongs to the branch row. */}
                    <span className="w-24 shrink-0 text-right">
                      <ValuePill tone="brand">
                        {branch.invoiceSeriesPrefix}
                      </ValuePill>
                    </span>
                  </div>
                ))}
              </Panel>

              <Panel
                title="Working slots"
                icon={Building2}
                caption="Customers are told a window, never a single time we cannot honour"
                flush
              >
                {SEED_TENANT.slots.map((slot) => (
                  <div
                    key={slot.label}
                    className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm last:border-b-0"
                  >
                    <span className="font-medium">{slot.label}</span>
                    <ValuePill>
                      {slot.from}–{slot.to}
                    </ValuePill>
                  </div>
                ))}
              </Panel>
            </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Policy"
              icon={ShieldCheck}
              caption="Each of these has a money consequence"
              flush
            >
              {/*
                Stated as consequences, not as toggle labels. Calling the second
                one "flexible billing" would be a lie by euphemism.
              */}
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
            </Panel>

            <LocalDataPanel />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
