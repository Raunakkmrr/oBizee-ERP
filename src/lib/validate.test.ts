import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  dialablePhone,
  gstin,
  optionalEmail,
  requiredName,
  rupees,
  validate,
} from "./validate";

const schema = z.object({
  name: requiredName("A name"),
  phone: dialablePhone,
  email: optionalEmail,
});

const values = { name: "Ramesh", phone: "98110 00003", email: "" };

describe("validation reports per field, and only once touched", () => {
  it("passes a good form", () => {
    const result = validate(schema, values, new Set());
    expect(result.ok).toBe(true);
    expect(result.summary).toEqual([]);
  });

  it("stays silent on a field nobody has touched", () => {
    // Errors on an untouched field turn a blank form into a wall of red before
    // anybody has typed anything.
    const result = validate(schema, { ...values, name: "" }, new Set());
    expect(result.errors.name).toBeUndefined();
    // …but the submit button still knows.
    expect(result.ok).toBe(false);
    expect(result.allErrors.name).toBe("A name is needed");
  });

  it("speaks up once the field has been touched", () => {
    const result = validate(schema, { ...values, name: "" }, new Set(["name"]));
    expect(result.errors.name).toBe("A name is needed");
  });

  it("shows one message per field, not three", () => {
    const result = validate(
      schema,
      { name: "", phone: "", email: "nope" },
      new Set(["name", "phone", "email"]),
    );
    expect(Object.keys(result.errors)).toHaveLength(3);
    expect(result.summary).toHaveLength(3);
  });
});

describe("the field rules themselves", () => {
  it("rejects whitespace as a name, and trims what it accepts", () => {
    expect(requiredName("A name").safeParse("   ").success).toBe(false);
    expect(requiredName("A name").parse("  Ramesh  ")).toBe("Ramesh");
  });

  it("accepts only a number the dialler could actually use", () => {
    // The form and the tel: link must agree — a number the form accepts and
    // the dialler cannot use fails later, in front of a customer.
    expect(dialablePhone.safeParse("98110 00003").success).toBe(true);
    expect(dialablePhone.safeParse("+91 98110 00003").success).toBe(true);
    expect(dialablePhone.safeParse("1234").success).toBe(false);
    expect(dialablePhone.safeParse("not a phone").success).toBe(false);
  });

  it("lets email be blank but not malformed", () => {
    // Field staff in this market often have none; demanding one would block a
    // real technician from being added at all.
    expect(optionalEmail.safeParse("").success).toBe(true);
    expect(optionalEmail.safeParse("a@b.example").success).toBe(true);
    expect(optionalEmail.safeParse("nope").success).toBe(false);
  });

  it("checks a GSTIN's shape, because a wrong one fails at filing", () => {
    expect(gstin.safeParse("07AABCS1429B1ZX").success).toBe(true);
    expect(gstin.safeParse("07AABCS1429B1Z").success).toBe(false);
    expect(gstin.safeParse("7AABCS1429B1ZX0").success).toBe(false);
  });

  it("takes money with separators but refuses zero and nonsense", () => {
    expect(rupees("A value").safeParse("1,20,000").success).toBe(true);
    expect(rupees("A value").safeParse("0").success).toBe(false);
    expect(rupees("A value").safeParse("-5").success).toBe(false);
    expect(rupees("A value").safeParse("abc").success).toBe(false);
  });
});
