import { describe, expect, it } from "vitest";
import { upiUri } from "./upi";

const payee = { vpa: "shakticooling@okhdfcbank", name: "Shakti Cooling" };

describe("UPI collect link", () => {
  it("carries payee, amount in rupees and the invoice reference", () => {
    const uri = upiUri(payee, 5_310_00, "SVC/26-27/0151")!;
    expect(uri).toContain("pa=shakticooling%40okhdfcbank");
    // UPI rejects paise integers — this must be rupees with two decimals.
    expect(uri).toContain("am=5310.00");
    expect(uri).toContain("cu=INR");
    // Money arriving with no reference is a reconciliation problem somebody
    // solves by hand later.
    expect(uri).toContain("tn=Invoice%20SVC%2F26-27%2F0151");
    // Never `+` for a space: that is a form convention, and a UPI app that
    // does not undo it shows the payer a literal plus sign.
    expect(uri).not.toContain("+");
  });

  it("refuses a malformed VPA rather than printing a dead code", () => {
    // A QR that fails in the customer's hand is worse than none.
    expect(upiUri({ ...payee, vpa: "not-a-vpa" }, 100, "X")).toBeNull();
    expect(upiUri({ ...payee, vpa: "" }, 100, "X")).toBeNull();
    expect(upiUri({ ...payee, vpa: "a@b" }, 100, "X")).toBeNull();
  });

  it("formats paise without floating-point drift", () => {
    expect(upiUri(payee, 1, "X")).toContain("am=0.01");
    expect(upiUri(payee, 999_99, "X")).toContain("am=999.99");
  });
});
