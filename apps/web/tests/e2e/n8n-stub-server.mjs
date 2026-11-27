// Stand-in for the n8n webhooks during Playwright runs (no OpenAI calls).
// Intake: inserts a deterministic "approved taxi" expense for the employee and answers like n8n does.
import http from "node:http";
import postgres from "postgres";

const port = Number(process.env.STUB_PORT ?? 5699);
const sql = postgres(process.env.DATABASE_URL, { max: 2 });

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

const server = http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.headers["x-webhook-secret"] !== process.env.N8N_WEBHOOK_SECRET) return send(403, { message: "Authorization data is wrong!" });
  const raw = await readBody(req);

  if (req.url === "/webhook/expense-intake") {
    const ct = req.headers["content-type"] ?? "";
    const form = await new Response(raw, { headers: { "content-type": ct } }).formData();
    const [user] = await sql`SELECT id FROM users WHERE employee_code = ${String(form.get("employeeId"))}`;
    if (!user) return send(403, { ok: false, code: "EMPLOYEE_NOT_FOUND" });
    const [row] = await sql`
      INSERT INTO expenses (user_id, merchant, amount, currency, amount_bgn, amount_eur, category, status, status_reason, policy, comment)
      VALUES (${user.id}, 'Yellow Taxi', 24, 'BGN', 24, 12.27, 'city_transport', 'approved',
              'Политика 4: градски транспорт/такси до 30 лв. (24.00 лв.). Одобрен автоматично.', 'P4', ${String(form.get("comment"))})
      RETURNING id, merchant, amount, currency, category, status, status_reason`;
    return send(201, { ok: true, expense: row });
  }
  if (req.url === "/webhook/cfo-chat") return send(200, { ok: true, reply: "Общо одобрени: **12,27 €**" });
  send(404, { message: "not found" });
});

server.listen(port, "127.0.0.1", () => console.log(`n8n stub on ${port}`));
