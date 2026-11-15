import { boot, ok } from "@/lib/server";
import { leaderboard } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  boot();
  const sp = new URL(req.url).searchParams;
  return ok(leaderboard(sp.get("category") ?? "", sp.get("mock") === "1"));
}
