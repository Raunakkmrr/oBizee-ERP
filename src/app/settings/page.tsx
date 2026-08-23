"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, CalendarCheck, Clock, Hash, Landmark, Lock, Percent, ScrollText, ShieldCheck, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Requires } from "@/components/shared/requires";
import { Numbering } from "@/components/settings/numbering";
import { Activity } from "@/components/settings/activity";
import { Rates } from "@/components/settings/rates";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ShineBorder } from "@/components/ui/shine-border";
import { cn } from "@/lib/utils";
// Aliased: this file already has a local `Chip`, which is a label/value
// display pill rather than a control.
import { SEED_TENANT } from "@/lib/data/fixtures/tenant";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/field";
import { ErrorState } from "@/components/data-states/error-state";
import { getAnnualReturns, fyLabel, filableYears, type AnnualReturns } from "@/lib/data/gst";
import { recordAnnualReturn } from "@/lib/api/mutations";
import { useCurrentUser } from "@/lib/data/use-session";
import { can, rolesWith, ROLE_LABELS } from "@/lib/roles";
import { useMutation } from "@/lib/api/use-mutation";
import { renameFirm } from "@/lib/api/mutations";
import { getFirmProfile, type FirmProfile } from "@/lib/data/series";
import { EM_DASH } from "@/lib/data/result";

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
  { key: "numbering", label: "Numbering", icon: Hash },
  { key: "rates", label: "Tax rates", icon: Percent },
  { key: "returns", label: "GST returns", icon: CalendarCheck },
  { key: "activity", label: "Activity", icon: ScrollText },
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
            {section === "numbering" ? <Numbering /> : null}
            {section === "rates" ? <Rates /> : null}
            {section === "returns" ? <AnnualReturn /> : null}
            {section === "activity" ? <Activity /> : null}
            {section === "data" ? <DataSection /> : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------- business */

/**
 * Who this firm is — read from the register, and editable.
 *
 * **It read `SEED_TENANT`.** A hardcoded fixture, so the screen that answers
 * "what is my business called" showed the seeded demo firm to everybody, and
 * no amount of correcting the database would have changed it. The same name
 * prints on every invoice, which is where it stopped being cosmetic: an
 * invoice is issued *by* somebody, and the wrong supplier on a tax document is
 * the wrong document.
 *
 * The GSTIN stays read-only. It encodes the entity's PAN and is issued by the
 * department rather than chosen; a field that accepted a typed one would be a
 * field for putting a false registration on a bill.
 */
function Business() {
  const [firm, setFirm] = useState<FirmProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const rename = useMutation(renameFirm);

  const load = useCallback(() => {
    void getFirmProfile().then((result) => {
      if (result.status !== "ready") return;
      setFirm(result.data);
      setLegalName(result.data.legalName);
      setBusinessName(result.data.businessName);
    });
  }, []);
  useEffect(load, [load]);

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
        {editing ? (
          <div className="mt-3 max-w-md space-y-3">
            <Field
              label="Legal name"
              value={legalName}
              onChange={setLegalName}
              hint="What a tax invoice must carry"
            />
            <Field
              label="Trading name"
              value={businessName}
              onChange={setBusinessName}
              hint="What a customer recognises — often shorter"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={rename.pending || legalName.trim().length < 2}
                onClick={async () => {
                  const result = await rename.run({
                    legalName: legalName.trim(),
                    businessName: businessName.trim() || legalName.trim(),
                  });
                  if (result?.ok) {
                    setEditing(false);
                    load();
                  }
                }}
              >
                Save
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
            {rename.error ? (
              <ErrorState error={rename.error} onRetry={rename.reset} />
            ) : null}
          </div>
        ) : (
          <>
            <h2 className="mt-2.5 text-[26px] leading-tight font-semibold tracking-tight text-foreground">
              {firm?.legalName ?? EM_DASH}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Trading as {firm?.businessName ?? EM_DASH}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {firm?.branch?.gstin ?? EM_DASH}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="relative mt-4"
              onClick={() => setEditing(true)}
            >
              Change the name
            </Button>
          </>
        )}
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
      {/*
        `useSearchParams` opts this subtree out of prerendering, and without a
        boundary the production build fails outright — which a dev server never
        tells you. The fallback is null rather than a skeleton: the tab bar
        resolves in the same tick, and a flashed skeleton would be slower to
        read than nothing.
      */}
      <Suspense fallback={null}>
        <Settings />
      </Suspense>
    </Requires>
  );
}

