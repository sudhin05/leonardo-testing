import { run } from "@/lib/db";
import { handle, me, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await me();
  const id = Number((await params).id);
  const b = await req.json();
  for (const f of ["sku", "name", "category", "notes"] as const) {
    if (b[f] !== undefined) await run(`UPDATE products SET ${f} = ? WHERE id = ?`, [String(b[f]), id]);
  }
  if (b.clearImage) await run("UPDATE products SET ref_image = NULL, ref_leonardo_id = NULL WHERE id = ?", [id]);
  return ok({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await me();
  const id = Number((await params).id);
  await run("UPDATE prompts SET product_id = NULL WHERE product_id = ?", [id]);
  await run("DELETE FROM products WHERE id = ?", [id]);
  return ok({ ok: true });
});
