import { all, run } from "./db";
import { isMock, uploadImage } from "./leonardo";
import { readFile } from "./storage";

/**
 * Leonardo image id for a stored reference file, uploading it once and caching the id on the
 * product/prompt that owns the file. Mock ids are never cached and cached mock ids are never sent live.
 */
export async function leonardoIdFor(file: string): Promise<string> {
  if (isMock()) return `mock-upload-${file}`;
  const cached = (
    await all<{ id: string }>(
      `SELECT ref_leonardo_id AS id FROM products WHERE ref_image = ? AND ref_leonardo_id IS NOT NULL
       UNION ALL SELECT input_leonardo_id AS id FROM prompts WHERE input_image = ? AND input_leonardo_id IS NOT NULL`,
      [file, file],
    )
  ).find((r) => r.id && !r.id.startsWith("mock-"))?.id;
  if (cached) return cached;
  const data = await readFile("uploads", file);
  if (!data) throw new Error(`Reference image ${file} is missing from storage`);
  const id = await uploadImage(data, file);
  await run("UPDATE products SET ref_leonardo_id = ? WHERE ref_image = ?", [id, file]);
  await run("UPDATE prompts SET input_leonardo_id = ? WHERE input_image = ?", [id, file]);
  return id;
}

/** Point every image guidance in a stored request at `id` (used when retrying with a fresh upload). */
export function withRefId(requestJson: string, id: string): string {
  const req = JSON.parse(requestJson);
  const g = req.parameters?.guidances as Record<string, { image?: { id?: string } }[]> | undefined;
  if (g) for (const list of Object.values(g)) for (const item of list ?? []) if (item.image) item.image.id = id;
  return JSON.stringify(req);
}
