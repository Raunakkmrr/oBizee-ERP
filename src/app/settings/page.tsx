"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Clock, Landmark, Lock, ShieldCheck, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Requires } from "@/components/shared/requires";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ShineBorder } from "@/components/ui/shine-border";
import { cn } from "@/lib/utils";
// Aliased: this file already has a local `Chip`, which is a label/value
// display pill rather than a control.
import { SEED_TENANT } from "@/lib/data/fixtures/tenant";

/**
 * Settings — attempt 3. **Dark-first.**
 *
 * Kept, because he said so: the dark rail, and the pill tab bar. Dropped
 * permanently: the light beige surfaces, cards with dark borders, the big
 * "Settings / business name" header, and the whole light colour system.
 *
 * **Why this is a theme change and not another card tweak.** Every dense
 * product that reads as premium in this space — Linear, Vercel, Supabase,
 * Raycast — is dark by default with a single signature accent and everything
 * else in restrained greyscale. That is the actual reference, and it explains
 * the pattern in the feedback: the rail was liked precisely because it was the
 * only surface already doing this, and each light rebuild failed because the
 * theme, not the layout, was wrong.
 *
 * The system, taken from current dark-UI practice rather than invented:
 *
 * - **Depth is surface lightness, not shadow.** Shadows are nearly invisible on
 *   dark, so elevation steps in lightness: page ~L10, card ~L15, raised ~L19.
 * - **Borders are light at very low opacity** — `white/6` — never dark rules.
 *   A dark border on a dark card is the thing that read as cheap.
 * - **One accent.** `#d17c45` carries every interactive state and nothing else
 *   competes; the restraint is what makes it read as the brand.
 * - **Glow replaces shadow.** Coloured `box-shadow` in the accent, because a
 *   black shadow on near-black does nothing.
 *
 * Near-black, not pure black, and warmed toward the brand hue so the accent
 * belongs to the surface rather than sitting on top of a generic charcoal.
 */
const SECTIONS = [
  { key: "business", label: "Business", icon: Landmark },
  { key: "branches", label: "Branches", icon: Building2 },
  { key: "policy", label: "Policy", icon: ShieldCheck },
  { key: "data", label: "Data", icon: Lock },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

/**
 * §9.7's seven Indic scripts, named rather than coded. "HI" is a column value,
 * not something an owner reads on his own settings screen; the endonym is
 * beside the English name because that is what he would recognise first.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  hi: "Hindi · हिन्दी",
  mr: "Marathi · मराठी",
  gu: "Gujarati · ગુજરાતી",
  ta: "Tamil · தமிழ்",
  te: "Telugu · తెలుగు",
  kn: "Kannada · ಕನ್ನಡ",
  bn: "Bengali · বাংলা",
  en: "English",
};

/**
 * The one surface treatment, both themes. `--shadow-card` is a soft drop on
 * light and a hairline-plus-bloom on dark, so nothing here branches on theme
 * and nothing is drawn as a border.
 */
const SURFACE =
  "rounded-2xl bg-card shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]";

function Settings() {
  /*
    The tab is addressable.

    Every route out of People — add someone, edit someone, cancel — links back
    to `?tab=people`, and the page ignored the parameter and reopened on
    Business. So saving a technician appeared to do nothing: the record was
    there, on a tab the reader had been silently moved off.
  */
  const params = useSearchParams();
  const requested = params.get("tab");
  const [section, setSection] = useState<SectionKey>(
    SECTIONS.some((entry) => entry.key === requested)
      ? (requested as SectionKey)
      : "business",
  );
  const today = new Date();

  return (
    <AppShell
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      {/* The page itself is the base layer — L10, warmed toward the accent. */}
      <div className="relative min-h-full">
        {/* A single accent bloom. On dark this is what shadow cannot do. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_18%_-8%,var(--primary-bg),transparent_62%)]"
        />

        <div className="relative p-5 md:p-8">
          {/* No page header. It was named the worst thing here, so the tab bar
              is the only chrome — it already says where you are. */}
          <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-card p-1.5 shadow-[var(--shadow-card)]">
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
                    "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                    on
                      ? "bg-primary font-medium text-primary-foreground shadow-[var(--shadow-raised)]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
            {section === "branches" ? <Branches /> : null}
            {section === "policy" ? <Policy /> : null}
            {section === "data" ? <DataSection /> : null}
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
      {/* The identity surface is the one thing that gets a moving light. */}
      <div className="relative overflow-hidden rounded-2xl bg-card p-8 shadow-[var(--shadow-card)] lg:col-span-2">
        <ShineBorder
          shineColor={["var(--primary)", "var(--chart-5)", "var(--primary)"]}
          duration={12}
          borderWidth={1}
        />
        <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Registered business
        </p>
        <h2 className="mt-2.5 text-[26px] leading-tight font-semibold tracking-tight text-foreground">
          {SEED_TENANT.legalName}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Trading as {SEED_TENANT.businessName}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {SEED_TENANT.branches[0].gstin}
        </p>
      </div>

      {/* The number that drives two statutory rules — accent, and it glows. */}
      <div className="relative overflow-hidden rounded-2xl bg-card p-8 shadow-[var(--shadow-card)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-primary/20 blur-3xl"
        />
        <p className="relative text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Turnover declared
        </p>
        <p className="relative mt-2.5 text-4xl font-semibold tracking-tight text-primary-text tabular-nums">
          ₹
          <NumberTicker
            value={SEED_TENANT.aatoPaise / 100}
            decimalPlaces={0}
            locale="en-IN"
            className="tabular-nums text-primary-text"
          />
        </p>
        <p className="relative mt-3 text-xs leading-relaxed text-muted-foreground">
          Sets SAC/HSN digit count and whether e-invoicing applies.
        </p>
      </div>

      <Tile
        label="Tax scheme"
        value={SEED_TENANT.taxScheme === "REGULAR" ? "Regular" : "Composition 6%"}
      />
      <Tile
        label="Regional language"
        value={LANGUAGE_NAMES[SEED_TENANT.regionalLanguage] ?? "English"}
      />
      <Tile label="Financial year" value="1 Apr – 31 Mar" />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(SURFACE, "p-6")}>
      <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-lg font-medium text-foreground">{value}</p>
    </div>
  );
}

