import { cookies } from "next/headers";
import { all, run } from "@/lib/db";
import { bad, currentRunId, handle, me, ok } from "@/lib/server";
import { RUN_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export type TestRunInfo = {
  id: number;
  name: string;
  notes: string;
  created_at: string;
  created_by_name: string | null;
  prompts: number;
  generations: number;
  outputs: number;
  votes: number;
  spent: number;
  last_activity: string | null;
};

/** All test runs (newest first) with headline numbers, plus which one this person is viewing. */
export const GET = handle(async () => {
  await me();
  const runs = await all<TestRunInfo>(
    `SELECT t.id, t.name, t.notes, t.created_at, u.name AS created_by_name,
       (SELECT COUNT(*) FROM prompts p WHERE p.test_run_id = t.id) AS prompts,
       (SELECT COUNT(*) FROM generations g JOIN prompts p ON p.id = g.prompt_id WHERE p.test_run_id = t.id) AS generations,
       (SELECT COUNT(*) FROM outputs o JOIN generations g ON g.id = o.generation_id JOIN prompts p ON p.id = g.prompt_id WHERE p.test_run_id = t.id) AS outputs,
       (SELECT COUNT(*) FROM votes v JOIN outputs o ON o.id = v.output_id JOIN generations g ON g.id = o.generation_id JOIN prompts p ON p.id = g.prompt_id WHERE p.test_run_id = t.id) AS votes,
       (SELECT COALESCE(SUM(g.credit_cost), 0) FROM generations g JOIN prompts p ON p.id = g.prompt_id WHERE p.test_run_id = t.id AND g.mock = 0 AND g.status = 'complete') AS spent,
       (SELECT MAX(g.created_at) FROM generations g JOIN prompts p ON p.id = g.prompt_id WHERE p.test_run_id = t.id) AS last_activity
     FROM test_runs t LEFT JOIN users u ON u.id = t.created_by
     ORDER BY t.created_at DESC, t.id DESC`,
  );
  return ok({ runs, current: await currentRunId() });
});

/** POST {name, notes?} → new empty test run, selected for this person. */
export const POST = handle(async (req: Request) => {
  const user = await me();
  const b = (await req.json().catch(() => ({}))) as { name?: string; notes?: string };
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!name) return bad("Give the test run a name");
  const r = await run("INSERT INTO test_runs (name, notes, created_by) VALUES (?, ?, ?)", [name, String(b.notes ?? "").slice(0, 500), user.uid]);
  (await cookies()).set(RUN_COOKIE, String(r.id), { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
  return ok({ id: r.id });
});
