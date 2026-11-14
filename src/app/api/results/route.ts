import { bad, boot, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

/** All generations (with outputs + scores) for a prompt, newest first. */
export async function GET(req: Request) {
  const d = boot();
  const promptId = Number(new URL(req.url).searchParams.get("promptId"));
  if (!promptId) return bad("promptId required");
  const gens = d
    .prepare(
      `SELECT g.id, g.run_id, g.model_key, g.status, g.error, g.credit_cost, g.width, g.height, g.mock,
              g.created_at, g.submitted_at, g.completed_at, g.request, r.created_at AS run_created_at, r.quantity
       FROM generations g JOIN runs r ON r.id = g.run_id
       WHERE g.prompt_id = ? ORDER BY g.id DESC`,
    )
    .all(promptId) as Record<string, unknown>[];
  const outs = d
    .prepare(
      `SELECT o.id, o.generation_id, o.idx, o.local_path, o.remote_url, o.media_type,
              s.text_accuracy, s.realism, s.color, s.keep, s.notes
       FROM outputs o JOIN generations g ON g.id = o.generation_id
       LEFT JOIN scores s ON s.output_id = o.id
       WHERE g.prompt_id = ? ORDER BY o.idx`,
    )
    .all(promptId) as Record<string, unknown>[];
  const byGen = new Map<number, Record<string, unknown>[]>();
  for (const o of outs) {
    const k = Number(o.generation_id);
    if (!byGen.has(k)) byGen.set(k, []);
    byGen.get(k)!.push(o);
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
}
