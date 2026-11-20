import { all, get, run } from "@/lib/db";
import { clearRunContent } from "@/lib/importer";
import { bad, handle, me, ok } from "@/lib/server";
import { deleteFiles } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** PATCH {name?, notes?} → rename or annotate a test run. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await me();
  const id = Number((await params).id);
  const b = (await req.json().catch(() => ({}))) as { name?: string; notes?: string };
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 80);
    if (!name) return bad("Name can't be empty");
    await run("UPDATE test_runs SET name = ? WHERE id = ?", [name, id]);
  }
  if (b.notes !== undefined) await run("UPDATE test_runs SET notes = ? WHERE id = ?", [String(b.notes).slice(0, 500), id]);
  return ok({ ok: true });
});

/** DELETE ?confirm=<exact name> → removes the test run, its prompts, results, votes and files. */
export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  await me();
  const id = Number((await params).id);
  const t = await get<{ name: string }>("SELECT name FROM test_runs WHERE id = ?", [id]);
  if (!t) return bad("No such test run", 404);
  if (new URL(req.url).searchParams.get("confirm") !== t.name) return bad("Type the test run's name to confirm");
  const active = await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM generations g JOIN prompts p ON p.id = g.prompt_id WHERE p.test_run_id = ? AND g.status IN ('queued','submitting','pending','completing')",
    [id],
  );
  if (active?.n) return bad("Generations are still running in this test run — wait for them to finish", 409);

  const media = await all<{ f: string }>(
    "SELECT o.local_path AS f FROM outputs o JOIN generations g ON g.id = o.generation_id JOIN prompts p ON p.id = g.prompt_id WHERE p.test_run_id = ?",
    [id],
  );
  const uploads = await all<{ f: string }>(
    `SELECT ref_image AS f FROM products WHERE test_run_id = ? AND ref_image IS NOT NULL
     UNION SELECT input_image FROM prompts WHERE test_run_id = ? AND input_image IS NOT NULL`,
    [id, id],
  );
  await clearRunContent(id);
  await run("DELETE FROM test_runs WHERE id = ?", [id]);
  // files last; an upload still referenced by another run (not normally possible) is left alone
  const stillUsed = new Set(
    (
      await all<{ f: string }>(
        "SELECT ref_image AS f FROM products WHERE ref_image IS NOT NULL UNION SELECT input_image FROM prompts WHERE input_image IS NOT NULL",
      )
    ).map((r) => r.f),
  );
  await deleteFiles("media", media.map((m) => m.f));
  await deleteFiles("uploads", uploads.map((u) => u.f).filter((f) => !stillUsed.has(f)));
  return ok({ ok: true });
});
