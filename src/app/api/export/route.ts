import Papa from "papaparse";
import { boot } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const d = boot();
  const rows = d
    .prepare(
      `SELECT p.test_id, p.ad_category, pr.sku, g.model_key AS model, g.id AS generation_id, o.id AS output_id, o.idx AS image_index,
              g.status, g.mock, g.width, g.height, g.credit_cost AS cost_usd, g.cost_source, g.ref_image AS reference_image,
              CASE WHEN g.completed_at IS NOT NULL THEN g.completed_at - g.submitted_at END AS latency_ms,
              s.text_accuracy, s.realism, s.color AS brand_color, s.keep, s.notes,
              o.local_path, o.remote_url, r.prompt_text, g.created_at
       FROM generations g
       JOIN runs r ON r.id = g.run_id
       JOIN prompts p ON p.id = g.prompt_id
       LEFT JOIN products pr ON pr.id = p.product_id
       LEFT JOIN outputs o ON o.generation_id = g.id
       LEFT JOIN scores s ON s.output_id = o.id
       ORDER BY p.test_id, g.model_key, g.id`,
    )
    .all();
  const csv = Papa.unparse(rows as object[]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="model-lab-results-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
