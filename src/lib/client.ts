// Client-side types + helpers (no server imports here).

export type Product = {
  id: number;
  sku: string;
  name: string;
  category: string;
  notes: string;
  ref_image: string | null;
};

export type Prompt = {
  id: number;
  test_id: string;
  ad_category: string;
  product_id: number | null;
  prompt: string;
  aspect_ratio: string;
  criteria: string;
  input_mode: "text" | "reference";
  input_image: string | null;
  kind: "image" | "video";
  sku: string | null;
  product_name: string | null;
  product_ref_image: string | null;
  done: number;
  running: number;
  models_done: number;
  votes?: number;
  created_by_name?: string | null;
};

export type ModelInfo = {
  key: string;
  label: string;
  vendor: string;
  kind: "image" | "video";
  blurb: string;
  enabled: boolean;
  overrides: string;
  custom: boolean;
  supportsReference: boolean;
  verified: boolean;
  sizes: Record<string, { width: number; height: number }>;
  sample: unknown;
};

export type Vote = {
  output_id: number;
  user_id: number;
  name: string;
  text_accuracy: number | null;
  realism: number | null;
  color: number | null;
  keep: number | null;
  notes: string | null;
  updated_at: string;
};

/** An output; text_accuracy…notes are the signed-in person's own vote, `votes` is everyone's. */
export type Output = {
  id: number;
  generation_id: number;
  idx: number;
  local_path: string | null;
  remote_url: string | null;
  media_type: "image" | "video";
  text_accuracy: number | null;
  realism: number | null;
  color: number | null;
  keep: number | null;
  notes: string | null;
  votes?: Vote[];
};

export type TestRun = {
  id: number;
  name: string;
  notes: string;
  created_at: string;
  created_by_name: string | null;
  prompts: number;
  generations: number;
  outputs: number;
  votes: number;
  spent: number;
  last_activity: string | null;
};

export type Me = { id: number; name: string };

let meCache: Promise<Me | null> | null = null;
/** The signed-in team member (cached for the page's lifetime). */
export function getMe(): Promise<Me | null> {
  meCache ??= fetch("/api/auth/me", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
    .catch(() => null);
  return meCache;
}

/** Keep / reject counts from a list of votes. */
export function tally(votes: Vote[] | undefined) {
  const v = votes ?? [];
  const keep = v.filter((x) => x.keep === 1).length;
  const reject = v.filter((x) => x.keep === 0).length;
  const scores = v.flatMap((x) => [x.text_accuracy, x.realism, x.color].filter((s): s is number => s != null));
  return { n: v.length, keep, reject, avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

export type Generation = {
  id: number;
  run_id: number;
  model_key: string;
  status: "queued" | "submitting" | "pending" | "completing" | "complete" | "failed" | "skipped";
  error: string | null;
  credit_cost: number | null;
  cost_source: "api" | "measured" | "estimate" | "mock" | null;
  ref_image: string | null;
  width: number | null;
  height: number | null;
  mock: number;
  created_at: string;
  run_created_at: string;
  run_by?: string | null;
  latency_ms: number | null;
  quantity: number;
  params: Record<string, unknown>;
  outputs: Output[];
};

export const ACTIVE = new Set(["queued", "submitting", "pending", "completing"]);

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "content-type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function mediaSrc(o: { local_path: string | null; remote_url: string | null }) {
  if (o.local_path) return `/api/media/${o.local_path}`;
  return o.remote_url ?? "";
}

export function uploadSrc(name: string | null | undefined) {
  return name ? `/api/media/uploads/${name}` : "";
}

export function aspectCss(ar: string) {
  const [a, b] = ar.split(":");
  return `${a} / ${b}`;
}

export function fmtMs(ms: number | null | undefined) {
  if (ms == null) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** US dollars: $0.090 for small amounts, $12.34 for totals. */
export function fmtUsd(v: number | null | undefined, digits?: number) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const d = digits ?? (Math.abs(v) < 1 ? 3 : 2);
  return `$${Number(v).toFixed(d)}`;
}

/** Cost of one generation in USD ("$0.090", "~$0.090" when estimated, "—" unknown) plus a tooltip saying where it came from. */
export function fmtCost(cost: number | null | undefined, source?: string | null) {
  if (cost == null) return { text: "—", title: "Cost unknown — Leonardo didn't report it and the balance change couldn't be measured" };
  const title =
    source === "api"
      ? "Cost reported by Leonardo for this call"
      : source === "measured"
        ? "Measured from your account balance before/after submitting (credits ÷ 669 per USD)"
        : source === "estimate"
          ? "Estimated from earlier calls with identical settings"
          : source === "mock"
            ? "Simulated (mock mode)"
            : "Cost in USD";
  return { text: (source === "estimate" ? "~" : "") + fmtUsd(cost), title };
}

export function fmtNum(v: number | null | undefined, digits = 1) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(digits);
}

export const SCORE_DIMS = [
  { key: "text_accuracy", short: "Text", label: "Text Accuracy" },
  { key: "realism", short: "Real", label: "Product Realism" },
  { key: "color", short: "Color", label: "Brand Colour Adherence" },
] as const;
