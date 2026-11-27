import { readFile } from "node:fs/promises";
import { isSafeStoredName, mimeForStoredName } from "@/lib/files";
import { uploadPath } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/uploads/[file]">) {
  const { file } = await ctx.params;
  const mime = isSafeStoredName(file) ? mimeForStoredName(file) : null;
  if (!mime) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(uploadPath(file));
    return new Response(data, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
