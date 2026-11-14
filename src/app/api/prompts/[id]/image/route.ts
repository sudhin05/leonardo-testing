import { bad, boot, ok, saveUpload } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = boot();
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return bad("file missing");
  try {
    const name = await saveUpload(file, `prompt${id}`);
    d.prepare("UPDATE prompts SET input_image = ?, input_leonardo_id = NULL, input_mode = 'reference' WHERE id = ?").run(name, Number(id));
    return ok({ input_image: name });
  } catch (e) {
    return bad((e as Error).message);
  }
}
