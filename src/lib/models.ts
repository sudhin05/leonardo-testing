/**
 * Model registry — the single place that knows how each Leonardo model wants its request shaped.
 *
 * All models go through POST /api/rest/v2/generations with { model, public, parameters }.
 * Dimensions, quantity and reference-image keys differ per model, so each entry declares them.
 * Anything here can be overridden per model from the Models page (JSON merged into `parameters`).
 *
 * Sources: docs.leonardo.ai per-model guides (read 2026-11-14). Entries marked `verified: false`
 * had no readable guide — their params are best guesses; check the first generation's error if any.
 */

export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9" | "2:3" | "3:2" | "3:4" | "4:3";
export const ASPECT_RATIOS: AspectRatio[] = ["1:1", "4:5", "9:16", "16:9", "2:3", "3:2", "3:4", "4:3"];

export type Dims = { width: number; height: number };

export type ModelDef = {
  key: string; // Leonardo v2 `model` string
  label: string;
  vendor: string;
  kind: "image" | "video";
  blurb: string;
  dims: (ar: AspectRatio) => Dims;
  /** extra params merged into `parameters` by default */
  defaults?: Record<string, unknown>;
  /** name of the field that sets the number of outputs (null = model only supports 1) */
  quantityKey?: string | null;
  maxQuantity?: number;
  /** guidance key used to pass a reference/product image, or null if the model has no image input */
  refGuidance?: string | null;
  refStrength?: string | null;
  defaultEnabled?: boolean;
  verified?: boolean;
};

function ratio(ar: AspectRatio) {
  const [a, b] = ar.split(":").map(Number);
  return a / b;
}

/** Compute dims for ~targetPx pixels, snapped to `multiple`, clamped to [min,max] per edge. */
function free(opts: { targetPx: number; multiple: number; min: number; max: number }) {
  return (ar: AspectRatio): Dims => {
    const r = ratio(ar);
    let w = Math.sqrt(opts.targetPx * r);
    let h = w / r;
    const scale = Math.min(1, opts.max / Math.max(w, h));
    w *= scale;
    h *= scale;
    const snap = (v: number) =>
      Math.min(opts.max, Math.max(opts.min, Math.round(v / opts.multiple) * opts.multiple));
    return { width: snap(w), height: snap(h) };
  };
}

/** Pick from an explicit table, falling back to the closest ratio in the table. */
function table(t: Partial<Record<AspectRatio, Dims>>) {
  return (ar: AspectRatio): Dims => {
    if (t[ar]) return t[ar]!;
    const want = ratio(ar);
    let best: Dims = Object.values(t)[0]!;
    let bestDiff = Infinity;
    for (const d of Object.values(t)) {
      const diff = Math.abs(Math.log(d!.width / d!.height) - Math.log(want));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = d!;
      }
    }
    return best;
  };
}

/** Snap each edge to the closest value from an allowed list. */
function snapList(allowed: number[], targetPx: number) {
  return (ar: AspectRatio): Dims => {
    const r = ratio(ar);
    const w = Math.sqrt(targetPx * r);
    const h = w / r;
    const closest = (v: number) => allowed.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    return { width: closest(w), height: closest(h) };
  };
}

// Gemini / Nano Banana 1K preset sizes (mismatched pairs silently fall back to 1:1 per docs)
const GEMINI_1K: Partial<Record<AspectRatio, Dims>> = {
  "1:1": { width: 1024, height: 1024 },
  "2:3": { width: 848, height: 1264 },
  "3:2": { width: 1264, height: 848 },
  "3:4": { width: 896, height: 1200 },
  "4:3": { width: 1200, height: 896 },
  "4:5": { width: 928, height: 1152 },
  "9:16": { width: 768, height: 1376 },
  "16:9": { width: 1376, height: 768 },
};