/**
 * When the annual return was filed — the date that quietly moves every
 * credit-note deadline.
 *
 * **Why the firm records it and nobody assumes it.** §34(2) shuts the window to
 * credit an invoice on 30 November following its financial year, *or* the day
 * GSTR-9 for that year was filed, whichever is earlier. Nothing in this product
 * can observe that date: it happens on the portal, usually by the CA. Until it
 * is recorded here, every deadline the product shows is the statute's outside
 * date — the generous one — and a firm that files in September has two months
 * less than it is being told.
 *
 * GSTR-9 is optional below ₹2 crore turnover and mandatory above it, so this
 * matters precisely to the firms large enough to be filing it, and being
 * well-organised is what costs them.
 *
 * ⚠️ Not tax advice. The CA confirms the deadline before anything is decided
 * on it.
 */
function AnnualReturn() {
  const [filings, setFilings] = useState<AnnualReturns["filings"]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [filedOn, setFiledOn] = useState("");
  const me = useCurrentUser();
  const record = useMutation(recordAnnualReturn);

  const load = useCallback(() => {
    void getAnnualReturns().then((result) => {
      if (result.status === "ready") setFilings(result.data.filings);
    });
  }, []);
  useEffect(load, [load]);

  /* A return cannot have been filed for a year that has not ended. */
  const years = filableYears(new Date());
  const recorded = new Map(filings.map((f) => [f.financialYear, f.filedOn]));
  const mayEdit = Boolean(me && can(me.role, "gst:write", undefined, me.level ?? undefined));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Annual return
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Recording when GSTR-9 was filed moves the deadline for crediting any
          invoice from that year. §34(2) allows a credit note until 30 November
          after the year ends <em>or</em> the day the return was filed —
          whichever comes first. Until a date is here, every deadline the product
          shows assumes the return has not been filed, which is the generous
          answer.
        </p>

        {record.error ? (
          <div className="mt-3">
            <ErrorState error={record.error} onRetry={record.reset} />
          </div>
        ) : null}

        <ul className="mt-4 space-y-2">
          {years.map((fy) => {
            const on = recorded.get(fy);
            const editing = year === fy;
            return (
              <li
                key={fy}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-muted/40 px-4 py-3"
              >
                <span className="w-24 shrink-0 font-medium tabular-nums">{fyLabel(fy)}</span>

                {editing ? (
                  <>
                    <input
                      type="date"
                      value={filedOn}
                      onChange={(e) => setFiledOn(e.target.value)}
                      aria-label={`GSTR-9 filing date for ${fyLabel(fy)}`}
                      className="min-h-9 rounded-lg border border-border bg-background px-3 text-sm"
                    />
                    <Button
                      size="sm"
                      disabled={record.pending || !filedOn}
                      onClick={async () => {
                        const result = await record.run({ financialYear: fy, filedOn });
                        if (result?.ok) {
                          setYear(null);
                          setFiledOn("");
                          load();
                        }
                      }}
                    >
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setYear(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 text-sm">
                      {on ? (
                        <span className="tabular-nums">Filed {on}</span>
                      ) : (
                        /* Not the same as "not filed", and it says so: one is a
                           fact about the return, the other about our records. */
                        <span className="text-muted-foreground">
                          Not recorded — deadlines for this year assume 30 November
                        </span>
                      )}
                    </span>
                    {mayEdit ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setYear(fy);
                          setFiledOn(on ?? "");
                        }}
                      >
                        {on ? "Change" : "Record the date"}
                      </Button>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>

        {!mayEdit ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Only {rolesWith("gst:write").map((r) => ROLE_LABELS[r]).join(" or ")} can
            record this.
          </p>
        ) : null}
      </div>
    </div>
  );
}
