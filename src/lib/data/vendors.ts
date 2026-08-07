import { z } from "zod";
import { MSME_CLASSES } from "./money";

/**
 * Vendors — FR-705.
 *
 * **Why this is a Must and not a Should.** FR-905's §43B(h) countdown is a Must,
 * and it cannot count anything without knowing whether the vendor is a micro or
 * small enterprise, when the bill was dated, and whether there is a written
 * agreement. Same for FR-807 (reverse charge, which turns on the vendor's
 * registration) and FR-906 (TDS, which turns on what kind of person they are).
 * Three Musts resting on an optional record is not a scheduling question, it is
 * a broken dependency — decision D1, resolved by promoting this.
 *
 * **The fields are chosen by what the law asks, not by what a form usually has.**
 * `panType` exists because the TDS rate under §194C differs by the payee's
 * constitution. `udyamActivity` exists because a trading registration does not
 * attract the MSMED timeline at all. `hasWrittenAgreement` exists because it is
 * what makes the limit 45 days rather than 15.
 */

/**
 * The fourth character of a PAN encodes the holder's constitution, and §194C
 * charges 1% to an individual or HUF and 2% to everyone else. Stored as a
 * choice rather than parsed out of the PAN, because a vendor without a PAN on
 * file still has a constitution — and a missing PAN has its own consequence.
 */
export const PAN_TYPES = ["INDIVIDUAL_HUF", "COMPANY_FIRM_OTHER"] as const;
export type PanType = (typeof PAN_TYPES)[number];

export const PAN_TYPE_LABEL: Record<PanType, string> = {
  INDIVIDUAL_HUF: "Individual or HUF",
  COMPANY_FIRM_OTHER: "Company, firm or other",
};

export const UDYAM_ACTIVITIES = ["MANUFACTURING", "SERVICE", "TRADING"] as const;
export type UdyamActivity = (typeof UDYAM_ACTIVITIES)[number];

export const UDYAM_ACTIVITY_LABEL: Record<UdyamActivity, string> = {
  MANUFACTURING: "Manufacturing",
  SERVICE: "Service",
  // Stated plainly because it changes the answer: a trading registration does
  // not attract the MSMED payment timeline.
  TRADING: "Trading — no MSMED timeline",
};

export const vendorSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Null for an unregistered supplier — which is what triggers reverse charge. */
  gstin: z.string().nullable(),
  stateCode: z.string(),
  pan: z.string().nullable(),
  panType: z.enum(PAN_TYPES),
  msmeClass: z.enum(MSME_CLASSES),
  udyamNumber: z.string().nullable(),
  udyamActivity: z.enum(UDYAM_ACTIVITIES).nullable(),
  /** §15 MSMED: with an agreement the limit is 45 days, without it 15. */
  hasWrittenAgreement: z.boolean(),
  paymentTermsDays: z.number().int().nonnegative(),
});

export type Vendor = z.infer<typeof vendorSchema>;
export const vendorsSchema = z.array(vendorSchema);

/** A vendor with no GSTIN is unregistered — the reverse-charge trigger. */
export function isUnregistered(vendor: Vendor): boolean {
  return vendor.gstin === null || vendor.gstin.trim() === "";
}

/**
 * Whether this vendor's bills fall under the MSMED payment timeline at all.
 *
 * Returns a reason either way, because "no timeline" is a fact somebody will be
 * asked to justify — not an absence.
 */
export function msmedApplies(
  vendor: Vendor,
): { applies: true; limitDays: 15 | 45 } | { applies: false; reason: string } {
  if (vendor.msmeClass === "UNVERIFIED") {
    return {
      applies: false,
      reason: "Udyam status unverified — the risk is unquantified, not absent",
    };
  }
  if (vendor.msmeClass === "MEDIUM" || vendor.msmeClass === "NOT_REGISTERED") {
    return {
      applies: false,
      reason: "Only micro and small enterprises attract the MSMED timeline",
    };
  }
  if (vendor.udyamActivity === "TRADING") {
    return {
      applies: false,
      reason: "Udyam registration is for trading, which the timeline excludes",
    };
  }
  return { applies: true, limitDays: vendor.hasWrittenAgreement ? 45 : 15 };
}

export const SEED_VENDORS: Vendor[] = [
  {
    id: "ven_1",
    name: "Kirloskar Spares Depot",
    gstin: "07AAACK1234F1Z9",
    stateCode: "07",
    pan: "AAACK1234F",
    panType: "COMPANY_FIRM_OTHER",
    msmeClass: "SMALL",
    udyamNumber: "UDYAM-DL-03-0012345",
    udyamActivity: "MANUFACTURING",
    hasWrittenAgreement: true,
    paymentTermsDays: 30,
  },
  {
    id: "ven_2",
    name: "Verma Electricals",
    gstin: null,
    stateCode: "07",
    pan: "ABCPV7788K",
    // Unregistered *and* an individual — reverse charge on the supply, and
    // §194C at 1% on the labour.
    panType: "INDIVIDUAL_HUF",
    msmeClass: "MICRO",
    udyamNumber: "UDYAM-DL-03-0099887",
    udyamActivity: "SERVICE",
    hasWrittenAgreement: false,
    paymentTermsDays: 15,
  },
  {
    id: "ven_3",
    name: "Metro Refrigeration Traders",
    gstin: "07AAFCM5566P1ZR",
    stateCode: "07",
    pan: "AAFCM5566P",
    panType: "COMPANY_FIRM_OTHER",
    msmeClass: "SMALL",
    udyamNumber: "UDYAM-DL-03-0044556",
    // Trading — so no MSMED clock, which is the case people get wrong.
    udyamActivity: "TRADING",
    hasWrittenAgreement: true,
    paymentTermsDays: 45,
  },
];
