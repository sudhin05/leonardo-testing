import { bad, boot } from "@/lib/server";
import { buildReport } from "@/lib/report";

export const dynamic = "force-dynamic";

/** GET /api/report?category=… → PDF download (summary + matrix). */
export async function GET(req: Request) {
  boot();
  const category = new URL(req.url).searchParams.get("category") ?? "";
  try {
    const pdf = await buildReport({ category });
    const date = new Date().toISOString().slice(0, 10);
    const slug = category ? `-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="model-lab-report${slug}-${date}.pdf"`,
      },
    });
  } catch (e) {
    return bad(`Couldn't build the report: ${(e as Error).message}`, 500);
  }
}
