"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mic } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MoneyText } from "@/components/shared/money-text";
import { cn } from "@/lib/utils";
import { asPaise } from "@/lib/money";
import { EM_DASH, isReady } from "@/lib/data/result";
import { lookupPhone, type Lookup } from "@/lib/data/lead-lookup";
import { CURRENT_USER, SEED_USERS } from "@/lib/data/fixtures/tenant";

/**
 * New lead — PRD §6.7, FR-101 · FR-102 · FR-103 · FR-104 · FR-105.
 *
 * **The one decision:** *do I have enough to call this person back?* — **not**
 * "is this record complete". Every field survived §6.7.1's justification test,
 * and the exclusions matter as much: GSTIN, full site address, billing address,
 * email, expected value and asset details are absent because "each of these,
 * asked here, measurably loses leads".
 *
 * ⚠️ **Divergence from §6.7.1, on the client's instruction (DR-17).** The spec
 * renders this as a 480px modal over the Leads screen so "the queue stays behind
 * and the coordinator does not lose her place". The client wants every form to
 * be its own page. Trade-off accepted knowingly: she loses her scroll position
 * in the queue on return, and gains a scrollable, linkable, back-button-friendly
 * form that behaves identically on a phone. The modal also could not scroll when
 * its content exceeded the viewport — a real defect that a page cannot have.
 */

const SOURCES = [
  "Phone",
  "WhatsApp",
  "Walk-in",
  "Referral",
  "Website",
  "Repeat",
  "Field",
] as const;

const SERVICES = [
  "AC servicing",
  "AC repair",
  "AMC visit",
  "Water purifier",
  "Refrigeration",
  "Generator",
] as const;

const FOLLOW_UPS = ["Today", "Tomorrow", "+3 days", "+1 week"] as const;

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

