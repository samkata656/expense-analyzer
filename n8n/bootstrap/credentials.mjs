// Writes n8n credential files (decrypted form; `n8n import:credentials` encrypts them) from env vars.
// Fixed IDs match the ones referenced by the workflow JSON in /bootstrap/workflows.
// The OpenAI credential is only written when OPENAI_API_KEY is set, or once as an empty placeholder
// (the user then pastes the key in the n8n UI and it is never overwritten again).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const env = process.env;
const now = new Date().toISOString();

const pg = (id, name, user, password) => ({
  id,
  name,
  type: "postgres",
  data: {
    host: env.EXPENSES_DB_HOST ?? "postgres",
    port: Number(env.EXPENSES_DB_PORT ?? 5432),
    database: env.EXPENSES_DB_NAME ?? "expenses",
    user,
    password,
    maxConnections: 10,
    allowUnauthorizedCerts: false,
    ssl: "disable",
    sshTunnel: false,
  },
});

const creds = [];
if (env.APP_DB_PASSWORD) creds.push(pg("pgAppRw000000001", "Expenses DB (app_rw)", "app_rw", env.APP_DB_PASSWORD));
else console.warn("[bootstrap] APP_DB_PASSWORD missing: skipping app_rw credential");
if (env.CFO_DB_PASSWORD) creds.push(pg("pgCfoRead0000001", "Expenses DB (cfo_readonly)", "cfo_readonly", env.CFO_DB_PASSWORD));
else console.warn("[bootstrap] CFO_DB_PASSWORD missing: skipping cfo_readonly credential");
if (env.N8N_WEBHOOK_SECRET)
  creds.push({ id: "hdrWebhook000001", name: "Expense Webhook Secret", type: "httpHeaderAuth", data: { name: "X-Webhook-Secret", value: env.N8N_WEBHOOK_SECRET } });
else console.warn("[bootstrap] N8N_WEBHOOK_SECRET missing: skipping webhook credential");

const openai = { id: "openAiMain000001", name: "OpenAI", type: "openAiApi" };
if (env.OPENAI_API_KEY) {
  creds.push({ ...openai, data: { apiKey: env.OPENAI_API_KEY, url: "https://api.openai.com/v1" } });
} else if (!credentialExists(openai.id)) {
  console.log("[bootstrap] creating empty OpenAI credential placeholder: paste your key in n8n → Credentials → OpenAI");
  creds.push({ ...openai, data: { apiKey: "", url: "https://api.openai.com/v1" } });
}

for (const c of creds) {
  fs.writeFileSync(path.join(out, `${c.id}.json`), JSON.stringify({ ...c, createdAt: now, updatedAt: now }));
}
console.log(`[bootstrap] prepared ${creds.length} credential(s)`);

function credentialExists(id) {
  try {
    execFileSync("n8n", ["export:credentials", `--id=${id}`, "--output=/tmp/_probe.json"], { stdio: "ignore" });
    return fs.existsSync("/tmp/_probe.json") && JSON.parse(fs.readFileSync("/tmp/_probe.json", "utf8")).length > 0;
  } catch {
    return false;
  } finally {
    fs.rmSync("/tmp/_probe.json", { force: true });
  }
}
