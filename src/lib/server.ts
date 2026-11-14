import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { db, UPLOAD_DIR } from "./db";
import { ensureWorker } from "./worker";

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
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  if (!["png", "jpg", "jpeg", "webp"].includes(ext)) throw new Error("Use PNG, JPG or WEBP");
  const name = `${prefix}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

export function uploadPath(name: string) {
  return path.join(UPLOAD_DIR, name);
}
