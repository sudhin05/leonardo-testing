import path from "node:path";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/node";
import { all, get, run } from "./db";
import { ASPECT_RATIOS } from "./models";

/**
 * Prompt-sheet importer. Canonical format: docs/PROMPT_SHEET_FORMAT.md
 *
 *   test_id | category | prompt | ref_image | aspect_ratio | product | product_name | criteria | output
 *
 * Only `prompt` is required. Headers are case/spacing-insensitive and a few aliases are accepted
 * (e.g. Tag → category, address → ref_image) so older sheets still load.
 *
 * Reference images are uploaded first, one request each (hosted limits cap a request at ~4.5 MB);
 * this importer receives their original names and the names they were stored under.
 */

export type SheetRow = Record<string, string>;
/** An already-stored reference image: the file name the sheet uses, and the stored upload name. */
export type StoredImage = { name: string; stored: string };
export type ImportResult = { inserted: number; productsCreated: number; imagesUsed: number; warnings: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const stemOf = (f: string) => norm(path.basename(f, path.extname(f)));

/** Header → canonical field. Ordered rules; first match wins. */
export function promptField(header: string): string | null {
  const h = norm(header);
  if (["testid", "id", "test", "promptid"].includes(h)) return "test_id";
  if (["refimage", "referenceimage", "reference", "ref", "image", "imagefile", "address", "inputimage", "refimg"].includes(h)) return "ref_image";
  if (h.includes("productname")) return "product_name";
  if (h.includes("sku") || h === "product" || h === "productcode" || h === "productid") return "product";
  if (h.includes("evaluat") || h.includes("criteria") || h.includes("passfail")) return "criteria";
  if (h.includes("aspect") || h === "ratio" || h === "size" || h === "format") return "aspect_ratio";
  if (h === "output" || h === "kind" || h === "type" || h === "media" || h === "outputtype") return "output";
  if (h.includes("prompt")) return "prompt";
  if (h.includes("category") || h === "tag" || h === "tags" || h === "usecase" || h === "placement") return "category";
  return null;
}

function productField(header: string): string | null {
  const h = norm(header);
  if (h.includes("sku") || h === "id" || h === "code" || h === "product") return "sku";
  if (h.includes("name") || h === "title") return "name";
  if (h.includes("category") || h.includes("archetype")) return "category";
  if (h.includes("note") || h.includes("why") || h.includes("description")) return "notes";
  if (["refimage", "image", "referenceimage", "address"].includes(h)) return "ref_image";
  return null;
}

/** Parse .xlsx / .xls / .csv / .tsv (or pasted CSV text) into objects keyed by the raw header. */
export async function parseSheet(data: Buffer | string, fileName = "sheet.csv"): Promise<SheetRow[]> {
  const ext = path.extname(fileName).toLowerCase();
  let matrix: string[][];
  if (typeof data !== "string" && (ext === ".xlsx" || ext === ".xlsm")) {
    const rows = await readXlsxFile(data);
    matrix = rows.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c))));
  } else {
    const text = typeof data === "string" ? data : data.toString("utf8").replace(/^\uFEFF/, "");
    matrix = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true }).data;
  }
  matrix = matrix.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((h) => String(h ?? "").trim());
  return matrix.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? "").trim()])));
}

function mapRow(raw: SheetRow, kind: "prompts" | "products") {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const f = kind === "prompts" ? promptField(k) : productField(k);
    if (f && v && !out[f]) out[f] = v;
  }
  return out;
}

export function inferAspect(explicit: string, ...texts: string[]): { ar: string; inferred: boolean } {
  const pick = (t: string) => {
    const m = t?.match(/\b(\d{1,2})\s*[:x×]\s*(\d{1,2})\b/);
    if (m) {
      const ar = `${m[1]}:${m[2]}`;
      if ((ASPECT_RATIOS as string[]).includes(ar)) return ar;
    }
    return null;
  };
  const e = pick(explicit);
  if (e) return { ar: e, inferred: false };
  for (const t of texts) {
    const hit = pick(t);
    if (hit) return { ar: hit, inferred: true };
  }
  const all = texts.join(" ").toLowerCase();
  if (/\b(story|stories|reel|reels|tiktok|status)\b/.test(all)) return { ar: "9:16", inferred: true };
  if (/\b(insta|instagram)\b.*\b(post|poster|feed)\b|\b(post|poster|feed)\b.*\b(insta|instagram)\b/.test(all)) return { ar: "4:5", inferred: true };
  return { ar: "1:1", inferred: true };
}

/** Find an uploaded image for a ref_image cell: exact file name first, then name without extension. */
function matchImage(ref: string, images: StoredImage[]) {
  const want = path.basename(ref.replace(/\\/g, "/")).toLowerCase();
  return images.find((i) => path.basename(i.name).toLowerCase() === want) ?? images.find((i) => stemOf(i.name) === stemOf(want));
}

/** Delete a test run's prompts and products (and everything under them). Explicit, since remote SQLite connections don't keep FK cascades on. */
export async function clearRunContent(runId: number) {
  const gens = `SELECT g.id FROM generations g JOIN prompts p ON p.id = g.prompt_id WHERE p.test_run_id = ?`;
  await run(`DELETE FROM votes WHERE output_id IN (SELECT id FROM outputs WHERE generation_id IN (${gens}))`, [runId]);
  await run(`DELETE FROM outputs WHERE generation_id IN (${gens})`, [runId]);
  await run(`DELETE FROM generations WHERE prompt_id IN (SELECT id FROM prompts WHERE test_run_id = ?)`, [runId]);
  await run(`DELETE FROM runs WHERE prompt_id IN (SELECT id FROM prompts WHERE test_run_id = ?)`, [runId]);
  await run("DELETE FROM prompts WHERE test_run_id = ?", [runId]);
  await run("DELETE FROM products WHERE test_run_id = ?", [runId]);
}

