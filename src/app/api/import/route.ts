import Papa from "papaparse";
import { bad, boot, ok } from "@/lib/server";
import { ASPECT_RATIOS } from "@/lib/models";

export const dynamic = "force-dynamic";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Map a messy spreadsheet header to our field name using ordered keyword rules. */
function fieldFor(header: string, kind: "prompts" | "products"): string | null {
  const h = norm(header);
  if (kind === "prompts") {
    if (h === "testid" || h === "id" || h === "test") return "test_id";
    if (h.includes("sku")) return "sku";
    if (h.includes("evaluat") || h.includes("criteria") || h.includes("passfail")) return "criteria";
    if (h.includes("aspect") || h === "ratio" || h === "size" || h === "format") return "aspect_ratio";
    if (h.includes("inputmode") || h === "mode") return "input_mode";
    if (h === "kind" || h === "type" || h === "media") return "kind";
    if (h.includes("prompt")) return "prompt";
    if (h.includes("category")) return "ad_category";
    return null;
  }
  if (h.includes("sku") || h === "id" || h === "code") return "sku";
  if (h.includes("name") || h === "product" || h === "title") return "name";
  if (h.includes("category") || h.includes("archetype")) return "category";
  if (h.includes("note") || h.includes("why") || h.includes("description")) return "notes";
  return null;
}

function inferAspect(...texts: string[]) {
  for (const t of texts) {
    const m = t?.match(/\b(\d{1,2})\s*[:x×]\s*(\d{1,2})\b/);
    if (m) {
      const ar = `${m[1]}:${m[2]}`;
      if ((ASPECT_RATIOS as string[]).includes(ar)) return ar;
    }
  }
  return "1:1";
}

export async function POST(req: Request) {
  const d = boot();
  const { kind, csv, replace } = (await req.json()) as { kind: "prompts" | "products"; csv: string; replace?: boolean };
  if (!csv?.trim()) return bad("Empty file");
  const parsed = Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true });
  if (!parsed.data.length) return bad("No rows found — the first row must be headers");

  const rows = parsed.data.map((raw) => {
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const f = fieldFor(k, kind);
      if (f && v != null && !r[f]) r[f] = String(v).trim();
    }
    return r;
  });

  const warnings: string[] = [];
  let inserted = 0;

  if (kind === "products") {
    if (replace) d.prepare("DELETE FROM products").run();
    const ins = d.prepare("INSERT INTO products (sku, name, category, notes) VALUES (?, ?, ?, ?)");
    for (const r of rows) {
      if (!r.sku && !r.name) continue;
      ins.run(r.sku || r.name, r.name || r.sku, r.category ?? "", r.notes ?? "");
      inserted++;
    }
    return ok({ inserted, warnings });
  }

  if (replace) d.prepare("DELETE FROM prompts").run();
  const products = d.prepare("SELECT id, sku FROM products").all() as { id: number; sku: string }[];
  const bySku = new Map(products.map((p) => [norm(p.sku), p.id]));
  const ins = d.prepare(
    "INSERT INTO prompts (test_id, ad_category, product_id, prompt, aspect_ratio, criteria, input_mode, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  rows.forEach((r, i) => {
    if (!r.prompt) {
      warnings.push(`Row ${i + 2}: no prompt column value — skipped`);
      return;
    }
    let productId: number | null = null;
    if (r.sku) {
      const first = r.sku.match(/SKU[-\s]?\d+/i)?.[0] ?? r.sku.split(/[\/,]/)[0];
      productId = bySku.get(norm(first)) ?? null;
      if (!productId) warnings.push(`Row ${i + 2}: SKU "${r.sku}" not found in products — left unlinked`);
    }
    const isRef =
      /reference|image|img2img|i2i/i.test(r.input_mode ?? "") ||
      /\[input:/i.test(r.prompt) ||
      /inpaint|image-to-image|background swap/i.test(r.ad_category ?? "");
    ins.run(
      r.test_id || `T-${i + 1}`,
      r.ad_category ?? "",
      productId,
      r.prompt.replace(/^"|"$/g, ""),
      inferAspect(r.aspect_ratio ?? "", r.ad_category ?? "", r.prompt),
      r.criteria ?? "",
      isRef ? "reference" : "text",
      /video/i.test(r.kind ?? "") ? "video" : "image",
    );
    inserted++;
  });
  return ok({ inserted, warnings });
}
