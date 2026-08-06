/**
 * Customers & sites — PRD §6.14, §7.4–§7.7.
 *
 * **The modelling decision this file exists to honour** (§7.5): *a site is a
 * first-class entity, not a text field on the customer.* "A customer with six
 * sites is the normal case, and every job, asset, contract and place-of-supply
 * determination hangs off the site."
 *
 * Two consequences the UI must not blur:
 *
 * - **`landmark` is its own field**, never concatenated into the address. It is
 *   how an Indian address is actually resolved on the ground, and §7.5 requires
 *   it rendered on its own line everywhere.
 * - **Every contact carries a `role_label`**, "rendered next to every number so
 *   nobody rings the wrong person" (§7.6). A number without a role is how a
 *   coordinator ends up explaining a compressor failure to a security guard.
 */
import { z } from "zod";
import { defineQuery, type Fetched } from "./source";

export const CONTACT_ROLES = [
  "OWNER",
  "SITE_INCHARGE",
  "SECURITY",
  "TENANT",
  "ACCOUNTS",
  "OTHER",
] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  OWNER: "Owner",
  SITE_INCHARGE: "Site in-charge",
  SECURITY: "Security",
  TENANT: "Tenant",
  ACCOUNTS: "Accounts",
  OTHER: "Other",
};

const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  /** §7.6: stored separately, because it differs often enough to matter. */
  whatsapp: z.string().nullable(),
  roleLabel: z.enum(CONTACT_ROLES),
  isPrimary: z.boolean(),
});

export type Contact = z.infer<typeof contactSchema>;

/** §7.7's condition scale — a word on every asset card. */
export const ASSET_CONDITIONS = ["GOOD", "NEEDS_ATTENTION", "CRITICAL"] as const;
export type AssetCondition = (typeof ASSET_CONDITIONS)[number];

export const CONDITION_LABEL: Record<AssetCondition, string> = {
  GOOD: "Good",
  NEEDS_ATTENTION: "Needs attention",
  CRITICAL: "Critical",
};

const assetSchema = z.object({
  id: z.string(),
  assetType: z.string(),
  make: z.string(),
  model: z.string(),
  serialNumber: z.string().nullable(),
  locationInSite: z.string(),
  condition: z.enum(ASSET_CONDITIONS),
  /**
   * Null when no warranty was ever recorded — which is **not** the same as an
   * expired warranty, and must not render as one.
   */
  warrantyExpiry: z.object({ dateWord: z.string(), daysLeft: z.number().int() }).nullable(),
  /** FR-602: derived, not entered. Three failures inside a year is a pattern. */
  repeatFailure: z.boolean(),
});

export type Asset = z.infer<typeof assetSchema>;

const timelineSchema = z.object({
  id: z.string(),
  dateWord: z.string(),
  assetId: z.string().nullable(),
  jobNumber: z.string(),
  summary: z.string(),
  technician: z.string(),
});

export type TimelineEntry = z.infer<typeof timelineSchema>;

const siteSchema = z.object({
  id: z.string(),
  label: z.string(),
  addressLine1: z.string(),
  locality: z.string(),
  city: z.string(),
  stateCode: z.string(),
  pincode: z.string(),
  /** Its own column, never folded into the address (§7.5). */
  landmark: z.string().nullable(),
  /** Gate pass, lift status, dog, ID requirement — read before arriving. */
  accessNotes: z.string().nullable(),
  contacts: z.array(contactSchema),
  assets: z.array(assetSchema),
  timeline: z.array(timelineSchema),
});

export type Site = z.infer<typeof siteSchema>;

const customerSchema = z.object({
  id: z.string(),
  name: z.string(),
  customerType: z.enum(["INDIVIDUAL", "BUSINESS"]),
  /** Nullable — most household customers have no GSTIN (§7.4). */
  gstin: z.string().nullable(),
  billingStateCode: z.string(),
  creditDays: z.number().int().nonnegative(),
  outstandingPaise: z.number().int(),
  sites: z.array(siteSchema),
});

export type Customer = z.infer<typeof customerSchema>;

export const customersSchema = z.object({ customers: z.array(customerSchema) });
export type CustomersData = z.infer<typeof customersSchema>;

/**
 * Warranty, as a word — §6.14 asks for "warranty-as-a-word", not a raw date.
 *
 * A discriminated union so **"no warranty on record" cannot be confused with
 * "warranty expired"**. They look identical if you only render a date, and they
 * are opposite facts when a customer is disputing a repair bill.
 */
