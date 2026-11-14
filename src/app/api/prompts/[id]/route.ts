import { boot, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

const FIELDS = ["test_id", "ad_category", "prompt", "aspect_ratio", "criteria", "input_mode", "kind"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = boot();
  const id = Number((await params).id);
  const b = await req.json();
  for (const f of FIELDS) {
    if (b[f] !== undefined) d.prepare(`UPDATE prompts SET ${f} = ? WHERE id = ?`).run(String(b[f]), id);
  }
  if (b.product_id !== undefined) d.prepare("UPDATE prompts SET product_id = ? WHERE id = ?").run(b.product_id ? Number(b.product_id) : null, id);
  if (b.clearImage) d.prepare("UPDATE prompts SET input_image = NULL, input_leonardo_id = NULL WHERE id = ?").run(id);
  return ok({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = boot();
  d.prepare("DELETE FROM prompts WHERE id = ?").run(Number((await params).id));
  return ok({ ok: true });
}