const IDEOGRAM_45_EDGES = [
  720, 800, 832, 864, 896, 1024, 1120, 1152, 1248, 1280, 1296, 1440, 1600, 1664, 1728, 1792, 2048, 2240,
  2304, 2496, 2560, 2880, 2944, 3072, 3168, 3328,
];
const RECRAFT_41_EDGES = [
  768, 832, 896, 1024, 1152, 1216, 1280, 1344, 1536, 1664, 1792, 2048, 2304, 2432, 2560, 2688, 3072,
];

const MP1 = 1024 * 1024;

export const MODELS: ModelDef[] = [
  // ───────────── Leonardo native ─────────────
  {
    key: "lucid-origin",
    label: "Lucid Origin",
    vendor: "Leonardo",
    kind: "image",
    blurb: "Leonardo's flagship; strong prompt adherence and in-image text.",
    dims: free({ targetPx: 1.4 * MP1, multiple: 8, min: 16, max: 3840 }),
    defaults: { mode: "FAST", prompt_enhance: "OFF" },
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: "content",
    refStrength: "MID",
    defaultEnabled: true,
    verified: true,
  },
  {
    key: "lucid-realism",
    label: "Lucid Realism",
    vendor: "Leonardo",
    kind: "image",
    blurb: "Photographic look; cinematic lighting and skin texture.",
    dims: free({ targetPx: MP1, multiple: 8, min: 16, max: 2496 }),
    defaults: { mode: "FAST", prompt_enhance: "OFF" },
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: "content",
    refStrength: "MID",
    defaultEnabled: true,
    verified: true,
  },
  {
    key: "phoenix-v1.0",
    label: "Phoenix 1.0",
    vendor: "Leonardo",
    kind: "image",
    blurb: "Mature Leonardo model with image-to-image, character and style guidance.",
    dims: free({ targetPx: MP1, multiple: 8, min: 32, max: 2048 }),
    defaults: { mode: "QUALITY", contrast: "MEDIUM", prompt_enhance: "OFF" },
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: "image_to_image",
    refStrength: "MID",
    defaultEnabled: false,
    verified: true,
  },
  // ───────────── OpenAI ─────────────
  {
    key: "gpt-image-2",
    label: "GPT Image 2",
    vendor: "OpenAI",
    kind: "image",
    blurb: "Very strong typography and layout instruction following.",
    dims: table({
      "1:1": { width: 1024, height: 1024 },
      "2:3": { width: 848, height: 1264 },
      "3:2": { width: 1264, height: 848 },
      "16:9": { width: 1376, height: 768 },
      "9:16": { width: 768, height: 1376 },
      "4:5": { width: 912, height: 1136 },
      "3:4": { width: 880, height: 1184 },
      "4:3": { width: 1184, height: 880 },
    }),
    defaults: { quality: "MEDIUM", prompt_enhance: "OFF" },
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: "image_reference",
    refStrength: null,
    defaultEnabled: true,
    verified: true,
  },
  {
    key: "gpt-image-1.5",
    label: "GPT Image 1.5",
    vendor: "OpenAI",
    kind: "image",
    blurb: "Previous GPT image model; only 1:1, 2:3, 3:2 sizes.",
    dims: table({
      "1:1": { width: 1024, height: 1024 },
      "2:3": { width: 1024, height: 1536 },
      "3:2": { width: 1536, height: 1024 },
    }),
    defaults: { quality: "MEDIUM", prompt_enhance: "OFF" },
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: "image_reference",
    refStrength: "MID",
    defaultEnabled: false,
    verified: true,
  },
  // ───────────── Google ─────────────
  {
    key: "nano-banana-2",
    label: "Nano Banana 2",
    vendor: "Google",
    kind: "image",
    blurb: "Gemini image model; excellent product fidelity when editing with references.",
    dims: table(GEMINI_1K),
    defaults: { prompt_enhance: "OFF" },
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: "image_reference",
    refStrength: "MID",
    defaultEnabled: true,
    verified: true,
  },
  {
    key: "gemini-image-2",
    label: "Nano Banana Pro",
    vendor: "Google",
    kind: "image",
    blurb: "Gemini 'Pro' image model; higher quality text and composition.",
    dims: table(GEMINI_1K),
    defaults: { prompt_enhance: "OFF" },
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: "image_reference",
    refStrength: "MID",
    defaultEnabled: true,
    verified: true,
  },
  // ───────────── Black Forest Labs ─────────────
  {
    key: "flux-pro-2.0",
    label: "FLUX.2 Pro",
    vendor: "Black Forest Labs",
    kind: "image",
    blurb: "Photoreal product shots; multi-reference editing.",
    dims: table({
      "1:1": { width: 1440, height: 1440 },
      "2:3": { width: 960, height: 1440 },
      "3:2": { width: 1440, height: 960 },
      "16:9": { width: 1440, height: 810 },
      "9:16": { width: 810, height: 1440 },
      "4:5": { width: 1152, height: 1440 },
      "3:4": { width: 1080, height: 1440 },
      "4:3": { width: 1440, height: 1080 },
    }),
    defaults: {},
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: "image_reference",
    refStrength: "MID",
    defaultEnabled: true,
    verified: true,
  },
  {
    key: "flux-kontext-pro",
    label: "FLUX.1 Kontext Pro",
    vendor: "Black Forest Labs",
    kind: "image",
    blurb: "Instruction-based image editing — good for background swaps.",
    dims: free({ targetPx: MP1, multiple: 8, min: 32, max: 2048 }),
    defaults: {},
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: "image_reference",
    refStrength: "MID",
    defaultEnabled: false,
    verified: true,
  },
  // ───────────── ByteDance ─────────────
  {
    key: "seedream-4.5",
    label: "Seedream 4.5",
    vendor: "ByteDance",
    kind: "image",
    blurb: "Strong photoreal + poster text; up to 6 references.",
    dims: free({ targetPx: 1.2 * MP1, multiple: 16, min: 256, max: 1440 }),
    defaults: { prompt_enhance: "OFF" },
    quantityKey: "quantity",
    maxQuantity: 6,
    refGuidance: "image_reference",
    refStrength: "MID",
    defaultEnabled: true,
    verified: true,
  },
  {
    key: "seedream-5.0-pro",
    label: "Seedream 5.0 Pro",
    vendor: "ByteDance",
    kind: "image",
    blurb: "Newest Seedream; high resolution, up to 10 references.",
    dims: free({ targetPx: 2.2 * MP1, multiple: 16, min: 768, max: 2048 }),
    defaults: { output_format: "png" },
    quantityKey: "quantity",
    maxQuantity: 6,
    refGuidance: "image_reference",
    refStrength: "MID",
    defaultEnabled: false,
    verified: true,
  },
  // ───────────── Ideogram ─────────────
  {
    key: "ideogram/ideogram-4.5",
    label: "Ideogram 4.5",
    vendor: "Ideogram",
    kind: "image",
    blurb: "Typography specialist — posters, badges, flyers.",
    dims: snapList(IDEOGRAM_45_EDGES, MP1),
    defaults: { quality: "MEDIUM", prompt_enhance: "OFF" },
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: "image_reference",
    refStrength: null,
    defaultEnabled: true,
    verified: true,
  },
  {
    key: "ideogram-v3.0",
    label: "Ideogram 3.0",
    vendor: "Ideogram",
    kind: "image",
    blurb: "Previous Ideogram; text-to-image only via API.",
    dims: free({ targetPx: MP1, multiple: 16, min: 512, max: 2048 }),
    defaults: { quality: "BALANCED", prompt_enhance: "OFF" },
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: null,
    defaultEnabled: false,
    verified: true,
  },
  // ───────────── Recraft ─────────────
  {
    key: "recraft/recraft-4.1",
    label: "Recraft 4.1",
    vendor: "Recraft",
    kind: "image",
    blurb: "Design/vector-style graphics; accepts brand colour palette.",
    dims: snapList(RECRAFT_41_EDGES, MP1),
    defaults: { prompt_enhance: "OFF" },
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: null,
    defaultEnabled: true,
    verified: true,
  },
  // ───────────── Video (phase 2 — wired but off by default) ─────────────
  {
    key: "kling-3.0",
    label: "Kling 3.0",
    vendor: "Kuaishou",
    kind: "video",
    blurb: "Text/image-to-video, 3–15s, native audio.",
    dims: table({
      "16:9": { width: 1920, height: 1080 },
      "9:16": { width: 1080, height: 1920 },
      "1:1": { width: 1440, height: 1440 },
    }),
    defaults: { duration: 5, mode: "RESOLUTION_1080", motion_has_audio: false },
    quantityKey: null,
    refGuidance: "start_frame",
    refStrength: null,
    defaultEnabled: false,
    verified: true,
  },
  {
    key: "veo-3.1-fast-generate-001",
    label: "Veo 3.1 Fast",
    vendor: "Google",
    kind: "video",
    blurb: "4/6/8s clips with audio.",
    dims: table({
      "16:9": { width: 1280, height: 720 },
      "9:16": { width: 720, height: 1280 },
    }),
    defaults: { duration: 8, motion_has_audio: false, quantity: 1 },
    quantityKey: null,
    refGuidance: "start_frame",
    refStrength: null,
    defaultEnabled: false,
    verified: true,
  },
  {
    key: "seedance-2.0",
    label: "Seedance 2.0",
    vendor: "ByteDance",
    kind: "video",
    blurb: "4–15s, strong motion; start/end frame + references.",
    dims: table({
      "16:9": { width: 1280, height: 720 },
      "9:16": { width: 720, height: 1280 },
      "1:1": { width: 960, height: 960 },
    }),
    defaults: { duration: 5, mode: "RESOLUTION_720", motion_has_audio: false, quantity: 1 },
    quantityKey: null,
    refGuidance: "start_frame",
    refStrength: null,
    defaultEnabled: false,
    verified: true,
  },
  {
    key: "motion_2.0",
    label: "Motion 2.0",
    vendor: "Leonardo",
    kind: "video",
    blurb: "Leonardo's video model; image-to-video via start frame.",
    dims: table({
      "16:9": { width: 1280, height: 720 },
      "9:16": { width: 720, height: 1280 },
      "4:5": { width: 576, height: 720 },
    }),
    defaults: { prompt_enhance: "OFF", quantity: 1 },
    quantityKey: null,
    refGuidance: "start_frame",
    refStrength: null,
    defaultEnabled: false,
    verified: true,
  },
];

