import { boot, ok } from "@/lib/server";
import { getModelDef } from "@/lib/registry";

export const dynamic = "force-dynamic";

const OVERALL = `(COALESCE(s.text_accuracy,0) + COALESCE(s.realism,0) + COALESCE(s.color,0)) * 1.0 /
  NULLIF((s.text_accuracy IS NOT NULL) + (s.realism IS NOT NULL) + (s.color IS NOT NULL), 0)`;

export async function GET(req: Request) {
  const d = boot();
  const category = new URL(req.url).searchParams.get("category") ?? "";
  const includeMock = new URL(req.url).searchParams.get("mock") === "1";
  const where = `(? = '' OR p.ad_category = ?) AND (${includeMock ? "1" : "g.mock = 0"})`;

  const ops = d
    .prepare(
      `SELECT g.model_key,
         COUNT(*) AS gens,
         SUM(g.status = 'complete') AS ok,
         SUM(g.status = 'failed') AS failed,
         AVG(CASE WHEN g.status = 'complete' THEN g.completed_at - g.submitted_at END) AS latency_ms,
         AVG(CASE WHEN g.status = 'complete' THEN g.credit_cost END) AS avg_cost,
         SUM(CASE WHEN g.status = 'complete' THEN g.credit_cost ELSE 0 END) AS total_cost
       FROM generations g JOIN prompts p ON p.id = g.prompt_id
       WHERE g.status != 'skipped' AND ${where}
       GROUP BY g.model_key`,
    )
    .all(category, category) as Record<string, number | string>[];

  const quality = d
    .prepare(
      `SELECT g.model_key,
         COUNT(o.id) AS outputs,
         SUM(s.output_id IS NOT NULL AND (s.text_accuracy IS NOT NULL OR s.realism IS NOT NULL OR s.color IS NOT NULL OR s.keep IS NOT NULL)) AS scored,
         AVG(s.text_accuracy) AS text_accuracy, AVG(s.realism) AS realism, AVG(s.color) AS color,
         AVG(s.keep) AS keep_rate, SUM(s.keep = 1) AS kept,
         AVG(${OVERALL}) AS overall
       FROM outputs o JOIN generations g ON g.id = o.generation_id JOIN prompts p ON p.id = g.prompt_id
       LEFT JOIN scores s ON s.output_id = o.id
       WHERE ${where}
       GROUP BY g.model_key`,
    )
    .all(category, category) as Record<string, number | string>[];

  const heat = d
    .prepare(
      `SELECT g.model_key, p.ad_category, AVG(${OVERALL}) AS overall, AVG(s.keep) AS keep_rate, COUNT(s.output_id) AS n
       FROM outputs o JOIN generations g ON g.id = o.generation_id JOIN prompts p ON p.id = g.prompt_id
       JOIN scores s ON s.output_id = o.id
       WHERE ${includeMock ? "1" : "g.mock = 0"}
       GROUP BY g.model_key, p.ad_category`,
    )
    .all() as Record<string, number | string>[];

  const categories = (d.prepare("SELECT DISTINCT ad_category FROM prompts WHERE ad_category != '' ORDER BY ad_category").all() as {
    ad_category: string;
  }[]).map((r) => r.ad_category);

  const qMap = new Map(quality.map((q) => [q.model_key, q]));
  const rows = ops.map((o) => {
    const def = getModelDef(String(o.model_key));
    return { ...o, ...(qMap.get(o.model_key) ?? {}), label: def?.label ?? o.model_key, vendor: def?.vendor ?? "" };
  });
  return ok({ rows, heat, categories });
}
