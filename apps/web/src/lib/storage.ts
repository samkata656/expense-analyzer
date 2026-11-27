import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { ALLOWED_TYPES, isSafeStoredName, type AllowedMime } from "./files";

export function uploadPath(name: string): string {
  if (!isSafeStoredName(name)) throw new Error("unsafe upload name");
  return path.join(path.resolve(env.uploadDir), name);
}

export async function saveUpload(bytes: Uint8Array, mime: AllowedMime): Promise<{ name: string; url: string }> {
  const name = `${randomUUID()}.${ALLOWED_TYPES[mime]}`;
  await mkdir(path.resolve(env.uploadDir), { recursive: true });
  await writeFile(uploadPath(name), bytes, { flag: "wx" });
  return { name, url: `${env.publicBaseUrl}/uploads/${name}` };
}

export async function deleteUpload(name: string): Promise<void> {
  await unlink(uploadPath(name)).catch(() => {});
}
