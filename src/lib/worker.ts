import fs from "node:fs";
import path from "node:path";
import { db, MEDIA_DIR } from "./db";
import { createGeneration, getGeneration, isMock, mockSvg } from "./leonardo";
import { getModelDef } from "./registry";

/**
 * Background worker living inside the Next.js server process.
 * queued → (submit) → pending → (poll) → complete | failed
 */

const TICK_MS = 2000;
const POLL_EVERY_MS = 4000;
const IMAGE_TIMEOUT_MS = 15 * 60_000;
const VIDEO_TIMEOUT_MS = 30 * 60_000;

type GenRow = {
  id: number;
  model_key: string;
  status: string;
  leonardo_id: string | null;
  request: string;
  submitted_at: number | null;
  mock: number;
  width: number;
  height: number;
};

type G = typeof globalThis & { __labWorker?: { timer: NodeJS.Timeout; busy: boolean } };

export function ensureWorker() {
  const g = globalThis as G;
  if (g.__labWorker) return;
  const state = { busy: false, timer: setInterval(() => void tick(), TICK_MS) };
  g.__labWorker = state;
  // anything stuck mid-submit from a previous server process goes back to the queue
  db().prepare("UPDATE generations SET status = 'queued' WHERE status = 'submitting'").run();

  async function tick() {
    if (state.busy) return;
    state.busy = true;
    try {
      await pollPending();
      await submitQueued();
    } catch (e) {
      console.error("[worker]", e);
    } finally {
      state.busy = false;
    }
  }
}

function maxConcurrent() {
  return Math.max(1, Number(process.env.LEONARDO_MAX_CONCURRENT || 6));
}

async function submitQueued() {
  const d = db();
  const inflight = (d.prepare("SELECT COUNT(*) AS n FROM generations WHERE status IN ('submitting','pending')").get() as { n: number }).n;
  const slots = maxConcurrent() - inflight;
  if (slots <= 0) return;
  const rows = d.prepare("SELECT * FROM generations WHERE status = 'queued' ORDER BY id LIMIT ?").all(slots) as unknown as GenRow[];
  await Promise.all(rows.map(submitOne));
}

async function submitOne(row: GenRow) {
  const d = db();
  d.prepare("UPDATE generations SET status = 'submitting' WHERE id = ?").run(row.id);
  const now = Date.now();
  if (isMock()) {
    d.prepare("UPDATE generations SET status = 'pending', leonardo_id = ?, mock = 1, submitted_at = ?, credit_cost = ? WHERE id = ?").run(
      `mock-${row.id}`,
      now,
      Math.round(5 + ((row.id * 37) % 40)),
      row.id,
    );
    return;
  }
  try {
    const res = await createGeneration(JSON.parse(row.request));
    d.prepare("UPDATE generations SET status = 'pending', leonardo_id = ?, submitted_at = ?, credit_cost = ?, mock = 0 WHERE id = ?").run(
      res.generationId,
      now,
      res.cost,
      row.id,
    );
  } catch (e) {
    fail(row.id, e);
  }
}

async function pollPending() {
  const d = db();
  const cutoff = Date.now() - POLL_EVERY_MS;
  const rows = d
    .prepare("SELECT * FROM generations WHERE status = 'pending' AND (last_polled_at IS NULL OR last_polled_at < ?)")
    .all(cutoff) as unknown as GenRow[];
  await Promise.all(rows.map(pollOne));
}

async function pollOne(row: GenRow) {
  const d = db();
  const now = Date.now();
  d.prepare("UPDATE generations SET last_polled_at = ? WHERE id = ?").run(now, row.id);
  const def = getModelDef(row.model_key);
  const isVideo = def?.kind === "video";
  if (row.submitted_at && now - row.submitted_at > (isVideo ? VIDEO_TIMEOUT_MS : IMAGE_TIMEOUT_MS)) {
    return fail(row.id, new Error("Timed out waiting for Leonardo"));
  }

  if (row.mock) {
    const wait = 2500 + ((row.id * 1931) % 6000);
    if (now - (row.submitted_at ?? now) < wait) return;
    const req = JSON.parse(row.request);
    const qty = Number(req.parameters?.quantity ?? 1);
    const files: string[] = [];
    for (let i = 0; i < qty; i++) {
      const name = `${row.id}_${i}.svg`;
      fs.writeFileSync(
        path.join(MEDIA_DIR, name),
        mockSvg({
          label: def?.label ?? row.model_key,
          prompt: String(req.parameters?.prompt ?? ""),
          width: row.width,
          height: row.height,
          seed: hash(row.model_key) + i * 3,
        }),
      );
      files.push(name);
    }
    complete(row.id, files.map((f) => ({ local: f, remote: null, type: "image" as const })), null);
    return;
  }

  try {
    const res = await getGeneration(row.leonardo_id!);
    if (res.status === "FAILED") return fail(row.id, new Error("Leonardo reported FAILED (possibly moderation/blocked)"));
    if (res.status !== "COMPLETE" || res.media.length === 0) return;
    const saved: { local: string | null; remote: string; type: "image" | "video" }[] = [];
    let i = 0;
    for (const m of res.media) {
      saved.push({ local: await download(m.url, `${row.id}_${i++}`), remote: m.url, type: m.type });
    }
    complete(row.id, saved, res.cost);
  } catch (e) {
    // transient poll errors shouldn't kill the generation; record and retry next tick
    d.prepare("UPDATE generations SET error = ? WHERE id = ?").run(String((e as Error).message), row.id);
  }
}

function complete(id: number, media: { local: string | null; remote: string | null; type: "image" | "video" }[], cost: number | null) {
  const d = db();
  const ins = d.prepare("INSERT INTO outputs (generation_id, idx, remote_url, local_path, media_type) VALUES (?, ?, ?, ?, ?)");
  media.forEach((m, i) => ins.run(id, i, m.remote, m.local, m.type));
  d.prepare("UPDATE generations SET status = 'complete', completed_at = ?, error = NULL, credit_cost = COALESCE(credit_cost, ?) WHERE id = ?").run(
    Date.now(),
    cost,
    id,
  );
}

function fail(id: number, e: unknown) {
  db()
    .prepare("UPDATE generations SET status = 'failed', error = ?, completed_at = ? WHERE id = ?")
    .run(String((e as Error)?.message ?? e), Date.now(), id);
}

async function download(url: string, base: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    const fromUrl = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
    const ext =
      ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : ct.includes("jpeg") ? "jpg" : ct.includes("mp4") ? "mp4" : fromUrl || "bin";
    const name = `${base}.${ext}`;
    fs.writeFileSync(path.join(MEDIA_DIR, name), Buffer.from(await res.arrayBuffer()));
    return name;
  } catch {
    return null;
  }
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
