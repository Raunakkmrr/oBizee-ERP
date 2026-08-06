import { describe, expect, it } from "vitest";
import { stampFor, toCsv } from "./export";

/**
 * The escaping is the part worth pinning. A customer called "Sharma, Bros"
 * silently splits into two columns without it, and every figure to its right
 * shifts by one — a corrupted export that still opens cleanly, which is the
 * worst kind.
 *
 * The DOM plumbing around it (anchor, click, revoke) is deliberately not
 * tested: it is four lines with no branches, and mocking it would assert that
 * the mock was called rather than that a file is correct.
 */
describe("CSV export", () => {
  it("quotes a value containing a comma, so columns cannot shift", () => {
    expect(toCsv(["Customer", "Amount"], [["Sharma, Bros", 4500]])).toContain(
      '"Sharma, Bros",4500',
    );
  });

  it("doubles an embedded quote, which is Excel's own escape", () => {
    expect(toCsv(["Note"], [['He said "later"']])).toContain(
      '"He said ""later"""',
    );
  });

  it("quotes a value containing a newline", () => {
    expect(toCsv(["Note"], [["line one\nline two"]])).toContain(
      '"line one\nline two"',
    );
  });

  it("writes a BOM, or Excel on Windows mangles every rupee sign", () => {
    expect(toCsv(["A"], [["₹100"]]).charCodeAt(0)).toBe(0xfeff);
  });

  it("renders an empty cell for null rather than the word null", () => {
    expect(toCsv(["A", "B"], [[null, 2]])).toContain("\r\n,2");
  });

  it("separates rows with CRLF, which is what Excel expects", () => {
    expect(toCsv(["A"], [["x"], ["y"]])).toBe("\uFEFFA\r\nx\r\ny");
  });
});

describe("filename stamp", () => {
  it("is sortable and unambiguous between date conventions", () => {
    expect(stampFor(new Date("2026-08-06T10:00:00"))).toBe("2026-08-06");
  });
});
