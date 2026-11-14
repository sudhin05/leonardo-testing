import { boot, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Retry a failed generation (same request). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = boot();
  const id = Number((await params).id);
  d.prepare(
    "UPDATE generations SET status = 'queued', error = NULL, leonardo_id = NULL, submitted_at = NULL, completed_at = NULL, last_polled_at = NULL WHERE id = ? AND status = 'failed'",
  ).run(id);
  return ok({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = boot();
  d.prepare("DELETE FROM generations WHERE id = ?").run(Number((await params).id));
  return ok({ ok: true });
}
