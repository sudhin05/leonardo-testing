import { db } from "./db";
import { getModelDef } from "./registry";

/** Shared by the Leaderboard/Matrix pages and the PDF report so they always agree. */

const OVERALL = `(COALESCE(s.text_accuracy,0) + COALESCE(s.realism,0) + COALESCE(s.color,0)) * 1.0 /
  NULLIF((s.text_accuracy IS NOT NULL) + (s.realism IS NOT NULL) + (s.color IS NOT NULL), 0)`;

export type LeaderRow = {
  model_key: string;
  label: string;
  vendor: string;
  gens: number;
  ok: number;
  failed: number;
  latency_ms: number | null;
  avg_cost: number | null;
  cost_per_image: number | null;
  total_cost: number | null;
  cost_unknown: number | null;
  outputs?: number;
  scored?: number;
  text_accuracy?: number | null;
  realism?: number | null;
  color?: number | null;
  keep_rate?: number | null;
  kept?: number;
  overall?: number | null;
};

export function leaderboard(category = "", includeMock = false) {
  const d = db();
  const where = `(? = '' OR p.ad_category = ?) AND (${includeMock ? "1" : "g.mock = 0"})`;

  const ops = d
    .prepare(
      `SELECT g.model_key,
         COUNT(*) AS gens,
         SUM(g.status = 'complete') AS ok,
         SUM(g.status = 'failed') AS failed,
         AVG(CASE WHEN g.status = 'complete' THEN g.completed_at - g.submitted_at END) AS latency_ms,
         AVG(CASE WHEN g.status = 'complete' THEN g.credit_cost END) AS avg_cost,
         AVG(CASE WHEN g.status = 'complete' THEN g.credit_cost * 1.0 / MAX(r.quantity, 1) END) AS cost_per_image,
         SUM(CASE WHEN g.status IN ('complete','pending','submitting') THEN COALESCE(g.credit_cost, 0) ELSE 0 END) AS total_cost,
         SUM(g.status = 'complete' AND g.credit_cost IS NULL) AS cost_unknown
       FROM generations g JOIN prompts p ON p.id = g.prompt_id JOIN runs r ON r.id = g.run_id
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
    return { ...o, ...(qMap.get(o.model_key) ?? {}), label: def?.label ?? o.model_key, vendor: def?.vendor ?? "" } as unknown as LeaderRow;
  });
  rows.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
  return { rows, heat, categories };
}

export type MatrixCell = {
  prompt_id: number;
  model_key: string;
  status: string;
  ref_image: string | null;
  credit_cost: number | null;
  cost_source: string | null;
  width: number | null;
  height: number | null;
  output_id: number | null;
  generation_id: number | null;
  idx: number | null;
  local_path: string | null;
  remote_url: string | null;
  media_type: "image" | "video";
  keep: number | null;
  text_accuracy: number | null;
  realism: number | null;
  color: number | null;
  notes: string | null;
};

/** For every prompt × model, the newest generation and its first output + score. */
export function matrixCells(): MatrixCell[] {
  return db()
    .prepare(
      `SELECT g.prompt_id, g.model_key, g.status, g.ref_image, g.credit_cost, g.cost_source, g.width, g.height,
              o.id AS output_id, o.generation_id, o.idx, o.local_path, o.remote_url, o.media_type,
              s.keep, s.text_accuracy, s.realism, s.color, s.notes
       FROM generations g
       LEFT JOIN outputs o ON o.generation_id = g.id AND o.idx = 0
       LEFT JOIN scores s ON s.output_id = o.id
       WHERE g.id IN (
         SELECT MAX(id) FROM generations WHERE status IN ('complete','queued','submitting','pending','failed')
         GROUP BY prompt_id, model_key
       )`,
    )
    .all() as unknown as MatrixCell[];
}
