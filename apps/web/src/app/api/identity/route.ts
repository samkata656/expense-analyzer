import { fail, readJson } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findUser } from "@/lib/users";
import { identitySchema } from "@/lib/validation";

export async function POST(req: Request) {
  if (!rateLimit(`id:${clientIp(req)}`, 30, 60_000)) return fail("RATE_LIMITED", 429);
  const parsed = identitySchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("VALIDATION", 400, { issues: parsed.error.flatten().fieldErrors });
  const user = await findUser(parsed.data);
  if (!user) return fail("EMPLOYEE_NOT_FOUND", 404);
  return Response.json({ ok: true, user: { firstName: user.first_name, lastName: user.last_name, role: user.role } });
}
