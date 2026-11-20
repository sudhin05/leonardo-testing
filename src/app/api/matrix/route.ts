import { currentRunId, handle, me, ok } from "@/lib/server";
import { matrixCells } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Overview grid for the current test run: newest result per prompt × model, with the team's vote tally. */
export const GET = handle(async () => {
  const user = await me();
  const runId = await currentRunId();
  return ok(runId ? await matrixCells(runId, user.uid) : []);
});
