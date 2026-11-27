import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";

/**
 * Applies every *.sql file in `dir` that is not yet recorded in schema_migrations,
 * in filename order, each inside its own transaction. An advisory lock keeps two
 * starting containers from migrating at the same time.
 */
export async function migrate(sql: postgres.Sql, dir: string, log = console.log): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(727274)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const done = new Set((await tx<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const body = await readFile(path.join(dir, file), "utf8");
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      applied.push(file);
      log(`[migrate] applied ${file}`);
    }
  });
  return applied;
}
