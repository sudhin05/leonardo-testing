import { cookies } from "next/headers";
import { ok } from "@/lib/server";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return ok({ ok: true });
}
