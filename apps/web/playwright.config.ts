import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// E2E runs the standalone production build against a throwaway DB and a stubbed n8n (no OpenAI calls).
const PORT = 3100;
const STUB_PORT = 5699;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://app_rw:app@localhost:55432/expenses_e2e";
const shared = { DATABASE_URL, N8N_WEBHOOK_SECRET: "e2e-secret" };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", locale: "bg-BG" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // Playwright starts web servers before globalSetup, so the DB is prepared in this command.
      command:
        "node tests/e2e/prepare.mjs db && npm run build && node tests/e2e/prepare.mjs static && node .next/standalone/server.js",
      port: PORT,
      timeout: 300_000,
      env: {
        ...shared,
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        N8N_INTAKE_WEBHOOK_URL: `http://127.0.0.1:${STUB_PORT}/webhook/expense-intake`,
        N8N_CFO_WEBHOOK_URL: `http://127.0.0.1:${STUB_PORT}/webhook/cfo-chat`,
        PUBLIC_BASE_URL: `http://127.0.0.1:${PORT}`,
        UPLOAD_DIR: path.resolve(__dirname, "test-results/uploads"),
        MIGRATIONS_DIR: path.resolve(__dirname, "../../db/migrations"),
      },
      reuseExistingServer: false,
    },
    {
      command: "node tests/e2e/n8n-stub-server.mjs",
      port: STUB_PORT,
      env: { ...shared, STUB_PORT: String(STUB_PORT) },
      reuseExistingServer: false,
    },
  ],
});
