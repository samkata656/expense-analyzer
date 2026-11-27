// Creates a throwaway database owned by app_rw (roles come from db/init/00-init.sh) and applies migrations.
import path from "node:path";
import postgres from "postgres";
import { migrate } from "../../src/lib/migrate";

export const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@localhost:55432/postgres";
export const APP_PASSWORD = process.env.TEST_APP_DB_PASSWORD ?? "app";
export const MIGRATIONS = path.resolve(__dirname, "../../../../db/migrations");

export function appUrl(db: string) {
  const u = new URL(ADMIN_URL);
  u.username = "app_rw";
  u.password = APP_PASSWORD;
  u.pathname = `/${db}`;
  return u.toString();
}

export async function createTestDb(name: string): Promise<string> {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${name}" OWNER app_rw`);
  } finally {
    await admin.end();
  }
  const dbAdminUrl = new URL(ADMIN_URL);
  dbAdminUrl.pathname = `/${name}`;
  const dbAdmin = postgres(dbAdminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    await dbAdmin.unsafe(`CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto; ALTER SCHEMA public OWNER TO app_rw; GRANT USAGE ON SCHEMA public TO cfo_readonly;`);
  } finally {
    await dbAdmin.end();
  }
  const url = appUrl(name);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(sql, MIGRATIONS, () => {});
  } finally {
    await sql.end();
  }
  return url;
}

export async function dropTestDb(name: string) {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}
