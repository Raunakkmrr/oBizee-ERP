"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Loader2, TriangleAlert, WifiOff } from "lucide-react";
import { Field } from "@/components/shared/field";
import { Chip } from "@/components/shared/controls";
import { cn } from "@/lib/utils";
import { isValidPin, selectableStates } from "@/lib/data/pincode";
import { lookupPin, type PinResult } from "@/lib/data/pin-lookup";
import { SiteMap } from "@/components/location/site-map";
import type { LatLng } from "@/lib/data/geo";

/**
 * Where the work is — PIN, city, state, locality, landmark and an optional pin.
 *
 * **Why the state is a field and not a derivation.** The site's state code is
 * what decides CGST+SGST versus IGST (FR-802). A PIN prefix maps to one state
 * in most of the country and to two in a good deal of it — 24xxxx is Uttar
 * Pradesh or Uttarakhand — so the lookup *proposes* and a human confirms.
 * Everything filled from outside carries a line saying where it came from, and
 * every one of those fields stays editable. That is the difference between an
 * assistant and an autocomplete that quietly gets your tax wrong.
 *
 * **Three ways this degrades, all ending in a usable form.** The directory
 * answers; or it does not and the PIN's prefix answers, labelled as a guess; or
 * neither, and the reader types it. No path blocks saving.
 */
export type AddressValue = {
  pin: string;
  city: string;
  stateCode: string;
  locality: string;
  landmark: string;
  point: LatLng | null;
};

export const EMPTY_ADDRESS: AddressValue = {
  pin: "",
  city: "",
  stateCode: "",
  locality: "",
  landmark: "",
  point: null,
};

export function AddressFields({
  value,
  onChange,
  errors,
  onTouch,
  showMap = true,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  errors: Partial<Record<keyof AddressValue, string>>;
  onTouch: (field: keyof AddressValue) => void;
  showMap?: boolean;
}) {
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "looking" }
    | { kind: "done"; result: PinResult }
  >({ kind: "idle" });

  /*
    The latest-ref pattern, assigned in an effect rather than during render —
    React 19 forbids the latter, and the compiler enforces it. Both exist so
    the lookup effect can read the current props without listing them as
    dependencies, which would re-fire the call on every keystroke.
  */
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  });

  /*
    Fires when the PIN becomes complete, not on every keystroke. Six digits is
    the natural debounce — there is nothing to ask about a partial PIN, and
    asking would be five wasted calls per address.
  */
  useEffect(() => {
    const pin = value.pin.replace(/\D/g, "");
    // Clearing a stale result belongs to the edit that invalidated it, not
    // here — see the PIN field's `onChange`. An effect that only reads is an
    // effect that cannot cascade.
    if (!isValidPin(pin)) return;

    let cancelled = false;

    /*
      The state changes live inside the async body rather than the effect
      body. Behaviourally identical, and it keeps this out of the
      cascading-render class of effect that React 19 warns about.
    */
    void (async () => {
      setStatus({ kind: "looking" });
      const result = await lookupPin(pin);
      if (cancelled) return;
      setStatus({ kind: "done", result });

      const current = valueRef.current;
      if (result.kind === "found") {
        onChangeRef.current({
          ...current,
          // Only fills what is still blank. Overwriting something a person
          // typed — because they know the building and the directory does not
          // — is the behaviour that makes people distrust the whole form.
          city: current.city.trim() === "" ? result.city : current.city,
          stateCode:
            current.stateCode === "" && result.stateCode
              ? result.stateCode
              : current.stateCode,
        });
      } else if (result.kind === "guessed" && current.stateCode === "") {
        onChangeRef.current({ ...current, stateCode: result.stateCode });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [value.pin]);

  const set = <K extends keyof AddressValue>(key: K, next: AddressValue[K]) =>
    onChange({ ...value, [key]: next });

  const suggestions =
    status.kind === "done" && status.result.kind === "found"
      ? status.result.localities
      : [];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Field
            label="PIN code"
            inputMode="numeric"
            className="tabular-nums"
            placeholder="6 digits"
            value={value.pin}
            onChange={(next) => {
              const cleaned = next.replace(/[^\d\s]/g, "").slice(0, 7);
              // The edit is what invalidates the old answer, so the edit is
              // what clears it.
              if (!isValidPin(cleaned)) setStatus({ kind: "idle" });
              set("pin", cleaned);
            }}
            onBlur={() => onTouch("pin")}
            error={errors.pin}
          />
          <LookupStatus status={status} />
        </div>

        <Field
          label="City / district"
          value={value.city}
          onChange={(next) => set("city", next)}
          onBlur={() => onTouch("city")}
          error={errors.city}
        />
      </div>

      <div>
        <label htmlFor="site-state" className="mb-1.5 block text-sm font-medium">
          State
        </label>
        <select
          id="site-state"
          value={value.stateCode}
          onChange={(event) => set("stateCode", event.target.value)}
          onBlur={() => onTouch("stateCode")}
          aria-invalid={errors.stateCode !== undefined}
          className={cn(
            "h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
            errors.stateCode && "border-destructive",
          )}
        >
          <option value="">Select the state</option>
          {selectableStates().map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.name} ({entry.code})
            </option>
          ))}
        </select>
        {errors.stateCode ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {errors.stateCode}
          </p>
        ) : (
          // Said plainly, because the consequence is not obvious from the field.
          <p className="mt-1 text-xs text-muted-foreground">
            Decides CGST + SGST or IGST on every invoice for this site
          </p>
        )}
      </div>

      <div>
        <Field
          label="Locality"
          value={value.locality}
          onChange={(next) => set("locality", next)}
          onBlur={() => onTouch("locality")}
          error={errors.locality}
          placeholder="Lajpat Nagar, Sector 44, MIDC Phase II"
        />
        {suggestions.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {/* The PIN covers several — picking beats typing. */}
            {suggestions.map((name) => (
              <Chip
                key={name}
                label={name}
                selected={value.locality === name}
                onClick={() => set("locality", name)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <Field
        label="Landmark"
        optional
        value={value.landmark}
        onChange={(next) => set("landmark", next)}
        placeholder="Opposite the Gurudwara, blue gate"
        // FR-201 / §6.5.1 — its own field, because this is how an Indian
        // address is actually resolved on the ground.
        hint="How the technician actually finds the place — worth more than the pin"
      />

      {showMap ? (
        <SiteMap value={value.point} onChange={(next) => set("point", next)} />
      ) : null}
    </div>
  );
}

function LookupStatus({
  status,
}: {
  status: { kind: "idle" } | { kind: "looking" } | { kind: "done"; result: PinResult };
}) {
  if (status.kind === "idle") return null;

  if (status.kind === "looking") {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-3 animate-spin" />
        Looking this PIN up…
      </p>
    );
  }

  const result = status.result;
  if (result.kind === "found") {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-success">
        <CircleCheck aria-hidden="true" className="size-3 shrink-0" />
        {result.district}, {result.stateName} — from the India Post directory
      </p>
    );
  }
  if (result.kind === "guessed") {
    return (
      <p className="mt-1 flex items-start gap-1.5 text-xs text-warning">
        <WifiOff aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
        {result.stateName} — {result.reason}
      </p>
    );
  }
  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
      {result.reason}
    </p>
  );
}
