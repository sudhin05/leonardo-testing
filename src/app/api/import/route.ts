import { bad, boot, ok } from "@/lib/server";
import { importProducts, importPrompts, parseSheet, type ImageFile } from "@/lib/importer";

export const dynamic = "force-dynamic";

/**
 * Two ways in:
 *  - multipart/form-data: kind, replace, sheet (.xlsx/.csv file), images (0..n files)
 *  - JSON: { kind, csv, replace } for pasted text
 */
export async function POST(req: Request) {
  boot();
  try {
    let kind: "prompts" | "products" = "prompts";
    let replace = false;
    let rows;
    let source = "";
    const images: ImageFile[] = [];

    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      kind = form.get("kind") === "products" ? "products" : "prompts";
      replace = form.get("replace") === "true";
      const sheet = form.get("sheet");
      const csv = form.get("csv");
      if (sheet instanceof File && sheet.size) {
        rows = await parseSheet(Buffer.from(await sheet.arrayBuffer()), sheet.name);
        source = sheet.name;
      } else if (typeof csv === "string" && csv.trim()) {
        rows = await parseSheet(csv);
        source = "pasted";
      } else return bad("Choose a sheet file (.xlsx or .csv) or paste rows");
      for (const f of form.getAll("images")) {
        if (f instanceof File && f.size) images.push({ name: f.name, data: Buffer.from(await f.arrayBuffer()) });
      }
    } else {
      const b = await req.json();
      kind = b.kind === "products" ? "products" : "prompts";
      replace = !!b.replace;
      rows = await parseSheet(String(b.csv ?? ""));
      source = "pasted";
    }

    if (!rows.length) return bad("No rows found — the first row must be the column headers");
    const result = kind === "products" ? await importProducts(rows, images, { replace }) : await importPrompts(rows, images, { replace, source });
    return ok(result);
  } catch (e) {
    return bad((e as Error).message);
  }
}
