// Server-only configuration. Read lazily so `next build` works without runtime secrets.
import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get n8nIntakeUrl() {
    return required("N8N_INTAKE_WEBHOOK_URL");
  },
  get n8nCfoUrl() {
    return required("N8N_CFO_WEBHOOK_URL");
  },
  get webhookSecret() {
    return required("N8N_WEBHOOK_SECRET");
  },
  /** Public origin used to build image URLs saved in the DB, e.g. https://expenses.samkobuilds.com */
  get publicBaseUrl() {
    return (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR ?? "./uploads";
  },
  get migrationsDir() {
    return process.env.MIGRATIONS_DIR ?? "../../db/migrations";
  },
  get n8nTimeoutMs() {
    return Number(process.env.N8N_TIMEOUT_MS ?? 120_000);
  },
};
