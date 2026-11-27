import "server-only";
import postgres from "postgres";
import { env } from "./env";

const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

/** Single pooled connection shared across route handlers (and HMR reloads in dev). */
export function db(): postgres.Sql {
  if (!globalForDb.sql) {
    globalForDb.sql = postgres(env.databaseUrl, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
      types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } },
    });
  }
  return globalForDb.sql;
}
