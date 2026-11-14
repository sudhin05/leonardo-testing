import { bad, boot, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const d = boot();
  const rows = d
    .prepare(
      `SELECT p.*, pr.sku, pr.name AS product_name, pr.ref_image AS product_ref_image,
        (SELECT COUNT(*) FROM generations g WHERE g.prompt_id = p.id AND g.status = 'complete') AS done,
        (SELECT COUNT(*) FROM generations g WHERE g.prompt_id = p.id AND g.status IN ('queued','submitting','pending')) AS running,
        (SELECT COUNT(DISTINCT g.model_key) FROM generations g WHERE g.prompt_id = p.id AND g.status = 'complete') AS models_done
       FROM prompts p LEFT JOIN products pr ON pr.id = p.product_id
       ORDER BY p.test_id`,
    )
    .all();
  return ok(rows);
}

export async function POST(req: Request) {
  const d = boot();
  const b = await req.json();
  if (!b.test_id || !b.prompt) return bad("test_id and prompt are required");
  const r = d
    .prepare(
      "INSERT INTO prompts (test_id, ad_category, product_id, prompt, aspect_ratio, criteria, input_mode, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      String(b.test_id),
      String(b.ad_category ?? ""),
      b.product_id ? Number(b.product_id) : null,
      String(b.prompt),
      String(b.aspect_ratio ?? "1:1"),
      String(b.criteria ?? ""),
      b.input_mode === "reference" ? "reference" : "text",
      b.kind === "video" ? "video" : "image",
    );
  return ok({ id: Number(r.lastInsertRowid) });
}
