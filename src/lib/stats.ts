import { all } from "./db";
import { labelOf } from "./registry";

/**
 * Shared by the Leaderboard/Matrix pages and the PDF report so they always agree.
 * Every team member's vote counts once: averages are over votes, keep rate = keep votes ÷ (keep + reject votes).
 */

const OVERALL = `(COALESCE(v.text_accuracy,0) + COALESCE(v.realism,0) + COALESCE(v.color,0)) * 1.0 /
  NULLIF((v.text_accuracy IS NOT NULL) + (v.realism IS NOT NULL) + (v.color IS NOT NULL), 0)`;

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
  votes?: number;
  voters?: number;
  text_accuracy?: number | null;
  realism?: number | null;
  color?: number | null;
  keep_rate?: number | null;
  kept?: number;
  rejected?: number;
  overall?: number | null;
};

export type VoterRow = { model_key: string; user_id: number; name: string; overall: number | null; keep_rate: number | null; n: number };

export async function leaderboard(runId: number, category = "", includeMock = false) {
  const where = `p.test_run_id = ? AND (? = '' OR p.ad_category = ?) AND (${includeMock ? "1" : "g.mock = 0"})`;
  const args = [runId, category, category];

  const ops = await all<Record<string, number | string>>(
    `SELECT g.model_key,
       COUNT(*) AS gens,
       SUM(g.status = 'complete') AS ok,
       SUM(g.status = 'failed') AS failed,
       AVG(CASE WHEN g.status = 'complete' THEN g.completed_at - g.submitted_at END) AS latency_ms,
       AVG(CASE WHEN g.status = 'complete' THEN g.credit_cost END) AS avg_cost,
       AVG(CASE WHEN g.status = 'complete' THEN g.credit_cost * 1.0 / MAX(r.quantity, 1) END) AS cost_per_image,
       SUM(CASE WHEN g.status IN ('complete','pending','submitting','completing') THEN COALESCE(g.credit_cost, 0) ELSE 0 END) AS total_cost,
       SUM(g.status = 'complete' AND g.credit_cost IS NULL) AS cost_unknown
     FROM generations g JOIN prompts p ON p.id = g.prompt_id JOIN runs r ON r.id = g.run_id
     WHERE g.status != 'skipped' AND ${where}
     GROUP BY g.model_key`,
    args,
  );

  const quality = await all<Record<string, number | string>>(
    `SELECT g.model_key,
       COUNT(DISTINCT o.id) AS outputs,
       COUNT(DISTINCT v.output_id) AS scored,
       COUNT(v.user_id) AS votes,
       COUNT(DISTINCT v.user_id) AS voters,
       AVG(v.text_accuracy) AS text_accuracy, AVG(v.realism) AS realism, AVG(v.color) AS color,
       AVG(v.keep) AS keep_rate, SUM(v.keep = 1) AS kept, SUM(v.keep = 0) AS rejected,
       AVG(${OVERALL}) AS overall
     FROM outputs o JOIN generations g ON g.id = o.generation_id JOIN prompts p ON p.id = g.prompt_id
     LEFT JOIN votes v ON v.output_id = o.id
     WHERE ${where}
     GROUP BY g.model_key`,
    args,
  );

  const heat = await all<Record<string, number | string>>(
    `SELECT g.model_key, p.ad_category, AVG(${OVERALL}) AS overall, AVG(v.keep) AS keep_rate, COUNT(*) AS n
     FROM votes v JOIN outputs o ON o.id = v.output_id JOIN generations g ON g.id = o.generation_id JOIN prompts p ON p.id = g.prompt_id
     WHERE p.test_run_id = ? AND (${includeMock ? "1" : "g.mock = 0"})
     GROUP BY g.model_key, p.ad_category`,
    [runId],
  );

  const voters = await all<VoterRow>(
    `SELECT g.model_key, u.id AS user_id, u.name, AVG(${OVERALL}) AS overall, AVG(v.keep) AS keep_rate, COUNT(*) AS n
     FROM votes v JOIN users u ON u.id = v.user_id JOIN outputs o ON o.id = v.output_id
     JOIN generations g ON g.id = o.generation_id JOIN prompts p ON p.id = g.prompt_id
     WHERE ${where}
     GROUP BY g.model_key, u.id ORDER BY u.name`,
    args,
  );

  const categories = (
    await all<{ ad_category: string }>("SELECT DISTINCT ad_category FROM prompts WHERE test_run_id = ? AND ad_category != '' ORDER BY ad_category", [runId])
  ).map((r) => r.ad_category);

  const qMap = new Map(quality.map((q) => [q.model_key, q]));
  const rows = ops.map((o) => ({ ...o, ...(qMap.get(o.model_key) ?? {}), ...labelOf(String(o.model_key)) }) as unknown as LeaderRow);
  rows.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
  return { rows, heat, voters, categories };
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
  votes_n: number;
  keep_yes: number;
  keep_no: number;
  overall: number | null;
  my_keep: number | null;
};

/** For every prompt × model in a test run: the newest generation, its first output and the team's votes on it. */
export async function matrixCells(runId: number, userId: number): Promise<MatrixCell[]> {
  return all<MatrixCell>(
    `SELECT g.prompt_id, g.model_key, g.status, g.ref_image, g.credit_cost, g.cost_source, g.width, g.height,
            o.id AS output_id, o.generation_id, o.idx, o.local_path, o.remote_url, o.media_type,
            (SELECT COUNT(*) FROM votes v WHERE v.output_id = o.id) AS votes_n,
            (SELECT COUNT(*) FROM votes v WHERE v.output_id = o.id AND v.keep = 1) AS keep_yes,
            (SELECT COUNT(*) FROM votes v WHERE v.output_id = o.id AND v.keep = 0) AS keep_no,
            (SELECT AVG(${OVERALL}) FROM votes v WHERE v.output_id = o.id) AS overall,
            (SELECT v.keep FROM votes v WHERE v.output_id = o.id AND v.user_id = ?) AS my_keep
     FROM generations g
     JOIN prompts p ON p.id = g.prompt_id
     LEFT JOIN outputs o ON o.generation_id = g.id AND o.idx = 0
     WHERE p.test_run_id = ? AND g.id IN (
       SELECT MAX(g2.id) FROM generations g2 JOIN prompts p2 ON p2.id = g2.prompt_id
       WHERE p2.test_run_id = ? AND g2.status IN ('complete','queued','submitting','pending','completing','failed')
       GROUP BY g2.prompt_id, g2.model_key
     )`,
    [userId, runId, runId],
  );
}

/** Every vote on a set of outputs, with voter names (for cards and the viewer). */
export async function votesFor(outputIds: number[]) {
  if (!outputIds.length) return [];
  return all<{
    output_id: number;
    user_id: number;
    name: string;
    text_accuracy: number | null;
    realism: number | null;
    color: number | null;
    keep: number | null;
    notes: string | null;
    updated_at: string;
  }>(
    `SELECT v.output_id, v.user_id, u.name, v.text_accuracy, v.realism, v.color, v.keep, v.notes, v.updated_at
     FROM votes v JOIN users u ON u.id = v.user_id
     WHERE v.output_id IN (${outputIds.map(() => "?").join(",")}) ORDER BY u.name`,
    outputIds,
  );
}
