"use client";

import { useId } from "react";
import { CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A labelled input that can say what is wrong with it.
 *
 * Every form in this product previously wired its own label, its own `<Input>`,
 * and — in four cases out of five — no error surface at all. The result was a
 * greyed submit button that would not explain itself.
 *
 * The error is bound with `aria-describedby` and the input carries
 * `aria-invalid`, so it is announced rather than merely coloured. Colour is
 * never the only channel (§6.13.4): there is an icon and a sentence too.
 */
export function Field({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  optional,
  ...input
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  /** Shown only once the field has been touched — see `validate`. */
  error?: string;
  hint?: string;
  optional?: boolean;
} & Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "onBlur" | "id"
>) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {optional ? (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        ) : null}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error !== undefined}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className={cn(error && "border-destructive")}
        {...input}
      />
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1 flex items-start gap-1.5 text-xs text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        // The hint gives way to the error rather than stacking — two lines of
        // small text under one input is where people stop reading.
        <p id={hintId} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The sentence beside a disabled submit button.
 *
 * A button that will not say why it is disabled is the thing this whole pass
 * removes, so a form that cannot be saved always carries the reason.
 */
export function WhyDisabled({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {/* First problem only: a list of five is a wall, and they fix them in
          order anyway. */}
      {reasons[0]}
      {reasons.length > 1 ? ` · and ${reasons.length - 1} more` : ""}
    </p>
  );
}
