import { boot, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = boot();
  const { id } = await params;
  const b = await req.json();
  for (const f of ["sku", "name", "category", "notes"] as const) {
    if (b[f] !== undefined) d.prepare(`UPDATE products SET ${f} = ? WHERE id = ?`).run(String(b[f]), Number(id));
  }
  if (b.clearImage) d.prepare("UPDATE products SET ref_image = NULL, ref_leonardo_id = NULL WHERE id = ?").run(Number(id));
  return ok({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = boot();
  const { id } = await params;
  d.prepare("DELETE FROM products WHERE id = ?").run(Number(id));
  return ok({ ok: true });
}
