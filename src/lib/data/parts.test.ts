import { describe, expect, it } from "vitest";
import {
  byUrgency,
  suggestedOrderQty,
  urgencyFor,
  type ReorderRow,
} from "./parts";

function row(over: Partial<ReorderRow> = {}): ReorderRow {
  return {
    id: "p",
    name: "Part",
    hsn: "8532",
    onHand: 5,
    reorderLevel: 10,
    monthlyConsumption: 4,
    preferredVendor: "V",
    unitCostPaise: 100_00,
    ...over,
  };
}

describe("reorder urgency (§6.14)", () => {
  it("separates out-of-stock from merely below level", () => {
    // Different problems with different remedies: one is a purchase order,
    // the other is a technician who cannot finish a job today.
    expect(urgencyFor(row({ onHand: 0 }))).toBe("out");
    expect(urgencyFor(row({ onHand: 3, reorderLevel: 10 }))).toBe("below");
    expect(urgencyFor(row({ onHand: 10, reorderLevel: 10 }))).toBe("at");
  });

  it("treats negative on-hand as out of stock, not as some fourth state", () => {
    expect(urgencyFor(row({ onHand: -2 }))).toBe("out");
  });

  it("sorts out-of-stock first, then by depth of shortfall", () => {
    const out = row({ id: "out", onHand: 0, reorderLevel: 4 });
    const deep = row({ id: "deep", onHand: 1, reorderLevel: 20 });
    const shallow = row({ id: "shallow", onHand: 9, reorderLevel: 10 });
    const sorted = [shallow, deep, out].sort(byUrgency).map((r) => r.id);
    expect(sorted).toEqual(["out", "deep", "shallow"]);
  });
});

describe("suggested order quantity", () => {
  it("covers the shortfall plus a month of consumption", () => {
    expect(suggestedOrderQty(row({ onHand: 3, reorderLevel: 10, monthlyConsumption: 11 }))).toBe(18);
  });

  it("never suggests zero on a screen whose purpose is producing an order", () => {
    // At level with no consumption: shortfall 0 + consumption 0 would be 0, and
    // an "order 0" row is noise on a reorder list.
    expect(suggestedOrderQty(row({ onHand: 4, reorderLevel: 4, monthlyConsumption: 0 }))).toBe(1);
  });

  it("counts a negative on-hand as a deeper shortfall, not as zero", () => {
    expect(suggestedOrderQty(row({ onHand: -2, reorderLevel: 6, monthlyConsumption: 5 }))).toBe(13);
  });
});
