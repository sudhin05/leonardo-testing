import { bad, boot, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const d = boot();
  return ok(d.prepare("SELECT * FROM products ORDER BY sku").all());
}

export async function POST(req: Request) {
  const d = boot();
  const b = await req.json();
  if (!b.sku || !b.name) return bad("sku and name are required");
  const r = d
    .prepare("INSERT INTO products (sku, name, category, notes) VALUES (?, ?, ?, ?)")
    .run(String(b.sku), String(b.name), String(b.category ?? ""), String(b.notes ?? ""));
  return ok({ id: Number(r.lastInsertRowid) });
}
