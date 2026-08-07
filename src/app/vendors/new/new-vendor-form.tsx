"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Chip } from "@/components/shared/controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, WhyDisabled } from "@/components/shared/field";
import { cn } from "@/lib/utils";
import { gstin as gstinRule, personName, validate } from "@/lib/validate";
import { selectableStates } from "@/lib/data/pincode";
import { MSME_CLASSES, MSME_LABEL, type MsmeClass } from "@/lib/data/money";
import {
  PAN_TYPES,
  PAN_TYPE_LABEL,
  UDYAM_ACTIVITIES,
  UDYAM_ACTIVITY_LABEL,
  msmedApplies,
  type PanType,
  type UdyamActivity,
} from "@/lib/data/vendors";
import { useDispatch } from "@/lib/data/use-store";

/**
 * Add a vendor — FR-705.
 *
 * **Every field here is asked because a rule needs it**, and the screen says
 * which rule as you fill it in. GSTIN decides reverse charge. PAN type decides
 * whether TDS is 1% or 2%. Udyam class and activity decide whether a 45-day
 * clock starts at all, and the written agreement decides whether it is 45 days
 * or 15. A vendor form that collects a name and a phone number is a vendor form
 * that cannot answer any of those.
 *
 * Nothing is inferred. "Unverified" is an available answer and an honest one —
 * §6.12.2 treats an unverified vendor as unquantified risk, not zero risk.
 */
const VENDOR_FORM = z
  .object({
    name: personName("A vendor name"),
    gstin: z.string(),
    pan: z.string(),
    stateCode: z.string().min(1, "The state is needed"),
  })
  .superRefine((values, ctx) => {
    if (values.gstin.trim() !== "" && !gstinRule.safeParse(values.gstin).success) {
      ctx.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "A GSTIN is 15 characters, like 07AABCS1429B1ZX",
      });
    }
    if (
      values.pan.trim() !== "" &&
      !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(values.pan.trim())
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["pan"],
        message: "A PAN is ten characters, like AAACK1234F",
      });
    }
  });

