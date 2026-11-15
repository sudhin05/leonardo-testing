import { bad, boot, ok } from "@/lib/server";
import { leonardoIdFor, withRefId } from "@/lib/refs";

export const dynamic = "force-dynamic";

/** Retry a failed generation with the same settings, re-resolving its reference image upload. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = boot();
  const id = Number((await params).id);
  const g = d.prepare("SELECT request, ref_image FROM generations WHERE id = ? AND status = 'failed'").get(id) as
    | { request: string; ref_image: string | null }
    | undefined;
  if (!g) return ok({ ok: true });
  let request = g.request;
  if (g.ref_image) {
    try {
      request = withRefId(request, await leonardoIdFor(g.ref_image));
    } catch (e) {
      return bad(`Reference image upload failed — ${(e as Error).message}`);
    }
  }
  d.prepare(
    `UPDATE generations SET status = 'queued', request = ?, error = NULL, leonardo_id = NULL, submitted_at = NULL, completed_at = NULL,
       last_polled_at = NULL, credit_cost = NULL, cost_source = NULL, create_response = NULL WHERE id = ?`,
  ).run(request, id);
  return ok({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = boot();
  d.prepare("DELETE FROM generations WHERE id = ?").run(Number((await params).id));
  return ok({ ok: true });
}
