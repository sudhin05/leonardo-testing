import { bad, boot, ok, saveUpload } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = boot();
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return bad("file missing");
  try {
    const name = await saveUpload(file, `product${id}`);
    d.prepare("UPDATE products SET ref_image = ?, ref_leonardo_id = NULL WHERE id = ?").run(name, Number(id));
    return ok({ ref_image: name });
  } catch (e) {
    return bad((e as Error).message);
  }
}
