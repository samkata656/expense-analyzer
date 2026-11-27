import { z } from "zod";
import { fail } from "@/lib/api";
import { env } from "@/lib/env";
import { MAX_UPLOAD_BYTES, sniffImageType } from "@/lib/files";
import { callN8n } from "@/lib/n8n";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { deleteUpload, saveUpload } from "@/lib/storage";
import { findUser } from "@/lib/users";
import { commentSchema, identitySchema } from "@/lib/validation";

export async function POST(req: Request) {
  if (!rateLimit(`exp:${clientIp(req)}`, 10, 60_000)) return fail("RATE_LIMITED", 429);

  // Reject oversized bodies before formData() buffers them in memory (10 MB file + form overhead).
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 1024 * 1024) return fail("FILE_TOO_LARGE", 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("VALIDATION", 400);
  }
  const str = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : "");

  const identity = identitySchema.safeParse({ firstName: str("firstName"), lastName: str("lastName"), employeeId: str("employeeId") });
  const comment = commentSchema.safeParse(str("comment"));
  if (!identity.success || !comment.success) {
    return fail("VALIDATION", 400, {
      issues: {
        ...(identity.error ? z.flattenError(identity.error).fieldErrors : {}),
        ...(comment.error ? { comment: comment.error.issues.map((i) => i.message) } : {}),
      },
    });
  }

  const file = form.get("receipt");
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !comment.data) return fail("EMPTY_SUBMISSION", 400);
  if (hasFile && file.size > MAX_UPLOAD_BYTES) return fail("FILE_TOO_LARGE", 413);

  // Cheap pre-check so files from non-employees are never stored. n8n checks again (spec requirement).
  if (!(await findUser(identity.data))) return fail("EMPLOYEE_NOT_FOUND", 403);

  const out = new FormData();
  out.set("firstName", identity.data.firstName);
  out.set("lastName", identity.data.lastName);
  out.set("employeeId", identity.data.employeeId);
  out.set("comment", comment.data);

  let stored: { name: string; url: string } | null = null;
  if (hasFile) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffImageType(bytes);
    if (!mime) return fail("INVALID_FILE_TYPE", 415);
    stored = await saveUpload(bytes, mime);
    out.set("imageUrl", stored.url);
    out.set("receipt", new Blob([bytes], { type: mime }), stored.name);
  }

  const result = await callN8n(env.n8nIntakeUrl, out);
  if (!result.ok) {
    // On a timeout n8n may still finish and save the expense, so keep the image it will point to.
    if (stored && result.code !== "UPSTREAM_TIMEOUT") await deleteUpload(stored.name);
    return fail(result.code, result.status, result.body?.details ? { details: result.body.details } : undefined);
  }
  return Response.json(result.body, { status: 201 });
}