export async function importPrompts(
  runId: number,
  userId: number,
  rowsRaw: SheetRow[],
  images: StoredImage[],
  opts: { replace?: boolean; source?: string } = {},
): Promise<ImportResult> {
  const warnings: string[] = [];
  let inserted = 0;
  let productsCreated = 0;
  const used = new Set<string>();

  if (opts.replace) await clearRunContent(runId);

  const existingIds = new Set(
    (await all<{ test_id: string }>("SELECT test_id FROM prompts WHERE test_run_id = ?", [runId])).map((r) => r.test_id.toLowerCase()),
  );
  const nextId = () => {
    let n = 1;
    while (existingIds.has(`t-${String(n).padStart(2, "0")}`)) n++;
    const id = `T-${String(n).padStart(2, "0")}`;
    existingIds.add(id.toLowerCase());
    return id;
  };

  const productImage = new Map<number, string>(); // product id → image set during this import

  const rows = rowsRaw.map((r) => mapRow(r, "prompts"));
  if (rows.length && !rows.some((r) => r.prompt)) {
    throw new Error(`No "prompt" column found. Headers seen: ${Object.keys(rowsRaw[0]).join(", ")}`);
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = `Row ${i + 2}`;
    if (!r.prompt) {
      warnings.push(`${line}: empty prompt — skipped`);
      continue;
    }

    // test id (unique within this test run)
    let testId = r.test_id || nextId();
    if (r.test_id) {
      if (existingIds.has(testId.toLowerCase())) {
        const alt = nextId();
        warnings.push(`${line}: test_id "${testId}" already exists in this test run — imported as ${alt}`);
        testId = alt;
      } else existingIds.add(testId.toLowerCase());
    }

    // reference image
    let storedImg: string | null = null;
    if (r.ref_image) {
      const img = matchImage(r.ref_image, images);
      if (img) {
        storedImg = img.stored;
        used.add(img.stored);
      } else {
        warnings.push(`${line}: image "${r.ref_image}" not among the uploaded images — upload it on the prompt before running`);
      }
    }

    // product (per test run): explicit code, else derived from the image name so rows sharing an image share a product
    let productId: number | null = null;
    const productKey = r.product || (r.ref_image ? path.basename(r.ref_image, path.extname(r.ref_image)) : "");
    if (productKey) {
      const hit = await get<{ id: number }>("SELECT id FROM products WHERE test_run_id = ? AND lower(sku) = lower(?)", [runId, productKey]);
      if (hit) productId = hit.id;
      else {
        productId = (
          await run("INSERT INTO products (test_run_id, sku, name, category, notes) VALUES (?, ?, ?, ?, '')", [
            runId,
            productKey,
            r.product_name || productKey,
            r.category ?? "",
          ])
        ).id;
        productsCreated++;
      }
    }

    // attach the image to the product (shared, uploaded to Leonardo once); keep it on the prompt only if the product already has a different one
    let promptImg: string | null = null;
    if (storedImg && productId) {
      const already = productImage.get(productId);
      if (!already) {
        await run("UPDATE products SET ref_image = ?, ref_leonardo_id = NULL WHERE id = ?", [storedImg, productId]);
        productImage.set(productId, storedImg);
      } else if (already !== storedImg) promptImg = storedImg;
    } else if (storedImg) promptImg = storedImg;

    const { ar, inferred } = inferAspect(r.aspect_ratio ?? "", r.prompt, r.category ?? "");
    if (inferred && !/\d:\d/.test(r.prompt) && ar === "1:1") {
      warnings.push(`${line} (${testId}): no aspect ratio given — using 1:1`);
    }
    const isRef = !!r.ref_image || /\[input:/i.test(r.prompt);

    await run(
      `INSERT INTO prompts (test_run_id, test_id, ad_category, product_id, prompt, aspect_ratio, criteria, input_mode, input_image, kind, source, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        testId,
        r.category ?? "",
        productId,
        r.prompt,
        ar,
        r.criteria ?? "",
        isRef ? "reference" : "text",
        promptImg,
        /video/i.test(r.output ?? "") ? "video" : "image",
        opts.source ?? "",
        userId,
      ],
    );
    inserted++;
  }
  return { inserted, productsCreated, imagesUsed: used.size, warnings };
}

export async function importProducts(runId: number, rowsRaw: SheetRow[], images: StoredImage[], opts: { replace?: boolean } = {}): Promise<ImportResult> {
  const warnings: string[] = [];
  let inserted = 0;
  let imagesUsed = 0;
  if (opts.replace) await run("DELETE FROM products WHERE test_run_id = ?", [runId]);
  for (const [i, raw] of rowsRaw.entries()) {
    const r = mapRow(raw, "products");
    if (!r.sku && !r.name) continue;
    let img: string | null = null;
    if (r.ref_image) {
      const f = matchImage(r.ref_image, images);
      if (f) {
        img = f.stored;
        imagesUsed++;
      } else warnings.push(`Row ${i + 2}: image "${r.ref_image}" not uploaded`);
    }
    await run("INSERT INTO products (test_run_id, sku, name, category, notes, ref_image) VALUES (?, ?, ?, ?, ?, ?)", [
      runId,
      r.sku || r.name,
      r.name || r.sku,
      r.category ?? "",
      r.notes ?? "",
      img,
    ]);
    inserted++;
  }
  return { inserted, productsCreated: inserted, imagesUsed, warnings };
}
