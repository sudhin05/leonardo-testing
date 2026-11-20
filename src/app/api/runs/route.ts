import { after } from "next/server";
import { get, run } from "@/lib/db";
import { bad, handle, me, ok } from "@/lib/server";
import { buildRequest, type AspectRatio } from "@/lib/models";
import { getModelDef, getOverrides } from "@/lib/registry";
import { leonardoIdFor } from "@/lib/refs";
import { tick } from "@/lib/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PromptRow = {
  id: number;
  prompt: string;
  aspect_ratio: string;
  input_mode: string;
  input_image: string | null;
  kind: string;
  product_id: number | null;
  ref_image: string | null;
  test_id: string;
};

/** Queue generations: every selected prompt × every selected model. Worker ticks submit them. */
export const POST = handle(async (req: Request) => {
  const user = await me();
  const b = (await req.json()) as { promptIds: number[]; modelKeys: string[]; quantity?: number };
  if (!b.promptIds?.length) return bad("Pick at least one prompt");
  if (!b.modelKeys?.length) return bad("Pick at least one model");
  const quantity = Math.max(1, Math.min(8, Number(b.quantity ?? 1)));
  const warnings: string[] = [];
  let queued = 0;

  for (const pid of b.promptIds) {
    const p = await get<PromptRow>(
      "SELECT p.*, pr.ref_image FROM prompts p LEFT JOIN products pr ON pr.id = p.product_id WHERE p.id = ?",
      [pid],
    );
    if (!p) continue;

    // Resolve the reference image (prompt-level upload wins over the product's image), uploading once and caching the id.
    let refId: string | null = null;
    let refFile: string | null = null;
    if (p.input_mode === "reference") {
      try {
        refFile = p.input_image ?? (p.product_id ? p.ref_image : null);
        if (refFile) {
          refId = await leonardoIdFor(refFile);
        } else {
          warnings.push(`${p.test_id}: needs a reference image — upload one on the prompt or its product. Skipped.`);
          continue;
        }
      } catch (e) {
        warnings.push(`${p.test_id}: image upload failed — ${(e as Error).message}`);
        continue;
      }
    }

    const runId = (
      await run("INSERT INTO runs (prompt_id, prompt_text, aspect_ratio, quantity, created_by) VALUES (?, ?, ?, ?, ?)", [
        p.id,
        p.prompt,
        p.aspect_ratio,
        quantity,
        user.uid,
      ])
    ).id;

    for (const key of b.modelKeys) {
      const def = await getModelDef(key);
      if (!def) {
        warnings.push(`Unknown model ${key}`);
        continue;
      }
      if (def.kind !== (p.kind === "video" ? "video" : "image")) continue; // image prompts → image models only
      const request = buildRequest({
        model: def,
        prompt: p.prompt,
        aspectRatio: p.aspect_ratio as AspectRatio,
        quantity,
        referenceImageId: refId,
        overrides: await getOverrides(key),
      });
      const params = request.parameters as { width?: number; height?: number };
      const skip = !!refId && !def.refGuidance;
      await run(
        "INSERT INTO generations (run_id, prompt_id, model_key, status, request, width, height, error, ref_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          runId,
          p.id,
          key,
          skip ? "skipped" : "queued",
          JSON.stringify(request),
          params.width ?? null,
          params.height ?? null,
          skip ? "Model has no image-reference input" : null,
          skip ? null : refId ? refFile : null,
        ],
      );
      if (!skip) queued++;
    }
  }
  if (queued) after(() => tick());
  return ok({ queued, warnings });
});
