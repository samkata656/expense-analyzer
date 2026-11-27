// Minimal stand-in for the n8n webhooks: records requests and answers with whatever the test queues.
import http from "node:http";
import type { AddressInfo } from "node:net";

export type StubReply = { status: number; body: unknown; delayMs?: number };
export type StubRequest = { path: string; headers: http.IncomingHttpHeaders; body: Buffer };

export async function startN8nStub() {
  const requests: StubRequest[] = [];
  const queue: StubReply[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      requests.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) });
      const reply = queue.shift() ?? { status: 500, body: { message: "no stub reply queued" } };
      setTimeout(() => {
        res.writeHead(reply.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reply.body));
      }, reply.delayMs ?? 0);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    reply: (r: StubReply) => queue.push(r),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
