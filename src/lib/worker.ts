import { all, get, run } from "./db";
import { CREDITS_PER_USD, createGeneration, getBalance, getGeneration, isMock, mockSvg } from "./leonardo";
import { getModelDef } from "./registry";
import { putFile } from "./storage";

/**
 * Generation worker, advanced in short "ticks" triggered by requests (status polling, Generate).
 * Works the same on a laptop and on serverless hosts that have no always-on process.
 *
 *   queued → submitting → pending → completing → complete
 *                     ↘ failed ↙
 *
 * Every transition is a conditional UPDATE ("claim"), so two ticks running at once — two people with the
 * app open, or two serverless instances — never submit or save the same generation twice.
 */

const POLL_EVERY_MS = 4000;
const STUCK_MS = 120_000; // a tick that died mid-step
const IMAGE_TIMEOUT_MS = 15 * 60_000;
const VIDEO_TIMEOUT_MS = 30 * 60_000;

export const ACTIVE_SQL = "('queued','submitting','pending','completing')";

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

type G = typeof globalThis & { __labTicking?: boolean };

/** Advance the queue for at most `budgetMs`. Safe to call often and concurrently. */
export async function tick(budgetMs = 20_000) {
  const g = globalThis as G;
  if (g.__labTicking) return; // one tick per instance at a time
  g.__labTicking = true;
  const deadline = Date.now() + budgetMs;
  try {
    await recoverStuck();
    await pollPending(deadline);
    if (Date.now() < deadline) await submitQueued(deadline);
  } catch (e) {
    console.error("[tick]", e);
  } finally {
    g.__labTicking = false;
  }
}

