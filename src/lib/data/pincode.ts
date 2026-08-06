/**
 * Indian PIN codes, and the state a site sits in.
 *
 * **This is not a convenience field.** The site's state code is what
 * `derivePlaceOfSupply` uses to decide CGST+SGST versus IGST (FR-802), and
 * charging the wrong head is "the commonest and most expensive GST error a
 * small service firm makes". Until now no job carried a site state at all, so
 * `CREATE_INVOICE_FROM_JOB` fell back to the *branch's* own state — which is
 * right by luck for local work and silently wrong for every interstate job.
 *
 * It is also how a technician finds the place, which is the other half of why
 * it is captured at the lead rather than discovered on the day.
 *
 * **The derivation never sets the tax head by itself.** A PIN prefix maps to
 * one state in most of the country and to two in a fair amount of it — 24xxxx
 * is Uttar Pradesh or Uttarakhand, 83xxxx is Bihar or Jharkhand. So this
 * proposes, labelled as a guess, and the state on the record is whatever a
 * human confirmed. A wrong guess is visible; a silent one is a notice two years
 * later.
 */

/** Six digits, and the first is 1–8. 9 is the Army Postal Service. */
export const PIN_PATTERN = /^[1-8][0-9]{5}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin.replace(/\s/g, ""));
}

/**
 * Every GST state code.
 *
 * The table this replaces held six entries, so a site in Punjab printed
 * "State 03" on its own invoice. `obsolete` marks codes that still resolve for
 * old records but are not offered when picking: 25 merged into 26 in 2020, and
 * 28 was split when Telangana was formed — Andhra Pradesh is 37.
 */
export type StateEntry = {
  code: string;
  name: string;
  obsolete?: boolean;
};

export const GST_STATES: StateEntry[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "25", name: "Daman and Diu", obsolete: true },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "28", name: "Andhra Pradesh (before the split)", obsolete: true },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

export const STATE_BY_CODE: Record<string, string> = Object.fromEntries(
  GST_STATES.map((entry) => [entry.code, entry.name]),
);

/** The codes offered when picking — obsolete ones resolve but are not chosen. */
export function selectableStates(): StateEntry[] {
  return GST_STATES.filter((entry) => !entry.obsolete);
}

/**
 * PIN prefixes that map to exactly one state.
 *
 * Deliberately partial. Anything genuinely shared between two states is absent
 * rather than guessed — the whole 2x block (Uttar Pradesh and Uttarakhand), 5x
 * (Telangana and Andhra Pradesh), 6x (Tamil Nadu and Puducherry), 8x (Bihar
 * and Jharkhand), and the north-east. Those return `ambiguous`, and the reader
 * picks.
 *
 * This is the *fallback* path — the lookup calls India Post first. Its job is
 * to be useful with no signal, not to be a postal database.
 */
const PREFIX_2: Record<string, string> = {
  "11": "07", // Delhi
  "12": "06", // Haryana
  "13": "06",
  "14": "03", // Punjab
  "15": "03",
  "17": "02", // Himachal Pradesh
  "30": "08", // Rajasthan
  "31": "08",
  "32": "08",
  "33": "08",
  "34": "08",
  "36": "24", // Gujarat
  "37": "24",
  "38": "24",
  "39": "24",
  "40": "27", // Maharashtra
  "41": "27",
  "42": "27",
  "43": "27",
  "44": "27",
  "45": "23", // Madhya Pradesh
  "46": "23",
  "47": "23",
  "48": "23",
  "49": "22", // Chhattisgarh
  "56": "29", // Karnataka
  "57": "29",
  "58": "29",
  "59": "29",
  "70": "19", // West Bengal
  "71": "19",
  "72": "19",
  "74": "19",
  "75": "21", // Odisha
  "76": "21",
  "77": "21",
  "78": "18", // Assam
};

/** Three-digit exceptions that override the block they sit in. */
const PREFIX_3: Record<string, string> = {
  "160": "04", // Chandigarh, inside Punjab's 16x block
  "737": "11", // Sikkim, inside West Bengal's 73x block
};

export type PinGuess =
  | { kind: "state"; code: string; name: string }
  /** The prefix is real but shared. Naming the candidates beats a coin toss. */
  | { kind: "ambiguous"; reason: string }
  | { kind: "unknown"; reason: string };

export function guessStateFromPin(pin: string): PinGuess {
  const digits = pin.replace(/\D/g, "");
  if (!isValidPin(digits)) {
    return { kind: "unknown", reason: "A PIN code is six digits, starting 1–8" };
  }

  const three = PREFIX_3[digits.slice(0, 3)];
  if (three) {
    return { kind: "state", code: three, name: STATE_BY_CODE[three] };
  }

  const two = PREFIX_2[digits.slice(0, 2)];
  if (two) {
    return { kind: "state", code: two, name: STATE_BY_CODE[two] };
  }

  return {
    kind: "ambiguous",
    reason: "This PIN block covers more than one state — please pick",
  };
}
