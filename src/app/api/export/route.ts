import Papa from "papaparse";
import { all, get } from "@/lib/db";
import { handle, me, requireRun } from "@/lib/server";

export const dynamic = "force-dynamic";

/** CSV of the current test run: one row per output per voter (outputs nobody voted on appear once with empty vote columns). */
export const GET = handle(async () => {
  await me();
  const runId = await requireRun();
  const runName = (await get<{ name: string }>("SELECT name FROM test_runs WHERE id = ?", [runId]))?.name ?? "";
  const rows = await all(
    `SELECT ? AS test_run, p.test_id, p.ad_category, pr.sku, g.model_key AS model, g.id AS generation_id, o.id AS output_id, o.idx AS image_index,
            g.status, g.mock, g.width, g.height, g.credit_cost AS cost_usd, g.cost_source, g.ref_image AS reference_image,
            CASE WHEN g.completed_at IS NOT NULL THEN g.completed_at - g.submitted_at END AS latency_ms,
            u.name AS voter, v.text_accuracy, v.realism, v.color AS brand_color, v.keep, v.notes, v.updated_at AS voted_at,
            o.local_path, o.remote_url, r.prompt_text, g.created_at
     FROM generations g
     JOIN runs r ON r.id = g.run_id
     JOIN prompts p ON p.id = g.prompt_id
     LEFT JOIN products pr ON pr.id = p.product_id
     LEFT JOIN outputs o ON o.generation_id = g.id
     LEFT JOIN votes v ON v.output_id = o.id
     LEFT JOIN users u ON u.id = v.user_id
     WHERE p.test_run_id = ?
     ORDER BY p.test_id, g.model_key, g.id, u.name`,
    [runName, runId],
  );
  const csv = Papa.unparse(rows as object[]);
  const slug = runName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="model-lab-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
