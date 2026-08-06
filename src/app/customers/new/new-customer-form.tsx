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
import {
  AddressFields,
  EMPTY_ADDRESS,
  type AddressValue,
} from "@/components/location/address-fields";
import {
  dialablePhone,
  gstin as gstinRule,
  indianPin,
  locality as localityRule,
  personName,
  requiredName,
  validate,
} from "@/lib/validate";
import { STATE_BY_CODE } from "@/lib/data/pincode";
import { useDispatch } from "@/lib/data/use-store";

/**
 * Add a customer — FR-201, and the thing that was blocking billing.
 *
 * **Why a customer and a site are one form.** A customer with no site has no
 * place of supply, and without that an invoice cannot say whether it is
 * CGST+SGST or IGST — so half a record blocks the exact thing the record exists
 * to enable. The invoice screen was showing "No site on file — the tax head
 * cannot be derived" for customers that existed on contracts but not here.
 *
 * **Why the GSTIN's state is checked against the site's.** The first two digits
 * of a GSTIN *are* the state code. A Maharashtra GSTIN against a Delhi site is
 * either a typo or a genuinely interstate arrangement, and the difference
 * decides the tax head — so it is raised as a question, never silently
 * corrected.
 */
const CUSTOMER_FORM = z
  .object({
    name: personName("A customer name"),
    gstin: z.string(),
    pin: indianPin,
    city: requiredName("A city or district"),
    stateCode: z.string().min(1, "The state is needed — it decides the tax head"),
    locality: localityRule,
    addressLine1: requiredName("An address line"),
    contactName: z.string(),
    contactPhone: z.string(),
  })
  .superRefine((values, ctx) => {
    // Optional, but a wrong one fails at filing rather than here.
    if (values.gstin.trim() !== "" && !gstinRule.safeParse(values.gstin).success) {
      ctx.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "A GSTIN is 15 characters, like 07AABCS1429B1ZX",
      });
    }
    // A contact is optional; a half-entered one is not.
    if (values.contactName.trim() !== "" || values.contactPhone.trim() !== "") {
      if (values.contactName.trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: ["contactName"],
          message: "A number with no name is a number nobody will ring",
        });
      }
      if (!dialablePhone.safeParse(values.contactPhone).success) {
        ctx.addIssue({
          code: "custom",
          path: ["contactPhone"],
          message: "That is not a number we can dial — ten digits, or with +91",
        });
      }
    }
  });

const TYPES = [
  { key: "BUSINESS", label: "Business" },
  { key: "INDIVIDUAL", label: "Household" },
] as const;

