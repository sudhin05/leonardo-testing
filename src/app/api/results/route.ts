import { all } from "@/lib/db";
import { bad, handle, me, ok } from "@/lib/server";
import { votesFor } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * All generations for a prompt, newest first. Each output carries the signed-in person's own vote in
 * text_accuracy / realism / color / keep / notes, and everyone's votes (with names) in `votes`.
 */
export const GET = handle(async (req: Request) => {
  const user = await me();
  const promptId = Number(new URL(req.url).searchParams.get("promptId"));
  if (!promptId) return bad("promptId required");
  const gens = await all<Record<string, unknown>>(
    `SELECT g.id, g.run_id, g.model_key, g.status, g.error, g.credit_cost, g.cost_source, g.ref_image, g.width, g.height, g.mock,
            g.created_at, g.submitted_at, g.completed_at, g.request, r.created_at AS run_created_at, r.quantity, u.name AS run_by
     FROM generations g JOIN runs r ON r.id = g.run_id LEFT JOIN users u ON u.id = r.created_by
     WHERE g.prompt_id = ? ORDER BY g.id DESC`,
    [promptId],
  );
  const outs = await all<Record<string, unknown>>(
    `SELECT o.id, o.generation_id, o.idx, o.local_path, o.remote_url, o.media_type
     FROM outputs o JOIN generations g ON g.id = o.generation_id
     WHERE g.prompt_id = ? ORDER BY o.idx`,
    [promptId],
  );
  const votes = await votesFor(outs.map((o) => Number(o.id)));
  const byOut = new Map<number, typeof votes>();
  for (const v of votes) byOut.set(v.output_id, [...(byOut.get(v.output_id) ?? []), v]);

  const byGen = new Map<number, Record<string, unknown>[]>();
  for (const o of outs) {
    const vs = byOut.get(Number(o.id)) ?? [];
    const mine = vs.find((v) => v.user_id === user.uid);
    const k = Number(o.generation_id);
    if (!byGen.has(k)) byGen.set(k, []);
    byGen.get(k)!.push({
      ...o,
      text_accuracy: mine?.text_accuracy ?? null,
      realism: mine?.realism ?? null,
      color: mine?.color ?? null,
      keep: mine?.keep ?? null,
      notes: mine?.notes ?? null,
      votes: vs,
    });
  }
  return ok(
    gens.map((g) => ({
      ...g,
      request: undefined,
      params: JSON.parse(String(g.request ?? "{}")).parameters ?? {},
      latency_ms: g.completed_at && g.submitted_at ? Number(g.completed_at) - Number(g.submitted_at) : null,
      outputs: byGen.get(Number(g.id)) ?? [],
    })),
  );
});
