import { cookies } from "next/headers";
import { get, run } from "@/lib/db";
import { bad, handle, ok } from "@/lib/server";
import { SESSION_COOKIE, SESSION_DAYS, passwordOk, signSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** POST {password, name} → signs in as that team member (created on first sign-in). */
export const POST = handle(async (req: Request) => {
  const b = (await req.json().catch(() => ({}))) as { password?: string; name?: string };
  const name = String(b.name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (process.env.TEAM_PASSWORD && !String(b.password ?? "")) return bad("Enter the team password", 401);
  if (!passwordOk(String(b.password ?? ""))) return bad("Wrong team password", 401);
  if (!name) return bad("Enter your name");
  const max = Number(process.env.TEAM_MAX_MEMBERS || 10);
  let user = await get<{ id: number; name: string }>("SELECT id, name FROM users WHERE name = ? COLLATE NOCASE", [name]);
  if (!user) {
    const count = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM users"))?.n ?? 0;
    if (count >= max) return bad(`The team already has ${count} members — pick your existing name`);
    const r = await run("INSERT INTO users (name) VALUES (?)", [name]);
    user = { id: r.id, name };
  }
  const token = await signSession({ uid: user.id, name: user.name, iat: Date.now() });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return ok({ id: user.id, name: user.name });
});
