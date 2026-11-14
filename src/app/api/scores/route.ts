import { bad, boot, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

const clamp = (v: unknown) => (v === null || v === undefined || v === "" ? null : Math.max(1, Math.min(5, Math.round(Number(v)))));

export async function PUT(req: Request) {
  const d = boot();
  const b = await req.json();
  const outputId = Number(b.outputId);
  if (!outputId) return bad("outputId required");
  const cur = (d.prepare("SELECT * FROM scores WHERE output_id = ?").get(outputId) ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (k in b ? b[k] : cur[k]);
  d.prepare(
    `INSERT INTO scores (output_id, text_accuracy, realism, color, keep, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(output_id) DO UPDATE SET text_accuracy = excluded.text_accuracy, realism = excluded.realism, color = excluded.color,
       keep = excluded.keep, notes = excluded.notes, updated_at = excluded.updated_at`,
  ).run(
    outputId,
    clamp(pick("text_accuracy")),
    clamp(pick("realism")),
    clamp(pick("color")),
    pick("keep") === null || pick("keep") === undefined ? null : pick("keep") ? 1 : 0,
    String(pick("notes") ?? ""),
  );
  return ok({ ok: true });
}
