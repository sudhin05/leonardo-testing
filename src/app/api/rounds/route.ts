import { bad, boot, ok } from "@/lib/server";
import { listArchives, startNewRound } from "@/lib/rounds";

export const dynamic = "force-dynamic";

/** GET → archived rounds. POST {label?} → archive the current round and start an empty one. */
export async function GET() {
  boot();
  return ok(listArchives());
}

export async function POST(req: Request) {
  boot();
  const b = await req.json().catch(() => ({}));
  try {
    return ok(startNewRound(String(b.label ?? "")));
  } catch (e) {
    return bad((e as Error).message, 409);
  }
}
