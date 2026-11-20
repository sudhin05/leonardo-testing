import path from "node:path";
import sharp from "sharp";
import { putFile } from "./storage";

type SharpImage = ReturnType<typeof sharp>;

/** Formats Leonardo's init-image upload accepts as-is. Everything else (avif, heic, gif, bmp, tiff…) is converted. */
const PASSTHROUGH = new Set(["png", "jpg", "jpeg", "webp"]);
/** Converted images are capped here (an iPhone HEIC is 3024×4032; as PNG that is ~24 MB). */
const MAX_EDGE = 2048;

/**
 * Decode anything sharp can't. sharp's prebuilt libvips reads AVIF but not HEVC-coded HEIC (iPhone photos),
 * so those go through heic-convert (libheif compiled to WebAssembly) first.
 */
async function decode(buf: Buffer, originalName: string): Promise<SharpImage> {
  try {
    const img = sharp(buf);
    await img.clone().raw().toBuffer(); // force a real decode, not just a header read
    return img;
  } catch (e) {
    if (!/\.(heic|heif)$/i.test(originalName)) throw e;
    const convert = (await import("heic-convert")).default;
    const png = Buffer.from(await convert({ buffer: buf, format: "PNG" }));
    return sharp(png);
  }
}

/** Store a reference image (uploads folder), converting when needed. Returns the stored filename. */
export async function saveImageBuffer(buf: Buffer, originalName: string, prefix: string): Promise<string> {
  const ext = path.extname(originalName).slice(1).toLowerCase();
  const stem = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 40);
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  if (PASSTHROUGH.has(ext)) {
    const name = `${prefix}_${stem}_${stamp}.${ext}`;
    await putFile("uploads", name, buf);
    return name;
  }
  let img: SharpImage;
  try {
    img = await decode(buf, originalName);
  } catch {
    throw new Error(`Couldn't read "${originalName}" as an image — use PNG, JPG or WEBP`);
  }
  // an alpha channel alone isn't transparency (HEIC decodes always come back RGBA); keep PNG only if some pixel is see-through
  const hasAlpha = (await img.metadata()).hasAlpha && !(await img.clone().stats()).isOpaque;
  const resized = img.rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
  const out = hasAlpha ? await resized.png().toBuffer() : await resized.jpeg({ quality: 92 }).toBuffer();
  const name = `${prefix}_${stem}_${stamp}.${hasAlpha ? "png" : "jpg"}`;
  await putFile("uploads", name, out);
  return name;
}
