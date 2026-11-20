import { get } from "@/lib/db";
import { bad, handle, me, requireRun } from "@/lib/server";
import { buildReport } from "@/lib/report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/report?category=… → PDF of the current test run (summary + matrix + team votes). */
export const GET = handle(async (req: Request) => {
  const user = await me();
  const runId = await requireRun();
  const category = new URL(req.url).searchParams.get("category") ?? "";
  try {
    const pdf = await buildReport({ runId, userId: user.uid, category });
    const runName = (await get<{ name: string }>("SELECT name FROM test_runs WHERE id = ?", [runId]))?.name ?? "run";
    const date = new Date().toISOString().slice(0, 10);
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="model-lab-${slug(runName)}${category ? `-${slug(category)}` : ""}-${date}.pdf"`,
      },
    });
  } catch (e) {
    return bad(`Couldn't build the report: ${(e as Error).message}`, 500);
  }
});
