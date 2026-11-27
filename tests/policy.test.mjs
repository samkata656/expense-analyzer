// Runs every case in policy-cases.json through the real n8n "Expense Policy (rules)" workflow
// via the TEST ONLY harness webhook. Needs n8n running with N8N_IMPORT_TEST_WORKFLOWS=true.
//   N8N_URL=http://localhost:5678 node --test tests/policy.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const N8N_URL = process.env.N8N_URL ?? "http://localhost:5678";
const cases = JSON.parse(readFileSync(new URL("./policy-cases.json", import.meta.url), "utf8"));

test(`policy workflow decides ${cases.length} cases correctly`, async () => {
  const input = cases.map(({ expected, ...c }) => c);
  const res = await fetch(`${N8N_URL}/webhook/policy-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cases: input }),
  });
  assert.equal(res.status, 200, await res.clone().text());
  const out = await res.json();
  const byId = new Map(out.map((r) => [r.id, r]));
  const failures = [];
  for (const c of cases) {
    const got = byId.get(c.id);
    if (!got) failures.push(`${c.id}: no result`);
    else if (got.status !== c.expected.status || got.policy !== c.expected.policy)
      failures.push(`${c.id} ${c.category} ${c.amount} ${c.currency}: expected ${c.expected.status}/${c.expected.policy}, got ${got.status}/${got.policy} (${got.status_reason})`);
    else assert.ok(got.status_reason?.length > 10, `${c.id} has a reason`);
  }
  assert.deepEqual(failures, []);
});

test("EUR amounts are converted at the fixed 1.95583 rate", async () => {
  const res = await fetch(`${N8N_URL}/webhook/policy-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cases: [{ id: "eur", category: "training", amount: 100, currency: "EUR", has_alcohol: false, force_manual_review: false }] }),
  });
  const [r] = await res.json();
  assert.equal(r.amount_bgn, 195.58);
  assert.equal(r.amount_eur, 100);
});
