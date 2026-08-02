import { describe, expect, it } from "vitest";
import {
  MoneyError,
  asPaise,
  formatMoney,
  formatMoneyAxis,
  formatMoneyBare,
  formatMoneyForCustomer,
  rupeesToPaise,
} from "./money";

describe("asPaise — the integer-paise invariant (FR-801)", () => {
  it("accepts integers", () => {
    expect(asPaise(0)).toBe(0);
    expect(asPaise(123456789)).toBe(123456789);
    expect(asPaise(-5000)).toBe(-5000);
  });

  it("rejects a fractional paisa, because it means a float leaked in", () => {
    expect(() => asPaise(10.5)).toThrow(MoneyError);
    // 0.1 + 0.2 = 0.30000000000000004 — the exact failure mode FR-801 exists to
    // prevent. Multiplying by 100 does not rescue it.
    expect(() => asPaise((0.1 + 0.2) * 100)).toThrow(MoneyError);
  });

  it("rejects values beyond exact integer representation", () => {
    expect(() => asPaise(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });

  it("rupeesToPaise rounds explicitly rather than truncating", () => {
    expect(rupeesToPaise(4500)).toBe(450000);
    expect(rupeesToPaise(1234.56)).toBe(123456);
    // 0.1 cannot be represented in binary; the explicit round is what saves it.
    expect(rupeesToPaise(0.1)).toBe(10);
    expect(rupeesToPaise(1234.565)).toBe(123457);
  });
});

describe("formatMoney — Indian grouping (FR-813) and §6.13.6", () => {
  it("renders FR-813's stated example exactly", () => {
    // FR-813: "Given the value 123456789 paise, Then it renders as ₹12,34,567.89"
    expect(formatMoney(asPaise(123456789))).toBe("₹12,34,567.89");
  });

  it("groups in two-digit blocks above the thousand, not in thousands", () => {
    expect(formatMoney(asPaise(100000000))).toBe("₹10,00,000.00");
    expect(formatMoney(asPaise(1234567890))).toBe("₹1,23,45,678.90");
    expect(formatMoney(asPaise(100000))).toBe("₹1,000.00");
  });

  it("always shows two decimal places — never ₹4,500 (rule 3)", () => {
    expect(formatMoney(asPaise(450000))).toBe("₹4,500.00");
    expect(formatMoney(asPaise(0))).toBe("₹0.00");
  });

  it("renders ₹0.10 exactly, which IEEE-754 cannot represent as a float", () => {
    expect(formatMoney(asPaise(10))).toBe("₹0.10");
    expect(formatMoney(asPaise(1))).toBe("₹0.01");
    expect(formatMoney(asPaise(99))).toBe("₹0.99");
  });

  it("puts ₹ immediately before the figure with no space (rule 7)", () => {
    expect(formatMoney(asPaise(571100))).toBe("₹5,711.00");
    expect(formatMoney(asPaise(571100)).startsWith("₹5")).toBe(true);
  });

  it("renders credits in parentheses, never with a leading minus (rule 6)", () => {
    expect(formatMoney(asPaise(-120000))).toBe("(₹1,200.00)");
    expect(formatMoney(asPaise(-120000))).not.toContain("-");
  });

  it("never abbreviates (rule 5)", () => {
    expect(formatMoney(asPaise(31240000))).toBe("₹3,12,400.00");
    expect(formatMoney(asPaise(31240000))).not.toMatch(/L|Cr/);
  });

  it("loses no precision at large values", () => {
    // ₹9,99,99,99,999.99 — well past any MSME invoice, still exact.
    expect(formatMoney(asPaise(99999999999))).toBe("₹99,99,99,999.99");
  });
});

describe("formatMoneyBare — accounting tables under a ₹-labelled heading", () => {
  it("omits the symbol", () => {
    expect(formatMoneyBare(asPaise(123456789))).toBe("12,34,567.89");
  });

  it("wraps credits in parentheses", () => {
    expect(formatMoneyBare(asPaise(-120000))).toBe("(1,200.00)");
  });
});

describe("formatMoneyForCustomer — §6.13.6 rule 6", () => {
  it("renders a positive amount normally", () => {
    expect(formatMoneyForCustomer(asPaise(571100))).toBe("₹5,711.00");
  });

  it("renders a credit as an Advance, never as a negative", () => {
    expect(formatMoneyForCustomer(asPaise(-120000))).toBe("Advance ₹1,200.00");
    expect(formatMoneyForCustomer(asPaise(-120000))).not.toContain("-");
    expect(formatMoneyForCustomer(asPaise(-120000))).not.toContain("(");
  });
});

describe("formatMoneyAxis — the ONLY place abbreviation is allowed", () => {
  it("uses Indian magnitudes, with no K", () => {
    // Paise, not rupees: ₹45,000 is 45_00_000 paise, ₹1 crore is 1e9 paise.
    expect(formatMoneyAxis(asPaise(4_500_000))).toBe("₹45,000");
    expect(formatMoneyAxis(asPaise(31_240_000))).toBe("₹3.1L");
    expect(formatMoneyAxis(asPaise(1_000_000_000))).toBe("₹1Cr");
    expect(formatMoneyAxis(asPaise(1_250_000_000))).toBe("₹1.3Cr");
    expect(formatMoneyAxis(asPaise(10_000_000_000))).toBe("₹10Cr");
  });

  it("switches from lakh to crore at exactly ₹1 crore", () => {
    expect(formatMoneyAxis(asPaise(999_900_000))).toBe("₹100L");
    expect(formatMoneyAxis(asPaise(1_000_000_000))).toBe("₹1Cr");
  });

  it("drops a trailing .0 rather than printing ₹1.0L", () => {
    expect(formatMoneyAxis(asPaise(10_000_000))).toBe("₹1L");
  });

  it("keeps sub-rupee values legible", () => {
    expect(formatMoneyAxis(asPaise(10))).toBe("₹0.10");
    expect(formatMoneyAxis(asPaise(0))).toBe("₹0");
  });
});
