// File type detection by magic bytes; the browser-provided MIME type is never trusted.
export const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
export type AllowedMime = keyof typeof ALLOWED_TYPES;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif";

export function sniffImageType(buf: Uint8Array): AllowedMime | null {
  const at = (i: number, bytes: number[]) => bytes.every((b, k) => buf[i + k] === b);
  if (buf.length >= 3 && at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (buf.length >= 8 && at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (buf.length >= 6 && (at(0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || at(0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])))
    return "image/gif";
  if (buf.length >= 12 && at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}

/** Upload names we generate: <uuid v4>.<ext>. Anything else is rejected (blocks path traversal). */
const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;
export function isSafeStoredName(name: string): boolean {
  return STORED_NAME.test(name);
}

export function mimeForStoredName(name: string): AllowedMime | null {
  const ext = name.split(".").pop();
  const hit = Object.entries(ALLOWED_TYPES).find(([, e]) => e === ext);
  return (hit?.[0] as AllowedMime) ?? null;
}
