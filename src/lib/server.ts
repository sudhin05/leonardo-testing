import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { get } from "./db";
import { RUN_COOKIE, SESSION_COOKIE, verifySession, type Session } from "./session";
import { saveImageBuffer } from "./images";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** The signed-in team member (middleware already rejected anyone without a session). */
export async function me(): Promise<Session> {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) throw new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  return s;
}

/**
 * The test run this person is looking at: their own cookie, so two people can be in different runs.
 * Falls back to the newest run; null when no run exists yet.
 */
export async function currentRunId(): Promise<number | null> {
  const raw = Number((await cookies()).get(RUN_COOKIE)?.value);
  if (raw) {
    const hit = await get<{ id: number }>("SELECT id FROM test_runs WHERE id = ?", [raw]);
    if (hit) return hit.id;
  }
  return (await get<{ id: number }>("SELECT id FROM test_runs ORDER BY created_at DESC, id DESC LIMIT 1"))?.id ?? null;
}

export async function requireRun(): Promise<number> {
  const id = await currentRunId();
  if (!id) throw new Response(JSON.stringify({ error: "Create a test run first" }), { status: 409 });
  return id;
}

/** Wrap a route handler so thrown Responses (401/409) and errors come back as JSON. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error(e);
      return bad((e as Error).message || "Server error", 500);
    }
  };
}

export async function saveUpload(file: File, prefix: string): Promise<string> {
  return saveImageBuffer(Buffer.from(await file.arrayBuffer()), file.name || "image.png", prefix);
}
