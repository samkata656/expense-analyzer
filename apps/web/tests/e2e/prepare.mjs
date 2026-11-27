// Runs before the e2e web server: fresh database (roles come from db/init) + standalone static assets.
import { cpSync, existsSync } from "node:fs";
import postgres from "postgres";

const step = process.argv[2];

if (step === "db") {
  const name = new URL(process.env.DATABASE_URL).pathname.slice(1);
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@localhost:55432/postgres";
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${name}" OWNER app_rw`);
  await admin.end();
  const dbUrl = new URL(adminUrl);
  dbUrl.pathname = `/${name}`;
  const db = postgres(dbUrl.toString(), { max: 1, onnotice: () => {} });
  await db.unsafe(
    "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto; ALTER SCHEMA public OWNER TO app_rw; GRANT USAGE ON SCHEMA public TO cfo_readonly;",
  );
  await db.end();
  console.log(`[e2e] fresh database ${name}`); // migrations run when the server starts
}

if (step === "static") {
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
}
