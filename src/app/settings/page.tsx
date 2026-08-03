"use client";

import { useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LocalDataPanel } from "@/components/shared/local-data-panel";
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
const SECTIONS = ["people", "business", "policy"] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_LABEL: Record<Section, string> = {
  people: "People & roles",
  business: "Business & tax",
  policy: "Policy",
};

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b px-3 py-2 text-sm last:border-b-0">
      <div className="min-w-0">
        <span>{label}</span>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <span className="shrink-0 text-right">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("people");
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
          title="Settings &amp; people"
          description="Who can do what, and what this business bills as."
        />

        <div className="mb-3 flex items-center gap-1 border-b">
          {SECTIONS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={section === value}
              onClick={() => setSection(value)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                section === value
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {SECTION_LABEL[value]}
            </button>
          ))}
        </div>

        {section === "people" ? (
          <Card className="gap-0 overflow-hidden py-0">
            {SEED_USERS.map((user) => (
              <div
                key={user.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2.5 text-sm last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={cn(
                        "font-medium",
                        // An inactive member stays visible and legible — hiding
                        // them is how a departed technician keeps a login.
                        !user.active && "text-muted-foreground",
                      )}
                    >
                      {user.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {ROLE_LABELS[user.role as Role]}
                    </Badge>
                    {!user.active ? (
                      <span className="text-xs text-muted-foreground">
                        Disabled
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {/* §7.3: the phone is the login identity in this market;
                        email is optional and its absence is normal. */}
                    {user.phone}
                    {user.email ? ` · ${user.email}` : " · no email on record"}
                  </p>
                </div>

                {user.languageOverride ? (
                  // FR-1304: a per-user override of the tenant default.
                  <Badge variant="outline" className="shrink-0 text-xs">
                    Language: {user.languageOverride}
                  </Badge>
                ) : null}

                <Button variant="outline" size="sm">
                  {user.active ? "Edit" : "Re-enable"}
                </Button>
              </div>
            ))}
          </Card>
        ) : null}

        {section === "business" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="gap-0 overflow-hidden py-0">
              <p className="border-b px-3 py-2 text-sm font-medium">Business</p>
              <Row label="Legal name" value={SEED_TENANT.legalName} />
              <Row label="Trading name" value={SEED_TENANT.businessName} />
              <Row
                label="Tax scheme"
                value={
                  SEED_TENANT.taxScheme === "REGULAR"
                    ? "Regular"
                    : "Composition — services, 6%"
                }
              />
              <Row
                label="Annual turnover declared"
                value={
                  <span className="tabular-nums">
                    {formatMoney(SEED_TENANT.aatoPaise)}
                  </span>
                }
                // The two rules this number silently drives, named here so a
                // change to it is never made casually.
                hint="Drives SAC/HSN digit count and whether e-invoicing applies"
              />
            </Card>

            <Card className="gap-0 overflow-hidden py-0">
              <p className="border-b px-3 py-2 text-sm font-medium">
                Branches &amp; GSTINs
              </p>
              {SEED_TENANT.branches.map((branch) => (
                <Row
                  key={branch.gstin}
                  label={branch.name}
                  value={
                    <span className="tnum-id text-xs">{branch.gstin}</span>
                  }
                  // FR-811: numbering is per (branch, doc type, financial year),
                  // so the prefix belongs to the branch, not the tenant.
                  hint={`State ${branch.stateCode} · invoice series ${branch.invoiceSeriesPrefix}`}
                />
              ))}
            </Card>

            <Card className="gap-0 overflow-hidden py-0">
              <p className="border-b px-3 py-2 text-sm font-medium">
                Working slots
              </p>
              {SEED_TENANT.slots.map((slot) => (
                <Row
                  key={slot.label}
                  label={slot.label}
                  value={
                    <span className="tabular-nums">
                      {slot.from}–{slot.to}
                    </span>
                  }
                />
              ))}
              <div className="px-3 py-2">
                {/* FR-203: the reason slots exist at all. */}
                <p className="text-xs text-muted-foreground">
                  Customers are told a window, never a single time that cannot
                  be honoured.
                </p>
              </div>
            </Card>
          </div>
        ) : null}

        {section === "policy" ? (
          <div className="space-y-4">
          <Card className="max-w-3xl gap-0 overflow-hidden py-0">
            <p className="border-b px-3 py-2 text-sm font-medium">
              Policy — each of these has a money consequence
            </p>

            <div className="space-y-2 px-3 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  Technicians can see job values
                </span>
                <Badge variant="outline">
                  {SEED_TENANT.toggles.technicianSeesPrices ? "On" : "Off"}
                </Badge>
              </div>
              {/* FR-1302. Stated as a consequence, not as a toggle label. */}
              <p className="text-xs text-muted-foreground">
                When off, a technician sees the work and the parts but not what
                the customer is being charged. Off is the common choice where
                technicians are paid per job rather than salaried.
              </p>

              <Separator />

              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  Allow billing without a customer sign-off
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    SEED_TENANT.toggles.allowBillingWithoutSignoff &&
                      "border-destructive/40 text-destructive",
                  )}
                >
                  {SEED_TENANT.toggles.allowBillingWithoutSignoff ? "On" : "Off"}
                </Badge>
              </div>
              {/*
                §4.2: off by default and audited when used. This is the setting
                that permits an invoice for work nobody confirmed happened, so
                the screen says exactly that rather than calling it "flexible
                billing".
              */}
              <p className="text-xs text-muted-foreground">
                Off by default. Turning it on lets an invoice be raised for a
                job the customer never confirmed, and every such invoice is
                recorded in the audit trail with the person who raised it.
              </p>
            </div>
          </Card>
          <LocalDataPanel />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
