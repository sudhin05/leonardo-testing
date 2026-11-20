import { all } from "@/lib/db";
import { handle, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Names for the sign-in picker (public: the sign-in page needs them before a session exists). */
export const GET = handle(async () => {
  const users = await all<{ name: string }>("SELECT name FROM users WHERE name != 'Earlier scores' ORDER BY name");
  return ok({ names: users.map((u) => u.name), passwordRequired: !!process.env.TEAM_PASSWORD });
});
