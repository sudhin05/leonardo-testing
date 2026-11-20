import { run } from "@/lib/db";
import { handle, me, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

const FIELDS = ["test_id", "ad_category", "prompt", "aspect_ratio", "criteria", "input_mode", "kind"] as const;
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await me();
  const id = Number((await params).id);
  const b = await req.json();
  for (const f of FIELDS) {
    if (b[f] !== undefined) await run(`UPDATE prompts SET ${f} = ? WHERE id = ?`, [String(b[f]), id]);
  }
  if (b.product_id !== undefined) await run("UPDATE prompts SET product_id = ? WHERE id = ?", [b.product_id ? Number(b.product_id) : null, id]);
  if (b.clearImage) await run("UPDATE prompts SET input_image = NULL, input_leonardo_id = NULL WHERE id = ?", [id]);
  return ok({ ok: true });
});

/** Deletes the prompt and its generations, outputs and votes (explicitly; remote SQLite doesn't keep FK cascades on). */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await me();
  const id = Number((await params).id);
  await run(
    "DELETE FROM votes WHERE output_id IN (SELECT o.id FROM outputs o JOIN generations g ON g.id = o.generation_id WHERE g.prompt_id = ?)",
    [id],
  );
  await run("DELETE FROM outputs WHERE generation_id IN (SELECT id FROM generations WHERE prompt_id = ?)", [id]);
  await run("DELETE FROM generations WHERE prompt_id = ?", [id]);
  await run("DELETE FROM runs WHERE prompt_id = ?", [id]);
  await run("DELETE FROM prompts WHERE id = ?", [id]);
  return ok({ ok: true });
});
