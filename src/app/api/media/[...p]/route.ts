import path from "node:path";
import { BLOB_ACCESS, USE_BLOB, blobUrl, openFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * /api/media/<file> → generated media; /api/media/uploads/<file> → reference images. Signed-in users only (middleware).
 * Local disk or private Blob: streamed through here. Public Blob: redirect to the public URL.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ p: string[] }> }) {
  const parts = (await params).p;
  const isUpload = parts[0] === "uploads";
  const name = path.basename(isUpload ? parts.slice(1).join("/") : parts.join("/"));
  const folder = isUpload ? "uploads" : "media";

  if (USE_BLOB && BLOB_ACCESS === "public") {
    const url = await blobUrl(folder, name);
    if (!url) return new Response("Not found", { status: 404 });
    return new Response(null, { status: 308, headers: { location: url, "cache-control": "public, max-age=31536000, immutable" } });
  }
  const f = await openFile(folder, name);
  if (!f) return new Response("Not found", { status: 404 });
  // files never change under the same name (new generations get new names), so browsers can keep them
  return new Response(f.body as BodyInit, {
    headers: { "content-type": f.contentType, "cache-control": "private, max-age=31536000, immutable" },
  });
}
