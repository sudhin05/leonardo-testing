import fs from "node:fs";
import path from "node:path";
import { MEDIA_DIR, UPLOAD_DIR } from "@/lib/db";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** Serves /api/media/<file> from data/media and /api/media/uploads/<file> from data/uploads. */
export async function GET(_req: Request, { params }: { params: Promise<{ p: string[] }> }) {
  const parts = (await params).p;
  const isUpload = parts[0] === "uploads";
  const name = path.basename(isUpload ? parts.slice(1).join("/") : parts.join("/"));
  const file = path.join(isUpload ? UPLOAD_DIR : MEDIA_DIR, name);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  const ext = name.split(".").pop()!.toLowerCase();
  return new Response(fs.readFileSync(file), {
    headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
  });
}
