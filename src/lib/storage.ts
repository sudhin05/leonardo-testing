import fs from "node:fs";
import path from "node:path";
import { del, get as blobGet, put } from "@vercel/blob";
import { all, get, run, MEDIA_DIR, UPLOAD_DIR } from "./db";

/**
 * File storage for generated media and reference uploads.
 *  - Local:    data/media/<name>, data/uploads/<name>
 *  - Deployed: Vercel Blob (BLOB_READ_WRITE_TOKEN), keys "media/<name>" / "uploads/<name>",
 *              URL recorded in the `media` table.
 * Blob stores are private by default (BLOB_ACCESS=private): files are only readable with the store token, so
 * /api/media/... streams them to signed-in users. With BLOB_ACCESS=public it redirects to the public URL instead.
 */

export type Folder = "media" | "uploads";
/**
 * Blob is on when the project has a store: either a read-write token, or (newer Vercel store connections)
 * BLOB_STORE_ID with Vercel's automatic OIDC token — @vercel/blob picks up either by itself.
 */
export const USE_BLOB = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
export const STORAGE_MODE = USE_BLOB ? (process.env.BLOB_READ_WRITE_TOKEN ? "blob (token)" : "blob (oidc)") : "local disk";
export const BLOB_ACCESS: "public" | "private" = process.env.BLOB_ACCESS === "public" ? "public" : "private";

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
  const blob = await put(key, data, { access: BLOB_ACCESS, addRandomSuffix: false, allowOverwrite: true, contentType });
  await run(
    "INSERT INTO media (key, url, content_type, size) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET url = excluded.url, content_type = excluded.content_type, size = excluded.size",
    [key, blob.url, contentType, data.length],
  );
}

/** A stored file as a web stream + type (for serving), or null. */
export async function openFile(folder: Folder, name: string): Promise<{ body: ReadableStream | Buffer; contentType: string } | null> {
  if (!USE_BLOB) {
    const p = path.join(dirOf(folder), path.basename(name));
    return fs.existsSync(p) ? { body: fs.readFileSync(p), contentType: contentTypeOf(name) } : null;
  }
  const url = await blobUrl(folder, name);
  if (!url) return null;
  if (BLOB_ACCESS === "public") {
    const res = await fetch(url);
    return res.ok && res.body ? { body: res.body, contentType: res.headers.get("content-type") ?? contentTypeOf(name) } : null;
  }
  const r = await blobGet(url, { access: "private" });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return { body: r.stream, contentType: r.blob.contentType ?? contentTypeOf(name) };
}

export async function readFile(folder: Folder, name: string): Promise<Buffer | null> {
  const f = await openFile(folder, name);
  if (!f) return null;
  if (Buffer.isBuffer(f.body)) return f.body;
  return Buffer.from(await new Response(f.body).arrayBuffer());
}

/** Blob URL of a stored file (Blob mode), or null. Only directly openable when BLOB_ACCESS=public. */
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
