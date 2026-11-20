import { run } from "@/lib/db";
import { bad, handle, me, ok, saveUpload } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await me();
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return bad("file missing");
  try {
    const name = await saveUpload(file, `product${id}`);
    await run("UPDATE products SET ref_image = ?, ref_leonardo_id = NULL WHERE id = ?", [name, Number(id)]);
    return ok({ ref_image: name });
  } catch (e) {
    return bad((e as Error).message);
  }
});
