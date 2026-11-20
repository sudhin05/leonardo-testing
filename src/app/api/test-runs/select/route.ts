import { cookies } from "next/headers";
import { get } from "@/lib/db";
import { bad, handle, me, ok } from "@/lib/server";
import { RUN_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** POST {id} → switch the test run *this person* is viewing (others are unaffected). */
export const POST = handle(async (req: Request) => {
  await me();
  const { id } = (await req.json().catch(() => ({}))) as { id?: number };
  const hit = await get<{ id: number }>("SELECT id FROM test_runs WHERE id = ?", [Number(id)]);
  if (!hit) return bad("No such test run", 404);
  (await cookies()).set(RUN_COOKIE, String(hit.id), { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
  return ok({ id: hit.id });
});
