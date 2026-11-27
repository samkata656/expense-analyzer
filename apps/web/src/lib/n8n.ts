import "server-only";
import { db } from "./db";
import { env } from "./env";
import { isErrorCode, type ErrorCode } from "./errors";

export type N8nResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; code: ErrorCode; body?: Record<string, unknown> };

/** POSTs to an n8n webhook with the shared secret and normalises the answer into ok/code. */
export async function callN8n(url: string, body: FormData | object): Promise<N8nResult> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "X-Webhook-Secret": env.webhookSecret, ...(isForm ? {} : { "Content-Type": "application/json" }) },
      body: isForm ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(env.n8nTimeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    await logWebError(timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR", String(err), { url: redact(url) });
    return { ok: false, status: timeout ? 504 : 502, code: timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR" };
  }

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok && json && json.ok !== false) return { ok: true, status: res.status, body: json };

  const code = json && isErrorCode(json.code) ? json.code : "UPSTREAM_ERROR";
  if (code === "UPSTREAM_ERROR") {
    await logWebError(code, `n8n answered HTTP ${res.status}`, { url: redact(url), body: json });
  }
  return { ok: false, status: res.ok ? 502 : res.status, code, body: json ?? undefined };
}

function redact(url: string) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "invalid-url";
  }
}

export async function logWebError(code: string, message: string, payload?: unknown) {
  try {
    await db()`INSERT INTO error_logs (source, error_code, message, payload)
               VALUES ('web', ${code}, ${message.slice(0, 2000)}, ${db().json((payload ?? null) as never)})`;
  } catch (e) {
    console.error("[error_logs] failed to record", code, e);
  }
}
