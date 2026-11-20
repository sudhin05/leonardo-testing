import { after } from "next/server";
import { get } from "@/lib/db";
import { CREDITS_PER_USD, isMock } from "@/lib/leonardo";
import { currentRunId, handle, me, ok } from "@/lib/server";
import { activeCount, cachedBalance, tick } from "@/lib/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Polled every few seconds by every open page. Besides reporting status, it is what drives generation:
 * when anything is in flight, a worker tick runs after the response is sent.
 */
export const GET = handle(async () => {
  const user = await me();
  const runId = await currentRunId();
  const active = await activeCount();
  if (active > 0) after(() => tick());

  const run = runId ? await get<{ id: number; name: string }>("SELECT id, name FROM test_runs WHERE id = ?", [runId]) : undefined;
  const spend = await get<{ spent: number; unknown: number | null; estimated: number | null; n: number }>(
    `SELECT COALESCE(SUM(credit_cost), 0) AS spent, SUM(credit_cost IS NULL) AS unknown, SUM(cost_source = 'estimate') AS estimated, COUNT(*) AS n
     FROM generations WHERE mock = 0 AND status IN ('submitting','pending','completing','complete')`,
  );
  const runSpend = runId
    ? await get<{ spent: number }>(
        "SELECT COALESCE(SUM(g.credit_cost), 0) AS spent FROM generations g JOIN prompts p ON p.id = g.prompt_id WHERE p.test_run_id = ? AND g.mock = 0 AND g.status = 'complete'",
        [runId],
      )
    : undefined;
  return ok({
    user: { id: user.uid, name: user.name },
    run: run ?? null,
    mock: isMock(),
    hasKey: !!process.env.LEONARDO_API_KEY,
    active,
    balance: isMock() ? null : await cachedBalance(),
    creditsPerUsd: CREDITS_PER_USD,
    usdSpent: spend?.spent ?? 0,
    runUsdSpent: runSpend?.spent ?? 0,
    unknownCost: spend?.unknown ?? 0,
    estimatedCost: spend?.estimated ?? 0,
    liveGenerations: spend?.n ?? 0,
  });
});
