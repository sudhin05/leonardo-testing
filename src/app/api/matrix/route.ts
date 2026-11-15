import { boot, ok } from "@/lib/server";
import { matrixCells } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Overview grid: for every prompt × model, the newest output (first image) + its score. */
export async function GET() {
  boot();
  return ok(matrixCells());
}
