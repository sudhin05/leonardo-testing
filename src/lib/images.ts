import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { UPLOAD_DIR } from "./db";

/** Formats Leonardo's init-image upload accepts as-is. Everything else (avif, heic, gif, bmp, tiff…) is converted to PNG. */
const PASSTHROUGH = new Set(["png", "jpg", "jpeg", "webp"]);

/** Save an uploaded/imported reference image into data/uploads, converting to PNG when needed. Returns the stored filename. */
export async function saveImageBuffer(buf: Buffer, originalName: string, prefix: string): Promise<string> {
  const ext = path.extname(originalName).slice(1).toLowerCase();
  const stem = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 40);
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  if (PASSTHROUGH.has(ext)) {
    const name = `${prefix}_${stem}_${stamp}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    return name;
  }
  let png: Buffer;
  try {
    png = await sharp(buf).rotate().png().toBuffer();
  } catch {
    throw new Error(`Couldn't read "${originalName}" as an image — use PNG, JPG or WEBP`);
  }
  const name = `${prefix}_${stem}_${stamp}.png`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), png);
  return name;
}
