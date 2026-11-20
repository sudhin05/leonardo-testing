import { after } from "next/server";
import { IS_REMOTE_DB, get } from "@/lib/db";
import { STORAGE_MODE, USE_BLOB } from "@/lib/storage";
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
  // a hosted deployment must use cloud storage + database; local disk there is read-only and wiped on each deploy
  const hosted = !!process.env.VERCEL;
  const setupProblems = [
    hosted && !USE_BLOB ? "Image storage isn't connected (no BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID) — images can't be saved or shown" : "",
    hosted && !IS_REMOTE_DB ? "Database isn't connected (no TURSO_DATABASE_URL)" : "",
  ].filter(Boolean);
  return ok({
    setupProblems,
    storage: STORAGE_MODE,
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
