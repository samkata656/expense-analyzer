// Route handlers against a real Postgres (throwaway DB) with n8n replaced by a local stub.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { startN8nStub } from "../support/n8n-stub";

const SECRET = "test-secret";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const ivan = { firstName: "иван", lastName: "ПЕТРОВ", employeeId: "EMP-001" };
const cfo = { firstName: "Росица", lastName: "Ангелова", employeeId: "CFO-7781" };

let stub: Awaited<ReturnType<typeof startN8nStub>>;
let uploadDir: string;
let sql: postgres.Sql;
type Routes = {
  identity: typeof import("@/app/api/identity/route");
  history: typeof import("@/app/api/history/route");
  expenses: typeof import("@/app/api/expenses/route");
  cfo: typeof import("@/app/api/cfo/chat/route");
  uploads: typeof import("@/app/uploads/[file]/route");
};
let r: Routes;
let ipCounter = 0;

const json = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": `10.0.0.${++ipCounter}` },
    body: JSON.stringify(body),
  });
const form = (fields: Record<string, string>, file?: { bytes: Uint8Array; name: string; type: string }) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (file) fd.set("receipt", new Blob([file.bytes as BlobPart], { type: file.type }), file.name);
  return new Request("http://localhost/api/expenses", { method: "POST", body: fd, headers: { "x-real-ip": `10.1.0.${++ipCounter}` } });
};
const uploadCtx = (file: string) => ({ params: Promise.resolve({ file }) });

beforeAll(async () => {
  stub = await startN8nStub();
  uploadDir = await mkdtemp(path.join(os.tmpdir(), "uploads-"));
  Object.assign(process.env, {
    DATABASE_URL: inject("databaseUrl"),
    N8N_INTAKE_WEBHOOK_URL: `${stub.url}/webhook/expense-intake`,
    N8N_CFO_WEBHOOK_URL: `${stub.url}/webhook/cfo-chat`,
    N8N_WEBHOOK_SECRET: SECRET,
    PUBLIC_BASE_URL: "https://expenses.example.test",
    UPLOAD_DIR: uploadDir,
    N8N_TIMEOUT_MS: "1500",
  });
  sql = postgres(inject("databaseUrl"), { max: 1 });
  r = {
    identity: await import("@/app/api/identity/route"),
    history: await import("@/app/api/history/route"),
    expenses: await import("@/app/api/expenses/route"),
    cfo: await import("@/app/api/cfo/chat/route"),
    uploads: await import("@/app/uploads/[file]/route"),
  };
});

afterAll(async () => {
  await stub?.close();
  await sql?.end();
  const { db } = await import("@/lib/db");
  await db().end();
  await rm(uploadDir, { recursive: true, force: true });
});

beforeEach(() => {
  stub.requests.length = 0;
});

