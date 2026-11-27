// Fixed-window, in-memory limiter. Good enough for a single-container PoC.
const windows = new Map<string, { start: number; count: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
    }
    return true;
  }
  w.count++;
  return w.count <= limit;
}

export function clientIp(req: Request): string {
  // NPM sets X-Real-IP / X-Forwarded-For; first hop is the client.
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}
