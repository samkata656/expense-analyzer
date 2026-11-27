import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES, isErrorCode, messageFor } from "@/lib/errors";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/labels";
import { clientIp, rateLimit } from "@/lib/rate-limit";

describe("error messages", () => {
  it("maps known codes and falls back for unknown ones", () => {
    expect(messageFor("EMPLOYEE_NOT_FOUND")).toBe(ERROR_MESSAGES.EMPLOYEE_NOT_FOUND);
    expect(messageFor("SOMETHING_ELSE")).toBe(ERROR_MESSAGES.INTERNAL);
    expect(messageFor(undefined)).toBe(ERROR_MESSAGES.INTERNAL);
    expect(isErrorCode("toString")).toBe(false);
  });
  it("covers every category and status used by n8n", () => {
    for (const c of ["food", "business_meal", "cigarettes", "city_transport", "travel", "it_equipment", "training", "other"]) expect(CATEGORY_LABELS[c]).toBeTruthy();
    for (const s of ["approved", "rejected", "manual_review"]) expect(STATUS_LABELS[s]).toBeTruthy();
  });
});

describe("rateLimit", () => {
  it("allows up to the limit per window, then resets", () => {
    const key = `t-${Math.random()}`;
    expect([1, 2, 3].map(() => rateLimit(key, 2, 1000, 0))).toEqual([true, true, false]);
    expect(rateLimit(key, 2, 1000, 1000)).toBe(true);
  });
  it("reads the proxy client ip", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "1.2.3.4" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" } }))).toBe("5.6.7.8");
    expect(clientIp(new Request("http://x"))).toBe("local");
  });
});
