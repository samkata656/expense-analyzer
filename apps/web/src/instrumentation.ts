// Runs once when the Next.js server starts: apply pending DB migrations.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_MIGRATIONS === "false") return;
  if (!process.env.DATABASE_URL) {
    console.warn("[migrate] DATABASE_URL not set, skipping migrations");
    return;
  }
  const { db } = await import("./lib/db");
  const { migrate } = await import("./lib/migrate");
  const { env } = await import("./lib/env");
  await migrate(db(), env.migrationsDir);
}
