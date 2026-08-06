import { z } from "zod";
import { e164 } from "@/lib/contact";

/**
 * Validation for what a person **types**, not for what the fixture returns.
 *
 * **The gap this closes.** Every zod schema in this product guarded a *read* —
 * `defineQuery` parsed data arriving from the source layer, and `safeParse`
 * appeared nowhere in `src/app` or `src/components`. Nothing checked what a
 * user wrote before it entered the store. That is backwards for a product whose
 * store *is* the source of truth: the data most likely to be wrong is the data
 * a human just typed at four in the afternoon.
 *
 * What the forms had instead were save-blockers — `disabled={customer.trim() ===
 * ""}` on one or two fields, no message, nothing per-field, and no schema. A
 * greyed button that will not say why is a worse experience than an error.
 *
 * Three rules this enforces, because they are the ones that were being broken:
 *
 * 1. **Say what is wrong, per field.** A form that disables its own button and
 *    stays silent makes the reader hunt.
 * 2. **Only after they have touched it.** Errors on an untouched field turn a
 *    blank form into a wall of red before anybody has typed anything.
 * 3. **Never block on something we can fix ourselves.** Whitespace is trimmed,
 *    not rejected.
 */

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export type Validation<T> = {
  /** Per-field messages, for the fields the reader has touched. */
  errors: FieldErrors<T>;
  /** Every problem, touched or not — what the submit button reads. */
  allErrors: FieldErrors<T>;
  ok: boolean;
  /** Plain-language list for the summary beside the button. */
  summary: string[];
};

export function validate<T extends Record<string, unknown>>(
  schema: z.ZodType<unknown>,
  values: T,
  touched: ReadonlySet<keyof T>,
): Validation<T> {
  const result = schema.safeParse(values);
  const allErrors: FieldErrors<T> = {};

  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof T | undefined;
      // First message per field wins: three complaints about one input is
      // noise, and the first is the one to fix.
      if (key !== undefined && allErrors[key] === undefined) {
        allErrors[key] = issue.message;
      }
    }
  }

  const errors: FieldErrors<T> = {};
  for (const key of Object.keys(allErrors) as (keyof T)[]) {
    if (touched.has(key)) errors[key] = allErrors[key];
  }

  return {
    errors,
    allErrors,
    ok: result.success,
    summary: Object.values(allErrors).filter(Boolean) as string[],
  };
}

/* ------------------------------------------------------------ field rules */

/** A name somebody will read on an invoice, so blank and " " are both wrong. */
export const requiredName = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `${what} is needed`)
    .max(120, `${what} is too long`);

/**
 * A phone that can actually be dialled.
 *
 * Checked through `e164` rather than a regex so the form and the `tel:` link
 * agree — a number the form accepts and the dialler cannot use is worse than a
 * rejection, because it fails later and in front of a customer.
 */
export const dialablePhone = z
  .string()
  .trim()
  .min(1, "A phone number is needed")
  .refine((value) => e164(value) !== null, {
    message: "That is not a number we can dial — ten digits, or with +91",
  });

/** Optional, but if given it has to look like one. */
export const optionalEmail = z
  .string()
  .trim()
  .refine((value) => value === "" || z.string().email().safeParse(value).success, {
    message: "That does not look like an email address",
  });

/** A GSTIN is 15 characters in a fixed shape; a wrong one fails at filing. */
export const gstin = z
  .string()
  .trim()
  .regex(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/,
    "A GSTIN is 15 characters, like 07AABCS1429B1ZX",
  );

/** Money a person typed, in rupees, as a positive amount. */
export const rupees = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `${what} is needed`)
    .refine((value) => {
      const n = Number(value.replace(/,/g, ""));
      return Number.isFinite(n) && n > 0;
    }, `${what} must be a number greater than zero`);