export const MODEL_MAP = new Map(MODELS.map((m) => [m.key, m]));

/** A custom model (raw model string added on the Models page) — uses generic sizing. */
export function customModel(key: string, kind: "image" | "video" = "image"): ModelDef {
  return {
    key,
    label: key,
    vendor: "Custom",
    kind,
    blurb: "Custom model string — configure parameters via overrides.",
    dims: free({ targetPx: MP1, multiple: 16, min: 256, max: 2048 }),
    defaults: {},
    quantityKey: "quantity",
    maxQuantity: 8,
    refGuidance: "image_reference",
    refStrength: "MID",
    defaultEnabled: true,
    verified: false,
  };
}

export type BuildInput = {
  model: ModelDef;
  prompt: string;
  aspectRatio: AspectRatio;
  quantity: number;
  referenceImageId?: string | null;
  overrides?: Record<string, unknown>;
};

/** Build the v2 request body for a model. */
export function buildRequest({ model, prompt, aspectRatio, quantity, referenceImageId, overrides }: BuildInput) {
  const { width, height } = model.dims(aspectRatio);
  const parameters: Record<string, unknown> = {
    prompt,
    width,
    height,
    ...(model.defaults ?? {}),
  };
  if (model.quantityKey) {
    parameters[model.quantityKey] = Math.max(1, Math.min(quantity, model.maxQuantity ?? 8));
  }
  if (referenceImageId && model.refGuidance) {
    const item: Record<string, unknown> = { image: { id: referenceImageId, type: "UPLOADED" } };
    if (model.refStrength) item.strength = model.refStrength;
    parameters.guidances = { [model.refGuidance]: [item] };
  }
  if (overrides) Object.assign(parameters, overrides);
  return { model: model.key, public: false, parameters };
}
