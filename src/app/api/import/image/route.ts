import { bad, handle, me, ok, saveUpload } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One reference image per request (hosted platforms cap a request body at ~4.5 MB).
 * Returns the stored name; the sheet import then refers to it.
 */
export const POST = handle(async (req: Request) => {
  await me();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return bad("file missing");
  try {
    return ok({ name: file.name, stored: await saveUpload(file, "ref") });
  } catch (e) {
    return bad(`${file.name}: ${(e as Error).message}`);
  }
});
