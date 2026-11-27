import { describe, expect, it } from "vitest";
import { chatSchema, commentSchema, identitySchema } from "@/lib/validation";

describe("identitySchema", () => {
  it("collapses whitespace and keeps Cyrillic", () => {
    expect(identitySchema.parse({ firstName: "  Иван ", lastName: "Петров  ", employeeId: " EMP-001 " })).toEqual({
      firstName: "Иван",
      lastName: "Петров",
      employeeId: "EMP-001",
    });
    expect(identitySchema.parse({ firstName: "Анна  Мария", lastName: "X", employeeId: "1" }).firstName).toBe("Анна Мария");
  });
  it("accepts any ID format", () => {
    for (const id of ["1042", "DS/0099", "en77", "TC-2025-17"]) expect(identitySchema.safeParse({ firstName: "a", lastName: "b", employeeId: id }).success).toBe(true);
  });
  it("rejects empty and oversized fields", () => {
    expect(identitySchema.safeParse({ firstName: "   ", lastName: "b", employeeId: "1" }).success).toBe(false);
    expect(identitySchema.safeParse({ firstName: "a".repeat(101), lastName: "b", employeeId: "1" }).success).toBe(false);
    expect(identitySchema.safeParse({ firstName: "a", lastName: "b", employeeId: "x".repeat(65) }).success).toBe(false);
    expect(identitySchema.safeParse({ firstName: "a", lastName: "b" }).success).toBe(false);
    expect(identitySchema.safeParse(null).success).toBe(false);
  });
});

describe("commentSchema", () => {
  it("trims and limits length", () => {
    expect(commentSchema.parse("  такси  ")).toBe("такси");
    expect(commentSchema.safeParse("x".repeat(2001)).success).toBe(false);
  });
});

describe("chatSchema", () => {
  const base = { firstName: "Р", lastName: "А", employeeId: "CFO-1", message: "Колко?", sessionId: "abcdef1234" };
  it("requires a safe session id", () => {
    expect(chatSchema.safeParse(base).success).toBe(true);
    expect(chatSchema.safeParse({ ...base, sessionId: "short" }).success).toBe(false);
    expect(chatSchema.safeParse({ ...base, sessionId: "abc'; DROP TABLE x;--" }).success).toBe(false);
    expect(chatSchema.safeParse({ ...base, message: " " }).success).toBe(false);
  });
});
