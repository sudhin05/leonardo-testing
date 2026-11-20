import { all, run } from "@/lib/db";
import { bad, currentRunId, handle, me, ok, requireRun } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await me();
  const runId = await currentRunId();
  if (!runId) return ok([]);
  return ok(await all("SELECT * FROM products WHERE test_run_id = ? ORDER BY sku", [runId]));
});

export const POST = handle(async (req: Request) => {
  await me();
  const runId = await requireRun();
  const b = await req.json();
  if (!b.sku || !b.name) return bad("sku and name are required");
  const r = await run("INSERT INTO products (test_run_id, sku, name, category, notes) VALUES (?, ?, ?, ?, ?)", [
    runId,
    String(b.sku),
    String(b.name),
    String(b.category ?? ""),
    String(b.notes ?? ""),
  ]);
  return ok({ id: r.id });
});
