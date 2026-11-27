import { describe, expect, it } from "vitest";
import { summarize, type ExpenseRow } from "@/lib/history";

const row = (p: Partial<ExpenseRow>): ExpenseRow => ({
  id: Math.random().toString(),
  image_url: null,
  merchant: null,
  receipt_date: null,
  amount: 0,
  currency: "EUR",
  amount_eur: 0,
  category: "food",
  status: "approved",
  status_reason: "",
  description: null,
  created_at: "",
  ...p,
});

describe("summarize", () => {
  it("totals by category and status in EUR", () => {
    const s = summarize([
      row({ amount_eur: 10.1, category: "food", status: "approved" }),
      row({ amount_eur: 20.2, category: "food", status: "rejected" }),
      row({ amount_eur: 100, category: "training", status: "approved" }),
      row({ amount_eur: null, currency: "USD", category: "other", status: "manual_review" }),
    ]);
    expect(s.count).toBe(4);
    expect(s.totalEur).toBe(130.3);
    expect(s.approvedEur).toBe(110.1);
    expect(s.unconvertedCount).toBe(1);
    expect(s.byCategory.food).toEqual({ count: 2, eur: 30.3 });
    expect(s.byStatus.manual_review).toEqual({ count: 1, eur: 0 });
  });
  it("handles an empty history", () => {
    expect(summarize([])).toEqual({ count: 0, totalEur: 0, approvedEur: 0, unconvertedCount: 0, byCategory: {}, byStatus: {} });
  });
});
