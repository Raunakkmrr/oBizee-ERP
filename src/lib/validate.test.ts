import { describe, expect, it } from "vitest";
import { dialablePhone, indianPin, locality, personName } from "./validate";

const name = personName("A name");

describe("personName", () => {
  it("takes real Indian names, including long ones", () => {
    for (const value of [
      "Lakshminarayanan Subramaniam",
      "Mrs. Deshpande",
      "Bharat Petroleum Nehru Place Depot",
      "M. K. Rao & Associates",
      "प्रिया शर्मा",
    ]) {
      expect(name.safeParse(value).success, value).toBe(true);
    }
  });

  it("rejects the keyboard mash a real form accepted", () => {
    // From the screenshot that started this: 74 characters, no spaces.
    const mash =
      "yjrytjytkujhlkjythefgsrdtfghjknn;likutrgsfbdggjnlk;okgjftnbfvsdfdjvkbuik,j";
    expect(name.safeParse(mash).success).toBe(false);
  });

  it("rejects a name with no letters in it", () => {
    expect(name.safeParse("1234").success).toBe(false);
    expect(name.safeParse("...").success).toBe(false);
  });

  it("rejects blank and single characters", () => {
    expect(name.safeParse("").success).toBe(false);
    expect(name.safeParse(" ").success).toBe(false);
    expect(name.safeParse("R").success).toBe(false);
  });

  it("cannot catch a mash that has spaces in it — and does not pretend to", () => {
    // Documented rather than hidden: shape is checkable, sense is not.
    expect(name.safeParse("asdf qwer zxcv").success).toBe(true);
  });
});

describe("dialablePhone", () => {
  it("rejects the 27-digit number the form accepted", () => {
    expect(dialablePhone.safeParse("876543678965436789765436789").success).toBe(false);
  });

  it("takes the shapes people actually type", () => {
    for (const value of ["9820012345", "98200 12345", "+91 98200 12345", "09820012345"]) {
      expect(dialablePhone.safeParse(value).success, value).toBe(true);
    }
  });

  it("rejects a nine-digit number", () => {
    expect(dialablePhone.safeParse("982001234").success).toBe(false);
  });
});

describe("indianPin", () => {
  it("takes a real PIN", () => {
    expect(indianPin.safeParse("110024").success).toBe(true);
  });

  it("rejects a PIN starting 9 — that is the Army Postal Service", () => {
    expect(indianPin.safeParse("900001").success).toBe(false);
  });

  it("says what a PIN is when it is wrong", () => {
    const result = indianPin.safeParse("12");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("six digits");
    }
  });
});

describe("locality", () => {
  it("takes a real locality", () => {
    expect(locality.safeParse("Lajpat Nagar").success).toBe(true);
  });

  it("explains why it matters when blank", () => {
    const result = locality.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("technician");
    }
  });
});
