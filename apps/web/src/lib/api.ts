import "server-only";
import { messageFor, type ErrorCode } from "./errors";

export function fail(code: ErrorCode, status: number, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, code, message: messageFor(code), ...extra }, { status });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
