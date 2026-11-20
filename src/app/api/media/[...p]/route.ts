import fs from "node:fs";
import path from "node:path";
import { MEDIA_DIR, UPLOAD_DIR } from "@/lib/db";
import { USE_BLOB, blobUrl, contentTypeOf } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * /api/media/<file> → generated media; /api/media/uploads/<file> → reference images.
 * Local: streams the file. Deployed (Vercel Blob): permanent redirect to the Blob URL.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ p: string[] }> }) {
  const parts = (await params).p;
  const isUpload = parts[0] === "uploads";
  const name = path.basename(isUpload ? parts.slice(1).join("/") : parts.join("/"));
  const folder = isUpload ? "uploads" : "media";

  if (USE_BLOB) {
    const url = await blobUrl(folder, name);
    if (!url) return new Response("Not found", { status: 404 });
    return new Response(null, { status: 308, headers: { location: url, "cache-control": "public, max-age=31536000, immutable" } });
  }
  const file = path.join(isUpload ? UPLOAD_DIR : MEDIA_DIR, name);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: { "content-type": contentTypeOf(name), "cache-control": "public, max-age=31536000, immutable" },
  });
}
