import { bad, handle, me, ok, requireRun } from "@/lib/server";
import { importProducts, importPrompts, parseSheet, type StoredImage } from "@/lib/importer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Import into the current test run.
 *  multipart/form-data: kind, replace, sheet (.xlsx/.csv) or csv (pasted text), images (JSON list of {name, stored}
 *  from /api/import/image — the images themselves are uploaded one per request beforehand).
 */
export const POST = handle(async (req: Request) => {
  const user = await me();
  const runId = await requireRun();
  const form = await req.formData();
  const kind = form.get("kind") === "products" ? "products" : "prompts";
  const replace = form.get("replace") === "true";
  const sheet = form.get("sheet");
  const csv = form.get("csv");
  let rows;
  let source = "pasted";
  if (sheet instanceof File && sheet.size) {
    rows = await parseSheet(Buffer.from(await sheet.arrayBuffer()), sheet.name);
    source = sheet.name;
  } else if (typeof csv === "string" && csv.trim()) {
    rows = await parseSheet(csv);
  } else return bad("Choose a sheet file (.xlsx or .csv) or paste rows");
  let images: StoredImage[] = [];
  try {
    images = JSON.parse(String(form.get("images") ?? "[]"));
  } catch {
    return bad("Bad images list");
  }
  if (!rows.length) return bad("No rows found — the first row must be the column headers");
  const result =
    kind === "products" ? await importProducts(runId, rows, images, { replace }) : await importPrompts(runId, user.uid, rows, images, { replace, source });
  return ok(result);
});
