import fs from "node:fs";
import path from "node:path";

const BASE = "https://cloud.leonardo.ai/api/rest";

export function isMock() {
  return process.env.LEONARDO_MOCK === "1" || !process.env.LEONARDO_API_KEY;
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${process.env.LEONARDO_API_KEY}`,
  };
  if (json) h["content-type"] = "application/json";
  return h;
}

async function readJson(res: Response) {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const msg = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`Leonardo ${res.status}: ${msg.slice(0, 800)}`);
  }
  return body as Record<string, unknown>;
}

/** Depth-first search for a key anywhere in a JSON blob (the API nests results differently per version). */
function findKey(obj: unknown, key: string, depth = 0): unknown {
  if (!obj || typeof obj !== "object" || depth > 5) return undefined;
  const o = obj as Record<string, unknown>;
  if (key in o && o[key] != null) return o[key];
  for (const v of Object.values(o)) {
    const hit = findKey(v, key, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

export type CreateResult = { generationId: string; cost: number | null; raw: unknown };

export async function createGeneration(body: unknown): Promise<CreateResult> {
  const res = await fetch(`${BASE}/v2/generations`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const json = await readJson(res);
  const generationId = findKey(json, "generationId") ?? findKey(json, "id");
  if (typeof generationId !== "string") {
    // Leonardo sometimes answers 200 with a GraphQL-style error list instead of an HTTP error
    const msg = findKey(json, "message");
    const code = findKey(json, "code");
    if (typeof msg === "string") throw new Error(`Leonardo rejected the request${typeof code === "string" ? ` (${code})` : ""}: ${msg}`);
    throw new Error(`No generationId in response: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return { generationId, cost: parseCost(json), raw: json };
}

/**
 * API credits per US dollar on this account. Measured 2026-11-14: every balance drop (GET /v1/me) was
 * 669 × the dollar cost Leonardo reported for that generation. Override with LEONARDO_CREDITS_PER_USD.
 */
export const CREDITS_PER_USD = Number(process.env.LEONARDO_CREDITS_PER_USD) || 669;

/**
 * Cost in USD as reported by Leonardo on create. Seen so far:
 *   {"generate":{"apiCreditCost":null,"cost":{"amount":"0.0897","unit":"DOLLARS"}}}
 * Credit-denominated values are converted to USD so every stored cost uses the same unit.
 */
function parseCost(json: unknown): number | null {
  const cost = findKey(json, "cost") as { amount?: unknown; unit?: unknown } | undefined;
  if (cost && typeof cost === "object" && cost.amount != null) {
    const n = Number(cost.amount);
    if (Number.isFinite(n) && n >= 0) return String(cost.unit).toUpperCase() === "CREDITS" ? n / CREDITS_PER_USD : n;
  }
  const credits = Number(findKey(json, "apiCreditCost") ?? NaN);
  if (Number.isFinite(credits) && credits >= 0) return credits / CREDITS_PER_USD;
  return null;
}

/** Remaining API credits on the account (GET /v1/me → apiPaidTokens + apiSubscriptionTokens). */
export async function getBalance(): Promise<number | null> {
  if (isMock()) return null;
  try {
    const res = await fetch(`${BASE}/v1/me`, { headers: headers(false) });
    const json = await readJson(res);
    const u = (json.user_details as Record<string, unknown>[] | undefined)?.[0];
    if (!u) return null;
    const paid = Number(u.apiPaidTokens ?? 0);
    const sub = Number(u.apiSubscriptionTokens ?? 0);
    const total = (Number.isFinite(paid) ? paid : 0) + (Number.isFinite(sub) ? sub : 0);
    return total;
  } catch {
    return null;
  }
}

export type PollResult = {
  status: "PENDING" | "COMPLETE" | "FAILED";
  media: { url: string; type: "image" | "video" }[];
  cost: number | null;
  raw: unknown;
};

export async function getGeneration(id: string): Promise<PollResult> {
  const res = await fetch(`${BASE}/v1/generations/${encodeURIComponent(id)}`, { headers: headers(false) });
  const json = await readJson(res);
  const gen = (json.generations_by_pk ?? json.generation ?? json) as Record<string, unknown>;
  const rawStatus = String(gen.status ?? "PENDING").toUpperCase();
  const status = rawStatus === "COMPLETE" ? "COMPLETE" : rawStatus === "FAILED" ? "FAILED" : "PENDING";
  const imgs = (gen.generated_images ?? gen.images ?? []) as Record<string, unknown>[];
  const media: PollResult["media"] = [];
  for (const im of imgs) {
    const video = im.motionMP4URL ?? im.videoUrl ?? im.motionVideoURL;
    if (typeof video === "string" && video) media.push({ url: video, type: "video" });
    else if (typeof im.url === "string") {
      media.push({ url: im.url, type: /\.(mp4|webm|mov)(\?|$)/i.test(im.url) ? "video" : "image" });
    }
  }
  // GET generation carries no cost field today; keep the lookup in case Leonardo adds one (credits → USD)
  const costRaw = gen.apiCreditCost;
  const cost = costRaw == null ? NaN : Number(costRaw) / CREDITS_PER_USD;
  return { status, media, cost: Number.isFinite(cost) ? cost : null, raw: json };
}

/** Upload a local image via the init-image presigned flow; returns the Leonardo image id. */
export async function uploadImage(filePath: string): Promise<string> {
  if (isMock()) return `mock-upload-${path.basename(filePath)}`;
  let ext = path.extname(filePath).slice(1).toLowerCase();
  if (!["png", "jpg", "jpeg", "webp"].includes(ext)) throw new Error(`Unsupported image type: .${ext}`);
  // normalise ".jpeg" to ".jpg" so the stored init image has the most widely accepted extension
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
  if (ext === "jpeg") ext = "jpg";
  const res = await fetch(`${BASE}/v1/init-image`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ extension: ext }),
  });
  const json = await readJson(res);
  const up = json.uploadInitImage as { url: string; fields: string | Record<string, string>; id: string };
  const fields = typeof up.fields === "string" ? (JSON.parse(up.fields) as Record<string, string>) : up.fields;
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([fs.readFileSync(filePath)], { type: mime }), `${path.basename(filePath, path.extname(filePath))}.${ext}`);
  const s3 = await fetch(up.url, { method: "POST", body: form });
  if (!s3.ok && s3.status !== 204) throw new Error(`Upload to storage failed: ${s3.status} ${await s3.text()}`);
  return up.id;
}

/** Placeholder art for mock mode so the UI can be exercised without spending credits. */
export function mockSvg(opts: { label: string; prompt: string; width: number; height: number; seed: number }) {
  const hue = (opts.seed * 47) % 360;
  const words = opts.prompt.split(/\s+/).slice(0, 14).join(" ");
  const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const w = opts.width;
  const h = opts.height;
  const fs1 = Math.round(w / 14);
  const fs2 = Math.round(w / 34);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue} 55% 38%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 60% 18%)"/>
</linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<circle cx="${w * 0.72}" cy="${h * 0.3}" r="${Math.min(w, h) * 0.22}" fill="hsl(${(hue + 30) % 360} 70% 60% / 0.35)"/>
<text x="${w * 0.06}" y="${h * 0.82}" font-family="system-ui,sans-serif" font-size="${fs1}" font-weight="700" fill="#fff">${esc(opts.label)}</text>
<text x="${w * 0.06}" y="${h * 0.82 + fs2 * 1.8}" font-family="system-ui,sans-serif" font-size="${fs2}" fill="#fff" opacity="0.75">MOCK · ${w}×${h} · ${esc(words.slice(0, 60))}…</text>
</svg>`;
}
