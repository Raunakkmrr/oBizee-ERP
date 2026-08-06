import { describe, expect, it } from "vitest";
import { e164, telHref, whatsappHref } from "./contact";

describe("phone numbers — a wrong guess dials a stranger", () => {
  it("assumes India for a bare ten-digit number", () => {
    expect(e164("98200 12345")).toBe("919820012345");
  });

  it("drops the domestic trunk prefix rather than dialling it", () => {
    // 0 is not dialled internationally; keeping it produces a dead number.
    expect(e164("098200 12345")).toBe("919820012345");
  });

  it("leaves an already-international number alone", () => {
    expect(e164("+971 50 123 4567")).toBe("971501234567");
    expect(e164("91 98200 12345")).toBe("919820012345");
  });

  it("returns null rather than guessing at an unrecognised shape", () => {
    // Four digits is an extension, not a phone number. Prefixing 91 to it
    // would produce a real, wrong number belonging to someone else.
    expect(e164("1234")).toBeNull();
    expect(e164("")).toBeNull();
    expect(e164(null)).toBeNull();
    expect(e164("not a phone")).toBeNull();
  });

  it("builds links only when the number is usable", () => {
    expect(telHref("98200 12345")).toBe("tel:+919820012345");
    expect(telHref("1234")).toBeNull();
    expect(whatsappHref("98200 12345")).toBe("https://wa.me/919820012345");
    expect(whatsappHref("1234", "hello")).toBeNull();
  });

  it("escapes the draft message", () => {
    expect(whatsappHref("98200 12345", "₹86,400 & due")).toBe(
      "https://wa.me/919820012345?text=%E2%82%B986%2C400%20%26%20due",
    );
  });
});
