/**
 * Font stack — PRD §6.13.5.
 *
 * Inter carries Latin and *all* numerals, because it ships true tabular figures
 * and an opt-in slashed zero, both of which §6.13.6 makes mandatory on money,
 * quantities, GSTIN, PAN, IRN and job numbers.
 *
 * Indic scripts use the matching Noto Sans family rather than a browser
 * fallback. This is not an aesthetic preference: Inter has no Indic coverage at
 * all, and falling back produces mismatched x-heights and — the part that
 * actually matters — broken conjunct shaping, which renders some words *wrong*
 * rather than merely ugly.
 *
 * No monospace face is loaded. §6.13.5 does not specify one, and the two jobs a
 * mono font would otherwise do here (aligned figures, unambiguous zeros) are
 * done by Inter's `tabular-nums` and `slashed-zero` features instead.
 */
import {
  Geist_Mono,
  Inter,
  Noto_Sans_Bengali,
  Noto_Sans_Devanagari,
  Noto_Sans_Gujarati,
  Noto_Sans_Kannada,
  Noto_Sans_Malayalam,
  Noto_Sans_Tamil,
  Noto_Sans_Telugu,
} from "next/font/google";

/** Latin + every numeral in the product. Always loaded. */
export const inter = Inter({
  variable: "--font-latin",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/**
 * Monospace, carried for parity with `obizee-dashboard`, which loads Geist Mono
 * as `--font-mono`. Nothing in this product's spec calls for a mono face —
 * aligned figures and unambiguous zeros come from Inter's `tabular-nums` and
 * `slashed-zero` — but shadcn's chart and code surfaces reach for `font-mono`,
 * and matching the dashboard means matching what those render as.
 */
export const geistMono = Geist_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Indic faces, one per script. Each declares its own `--font-indic` variable so
 * the active locale's face is selected by applying exactly one of these classes
 * at the layout level — the CSS `font-family` stack never changes.
 *
 * Only the face whose class is actually applied gets preloaded, which is how
 * §6.13.5's "subsetted per language pack" requirement is met on web. The
 * technician APK bundles only its active language's face (FR-309's 25 MB
 * budget) — a separate concern handled in that repo.
 */
// `next/font` resolves these calls at build time by statically parsing the
// argument, so every option must be an inline literal. A shared options object
// spread into each call fails the build with "Unexpected spread" — hence the
// repetition below, which is required rather than careless.
export const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-indic",
  display: "swap",
  subsets: ["devanagari"],
});

export const notoTamil = Noto_Sans_Tamil({
  variable: "--font-indic",
  display: "swap",
  subsets: ["tamil"],
});

export const notoTelugu = Noto_Sans_Telugu({
  variable: "--font-indic",
  display: "swap",
  subsets: ["telugu"],
});

export const notoKannada = Noto_Sans_Kannada({
  variable: "--font-indic",
  display: "swap",
  subsets: ["kannada"],
});

export const notoGujarati = Noto_Sans_Gujarati({
  variable: "--font-indic",
  display: "swap",
  subsets: ["gujarati"],
});

export const notoBengali = Noto_Sans_Bengali({
  variable: "--font-indic",
  display: "swap",
  subsets: ["bengali"],
});

export const notoMalayalam = Noto_Sans_Malayalam({
  variable: "--font-indic",
  display: "swap",
  subsets: ["malayalam"],
});

/**
 * Launch locales — PRD §9.7. Malayalam and Punjabi are named for the release
 * after launch; Malayalam's face is wired here because it costs nothing until
 * its class is applied, Punjabi (Gurmukhi) is not yet wired because no locale
 * references it.
 */
export const LOCALES = [
  "en",
  "hi",
  "mr",
  "ta",
  "te",
  "gu",
  "kn",
  "bn",
  "ml",
] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * Locale → the Indic face that renders its script.
 *
 * Hindi and Marathi deliberately share the Devanagari face: they are two
 * languages in one script, and loading a second identical face for Marathi
 * would cost bytes for no glyph coverage.
 *
 * `en` maps to no Indic face at all — Inter covers it, and loading an unused
 * Devanagari face on the Owner's and Accountant's default locale would be pure
 * waste on the two personas most likely to be on a metered connection.
 */
const INDIC_FACE_BY_LOCALE: Record<Locale, { variable: string } | null> = {
  en: null,
  hi: notoDevanagari,
  mr: notoDevanagari,
  ta: notoTamil,
  te: notoTelugu,
  gu: notoGujarati,
  kn: notoKannada,
  bn: notoBengali,
  ml: notoMalayalam,
};

/**
 * The `className` list for `<html>` for a given locale: Inter always, plus the
 * one Indic face that locale needs.
 */
export function fontClassNamesFor(locale: Locale): string {
  const indic = INDIC_FACE_BY_LOCALE[locale];
  const base = `${inter.variable} ${geistMono.variable}`;
  return indic ? `${base} ${indic.variable}` : base;
}
