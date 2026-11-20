import fs from "node:fs";
import path from "node:path";
import { put, del } from "@vercel/blob";
import { all, get, run, MEDIA_DIR, UPLOAD_DIR } from "./db";

/**
 * File storage for generated media and reference uploads.
 *  - Local:    data/media/<name>, data/uploads/<name>
 *  - Deployed: Vercel Blob (BLOB_READ_WRITE_TOKEN), keys "media/<name>" / "uploads/<name>",
 *              public URL recorded in the `media` table.
 * The browser always asks /api/media/... and is redirected to the Blob URL when deployed.
 */

export type Folder = "media" | "uploads";
export const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

const dirOf = (f: Folder) => (f === "media" ? MEDIA_DIR : UPLOAD_DIR);
const keyOf = (f: Folder, name: string) => `${f}/${path.basename(name)}`;

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
};
export const contentTypeOf = (name: string) => TYPES[name.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";

export async function putFile(folder: Folder, name: string, data: Buffer): Promise<void> {
  const contentType = contentTypeOf(name);
  if (!USE_BLOB) {
    fs.mkdirSync(dirOf(folder), { recursive: true });
    fs.writeFileSync(path.join(dirOf(folder), path.basename(name)), data);
    return;
  }
  const key = keyOf(folder, name);
  const blob = await put(key, data, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType });
  await run(
    "INSERT INTO media (key, url, content_type, size) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET url = excluded.url, content_type = excluded.content_type, size = excluded.size",
    [key, blob.url, contentType, data.length],
  );
}

export async function readFile(folder: Folder, name: string): Promise<Buffer | null> {
  if (!USE_BLOB) {
    const p = path.join(dirOf(folder), path.basename(name));
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  }
  const url = await blobUrl(folder, name);
  if (!url) return null;
  const res = await fetch(url);
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

/** Public URL of a stored file (Blob mode), or null. */
export async function blobUrl(folder: Folder, name: string): Promise<string | null> {
  return (await get<{ url: string }>("SELECT url FROM media WHERE key = ?", [keyOf(folder, name)]))?.url ?? null;
}

export async function deleteFiles(folder: Folder, names: (string | null | undefined)[]) {
  const list = names.filter((n): n is string => !!n);
  if (!list.length) return;
  if (!USE_BLOB) {
    for (const n of list) fs.rmSync(path.join(dirOf(folder), path.basename(n)), { force: true });
    return;
  }
  const keys = list.map((n) => keyOf(folder, n));
  const rows = await all<{ key: string; url: string }>(`SELECT key, url FROM media WHERE key IN (${keys.map(() => "?").join(",")})`, keys);
  if (rows.length) await del(rows.map((r) => r.url)).catch(() => {});
  await run(`DELETE FROM media WHERE key IN (${keys.map(() => "?").join(",")})`, keys);
}
