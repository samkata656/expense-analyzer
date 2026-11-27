import { z } from "zod";
import { fail, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { summarize, type ExpenseRow } from "@/lib/history";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findUser } from "@/lib/users";
import { identitySchema } from "@/lib/validation";

export async function POST(req: Request) {
  if (!rateLimit(`hist:${clientIp(req)}`, 60, 60_000)) return fail("RATE_LIMITED", 429);
  const parsed = identitySchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("VALIDATION", 400, { issues: z.flattenError(parsed.error).fieldErrors });
  const user = await findUser(parsed.data);
  if (!user) return fail("EMPLOYEE_NOT_FOUND", 404);

  const rows = await db()<ExpenseRow[]>`
    SELECT id, image_url, merchant, to_char(receipt_date, 'YYYY-MM-DD') AS receipt_date,
           amount, currency, amount_eur, category, status, status_reason, description,
           created_at
    FROM expenses
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
    LIMIT 500`;
  return Response.json({ ok: true, expenses: rows, summary: summarize(rows) });
}
