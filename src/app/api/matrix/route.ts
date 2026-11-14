import { boot, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Overview grid: for every prompt × model, the newest completed output (first image) + its score. */
export async function GET() {
  const d = boot();
  const cells = d
    .prepare(
      `SELECT g.prompt_id, g.model_key, g.status, o.id AS output_id, o.local_path, o.remote_url, o.media_type,
              s.keep, s.text_accuracy, s.realism, s.color
       FROM generations g
       LEFT JOIN outputs o ON o.generation_id = g.id AND o.idx = 0
       LEFT JOIN scores s ON s.output_id = o.id
       WHERE g.id IN (
         SELECT MAX(id) FROM generations WHERE status IN ('complete','queued','submitting','pending','failed')
         GROUP BY prompt_id, model_key
       )`,
    )
    .all();
  return ok(cells);
}
