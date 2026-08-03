import { describe, expect, it } from "vitest";
import {
  contactOrder,
  warrantyStateFor,
  type Asset,
  type Contact,
} from "./customers";

function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: "a",
    assetType: "Split AC",
    make: "LG",
    model: "M",
    serialNumber: "S",
    locationInSite: "Room",
    condition: "GOOD",
    warrantyExpiry: { dateWord: "1 Jan 2027", daysLeft: 200 },
    repeatFailure: false,
    ...over,
  };
}

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: "c",
    name: "N",
    phone: "9",
    whatsapp: null,
    roleLabel: "OTHER",
    isPrimary: false,
    ...over,
  };
}

describe("warranty as a word (§6.14)", () => {
  it("distinguishes no-warranty-on-record from expired", () => {
    // The distinction the union exists to enforce: these look identical if you
    // only render a date, and they are opposite facts when a customer disputes
    // a repair bill.
    expect(warrantyStateFor(asset({ warrantyExpiry: null })).kind).toBe("unknown");
    expect(
      warrantyStateFor(
        asset({ warrantyExpiry: { dateWord: "12 Mar 2026", daysLeft: -143 } }),
      ).kind,
    ).toBe("expired");
  });

  it("flags a warranty about to lapse, because that changes what you quote", () => {
    const state = warrantyStateFor(
      asset({ warrantyExpiry: { dateWord: "30 Sep 2026", daysLeft: 59 } }),
    );
    expect(state.kind).toBe("expiring");
    expect(state.word).toContain("59 days");
  });

  it("treats the last day of cover as still in warranty", () => {
    expect(
      warrantyStateFor(asset({ warrantyExpiry: { dateWord: "x", daysLeft: 0 } }))
        .kind,
    ).toBe("expiring");
  });

  it("never renders a bare date with no state", () => {
    // Every branch produces a word, so no asset card can show a naked date.
    const kinds = [null, -1, 0, 30, 400].map((daysLeft) =>
      warrantyStateFor(
        asset({
          warrantyExpiry:
            daysLeft === null ? null : { dateWord: "d", daysLeft },
        }),
      ).word,
    );
    expect(kinds.every((word) => word.length > 0)).toBe(true);
  });
});

describe("contact call order (§7.6)", () => {
  it("puts the primary contact first regardless of role", () => {
    const security = contact({ id: "sec", roleLabel: "SECURITY", isPrimary: true });
    const incharge = contact({ id: "inc", roleLabel: "SITE_INCHARGE" });
    expect(contactOrder([incharge, security]).map((c) => c.id)).toEqual([
      "sec",
      "inc",
    ]);
  });

  it("ranks the site in-charge above accounts and security", () => {
    // Nobody should ring the gate desk about a compressor.
    const order = contactOrder([
      contact({ id: "sec", roleLabel: "SECURITY" }),
      contact({ id: "acc", roleLabel: "ACCOUNTS" }),
      contact({ id: "inc", roleLabel: "SITE_INCHARGE" }),
      contact({ id: "own", roleLabel: "OWNER" }),
    ]).map((c) => c.id);
    expect(order).toEqual(["inc", "own", "acc", "sec"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      contact({ id: "a", roleLabel: "SECURITY" }),
      contact({ id: "b", roleLabel: "SITE_INCHARGE" }),
    ];
    contactOrder(input);
    expect(input.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