/* --------------------------------------------------------------- people */


/* ------------------------------------------------------------- branches */

function Branches() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {SEED_TENANT.branches.map((branch) => (
        <div key={branch.gstin} className={cn(SURFACE, "p-6")}>
          <div className="flex items-center gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-bg text-primary-text">
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-foreground">{branch.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
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
      ))}

      <div className={cn(SURFACE, "p-6 lg:col-span-2")}>
        <div className="flex items-center gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-bg text-primary-text">
            <Clock className="size-5" />
          </span>
          <div>
            <p className="font-medium text-foreground">Working slots</p>
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
              className="rounded-xl bg-muted p-4"
            >
              <p className="text-sm text-muted-foreground">{slot.label}</p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-foreground tabular-nums">
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
      <span className="font-semibold text-foreground">{value}</span>
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
 * A policy states its consequence, not its name. A switch with a label is a
 * preference; a switch with what it does beside it is a decision — and two of
 * these change what this business can legally bill.
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
    <div className={cn(SURFACE, "p-6")}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-foreground">{label}</p>
        <span
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold",
            on && dangerWhenOn
              ? "bg-destructive-bg text-destructive"
              : on
                ? "bg-success-bg text-success"
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

/* ----------------------------------------------------------------- data */

function DataSection() {
  return (
    <div className={cn(SURFACE, "max-w-2xl p-6")}>
      <div className="flex items-center gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-bg text-primary-text">
          <Lock className="size-5" />
        </span>
        <div>
          <p className="font-medium text-foreground">Local data</p>
          <p className="text-xs text-muted-foreground">
            Stored in this browser, encrypted at rest
          </p>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Saved with AES-GCM under a key the browser holds and no script can read,
        so a copied storage file is unreadable on another machine. It does not
        protect against someone using this browser.
      </p>
      <button
        type="button"
        className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        Reset demo data
      </button>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Requires permission="settings:read">
      <Settings />
    </Requires>
  );
}
