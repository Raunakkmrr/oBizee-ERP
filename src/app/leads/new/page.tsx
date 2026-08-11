"use client";

import { useEffect, useRef, useState } from "react";
import { createLead, type LeadSource, type MutationResult } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mic } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Chip } from "@/components/shared/controls";
import { Field, WhyDisabled } from "@/components/shared/field";
import { AddressFields, EMPTY_ADDRESS, type AddressValue } from "@/components/location/address-fields";
import {
  dialablePhone,
  indianPin,
  locality as localityRule,
  personName,
  requiredName,
  validate,
} from "@/lib/validate";
import { z } from "zod";
import { NEEDS_UPLOAD } from "@/components/shared/unavailable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MoneyText } from "@/components/shared/money-text";
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

/** FR-102's panel. Resting state renders **nothing** — §6.7.2. */
function DuplicatePanel({
  lookup,
  unavailable,
  onDismiss,
}: {
  lookup: Lookup["match"];
  unavailable: boolean;
  /** FR-102: the warning is advisory, so there has to be a way past it. */
  onDismiss: () => void;
}) {
  if (unavailable) {
    return (
      <div className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
        Duplicate check unavailable — check the customer list after saving.
      </div>
    );
  }
  if (!lookup) return null;

  if (lookup.kind === "customer") {
    return (
      <div className="space-y-2 rounded-xl bg-primary-bg p-3 text-sm">
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
          <Button variant="outline" size="sm" onClick={onDismiss}>
            Still create a new lead
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl bg-warning-bg p-3 text-sm">
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
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Still create a new lead
        </Button>
      </div>
    </div>
  );
}

/**
 * FR-101/102/104's rules, each with the sentence it was missing.
 *
 * The referral rule is a `superRefine` rather than a second schema: "who
 * referred them" is required *only* when the source is a referral, and
 * splitting that into two schemas is how the two drift apart.
 */
const LEAD_FORM = z
  .object({
    phone: dialablePhone,
    name: personName("A name"),
    // The address is validated here rather than trusted, because the site's
    // state decides the GST head on every invoice this lead ever produces.
    pin: indianPin,
    city: requiredName("A city or district"),
    stateCode: z.string().min(1, "The state is needed — it decides the tax head"),
    locality: localityRule,
    source: z.string().nullable(),
    service: z.string().nullable(),
    // FR-104: a lead with no next date gets forgotten, which is why it blocks.
    followUp: z.string().min(1, "A follow-up date is needed"),
    referredBy: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.source) {
      ctx.addIssue({
        code: "custom",
        path: ["source"],
        message: "Where the lead came from is needed",
      });
    }
    if (!values.service) {
      ctx.addIssue({
        code: "custom",
        path: ["service"],
        message: "What they want is needed",
      });
    }
    if (values.source === "Referral" && values.referredBy.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["referredBy"],
        message: "A referral needs the name of who referred them",
      });
    }
  });

