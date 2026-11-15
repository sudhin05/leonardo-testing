import { bad, boot, ok } from "@/lib/server";
import { buildRequest, type AspectRatio } from "@/lib/models";
import { getModelDef, getOverrides } from "@/lib/registry";
import { leonardoIdFor } from "@/lib/refs";

export const dynamic = "force-dynamic";

type PromptRow = {
  id: number;
  prompt: string;
  aspect_ratio: string;
  input_mode: string;
  input_image: string | null;
  input_leonardo_id: string | null;
  kind: string;
  product_id: number | null;
  ref_image: string | null;
  ref_leonardo_id: string | null;
  test_id: string;
};

/** Queue generations: every selected prompt × every selected model. The worker submits them. */
export async function POST(req: Request) {
  const d = boot();
  const b = (await req.json()) as { promptIds: number[]; modelKeys: string[]; quantity?: number };
  if (!b.promptIds?.length) return bad("Pick at least one prompt");
  if (!b.modelKeys?.length) return bad("Pick at least one model");
  const quantity = Math.max(1, Math.min(8, Number(b.quantity ?? 1)));
  const warnings: string[] = [];
  let queued = 0;

  const getPrompt = d.prepare(
    `SELECT p.*, pr.ref_image, pr.ref_leonardo_id FROM prompts p LEFT JOIN products pr ON pr.id = p.product_id WHERE p.id = ?`,
  );
  const insRun = d.prepare("INSERT INTO runs (prompt_id, prompt_text, aspect_ratio, quantity) VALUES (?, ?, ?, ?)");
  const insGen = d.prepare(
    "INSERT INTO generations (run_id, prompt_id, model_key, status, request, width, height, error, ref_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );

  for (const pid of b.promptIds) {
    const p = getPrompt.get(pid) as unknown as PromptRow | undefined;
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

    const run = insRun.run(p.id, p.prompt, p.aspect_ratio, quantity);
    const runId = Number(run.lastInsertRowid);

    for (const key of b.modelKeys) {
      const def = getModelDef(key);
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
        overrides: getOverrides(key),
      });
      const params = request.parameters as { width?: number; height?: number };
      if (refId && !def.refGuidance) {
        insGen.run(runId, p.id, key, "skipped", JSON.stringify(request), params.width ?? null, params.height ?? null, "Model has no image-reference input", null);
        continue;
      }
      insGen.run(runId, p.id, key, "queued", JSON.stringify(request), params.width ?? null, params.height ?? null, null, refId ? refFile : null);
      queued++;
    }
  }
  return ok({ queued, warnings });
}
