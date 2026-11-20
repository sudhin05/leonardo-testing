import { currentRunId, handle, me, ok } from "@/lib/server";
import { leaderboard } from "@/lib/stats";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await me();
  const runId = await currentRunId();
  if (!runId) return ok({ rows: [], heat: [], voters: [], categories: [] });
  const sp = new URL(req.url).searchParams;
  return ok(await leaderboard(runId, sp.get("category") ?? "", sp.get("mock") === "1"));
});