export default function NewLeadPage() {
  const router = useRouter();
  /*
    `run` takes the mutation as a thunk so the hook owns pending, failure and
    the error surface, exactly as the other create forms do.
  */
  const write = useMutation(
    async (run: () => Promise<MutationResult<{ id: string; reference: string }>>) => run(),
  );
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [referredBy, setReferredBy] = useState("");
  const [service, setService] = useState<string | null>(null);
  const [otherService, setOtherService] = useState("");
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [takenBy, setTakenBy] = useState(CURRENT_USER.name);
  const [owner, setOwner] = useState(CURRENT_USER.name);
  const [followUp, setFollowUp] = useState<string>("Tomorrow");
  const [note, setNote] = useState("");
  const [match, setMatch] = useState<Lookup["match"]>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  /** Fields the reader has left, so a blank form is not a wall of red. */
  /*
    The defect this replaces: `const [touched] = useState(new Set())` — created
    once, no setter, never added to. `check.errors` was therefore empty by
    construction, so not one per-field message could ever appear no matter what
    the schema found. The form greyed its button and said nothing, and a
    27-digit phone number looked accepted.
  */
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const touch = (field: string) =>
    setTouched((previous) => new Set(previous).add(field));

  const digits = phone.replace(/\D/g, "");
  /**
   * FR-102's duplicate warning is advisory, not a block — two customers really
   * can share a landline. Acknowledging it hides the panel rather than
   * disabling the save, which is what "still create a new lead" has to mean.
   */
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const showPanel = digits.length === 10 && !duplicateAcknowledged;

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
  /*
    The same six conditions the old `canSave` held — now as a schema, so each
    one carries a sentence. The logic was already thorough; it simply refused
    to say which of the six was unmet, and greyed the button in silence.
  */
  const check = validate(
    LEAD_FORM,
    {
      phone,
      name,
      source,
      service: chosenService,
      followUp,
      referredBy,
      pin: address.pin,
      city: address.city,
      stateCode: address.stateCode,
      locality: address.locality,
    },
    touched as ReadonlySet<
      | "phone"
      | "name"
      | "source"
      | "service"
      | "followUp"
      | "referredBy"
      | "pin"
      | "city"
      | "stateCode"
      | "locality"
    >,
  );
  const canSave = check.ok;

  /**
   * FR-105's closed list, mapped from the chips this form shows.
   *
   * The two that differ are not cosmetic: the route validates against the
   * statutory list, and "Repeat" or "Field" would be refused.
   */
  const SOURCE_FOR: Record<string, LeadSource> = {
    Phone: "Phone",
    WhatsApp: "WhatsApp",
    "Walk-in": "Walk-in",
    Referral: "Referral",
    Website: "Website",
    Repeat: "Repeat customer",
    Field: "Field/Marketing",
  };

  /** FR-104 wants a datetime; the chips are relative words. */
  function followUpAt(choice: string): string {
    const days = { Today: 0, Tomorrow: 1, "+3 days": 3, "+1 week": 7 }[choice] ?? 1;
    const when = new Date();
    when.setDate(when.getDate() + days);
    // Late morning, not this instant: a follow-up "today" set at 5pm is a
    // follow-up nobody makes, and the queue sorts on this.
    when.setHours(11, 0, 0, 0);
    return when.toISOString();
  }

  async function save() {
    if (!canSave || write.pending) return;

    /*
      **This used to be `router.push("/leads?saved=L-2608-0163")` and nothing
      else.** No request, no record — a hardcoded reference in a redirect, on
      the screen FR-101 calls "capture a lead in under thirty seconds". It
      validated, it congratulated you, and the lead did not exist.

      Nothing caught it. The screen *reads* from the API, so the wired sweep saw
      no fixture. The endpoint is real and fast — the NFR gate measures it at
      269ms — but it was measured by calling it directly, which no screen did.
      `createLead` sat exported from the mutations module, imported by nobody.
    */
    const result = await write.run(() =>
      createLead({
        name: name.trim(),
        phone: phone.trim(),
        locality: address.locality || undefined,
        source: SOURCE_FOR[source ?? "Phone"] ?? "Phone",
        nextFollowUpAt: followUpAt(followUp),
      }),
    );

    // The reference the register gave it, not one this file invented.
    if (result?.ok) router.push(`/leads?saved=${result.data.reference}`);
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
          breadcrumb={[{ label: "Work" }, { label: "Leads", href: "/leads" }]}
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
              <Field
                label="Phone"
                ref={phoneRef}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="10 digits"
                className="tabular-nums"
                value={phone}
                onChange={setPhone}
                onBlur={() => touch("phone")}
                error={check.errors.phone}
                hint="+91 assumed"
              />

              <DuplicatePanel
                lookup={showPanel ? match : null}
                unavailable={showPanel && lookupFailed}
                onDismiss={() => setDuplicateAcknowledged(true)}
              />

              <Field
                label="Name"
                value={name}
                onChange={setName}
                onBlur={() => touch("name")}
                error={check.errors.name}
                placeholder="How you'll greet them"
              />

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

              {/*
                FR-201 / FR-802. A locality alone was a free-text box that
                accepted anything and told the technician nothing; worse, no
                job carried a site state, so every invoice fell back to the
                branch's own and charged CGST+SGST on interstate work.
              */}
              <AddressFields
                value={address}
                onChange={setAddress}
                errors={{
                  pin: check.errors.pin,
                  city: check.errors.city,
                  stateCode: check.errors.stateCode,
                  locality: check.errors.locality,
                }}
                onTouch={touch}
              />

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
                    // Recording needs somewhere to put the audio. Disabled with
                    // the reason in the accessible name, rather than a mic
                    // button that swallows a press.
                    disabled
                    aria-label={`Record a voice note — unavailable: ${NEEDS_UPLOAD}`}
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
                      {/* Names which of the six conditions is unmet, rather than
                greying the button and leaving the reader to guess. */}
            <WhyDisabled reasons={check.summary} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
