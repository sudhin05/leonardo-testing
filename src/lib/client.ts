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
};

export type Generation = {
  id: number;
  run_id: number;
  model_key: string;
  status: "queued" | "submitting" | "pending" | "complete" | "failed" | "skipped";
  error: string | null;
  credit_cost: number | null;
  width: number | null;
  height: number | null;
  mock: number;
  created_at: string;
  run_created_at: string;
  latency_ms: number | null;
  quantity: number;
  params: Record<string, unknown>;
  outputs: Output[];
};

export const ACTIVE = new Set(["queued", "submitting", "pending"]);

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

export function fmtNum(v: number | null | undefined, digits = 1) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(digits);
}

export const SCORE_DIMS = [
  { key: "text_accuracy", short: "Text", label: "Text Accuracy" },
  { key: "realism", short: "Real", label: "Product Realism" },
  { key: "color", short: "Color", label: "Brand Colour Adherence" },
] as const;
