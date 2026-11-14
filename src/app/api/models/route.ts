import { bad, boot, ok } from "@/lib/server";
import { deleteCustomModel, listModels, upsertModelSetting } from "@/lib/registry";
import { ASPECT_RATIOS, MODEL_MAP, buildRequest, customModel } from "@/lib/models";

export const dynamic = "force-dynamic";

export async function GET() {
  boot();
  const models = listModels().map((m) => {
    // include a sample request so the Models page can show exactly what gets sent
    const def = MODEL_MAP.get(m.key) ?? customModel(m.key, m.kind);
    let overrides: Record<string, unknown> | undefined;
    try {
      overrides = m.overrides.trim() ? JSON.parse(m.overrides) : undefined;
    } catch {
      overrides = undefined;
    }
    const sizes = Object.fromEntries(ASPECT_RATIOS.map((ar) => [ar, def.dims(ar)]));
    const sample = buildRequest({ model: def, prompt: "<prompt>", aspectRatio: "1:1", quantity: 1, overrides });
    return { ...m, sizes, sample };
  });
  return ok(models);
}

export async function PATCH(req: Request) {
  boot();
  const b = await req.json();
  if (!b.key) return bad("key required");
  if (b.overrides !== undefined && String(b.overrides).trim()) {
    try {
      const v = JSON.parse(b.overrides);
      if (typeof v !== "object" || Array.isArray(v)) throw new Error();
    } catch {
      return bad("Overrides must be a JSON object, e.g. {\"quality\": \"HIGH\"}");
    }
  }
  upsertModelSetting(b.key, { enabled: b.enabled, overrides: b.overrides });
  return ok({ ok: true });
}

export async function POST(req: Request) {
  boot();
  const b = await req.json();
  const key = String(b.key ?? "").trim();
  if (!key) return bad("Model string required");
  if (MODEL_MAP.has(key)) return bad("That model is already in the registry");
  upsertModelSetting(key, { enabled: true, custom: true, kind: b.kind === "video" ? "video" : "image" });
  return ok({ ok: true });
}

export async function DELETE(req: Request) {
  boot();
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return bad("key required");
  deleteCustomModel(key);
  return ok({ ok: true });
}