describe("POST /api/identity", () => {
  it("matches names case-insensitively and the ID exactly", async () => {
    const res = await r.identity.POST(json(ivan));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, user: { firstName: "Иван", role: "employee" } });
    expect((await r.identity.POST(json({ ...ivan, employeeId: "emp-001" }))).status).toBe(404);
  });

  it("rejects unknown people and invalid bodies", async () => {
    expect((await r.identity.POST(json({ firstName: "Нико", lastName: "Никой", employeeId: "0" }))).status).toBe(404);
    const bad = await r.identity.POST(json({ firstName: "" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("VALIDATION");
  });
});

describe("POST /api/expenses", () => {
  it("rejects empty submissions and non-employees without calling n8n", async () => {
    expect((await r.expenses.POST(form({ ...ivan, comment: "" }))).status).toBe(400);
    const res = await r.expenses.POST(form({ firstName: "X", lastName: "Y", employeeId: "Z", comment: "такси" }));
    expect(res.status).toBe(403);
    expect(stub.requests).toHaveLength(0);
  });

  it("rejects files that are not real images (magic bytes) and stores nothing", async () => {
    const svg = new TextEncoder().encode("<svg/>");
    const res = await r.expenses.POST(form({ ...ivan, comment: "" }, { bytes: svg, name: "x.png", type: "image/png" }));
    expect(res.status).toBe(415);
    expect((await res.json()).code).toBe("INVALID_FILE_TYPE");
    expect(await readdir(uploadDir)).toHaveLength(0);
  });

  it("stores the image, forwards multipart with the secret, and returns the n8n result", async () => {
    stub.reply({ status: 201, body: { ok: true, expense: { status: "approved", category: "food" } } });
    const res = await r.expenses.POST(form({ ...ivan, comment: "Обяд" }, { bytes: PNG, name: "receipt.png", type: "image/png" }));
    expect(res.status).toBe(201);
    expect((await res.json()).expense.status).toBe("approved");

    const [req] = stub.requests;
    expect(req.path).toBe("/webhook/expense-intake");
    expect(req.headers["x-webhook-secret"]).toBe(SECRET);
    const text = req.body.toString("latin1");
    expect(text).toContain('name="receipt"');
    expect(text).toMatch(/https:\/\/expenses\.example\.test\/uploads\/[0-9a-f-]{36}\.png/);
    const files = await readdir(uploadDir);
    expect(files).toHaveLength(1);

    const served = await r.uploads.GET(new Request("http://localhost"), uploadCtx(files[0]));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("passes n8n error codes through and deletes the stored image", async () => {
    const before = (await readdir(uploadDir)).length;
    stub.reply({ status: 422, body: { ok: false, code: "RECEIPT_UNREADABLE", details: "черна снимка" } });
    const res = await r.expenses.POST(form({ ...ivan, comment: "" }, { bytes: PNG, name: "b.png", type: "image/png" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, code: "RECEIPT_UNREADABLE", details: "черна снимка" });
    expect((await readdir(uploadDir)).length).toBe(before);
  });

  it("rejects oversized bodies before parsing them", async () => {
    const req = new Request("http://localhost/api/expenses", {
      method: "POST",
      headers: { "content-length": String(50 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x", "x-real-ip": "10.9.9.9" },
      body: "--x--",
    });
    const res = await r.expenses.POST(req);
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("FILE_TOO_LARGE");
  });

  it("keeps the image when n8n times out (it may still save the expense)", async () => {
    const before = (await readdir(uploadDir)).length;
    stub.reply({ status: 201, body: { ok: true }, delayMs: 3000 });
    const res = await r.expenses.POST(form({ ...ivan, comment: "" }, { bytes: PNG, name: "slow.png", type: "image/png" }));
    expect(res.status).toBe(504);
    expect((await readdir(uploadDir)).length).toBe(before + 1);
  });

  it("maps n8n timeouts and garbage answers to friendly codes and logs them", async () => {
    stub.reply({ status: 200, body: { ok: true }, delayMs: 3000 });
    const t = await r.expenses.POST(form({ ...ivan, comment: "такси 10 лв" }));
    expect(t.status).toBe(504);
    expect((await t.json()).code).toBe("UPSTREAM_TIMEOUT");

    stub.reply({ status: 500, body: { message: "Workflow could not be started!" } });
    const e = await r.expenses.POST(form({ ...ivan, comment: "такси 10 лв" }));
    expect(e.status).toBe(500);
    expect((await e.json()).code).toBe("UPSTREAM_ERROR");

    const logs = await sql`SELECT error_code FROM error_logs WHERE source = 'web'`;
    expect(logs.map((l) => l.error_code)).toEqual(expect.arrayContaining(["UPSTREAM_TIMEOUT", "UPSTREAM_ERROR"]));
  });
});

describe("POST /api/history", () => {
  it("returns only the employee's own expenses with totals", async () => {
    const [ivanRow] = await sql`SELECT id FROM users WHERE employee_code = 'EMP-001'`;
    const [maria] = await sql`SELECT id FROM users WHERE employee_code = '1042'`;
    await sql`INSERT INTO expenses (user_id, amount, currency, amount_bgn, amount_eur, category, status, status_reason) VALUES
      (${ivanRow.id}, 24, 'BGN', 24, 12.27, 'city_transport', 'approved', 'P4'),
      (${ivanRow.id}, 100, 'EUR', 195.58, 100, 'it_equipment', 'approved', 'P6'),
      (${ivanRow.id}, 7.5, 'BGN', 7.5, 3.83, 'cigarettes', 'rejected', 'P3'),
      (${maria.id}, 999, 'EUR', 1953.87, 999, 'travel', 'manual_review', 'P5')`;
    const res = await r.history.POST(json(ivan));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expenses).toHaveLength(3);
    expect(body.summary).toMatchObject({ count: 3, totalEur: 116.1, approvedEur: 112.27 });
    expect(body.summary.byStatus.rejected).toEqual({ count: 1, eur: 3.83 });
    expect((await r.history.POST(json({ ...ivan, employeeId: "1042" }))).status).toBe(404);
  });
});

describe("POST /api/cfo/chat", () => {
  const msg = { message: "Колко са разходите?", sessionId: "session12345" };

  it("only the CFO can talk to the assistant", async () => {
    const res = await r.cfo.POST(json({ ...ivan, ...msg }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_CFO");
    expect(stub.requests).toHaveLength(0);
  });

  it("forwards the question with the secret and returns the reply", async () => {
    stub.reply({ status: 200, body: { ok: true, reply: "Общо 116,10 €" } });
    const res = await r.cfo.POST(json({ ...cfo, ...msg }));
    expect(await res.json()).toEqual({ ok: true, reply: "Общо 116,10 €" });
    expect(stub.requests[0].headers["x-webhook-secret"]).toBe(SECRET);
    expect(JSON.parse(stub.requests[0].body.toString()).message).toBe(msg.message);
  });
});

describe("GET /uploads/[file]", () => {
  it("404s for traversal attempts and unknown files", async () => {
    for (const file of ["../../package.json", "..%2F..%2Fpackage.json", "00000000-0000-4000-8000-000000000000.png"]) {
      const res = await r.uploads.GET(new Request("http://localhost"), uploadCtx(file));
      expect(res.status, file).toBe(404);
    }
  });
});

describe("CFO code from env", () => {
  it("replaces the public demo code so the seeded one stops working", async () => {
    const { applyCfoCode } = await import("@/lib/cfo-identity");
    expect(await applyCfoCode(sql, "  ", () => {})).toBe(false);
    await applyCfoCode(sql, "SECRET-CFO-42", () => {});
    expect((await r.identity.POST(json(cfo))).status).toBe(404);
    expect((await r.identity.POST(json({ ...cfo, employeeId: "SECRET-CFO-42" }))).status).toBe(200);
    await applyCfoCode(sql, cfo.employeeId, () => {});
  });
});

describe("database roles", () => {
  it("cfo_readonly can read but never write", async () => {
    const u = new URL(inject("databaseUrl"));
    u.username = "cfo_readonly";
    u.password = process.env.TEST_CFO_DB_PASSWORD ?? "cfo";
    const ro = postgres(u.toString(), { max: 1 });
    try {
      expect((await ro`SELECT count(*)::int AS n FROM expenses`)[0].n).toBeGreaterThan(0);
      await expect(ro`DELETE FROM expenses`).rejects.toThrow();
      await expect(ro`SELECT * FROM jailbreak_attempts`).rejects.toThrow(/permission denied/);
      // employee codes are the login secret: hidden from the CFO agent
      expect((await ro`SELECT first_name, role FROM users WHERE role = 'cfo'`)[0].role).toBe("cfo");
      await expect(ro`SELECT employee_code FROM users`).rejects.toThrow(/permission denied/);
    } finally {
      await ro.end();
    }
  });
});
