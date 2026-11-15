import { db } from "./db";
import { isMock, uploadImage } from "./leonardo";
import { uploadPath } from "./server";

/**
 * Leonardo image id for a stored reference file, uploading it once and caching the id on the
 * product/prompt that owns the file. Mock ids are never cached and cached mock ids are never sent live.
 */
export async function leonardoIdFor(file: string): Promise<string> {
  const d = db();
  if (isMock()) return `mock-upload-${file}`;
  const cached =
    (d.prepare("SELECT ref_leonardo_id AS id FROM products WHERE ref_image = ? AND ref_leonardo_id IS NOT NULL").get(file) as { id: string } | undefined)?.id ??
    (d.prepare("SELECT input_leonardo_id AS id FROM prompts WHERE input_image = ? AND input_leonardo_id IS NOT NULL").get(file) as { id: string } | undefined)?.id;
  if (cached && !cached.startsWith("mock-")) return cached;
  const id = await uploadImage(uploadPath(file));
  d.prepare("UPDATE products SET ref_leonardo_id = ? WHERE ref_image = ?").run(id, file);
  d.prepare("UPDATE prompts SET input_leonardo_id = ? WHERE input_image = ?").run(id, file);
  return id;
}

/** Point every image guidance in a stored request at `id` (used when retrying with a fresh upload). */
export function withRefId(requestJson: string, id: string): string {
  const req = JSON.parse(requestJson);
  const g = req.parameters?.guidances as Record<string, { image?: { id?: string } }[]> | undefined;
  if (g) for (const list of Object.values(g)) for (const item of list ?? []) if (item.image) item.image.id = id;
  return JSON.stringify(req);
}
