import { describe, expect, it } from "vitest";
import { isSafeStoredName, mimeForStoredName, sniffImageType } from "@/lib/files";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

describe("sniffImageType", () => {
  it("detects every allowed format by magic bytes", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImageType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("image/gif");
    expect(sniffImageType(bytes(0x47, 0x49, 0x46, 0x38, 0x37, 0x61))).toBe("image/gif");
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });

  it("rejects other content even with an image extension", () => {
    expect(sniffImageType(new TextEncoder().encode("not an image"))).toBeNull();
    expect(sniffImageType(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20))).toBeNull(); // RIFF AVI
  });
});

describe("stored upload names", () => {
  const ok = "3f2b8c1e-9a4d-4c7b-8e2f-1a2b3c4d5e6f.png";
  it("accepts only uuid-v4 names with an allowed extension", () => {
    expect(isSafeStoredName(ok)).toBe(true);
    expect(mimeForStoredName(ok)).toBe("image/png");
    expect(mimeForStoredName(ok.replace(".png", ".jpg"))).toBe("image/jpeg");
  });
  it("blocks traversal and unexpected names", () => {
    for (const bad of ["../etc/passwd", `..%2F${ok}`, `${ok}/../x`, "x.png", ok.replace(".png", ".svg"), ok.replace(".png", ".html"), ok.toUpperCase()]) {
      expect(isSafeStoredName(bad), bad).toBe(false);
    }
  });
});
