import { boot, ok } from "@/lib/server";
import { CREDITS_PER_USD, isMock } from "@/lib/leonardo";
import { cachedBalance } from "@/lib/worker";

export const dynamic = "force-dynamic";

export async function GET() {
  const d = boot();
  const counts = d.prepare("SELECT status, COUNT(*) AS n FROM generations GROUP BY status").all() as { status: string; n: number }[];
  // failed generations are refunded by Leonardo, so they don't count as spend
  const spend = d
    .prepare(
      `SELECT COALESCE(SUM(credit_cost), 0) AS spent,
              SUM(credit_cost IS NULL) AS unknown,
              SUM(cost_source = 'estimate') AS estimated,
              COUNT(*) AS n
       FROM generations WHERE mock = 0 AND status IN ('submitting','pending','complete')`,
    )
    .get() as { spent: number; unknown: number | null; estimated: number | null; n: number };
  const first = d.prepare("SELECT balance, ts FROM balance_log ORDER BY ts ASC LIMIT 1").get() as { balance: number; ts: number } | undefined;
  const balance = isMock() ? null : await cachedBalance();
  return ok({
    mock: isMock(),
    hasKey: !!process.env.LEONARDO_API_KEY,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    balance, // API credits (Leonardo /v1/me)
    creditsPerUsd: CREDITS_PER_USD,
    usdSpent: spend.spent, // generations.credit_cost is stored in USD
    unknownCost: spend.unknown ?? 0,
    estimatedCost: spend.estimated ?? 0,
    liveGenerations: spend.n,
    firstBalance: first ? { balance: first.balance, ts: first.ts } : null,
  });
}