export function NewCustomerForm() {
  const dispatch = useDispatch();
  const router = useRouter();

  const [name, setName] = useState("");
  const [customerType, setCustomerType] =
    useState<(typeof TYPES)[number]["key"]>("BUSINESS");
  const [gstin, setGstin] = useState("");
  const [creditDays, setCreditDays] = useState("15");
  const [siteLabel, setSiteLabel] = useState("Main site");
  const [addressLine1, setAddressLine1] = useState("");
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const touch = (field: string) =>
    setTouched((previous) => new Set(previous).add(field));

  const check = validate(
    CUSTOMER_FORM,
    {
      name,
      gstin,
      pin: address.pin,
      city: address.city,
      stateCode: address.stateCode,
      locality: address.locality,
      addressLine1,
      contactName,
      contactPhone,
    },
    touched as ReadonlySet<
      | "name"
      | "gstin"
      | "pin"
      | "city"
      | "stateCode"
      | "locality"
      | "addressLine1"
      | "contactName"
      | "contactPhone"
    >,
  );

  /*
    The GSTIN's first two digits are the state code. Raised as a question rather
    than an error: a Maharashtra-registered company genuinely can have a Delhi
    site, and that is an IGST supply, not a typo. Silently "fixing" it would set
    the wrong tax head on every invoice that follows.
  */
  const gstinState = gstin.trim().slice(0, 2);
  const stateMismatch =
    gstin.trim().length >= 2 &&
    address.stateCode !== "" &&
    gstinState !== address.stateCode &&
    STATE_BY_CODE[gstinState] !== undefined;

  const today = new Date();

  return (
    <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
      <div className="p-4 md:p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href="/customers" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to customers
        </Button>

        <PageHeader
          breadcrumb={[{ label: "Work" }, { label: "Customers", href: "/customers" }]}
          className="mb-4"
          title="Add a customer"
          description="Who they are, and where the work happens — an invoice needs both."
        />

        <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Who they are</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field
                label="Customer name"
                value={name}
                onChange={setName}
                onBlur={() => touch("name")}
                error={check.errors.name}
                placeholder="Shakti Industries, Mrs. Deshpande"
              />

              <div>
                <p className="mb-1.5 text-sm font-medium">Type</p>
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((option) => (
                    <Chip
                      key={option.key}
                      label={option.label}
                      selected={customerType === option.key}
                      onClick={() => setCustomerType(option.key)}
                    />
                  ))}
                </div>
              </div>

              <Field
                label="GSTIN"
                optional
                value={gstin}
                onChange={(next) => setGstin(next.toUpperCase())}
                onBlur={() => touch("gstin")}
                error={check.errors.gstin}
                className="tnum-id"
                placeholder="07AABCS1429B1ZX"
                // §7.4: most household customers have none, and that is a fact
                // to record rather than a field to nag about.
                hint="Households usually have none — leave it blank"
              />

              <Field
                label="Credit days"
                inputMode="numeric"
                className="tabular-nums"
                value={creditDays}
                onChange={(next) => setCreditDays(next.replace(/\D/g, "").slice(0, 3))}
                hint="Drives the ageing buckets and the §43B(h) clock"
              />

              <div className="border-t pt-3">
                <p className="mb-1.5 text-sm font-medium">Primary contact</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Name"
                    optional
                    value={contactName}
                    onChange={setContactName}
                    onBlur={() => touch("contactName")}
                    error={check.errors.contactName}
                  />
                  <Field
                    label="Phone"
                    optional
                    type="tel"
                    inputMode="numeric"
                    className="tabular-nums"
                    value={contactPhone}
                    onChange={setContactPhone}
                    onBlur={() => touch("contactPhone")}
                    error={check.errors.contactPhone}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where the work happens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Site label"
                  value={siteLabel}
                  onChange={setSiteLabel}
                  hint="Plant, Head office, Residence"
                />
                <Field
                  label="Address line"
                  value={addressLine1}
                  onChange={setAddressLine1}
                  onBlur={() => touch("addressLine1")}
                  error={check.errors.addressLine1}
                  placeholder="Plot 14, MIDC Phase II"
                />
              </div>

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

              {stateMismatch ? (
                <p className="flex items-start gap-2 rounded-lg bg-warning-bg p-2.5 text-xs">
                  <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  <span>
                    The GSTIN is registered in{" "}
                    <strong>{STATE_BY_CODE[gstinState]}</strong> but this site is
                    in <strong>{STATE_BY_CODE[address.stateCode]}</strong>. That
                    is fine if it is genuinely interstate work — invoices will be
                    IGST. Check it if not.
                  </span>
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex max-w-5xl flex-wrap items-center gap-2">
          <Button
            disabled={!check.ok}
            onClick={() => {
              dispatch({
                type: "ADD_CUSTOMER",
                name: name.trim(),
                customerType,
                gstin: gstin.trim() === "" ? null : gstin.trim(),
                creditDays: Number(creditDays) || 0,
                site: {
                  label: siteLabel.trim() || "Main site",
                  addressLine1: addressLine1.trim(),
                  locality: address.locality.trim(),
                  city: address.city.trim(),
                  stateCode: address.stateCode,
                  pincode: address.pin.replace(/\D/g, ""),
                  landmark:
                    address.landmark.trim() === "" ? null : address.landmark.trim(),
                },
                contact:
                  contactName.trim() === ""
                    ? null
                    : { name: contactName.trim(), phone: contactPhone.trim() },
              });
              router.push("/customers");
            }}
          >
            Add customer
          </Button>
          <Button
            variant="outline"
            render={<Link href="/customers" />}
            nativeButton={false}
          >
            Cancel
          </Button>
          <WhyDisabled reasons={check.summary} />
        </div>
      </div>
    </AppShell>
  );
}
