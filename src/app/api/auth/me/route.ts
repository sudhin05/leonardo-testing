import { cookies } from "next/headers";
import { bad, ok } from "@/lib/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return bad("Not signed in", 401);
  return ok({ id: s.uid, name: s.name });
}
