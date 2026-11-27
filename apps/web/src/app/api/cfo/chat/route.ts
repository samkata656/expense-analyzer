import { fail, readJson } from "@/lib/api";
import { env } from "@/lib/env";
import { callN8n } from "@/lib/n8n";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findUser } from "@/lib/users";
import { chatSchema } from "@/lib/validation";

export async function POST(req: Request) {
  if (!rateLimit(`cfo:${clientIp(req)}`, 20, 60_000)) return fail("RATE_LIMITED", 429);
  const parsed = chatSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("VALIDATION", 400);
  const user = await findUser(parsed.data);
  if (!user || user.role !== "cfo") return fail("NOT_CFO", 403);

  const result = await callN8n(env.n8nCfoUrl, parsed.data);
  if (!result.ok) return fail(result.code, result.status);
  return Response.json({ ok: true, reply: String(result.body.reply ?? "") });
}