export function NewVendorForm() {
  const dispatch = useDispatch();
  const router = useRouter();

  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [stateCode, setStateCode] = useState("07");
  const [panType, setPanType] = useState<PanType>("COMPANY_FIRM_OTHER");
  const [msmeClass, setMsmeClass] = useState<MsmeClass>("UNVERIFIED");
  const [udyamNumber, setUdyamNumber] = useState("");
  const [udyamActivity, setUdyamActivity] = useState<UdyamActivity | null>(null);
  const [hasWrittenAgreement, setHasWrittenAgreement] = useState(false);
  const [paymentTermsDays, setPaymentTermsDays] = useState("30");

  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const touch = (field: string) =>
    setTouched((previous) => new Set(previous).add(field));

  const check = validate(
    VENDOR_FORM,
    { name, gstin, pan, stateCode },
    touched as ReadonlySet<"name" | "gstin" | "pan" | "stateCode">,
  );

  /* The consequences, stated live rather than discovered on the first bill. */
  const draft = {
    msmeClass,
    udyamActivity,
    hasWrittenAgreement,
  };
  const msmed = msmedApplies({
    id: "",
    name,
    gstin: gstin.trim() === "" ? null : gstin.trim(),
    stateCode,
    pan: null,
    panType,
    udyamNumber: null,
    paymentTermsDays: 0,
    ...draft,
  });
  const unregistered = gstin.trim() === "";

  const today = new Date();

  return (
    <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
      <div className="p-4 md:p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href="/vendors" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to vendors
        </Button>

        <PageHeader
          breadcrumb={[{ label: "Money" }, { label: "Vendors", href: "/vendors" }]}
          className="mb-4"
          title="Add a vendor"
          description="Each answer here decides what happens on their bills."
        />

        <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Who they are</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field
                label="Vendor name"
                value={name}
                onChange={setName}
                onBlur={() => touch("name")}
                error={check.errors.name}
              />

              <Field
                label="GSTIN"
                optional
                className="tnum-id"
                value={gstin}
                onChange={(next) => setGstin(next.toUpperCase())}
                onBlur={() => touch("gstin")}
                error={check.errors.gstin}
                hint="Leave blank if they are not registered"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="PAN"
                  optional
                  className="tnum-id"
                  value={pan}
                  onChange={(next) => setPan(next.toUpperCase())}
                  onBlur={() => touch("pan")}
                  error={check.errors.pan}
                  hint="Without it, TDS is 20%"
                />
                <div>
                  <label htmlFor="ven-state" className="mb-1.5 block text-sm font-medium">
                    State
                  </label>
                  <select
                    id="ven-state"
                    value={stateCode}
                    onChange={(event) => setStateCode(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {selectableStates().map((entry) => (
                      <option key={entry.code} value={entry.code}>
                        {entry.name} ({entry.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium">They are a</p>
                <div className="flex flex-wrap gap-1.5">
                  {PAN_TYPES.map((option) => (
                    <Chip
                      key={option}
                      label={PAN_TYPE_LABEL[option]}
                      selected={panType === option}
                      onClick={() => setPanType(option)}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Decides §194C at{" "}
                  {panType === "INDIVIDUAL_HUF" ? "1%" : "2%"} on their labour bills
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                MSME status — and the 45-day clock
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="mb-1.5 text-sm font-medium">Udyam class</p>
                <div className="flex flex-wrap gap-1.5">
                  {MSME_CLASSES.map((option) => (
                    <Chip
                      key={option}
                      label={MSME_LABEL[option]}
                      selected={msmeClass === option}
                      onClick={() => setMsmeClass(option)}
                    />
                  ))}
                </div>
              </div>

              <Field
                label="Udyam number"
                optional
                className="tnum-id"
                value={udyamNumber}
                onChange={(next) => setUdyamNumber(next.toUpperCase())}
                placeholder="UDYAM-DL-03-0012345"
              />

              <div>
                <p className="mb-1.5 text-sm font-medium">Registered activity</p>
                <div className="flex flex-wrap gap-1.5">
                  {UDYAM_ACTIVITIES.map((option) => (
                    <Chip
                      key={option}
                      label={UDYAM_ACTIVITY_LABEL[option]}
                      selected={udyamActivity === option}
                      onClick={() =>
                        setUdyamActivity(udyamActivity === option ? null : option)
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium">Written agreement</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip
                    label="Yes — 45 days"
                    selected={hasWrittenAgreement}
                    onClick={() => setHasWrittenAgreement(true)}
                  />
                  <Chip
                    label="No — 15 days"
                    selected={!hasWrittenAgreement}
                    onClick={() => setHasWrittenAgreement(false)}
                  />
                </div>
              </div>

              <Field
                label="Payment terms (days)"
                inputMode="numeric"
                className="tabular-nums"
                value={paymentTermsDays}
                onChange={(next) =>
                  setPaymentTermsDays(next.replace(/\D/g, "").slice(0, 3))
                }
              />
            </CardContent>
          </Card>
        </div>

        {/* What these answers will do, before the first bill rather than after. */}
        <div className="mt-4 max-w-5xl space-y-2">
          <p
            className={cn(
              "flex items-start gap-2 rounded-lg p-2.5 text-xs",
              msmed.applies ? "bg-destructive-bg" : "bg-muted-bg",
            )}
          >
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {msmed.applies
                ? `Their bills must be paid within ${msmed.limitDays} days or the expense stops being deductible for the year.`
                : msmed.reason}
            </span>
          </p>
          {unregistered ? (
            <p className="flex items-start gap-2 rounded-lg bg-warning-bg p-2.5 text-xs">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>
                No GSTIN, so their supplies attract reverse charge — the tax is
                yours to pay and claim, not theirs to collect.
              </span>
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex max-w-5xl flex-wrap items-center gap-2">
          <Button
            disabled={!check.ok}
            onClick={() => {
              dispatch({
                type: "ADD_VENDOR",
                vendor: {
                  name: name.trim(),
                  gstin: gstin.trim() === "" ? null : gstin.trim(),
                  stateCode,
                  pan: pan.trim() === "" ? null : pan.trim(),
                  panType,
                  msmeClass,
                  udyamNumber: udyamNumber.trim() === "" ? null : udyamNumber.trim(),
                  udyamActivity,
                  hasWrittenAgreement,
                  paymentTermsDays: Number(paymentTermsDays) || 0,
                },
              });
              router.push("/vendors");
            }}
          >
            Add vendor
          </Button>
          <Button variant="outline" render={<Link href="/vendors" />} nativeButton={false}>
            Cancel
          </Button>
          <WhyDisabled reasons={check.summary} />
        </div>
      </div>
    </AppShell>
  );
}
