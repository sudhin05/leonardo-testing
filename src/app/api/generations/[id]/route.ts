import { after } from "next/server";
import { get, run } from "@/lib/db";
import { bad, handle, me, ok } from "@/lib/server";
import { leonardoIdFor, withRefId } from "@/lib/refs";
import { tick } from "@/lib/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** Retry a failed generation with the same settings, re-resolving its reference image upload. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  await me();
  const id = Number((await params).id);
  const g = await get<{ request: string; ref_image: string | null }>("SELECT request, ref_image FROM generations WHERE id = ? AND status = 'failed'", [id]);
  if (!g) return ok({ ok: true });
  let request = g.request;
  if (g.ref_image) {
    try {
      request = withRefId(request, await leonardoIdFor(g.ref_image));
    } catch (e) {
      return bad(`Reference image upload failed — ${(e as Error).message}`);
    }
  }
  await run(
    `UPDATE generations SET status = 'queued', request = ?, error = NULL, leonardo_id = NULL, submitted_at = NULL, completed_at = NULL,
       last_polled_at = NULL, credit_cost = NULL, cost_source = NULL, create_response = NULL WHERE id = ?`,
    [request, id],
  );
  after(() => tick());
  return ok({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await me();
  const id = Number((await params).id);
  await run("DELETE FROM votes WHERE output_id IN (SELECT id FROM outputs WHERE generation_id = ?)", [id]);
  await run("DELETE FROM outputs WHERE generation_id = ?", [id]);
  await run("DELETE FROM generations WHERE id = ?", [id]);
  return ok({ ok: true });
});
