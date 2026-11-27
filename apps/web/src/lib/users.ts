import "server-only";
import { db } from "./db";
import type { Identity } from "./validation";

export type UserRecord = { id: string; first_name: string; last_name: string; employee_code: string; role: "employee" | "cfo" };

/** Names match case-insensitively (whitespace collapsed by the schema); the ID must match exactly. */
export async function findUser(i: Identity): Promise<UserRecord | null> {
  const rows = await db()<UserRecord[]>`
    SELECT id, first_name, last_name, employee_code, role
    FROM users
    WHERE lower(first_name) = lower(${i.firstName})
      AND lower(last_name)  = lower(${i.lastName})
      AND employee_code     = ${i.employeeId}
    LIMIT 1`;
  return rows[0] ?? null;
}
