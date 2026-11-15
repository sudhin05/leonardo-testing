import fs from "node:fs";
import path from "node:path";
import { db, MEDIA_DIR } from "./db";
import { CREDITS_PER_USD, createGeneration, getBalance, getGeneration, isMock, mockSvg } from "./leonardo";
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

type G = typeof globalThis & {
  __labWorker?: { timer: NodeJS.Timeout; busy: boolean };
  __labTick?: () => Promise<void>;
};

// The interval lives on globalThis (survives dev hot-reload) but always calls the *latest* module's tick.
async function tick() {
  const state = (globalThis as G).__labWorker!;
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
(globalThis as G).__labTick = tick;

export function ensureWorker() {
  const g = globalThis as G;
  if (g.__labWorker) return;
  g.__labWorker = { busy: false, timer: setInterval(() => void (globalThis as G).__labTick?.(), TICK_MS) };
  // anything stuck mid-submit from a previous server process goes back to the queue
  db().prepare("UPDATE generations SET status = 'queued' WHERE status = 'submitting'").run();
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
  if (isMock()) {
    await Promise.all(rows.map(submitOne));
    return;
  }
  // Live: submit one at a time so a balance drop can be attributed to exactly one generation.
  for (const r of rows) await submitOne(r);
}

// ── Credits ──────────────────────────────────────────────────────────────
// Leonardo's GET generation has no cost field. Cost comes from (1) the create response if present,
// else (2) the drop in account balance (GET /v1/me) across that single submit, else (3) an estimate
// from earlier generations with identical settings.

type BalanceCache = { value: number | null; ts: number };
type GB = typeof globalThis & { __labBalance?: BalanceCache; __labApiCost?: Set<string> };

export async function readBalance(): Promise<number | null> {
  const value = await getBalance();
  if (value != null) {
    (globalThis as GB).__labBalance = { value, ts: Date.now() };
    db().prepare("INSERT OR REPLACE INTO balance_log (ts, balance) VALUES (?, ?)").run(Date.now(), value);
  }
  return value;
}

export async function cachedBalance(maxAgeMs = 20_000): Promise<number | null> {
  const c = (globalThis as GB).__labBalance;
  if (c && Date.now() - c.ts < maxAgeMs) return c.value;
  return readBalance();
}

function apiCostModels() {
  const g = globalThis as GB;
  return (g.__labApiCost ??= new Set());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function estimateCost(row: GenRow): number | null {
  const sig = (req: string) => {
    const p = (JSON.parse(req).parameters ?? {}) as Record<string, unknown>;
    return JSON.stringify([p.width, p.height, p.quantity, p.quality, p.mode, p.duration, !!p.guidances]);
  };
  const mine = sig(row.request);
  const prior = db()
    .prepare("SELECT request, credit_cost FROM generations WHERE model_key = ? AND cost_source IN ('api','measured') AND credit_cost IS NOT NULL ORDER BY id DESC LIMIT 50")
    .all(row.model_key) as { request: string; credit_cost: number }[];
  const same = prior.filter((p) => sig(p.request) === mine);
  if (!same.length) return null;
  return Math.round((same.reduce((a, b) => a + b.credit_cost, 0) / same.length) * 10000) / 10000;
}

async function submitOne(row: GenRow) {
  const d = db();
  d.prepare("UPDATE generations SET status = 'submitting' WHERE id = ?").run(row.id);
  if (isMock()) {
    d.prepare(
      "UPDATE generations SET status = 'pending', leonardo_id = ?, mock = 1, submitted_at = ?, credit_cost = ?, cost_source = 'mock' WHERE id = ?",
    ).run(`mock-${row.id}`, Date.now(), Math.round(300 + ((row.id * 37) % 900)) / 10000, row.id);
    return;
  }
  try {
    const measure = !apiCostModels().has(row.model_key);
    const before = measure ? await readBalance() : null;
    const res = await createGeneration(JSON.parse(row.request));
    const submittedAt = Date.now();
    let cost = res.cost;
    let source: string | null = cost != null ? "api" : null;
    if (cost != null) apiCostModels().add(row.model_key);
    if (cost == null && before != null) {
      let after = await readBalance();
      if (after === before) {
        await sleep(1500);
        after = await readBalance();
      }
      if (after != null && before - after > 0) {
        cost = Math.round(((before - after) / CREDITS_PER_USD) * 10000) / 10000; // balance is in credits; store USD
        source = "measured";
      }
    }
    if (cost == null) {
      cost = estimateCost(row);
      if (cost != null) source = "estimate";
    }
    d.prepare(
      `UPDATE generations SET status = 'pending', leonardo_id = ?, submitted_at = ?, credit_cost = ?, cost_source = ?, create_response = ?, mock = 0
       WHERE id = ?`,
    ).run(res.generationId, submittedAt, cost, source, JSON.stringify(res.raw).slice(0, 4000), row.id);
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
  // Checked only after asking Leonardo (below), so work that finished while the app was closed is still collected.
  const timedOut = !!row.submitted_at && now - row.submitted_at > (isVideo ? VIDEO_TIMEOUT_MS : IMAGE_TIMEOUT_MS);

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
    if (res.status !== "COMPLETE" || res.media.length === 0) {
      if (timedOut) fail(row.id, new Error("Timed out waiting for Leonardo"));
      return;
    }
    const saved: { local: string | null; remote: string; type: "image" | "video" }[] = [];
    let i = 0;
    for (const m of res.media) {
      saved.push({ local: await download(m.url, `${row.id}_${i++}`), remote: m.url, type: m.type });
    }
    complete(row.id, saved, res.cost);
  } catch (e) {
    // transient poll errors shouldn't kill the generation; record and retry next tick
    if (timedOut) return fail(row.id, e);
    d.prepare("UPDATE generations SET error = ? WHERE id = ?").run(String((e as Error).message), row.id);
  }
}

function complete(id: number, media: { local: string | null; remote: string | null; type: "image" | "video" }[], cost: number | null) {
  const d = db();
  const ins = d.prepare("INSERT INTO outputs (generation_id, idx, remote_url, local_path, media_type) VALUES (?, ?, ?, ?, ?)");
  media.forEach((m, i) => ins.run(id, i, m.remote, m.local, m.type));
  d.prepare(
    `UPDATE generations SET status = 'complete', completed_at = ?, error = NULL,
       cost_source = CASE WHEN credit_cost IS NULL AND ? IS NOT NULL THEN 'api' ELSE cost_source END,
       credit_cost = COALESCE(credit_cost, ?) WHERE id = ?`,
  ).run(Date.now(), cost, cost, id);
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
