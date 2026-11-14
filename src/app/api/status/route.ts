import { boot, ok } from "@/lib/server";
import { isMock } from "@/lib/leonardo";

export const dynamic = "force-dynamic";

export async function GET() {
  const d = boot();
  const counts = d.prepare("SELECT status, COUNT(*) AS n FROM generations GROUP BY status").all() as { status: string; n: number }[];
  const spent = d.prepare("SELECT COALESCE(SUM(credit_cost),0) AS c FROM generations WHERE mock = 0").get() as { c: number };
  return ok({
    mock: isMock(),
    hasKey: !!process.env.LEONARDO_API_KEY,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    creditsSpent: spent.c,
  });
}
