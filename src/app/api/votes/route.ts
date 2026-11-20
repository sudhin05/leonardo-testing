import { get, run } from "@/lib/db";
import { bad, handle, me, ok } from "@/lib/server";
import { votesFor } from "@/lib/stats";

export const dynamic = "force-dynamic";

const clamp = (v: unknown) => (v === null || v === undefined || v === "" ? null : Math.max(1, Math.min(5, Math.round(Number(v)))));

/** GET ?outputId= → everyone's votes on one output. */
export const GET = handle(async (req: Request) => {
  await me();
  const outputId = Number(new URL(req.url).searchParams.get("outputId"));
  if (!outputId) return bad("outputId required");
  return ok(await votesFor([outputId]));
});

/** PUT {outputId, text_accuracy?, realism?, color?, keep?, notes?} → the signed-in person's vote (partial updates merge). */
export const PUT = handle(async (req: Request) => {
  const user = await me();
  const b = await req.json();
  const outputId = Number(b.outputId);
  if (!outputId) return bad("outputId required");
  const cur = ((await get("SELECT * FROM votes WHERE output_id = ? AND user_id = ?", [outputId, user.uid])) ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (k in b ? b[k] : cur[k]);
  const keep = pick("keep");
  await run(
    `INSERT INTO votes (output_id, user_id, text_accuracy, realism, color, keep, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(output_id, user_id) DO UPDATE SET text_accuracy = excluded.text_accuracy, realism = excluded.realism, color = excluded.color,
       keep = excluded.keep, notes = excluded.notes, updated_at = excluded.updated_at`,
    [
      outputId,
      user.uid,
      clamp(pick("text_accuracy")),
      clamp(pick("realism")),
      clamp(pick("color")),
      keep === null || keep === undefined ? null : keep ? 1 : 0,
      String(pick("notes") ?? ""),
    ],
  );
  // a vote cleared back to nothing is removed, so it doesn't count as "voted"
  await run(
    "DELETE FROM votes WHERE output_id = ? AND user_id = ? AND text_accuracy IS NULL AND realism IS NULL AND color IS NULL AND keep IS NULL AND COALESCE(notes,'') = ''",
    [outputId, user.uid],
  );
  return ok(await votesFor([outputId]));
});
