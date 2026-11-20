import { all, run } from "./db";
import { MODELS, MODEL_MAP, customModel, type ModelDef } from "./models";

type SettingRow = { key: string; enabled: number; overrides: string; custom: number; custom_kind: string };

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
};

async function settingsMap() {
  const rows = await all<SettingRow>("SELECT * FROM model_settings");
  return new Map(rows.map((r) => [r.key, r]));
}

export async function getModelDef(key: string): Promise<ModelDef | null> {
  const known = MODEL_MAP.get(key);
  if (known) return known;
  const s = (await settingsMap()).get(key);
  if (s?.custom) return customModel(key, s.custom_kind === "video" ? "video" : "image");
  return null;
}

export async function getOverrides(key: string): Promise<Record<string, unknown> | undefined> {
  const s = (await settingsMap()).get(key);
  if (!s?.overrides?.trim()) return undefined;
  try {
    return JSON.parse(s.overrides);
  } catch {
    return undefined;
  }
}

/** Label for a model key without hitting the database (custom models fall back to their key). */
export function labelOf(key: string) {
  const m = MODEL_MAP.get(key);
  return { label: m?.label ?? key, vendor: m?.vendor ?? "Custom" };
}

export async function listModels(): Promise<ModelInfo[]> {
  const sm = await settingsMap();
  const out: ModelInfo[] = [];
  const toInfo = (m: ModelDef, s?: SettingRow): ModelInfo => ({
    key: m.key,
    label: m.label,
    vendor: m.vendor,
    kind: m.kind,
    blurb: m.blurb,
    enabled: s ? !!s.enabled : !!m.defaultEnabled,
    overrides: s?.overrides ?? "",
    custom: !!s?.custom,
    supportsReference: !!m.refGuidance,
    verified: m.verified !== false,
  });
  for (const m of MODELS) out.push(toInfo(m, sm.get(m.key)));
  for (const s of sm.values()) {
    if (s.custom && !MODEL_MAP.has(s.key)) out.push(toInfo(customModel(s.key, s.custom_kind === "video" ? "video" : "image"), s));
  }
  return out;
}

export async function upsertModelSetting(key: string, patch: { enabled?: boolean; overrides?: string; custom?: boolean; kind?: string }) {
  const existing = (await settingsMap()).get(key);
  const known = MODEL_MAP.get(key);
  const enabled = patch.enabled ?? (existing ? !!existing.enabled : known ? !!known.defaultEnabled : true);
  const overrides = patch.overrides ?? existing?.overrides ?? "";
  const custom = patch.custom ?? !!existing?.custom;
  const kind = patch.kind ?? existing?.custom_kind ?? "image";
  await run(
    `INSERT INTO model_settings (key, enabled, overrides, custom, custom_kind) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, overrides = excluded.overrides, custom = excluded.custom, custom_kind = excluded.custom_kind`,
    [key, enabled ? 1 : 0, overrides, custom ? 1 : 0, kind],
  );
}

export async function deleteCustomModel(key: string) {
  await run("DELETE FROM model_settings WHERE key = ? AND custom = 1", [key]);
}
