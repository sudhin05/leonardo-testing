import { all, run } from "@/lib/db";
import { bad, currentRunId, handle, me, ok, requireRun } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await me();
  const runId = await currentRunId();
  if (!runId) return ok([]);
  const rows = await all(
    `SELECT p.*, pr.sku, pr.name AS product_name, pr.ref_image AS product_ref_image, u.name AS created_by_name,
      (SELECT COUNT(*) FROM generations g WHERE g.prompt_id = p.id AND g.status = 'complete') AS done,
      (SELECT COUNT(*) FROM generations g WHERE g.prompt_id = p.id AND g.status IN ('queued','submitting','pending','completing')) AS running,
      (SELECT COUNT(DISTINCT g.model_key) FROM generations g WHERE g.prompt_id = p.id AND g.status = 'complete') AS models_done,
      (SELECT COUNT(*) FROM votes v JOIN outputs o ON o.id = v.output_id JOIN generations g ON g.id = o.generation_id WHERE g.prompt_id = p.id) AS votes
     FROM prompts p LEFT JOIN products pr ON pr.id = p.product_id LEFT JOIN users u ON u.id = p.created_by
     WHERE p.test_run_id = ?
     ORDER BY p.test_id`,
    [runId],
  );
  return ok(rows);
});

export const POST = handle(async (req: Request) => {
  const user = await me();
  const runId = await requireRun();
  const b = await req.json();
  if (!b.test_id || !b.prompt) return bad("test_id and prompt are required");
  const r = await run(
    "INSERT INTO prompts (test_run_id, test_id, ad_category, product_id, prompt, aspect_ratio, criteria, input_mode, kind, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      runId,
      String(b.test_id),
      String(b.ad_category ?? ""),
      b.product_id ? Number(b.product_id) : null,
      String(b.prompt),
      String(b.aspect_ratio ?? "1:1"),
      String(b.criteria ?? ""),
      b.input_mode === "reference" ? "reference" : "text",
      b.kind === "video" ? "video" : "image",
      user.uid,
    ],
  );
  return ok({ id: r.id });
});
