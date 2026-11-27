import type postgres from "postgres";

/**
 * The seed ships a demo CFO code in a public repo. In production CFO_EMPLOYEE_CODE replaces it at startup,
 * so the only way into the CFO assistant is a code that never appears in git.
 */
export async function applyCfoCode(sql: postgres.Sql, code: string | undefined, log: (m: string) => void = console.log) {
  const value = code?.trim();
  if (!value) return false;
  const rows = await sql`UPDATE users SET employee_code = ${value} WHERE role = 'cfo' AND employee_code <> ${value} RETURNING id`;
  if (rows.length) log(`[startup] CFO employee code set from CFO_EMPLOYEE_CODE`);
  return true;
}