/** FR-102's panel. Resting state renders **nothing** — §6.7.2. */
function DuplicatePanel({
  lookup,
  unavailable,
}: {
  lookup: Lookup["match"];
  unavailable: boolean;
}) {
  if (unavailable) {
    return (
      <div className="rounded-lg border border-input bg-muted p-3 text-sm text-muted-foreground">
        Duplicate check unavailable — check the customer list after saving.
      </div>
    );
  }
  if (!lookup) return null;

  if (lookup.kind === "customer") {
    return (
      <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm">
        <p className="font-medium">{lookup.name}</p>
        <p className="text-muted-foreground tabular-nums">
          {lookup.pastJobs} past jobs
          {lookup.lastJobDate ? ` · last ${lookup.lastJobDate}` : null} ·{" "}
          {lookup.openJobs} open
        </p>
        <p className="text-muted-foreground">
          Outstanding:{" "}
          {lookup.outstandingPaise === null ? (
            <span>{EM_DASH}</span>
          ) : (
            <MoneyText amount={asPaise(lookup.outstandingPaise)} />
          )}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" render={<Link href="/jobs" />} nativeButton={false}>
            Create job for this customer
          </Button>
          <Button variant="outline" size="sm">
            Still create a new lead
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/15 p-3 text-sm">
      <p className="font-medium">
        {lookup.name}{" "}
        <span className="font-normal text-muted-foreground tnum-id">
          {lookup.reference}
        </span>
      </p>
      <p className="text-brand-brown">
        Already an open lead · {lookup.owner} · {lookup.stage} · follow-up{" "}
        {lookup.nextFollowUp}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {/* FR-102: primary becomes "Open existing lead" so she does not create
            a second lead for the same caller. */}
        <Button size="sm" render={<Link href="/leads" />} nativeButton={false}>
          Open existing lead
        </Button>
        <Button variant="outline" size="sm">
          Still create a new lead
        </Button>
      </div>
    </div>
  );
}

export default function NewLeadPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [referredBy, setReferredBy] = useState("");
  const [service, setService] = useState<string | null>(null);
  const [otherService, setOtherService] = useState("");
  const [locality, setLocality] = useState("");
  const [takenBy, setTakenBy] = useState(CURRENT_USER.name);
  const [owner, setOwner] = useState(CURRENT_USER.name);
  const [followUp, setFollowUp] = useState<string>("Tomorrow");
  const [note, setNote] = useState("");
  const [match, setMatch] = useState<Lookup["match"]>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  const digits = phone.replace(/\D/g, "");
  const showPanel = digits.length === 10;

  // FR-102: fires on the 10th digit, while the customer is still talking.
  useEffect(() => {
    if (digits.length !== 10) return;
    let cancelled = false;
    lookupPhone(digits).then((result) => {
      if (cancelled) return;
      if (isReady(result)) setMatch(result.data.match);
      else setLookupFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [digits]);

  useEffect(() => {
    phoneRef.current?.focus();
  }, []);

  const chosenService = service ?? (otherService.trim() || null);

  /** FR-101: phone + name + one source + one service. Nothing else required. */
  const canSave =
    digits.length === 10 &&
    name.trim() !== "" &&
    source !== null &&
    chosenService !== null &&
    followUp !== "" &&
    (source !== "Referral" || referredBy.trim() !== "");

  function save() {
    if (!canSave) return;
    router.push("/leads?saved=L-2608-0163");
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      save();
    }
  }

  const today = new Date();

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6" onKeyDown={onKeyDown}>
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href="/leads" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to leads
        </Button>

        <PageHeader
          className="mb-4"
          title="New lead"
          description="Enough to call this person back — nothing more."
        />

        {/* A single column, as §6.7.1 specifies, but as a page rather than a
            modal (DR-17). Capped so the form does not stretch across a wide
            monitor into an unreadable line length. */}
        <div className="max-w-[560px] space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div>
                <label
                  htmlFor="lead-phone"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Phone
                </label>
                <Input
                  id="lead-phone"
                  ref={phoneRef}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="10 digits"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="tabular-nums"
                />
                <p className="mt-1 text-xs text-muted-foreground">+91 assumed</p>
              </div>

              <DuplicatePanel
                lookup={showPanel ? match : null}
                unavailable={showPanel && lookupFailed}
              />

              <div>
                <label
                  htmlFor="lead-name"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Name
                </label>
                <Input
                  id="lead-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How you'll greet them"
                />
              </div>

              <div>
                {/* Chips, not a dropdown — "a dropdown costs open-scroll-select
                    while the phone is ringing" (§6.7.1). */}
                <p className="mb-1.5 text-sm font-medium">Source</p>
                <div className="flex flex-wrap gap-1.5">
                  {SOURCES.map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      selected={source === option}
                      onClick={() => setSource(option)}
                    />
                  ))}
                </div>
                {source === "Referral" ? (
                  <div className="mt-3">
                    <label
                      htmlFor="referred-by"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Referred by — required
                    </label>
                    <Input
                      id="referred-by"
                      value={referredBy}
                      onChange={(e) => setReferredBy(e.target.value)}
                      placeholder="Who sent them"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Referral incentives cannot be paid to an unnamed person.
                    </p>
                  </div>
                ) : null}
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium">Service needed</p>
                <div className="flex flex-wrap gap-1.5">
                  {SERVICES.map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      selected={service === option}
                      onClick={() => {
                        setService(option);
                        setOtherService("");
                      }}
                    />
                  ))}
                </div>
                {/* An unlisted service must never block capture (§6.7.1). */}
                <Input
                  className="mt-2"
                  placeholder="Or type another service"
                  value={otherService}
                  onChange={(e) => {
                    setOtherService(e.target.value);
                    if (e.target.value) setService(null);
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="locality"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Locality
                </label>
                <Input
                  id="locality"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  placeholder="Area or pincode"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="taken-by"
                    className="mb-1.5 block text-sm font-medium"
                  >
                    Taken by
                  </label>
                  <select
                    id="taken-by"
                    value={takenBy}
                    onChange={(e) => setTakenBy(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {SEED_USERS.filter((u) => u.active).map((u) => (
                      <option key={u.id}>{u.name}</option>
                    ))}
                  </select>
                  {/* Editable now, immutable after save — FR-103. */}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Locked after saving
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="owner"
                    className="mb-1.5 block text-sm font-medium"
                  >
                    Managed by
                  </label>
                  <select
                    id="owner"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {SEED_USERS.filter((u) => u.active).map((u) => (
                      <option key={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                {/* Chips because "a date picker is four interactions" (§6.7.1).
                    Mandatory per FR-104; default Tomorrow. */}
                <p className="mb-1.5 text-sm font-medium">Next follow-up</p>
                <div className="flex flex-wrap gap-1.5">
                  {FOLLOW_UPS.map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      selected={followUp === option}
                      onClick={() => setFollowUp(option)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="lead-note"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Note
                </label>
                <div className="flex gap-2">
                  <Input
                    id="lead-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What they actually said"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Record a voice note"
                  >
                    <Mic className="size-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            {/* §6.7.3: Save is the primary, Ctrl/Cmd+Enter. */}
            <Button className="flex-1" disabled={!canSave} onClick={save}>
              Save lead
              <kbd className="ml-1 rounded border border-primary-foreground/30 px-1 text-[10px]">
                ⌘↵
              </kbd>
            </Button>
            <Button
              variant="outline"
              render={<Link href="/leads" />}
              nativeButton={false}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