export async function activeCount() {
  return (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM generations WHERE status IN ${ACTIVE_SQL}`))?.n ?? 0;
}

function maxConcurrent() {
  return Math.max(1, Number(process.env.LEONARDO_MAX_CONCURRENT || 6));
}

async function recoverStuck() {
  const cutoff = Date.now() - STUCK_MS;
  // died while submitting: the request may or may not have reached Leonardo, so don't resubmit blindly
  await run(
    "UPDATE generations SET status = 'failed', error = 'Interrupted while submitting; press Retry', completed_at = ? WHERE status = 'submitting' AND last_polled_at < ?",
    [Date.now(), cutoff],
  );
  // died while saving results: Leonardo still has them, so go back to polling
  await run("UPDATE generations SET status = 'pending', last_polled_at = NULL WHERE status = 'completing' AND last_polled_at < ?", [cutoff]);
}

async function submitQueued(deadline: number) {
  const inflight = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM generations WHERE status IN ('submitting','pending','completing')"))?.n ?? 0;
  const slots = maxConcurrent() - inflight;
  if (slots <= 0) return;
  const rows = await all<GenRow>("SELECT * FROM generations WHERE status = 'queued' ORDER BY id LIMIT ?", [slots]);
  for (const r of rows) {
    if (Date.now() > deadline) break;
    await submitOne(r);
  }
}

// ── Credits ──────────────────────────────────────────────────────────────
// Leonardo returns the cost in USD on create (normal case). Fallbacks: the balance drop around this submit,
// then an estimate from earlier generations with identical settings.

type GB = typeof globalThis & { __labBalance?: { value: number | null; ts: number }; __labApiCost?: Set<string> };

export async function readBalance(): Promise<number | null> {
  const value = await getBalance();
  if (value != null) {
    (globalThis as GB).__labBalance = { value, ts: Date.now() };
    await run("INSERT OR REPLACE INTO balance_log (ts, balance) VALUES (?, ?)", [Date.now(), value]);
  }
  return value;
}

export async function cachedBalance(maxAgeMs = 30_000): Promise<number | null> {
  const c = (globalThis as GB).__labBalance;
  if (c && Date.now() - c.ts < maxAgeMs) return c.value;
  return readBalance();
}

function apiCostModels() {
  const g = globalThis as GB;
  return (g.__labApiCost ??= new Set());
}

async function estimateCost(row: GenRow): Promise<number | null> {
  const sig = (req: string) => {
    const p = (JSON.parse(req).parameters ?? {}) as Record<string, unknown>;
    return JSON.stringify([p.width, p.height, p.quantity, p.quality, p.mode, p.duration, !!p.guidances]);
  };
  const mine = sig(row.request);
  const prior = await all<{ request: string; credit_cost: number }>(
    "SELECT request, credit_cost FROM generations WHERE model_key = ? AND cost_source IN ('api','measured') AND credit_cost IS NOT NULL ORDER BY id DESC LIMIT 50",
    [row.model_key],
  );
  const same = prior.filter((p) => sig(p.request) === mine);
  if (!same.length) return null;
  return Math.round((same.reduce((a, b) => a + b.credit_cost, 0) / same.length) * 10000) / 10000;
}

async function submitOne(row: GenRow) {
  const claimed = await run("UPDATE generations SET status = 'submitting', last_polled_at = ? WHERE id = ? AND status = 'queued'", [Date.now(), row.id]);
  if (claimed.changes !== 1) return; // someone else took it
  if (isMock()) {
    await run(
      "UPDATE generations SET status = 'pending', leonardo_id = ?, mock = 1, submitted_at = ?, last_polled_at = NULL, credit_cost = ?, cost_source = 'mock' WHERE id = ?",
      [`mock-${row.id}`, Date.now(), Math.round(300 + ((row.id * 37) % 900)) / 10000, row.id],
    );
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
      const after = await readBalance();
      if (after != null && before - after > 0) {
        cost = Math.round(((before - after) / CREDITS_PER_USD) * 10000) / 10000;
        source = "measured";
      }
    }
    if (cost == null) {
      cost = await estimateCost(row);
      if (cost != null) source = "estimate";
    }
    await run(
      `UPDATE generations SET status = 'pending', leonardo_id = ?, submitted_at = ?, last_polled_at = NULL, credit_cost = ?, cost_source = ?, create_response = ?, mock = 0
       WHERE id = ?`,
      [res.generationId, submittedAt, cost, source, JSON.stringify(res.raw).slice(0, 4000), row.id],
    );
  } catch (e) {
    await fail(row.id, e);
  }
}

async function pollPending(deadline: number) {
  const now = Date.now();
  const rows = await all<GenRow>(
    "SELECT * FROM generations WHERE status = 'pending' AND (last_polled_at IS NULL OR last_polled_at < ?) ORDER BY id LIMIT 12",
    [now - POLL_EVERY_MS],
  );
  // poll in parallel (cheap GETs); saving results is sequential inside each
  await Promise.all(rows.map((r) => (Date.now() < deadline ? pollOne(r) : Promise.resolve())));
}

async function pollOne(row: GenRow) {
  const now = Date.now();
  const claim = await run(
    "UPDATE generations SET last_polled_at = ? WHERE id = ? AND status = 'pending' AND (last_polled_at IS NULL OR last_polled_at < ?)",
    [now, row.id, now - POLL_EVERY_MS],
  );
  if (claim.changes !== 1) return;
  const def = await getModelDef(row.model_key);
  const timedOut = !!row.submitted_at && now - row.submitted_at > (def?.kind === "video" ? VIDEO_TIMEOUT_MS : IMAGE_TIMEOUT_MS);

  if (row.mock) {
    const wait = 2500 + ((row.id * 1931) % 6000);
    if (now - (row.submitted_at ?? now) < wait) return;
    if (!(await claimCompletion(row.id))) return;
    const req = JSON.parse(row.request);
    const qty = Number(req.parameters?.quantity ?? 1);
    const saved: Saved[] = [];
    for (let i = 0; i < qty; i++) {
      const name = `${row.id}_${i}.svg`;
      const svg = mockSvg({
        label: def?.label ?? row.model_key,
        prompt: String(req.parameters?.prompt ?? ""),
        width: row.width,
        height: row.height,
        seed: hash(row.model_key) + i * 3,
      });
      await putFile("media", name, Buffer.from(svg));
      saved.push({ local: name, remote: null, type: "image" });
    }
    await complete(row.id, saved, null);
    return;
  }

  try {
    const res = await getGeneration(row.leonardo_id!);
    if (res.status === "FAILED") return await fail(row.id, new Error("Leonardo reported FAILED (possibly moderation/blocked)"));
    if (res.status !== "COMPLETE" || res.media.length === 0) {
      if (timedOut) await fail(row.id, new Error("Timed out waiting for Leonardo"));
      return;
    }
    if (!(await claimCompletion(row.id))) return;
    const saved: Saved[] = [];
    let i = 0;
    for (const m of res.media) saved.push({ local: await download(m.url, `${row.id}_${i++}`), remote: m.url, type: m.type });
    await complete(row.id, saved, res.cost);
  } catch (e) {
    if (timedOut) return await fail(row.id, e);
    await run("UPDATE generations SET error = ? WHERE id = ? AND status = 'pending'", [String((e as Error).message), row.id]);
  }
}

type Saved = { local: string | null; remote: string | null; type: "image" | "video" };

/** Only one tick may save a generation's results. */
async function claimCompletion(id: number) {
  const c = await run("UPDATE generations SET status = 'completing', last_polled_at = ? WHERE id = ? AND status = 'pending'", [Date.now(), id]);
  if (c.changes !== 1) return false;
  await run("DELETE FROM outputs WHERE generation_id = ?", [id]); // leftovers from an interrupted earlier save
  return true;
}

async function complete(id: number, media: Saved[], cost: number | null) {
  for (const [i, m] of media.entries()) {
    await run("INSERT INTO outputs (generation_id, idx, remote_url, local_path, media_type) VALUES (?, ?, ?, ?, ?)", [id, i, m.remote, m.local, m.type]);
  }
  await run(
    `UPDATE generations SET status = 'complete', completed_at = ?, error = NULL,
       cost_source = CASE WHEN credit_cost IS NULL AND ? IS NOT NULL THEN 'api' ELSE cost_source END,
       credit_cost = COALESCE(credit_cost, ?) WHERE id = ?`,
    [Date.now(), cost, cost, id],
  );
}

async function fail(id: number, e: unknown) {
  await run("UPDATE generations SET status = 'failed', error = ?, completed_at = ? WHERE id = ?", [String((e as Error)?.message ?? e), Date.now(), id]);
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
    await putFile("media", name, Buffer.from(await res.arrayBuffer()));
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