export type WarrantyState =
  | { kind: "in_warranty"; word: string }
  | { kind: "expiring"; word: string }
  | { kind: "expired"; word: string }
  | { kind: "unknown"; word: string };

export function warrantyStateFor(asset: Asset): WarrantyState {
  if (asset.warrantyExpiry === null) {
    return { kind: "unknown", word: "No warranty on record" };
  }
  const { dateWord, daysLeft } = asset.warrantyExpiry;
  if (daysLeft < 0) return { kind: "expired", word: `Out of warranty ${dateWord}` };
  if (daysLeft <= 60) {
    return { kind: "expiring", word: `Warranty ends ${dateWord} — ${daysLeft} days` };
  }
  return { kind: "in_warranty", word: `In warranty to ${dateWord}` };
}

/** Contacts in call order: primary first, then by how likely they are to answer usefully. */
export function contactOrder(contacts: Contact[]): Contact[] {
  const rank: Record<ContactRole, number> = {
    SITE_INCHARGE: 0,
    OWNER: 1,
    ACCOUNTS: 2,
    TENANT: 3,
    SECURITY: 4,
    OTHER: 5,
  };
  return [...contacts].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return rank[a.roleLabel] - rank[b.roleLabel];
  });
}

const FIXTURE = {
  customers: [
    {
      id: "cus_1",
      name: "Shakti Industries",
      customerType: "BUSINESS" as const,
      gstin: "27AABCS1234M1Z5",
      billingStateCode: "27",
      creditDays: 30,
      outstandingPaise: 86_400_00,
      sites: [
        {
          id: "site_1",
          label: "Okhla plant",
          addressLine1: "Plot 14, MIDC Phase II",
          locality: "Okhla Phase II",
          city: "New Delhi",
          stateCode: "07",
          pincode: "110020",
          landmark: "Opposite the Gurudwara, blue gate",
          accessNotes: "Gate pass from security. Photo ID required. Lift out of service.",
          contacts: [
            {
              id: "con_1",
              name: "Anil Joshi",
              phone: "98200 12345",
              whatsapp: "98200 12345",
              roleLabel: "SITE_INCHARGE" as const,
              isPrimary: true,
            },
            {
              id: "con_2",
              name: "Sunita Rao",
              phone: "98200 54321",
              // Different WhatsApp number — the case §7.6 stores separately for.
              whatsapp: "98200 99887",
              roleLabel: "ACCOUNTS" as const,
              isPrimary: false,
            },
            {
              id: "con_3",
              name: "Gate desk",
              phone: "98200 11111",
              whatsapp: null,
              roleLabel: "SECURITY" as const,
              isPrimary: false,
            },
          ],
          assets: [
            {
              id: "ast_1",
              assetType: "Cassette AC",
              make: "Daikin",
              model: "FCQ60",
              serialNumber: "DK60-2291884",
              locationInSite: "Shop floor, bay 2",
              condition: "CRITICAL" as const,
              warrantyExpiry: { dateWord: "12 Mar 2026", daysLeft: -143 },
              // Three failures in a year — FR-602's derived flag.
              repeatFailure: true,
            },
            {
              id: "ast_2",
              assetType: "Chiller",
              make: "Voltas",
              model: "CH-220",
              serialNumber: "VL220-77120",
              locationInSite: "Roof, north side",
              condition: "GOOD" as const,
              warrantyExpiry: { dateWord: "30 Sep 2026", daysLeft: 59 },
              repeatFailure: false,
            },
            {
              id: "ast_3",
              assetType: "Cassette AC",
              make: "Blue Star",
              model: "BS-48CQ",
              // No serial recorded — must not render as an empty string.
              serialNumber: null,
              locationInSite: "Office, first floor",
              condition: "NEEDS_ATTENTION" as const,
              // No warranty on record — different from expired.
              warrantyExpiry: null,
              repeatFailure: false,
            },
          ],
          timeline: [
            {
              id: "tl_1",
              dateWord: "31 Jul 2026",
              assetId: "ast_1",
              jobNumber: "J-2608-0398",
              summary: "AC repair — awaiting drain pump, van stock exhausted",
              technician: "Ramesh Yadav",
            },
            {
              id: "tl_2",
              dateWord: "18 Jun 2026",
              assetId: "ast_1",
              jobNumber: "J-2606-0201",
              summary: "Compressor tripping under load; capacitor replaced",
              technician: "Ramesh Yadav",
            },
            {
              id: "tl_3",
              dateWord: "2 May 2026",
              assetId: "ast_1",
              jobNumber: "J-2605-0088",
              summary: "Same fault reported — gas top-up, no leak found",
              technician: "Deepak Verma",
            },
            {
              id: "tl_4",
              dateWord: "14 Apr 2026",
              assetId: "ast_2",
              jobNumber: "J-2604-0031",
              summary: "Quarterly preventive — coils cleaned, readings normal",
              technician: "Ramesh Yadav",
            },
          ],
        },
        {
          // The second site is the whole point of §7.5 — same customer, own
          // address, own assets, own place-of-supply state.
          id: "site_2",
          label: "Nagpur unit",
          addressLine1: "Survey 88, Butibori MIDC",
          locality: "Butibori",
          city: "Nagpur",
          stateCode: "27",
          pincode: "441122",
          landmark: null,
          accessNotes: null,
          contacts: [
            {
              id: "con_4",
              name: "Vikram Pawar",
              phone: "98220 45671",
              whatsapp: "98220 45671",
              roleLabel: "SITE_INCHARGE" as const,
              isPrimary: true,
            },
          ],
          assets: [],
          timeline: [],
        },
      ],
    },
    {
      id: "cus_2",
      name: "Mrs. Deshpande",
      customerType: "INDIVIDUAL" as const,
      // Household customer, no GSTIN — the common case (§7.4).
      gstin: null,
      billingStateCode: "07",
      creditDays: 0,
      outstandingPaise: 0,
      sites: [
        {
          id: "site_3",
          label: "Residence",
          addressLine1: "B-42, Vasant Kunj",
          locality: "Vasant Kunj",
          city: "New Delhi",
          stateCode: "07",
          pincode: "110070",
          landmark: "Behind the DDA market, green gate",
          accessNotes: "Dog on premises. Ring before entering.",
          contacts: [
            {
              id: "con_5",
              name: "Mrs. Deshpande",
              phone: "98110 66554",
              whatsapp: "98110 66554",
              roleLabel: "OWNER" as const,
              isPrimary: true,
            },
          ],
          assets: [
            {
              id: "ast_4",
              assetType: "Split AC",
              make: "LG",
              model: "PS-Q19",
              serialNumber: "LG19-441290",
              locationInSite: "Bedroom, first floor",
              condition: "GOOD" as const,
              warrantyExpiry: { dateWord: "8 Feb 2028", daysLeft: 555 },
              repeatFailure: false,
            },
          ],
          timeline: [
            {
              id: "tl_5",
              dateWord: "2 Aug 2026",
              assetId: "ast_4",
              jobNumber: "J-2608-0417",
              summary: "AC servicing — signed off, rated 1 star, “left dirty”",
              technician: "Ramesh Yadav",
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Who a bill is addressed to, frozen at the moment it is issued — not joined.
 *
 * **Why a snapshot.** A tax invoice is a document, not a view. If a customer
 * later corrects their GSTIN or moves office, every invoice already issued must
 * keep showing what was printed and filed; joining live would silently rewrite
 * history and put the register out of step with the returns. So the invoice
 * carries these fields, and this function is only ever called at the moment one
 * is created.
 *
 * Returns null when the customer is not on file. The caller must then say so —
 * the defect this replaces was a screen that printed one customer's registered
 * address and GSTIN on every other customer's invoice.
 */
export type BillingIdentity = {
  gstin: string | null;
  billingStateCode: string;
  siteAddress: string;
  siteLocality: string;
  siteStateCode: string;
  sitePincode: string;
};

export function billingIdentityFor(
  customerName: string,
  siteHint?: string | null,
): BillingIdentity | null {
  const customer = FIXTURE.customers.find(
    (candidate) => candidate.name === customerName,
  );
  if (!customer) return null;

  // The site the work was at, when we know it — a customer with a Pune office
  // and a Nagpur plant has two different places of supply.
  const site =
    (siteHint
      ? customer.sites.find(
          (candidate) =>
            candidate.locality === siteHint ||
            candidate.label === siteHint ||
            candidate.addressLine1 === siteHint,
        )
      : null) ?? customer.sites[0];

  return {
    gstin: customer.gstin,
    billingStateCode: customer.billingStateCode,
    siteAddress: site?.addressLine1 ?? "",
    siteLocality: site?.locality ?? "",
    // FR-802 compares the SITE's state, never the billing state.
    siteStateCode: site?.stateCode ?? customer.billingStateCode,
    sitePincode: site?.pincode ?? "",
  };
}

export const getCustomers = defineQuery<void, CustomersData>({
  key: "customers.list",
  schema: customersSchema,
  fixture: (): Fetched<unknown> => ({ raw: FIXTURE }),
});
