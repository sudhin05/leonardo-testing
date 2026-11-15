import path from "node:path";
import { NextResponse } from "next/server";
import { db, UPLOAD_DIR } from "./db";
import { ensureWorker } from "./worker";
import { saveImageBuffer } from "./images";

/** Every API route calls this — opens the DB and makes sure the background worker is running. */
export function boot() {
  db();
  ensureWorker();
  return db();
}

export function ok(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function saveUpload(file: File, prefix: string): Promise<string> {
  return saveImageBuffer(Buffer.from(await file.arrayBuffer()), file.name || "image.png", prefix);
}

export function uploadPath(name: string) {
  return path.join(UPLOAD_DIR, name);
}
