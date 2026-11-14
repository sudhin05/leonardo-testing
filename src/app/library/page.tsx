"use client";

import { useCallback, useEffect, useState } from "react";
import { FileUp, ImagePlus, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { api, uploadSrc, type Product, type Prompt } from "@/lib/client";

const ARS = ["1:1", "4:5", "9:16", "16:9", "2:3", "3:2", "3:4", "4:3"];

type Draft = Partial<Prompt> & { id?: number };

export default function LibraryPage() {
  const [tab, setTab] = useState<"prompts" | "products">("prompts");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  const [importing, setImporting] = useState<"prompts" | "products" | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [p, pr] = await Promise.all([api<Prompt[]>("/api/prompts"), api<Product[]>("/api/products")]);
    setPrompts(p);
    setProducts(pr);
    return p;
  }, []);

  useEffect(() => {
    load().then((p) => {
      const id = Number(new URLSearchParams(window.location.search).get("edit"));
      const hit = p.find((x) => x.id === id);
      if (hit) setEdit(hit);
    });
  }, [load]);

  const savePrompt = async (d: Draft) => {
    try {
      if (d.id) await api(`/api/prompts/${d.id}`, { method: "PATCH", json: d });
      else await api("/api/prompts", { method: "POST", json: d });
      setEdit(null);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const saveProduct = async (d: Partial<Product>) => {
    try {
      if (d.id) await api(`/api/products/${d.id}`, { method: "PATCH", json: d });
      else await api("/api/products", { method: "POST", json: d });
      setEditProduct(null);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const uploadProductImage = async (id: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api(`/api/products/${id}/image`, { method: "POST", body: fd });
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Library</h1>
          <p className="text-sm text-muted">The prompt sheet and the products (SKUs) it tests. Import your team&apos;s sheet as CSV.</p>
        </div>
        <div className="ml-auto flex rounded-lg border border-line bg-panel p-0.5 text-sm">
          {(["prompts", "products"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 capitalize ${tab === t ? "bg-panel-3 text-ink" : "text-muted hover:text-ink"}`}
            >
              {t} ({t === "prompts" ? prompts.length : products.length})
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-sm text-warn">
          {msg}
          <button onClick={() => setMsg("")} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() =>
            tab === "prompts"
              ? setEdit({ test_id: `P-${String(prompts.length + 1).padStart(2, "0")}`, aspect_ratio: "1:1", input_mode: "text", kind: "image" })
              : setEditProduct({ sku: `SKU-${String(products.length + 1).padStart(2, "0")}` })
          }
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus size={15} /> New {tab === "prompts" ? "prompt" : "product"}
        </button>
        <button
          onClick={() => setImporting(tab)}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-muted hover:border-line-2 hover:text-ink"
        >
          <FileUp size={15} /> Import CSV
        </button>
      </div>

      {tab === "prompts" ? (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
                <th className="px-4 py-3">Test</th>
                <th className="px-4 py-3">Category / SKU</th>
                <th className="px-4 py-3">Prompt</th>
                <th className="px-4 py-3">Format</th>
                <th className="px-4 py-3">Results</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr key={p.id} className="border-b border-line/60 align-top last:border-0 hover:bg-panel-2">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-accent-2">{p.test_id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.ad_category || "—"}</div>
                    <div className="text-xs text-faint">{p.sku ? `${p.sku} · ${p.product_name}` : "No product"}</div>
                  </td>
                  <td className="max-w-xl px-4 py-3">
                    <p className="line-clamp-2 text-muted">{p.prompt}</p>
                    {p.criteria && <p className="mt-1 line-clamp-1 text-xs text-faint">✓ {p.criteria}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                    <div className="font-mono">{p.aspect_ratio}</div>
                    <div>{p.input_mode === "reference" ? "Image → Image" : `Text → ${p.kind === "video" ? "Video" : "Image"}`}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    <a href={`/?p=${p.id}`} className="hover:text-ink">
                      {p.models_done} models →
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <IconBtn onClick={() => setEdit(p)} title="Edit">
                        <Pencil size={14} />
                      </IconBtn>
                      <IconBtn
                        title="Delete"
                        onClick={async () => {
                          if (!confirm(`Delete ${p.test_id} and all its generations?`)) return;
                          await api(`/api/prompts/${p.id}`, { method: "DELETE" });
                          void load();
                        }}
                      >
                        <Trash2 size={14} />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {products.map((p) => (
            <div key={p.id} className="flex gap-3 rounded-xl border border-line bg-panel p-3">
              <label className="checker relative h-28 w-28 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-dashed border-line-2 hover:border-accent">
                {p.ref_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploadSrc(p.ref_image)} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-[10px] text-muted">
                    <ImagePlus size={16} />
                    Reference
                    <br />
                    image
                  </span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadProductImage(p.id, e.target.files[0])}
                />
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-2">{p.sku}</span>
                  <div className="ml-auto flex gap-1">
                    <IconBtn onClick={() => setEditProduct(p)} title="Edit">
                      <Pencil size={13} />
                    </IconBtn>
                    <IconBtn
                      title="Delete"
                      onClick={async () => {
                        if (!confirm(`Delete ${p.sku}? Prompts linked to it are kept but unlinked.`)) return;
                        await api(`/api/products/${p.id}`, { method: "DELETE" });
                        void load();
                      }}
                    >
                      <Trash2 size={13} />
                    </IconBtn>
                  </div>
                </div>
                <div className="mt-1 text-sm font-medium leading-snug">{p.name}</div>
                <div className="text-xs text-faint">{p.category}</div>
                {p.notes && <p className="mt-1 line-clamp-2 text-xs text-muted">{p.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && <PromptForm draft={edit} products={products} onCancel={() => setEdit(null)} onSave={savePrompt} />}
      {editProduct && <ProductForm draft={editProduct} onCancel={() => setEditProduct(null)} onSave={saveProduct} />}
      {importing && (
        <ImportDialog
          kind={importing}
          onClose={() => setImporting(null)}
          onDone={(m) => {
            setImporting(null);
            setMsg(m);
            void load();
          }}
        />
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="rounded-md p-1.5 text-muted hover:bg-panel-3 hover:text-ink">
      {children}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line-2 bg-panel p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="ml-auto text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const input = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none focus:border-accent/60";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

function PromptForm({ draft, products, onCancel, onSave }: { draft: Draft; products: Product[]; onCancel: () => void; onSave: (d: Draft) => void }) {
  const [d, setD] = useState<Draft>(draft);
  const set = (patch: Draft) => setD((c) => ({ ...c, ...patch }));
  return (
    <Modal title={draft.id ? `Edit ${draft.test_id}` : "New prompt"} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Test ID">
          <input className={input} value={d.test_id ?? ""} onChange={(e) => set({ test_id: e.target.value })} />
        </Field>
        <Field label="Ad category">
          <input className={input} value={d.ad_category ?? ""} onChange={(e) => set({ ad_category: e.target.value })} placeholder="Hero Product Studio Shot" />
        </Field>
        <Field label="Target product">
          <select className={input} value={d.product_id ?? ""} onChange={(e) => set({ product_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">— none —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Aspect ratio">
          <select className={input} value={d.aspect_ratio ?? "1:1"} onChange={(e) => set({ aspect_ratio: e.target.value })}>
            {ARS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Input" hint="Image → Image sends the product/prompt reference image to models that accept one.">
          <select className={input} value={d.input_mode ?? "text"} onChange={(e) => set({ input_mode: e.target.value as Prompt["input_mode"] })}>
            <option value="text">Text only</option>
            <option value="reference">Text + reference image</option>
          </select>
        </Field>
        <Field label="Output">
          <select className={input} value={d.kind ?? "image"} onChange={(e) => set({ kind: e.target.value as Prompt["kind"] })}>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </Field>
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Prompt">
          <textarea className={input} rows={6} value={d.prompt ?? ""} onChange={(e) => set({ prompt: e.target.value })} />
        </Field>
        <Field label="What to evaluate (pass / fail criteria)">
          <textarea className={input} rows={2} value={d.criteria ?? ""} onChange={(e) => set({ criteria: e.target.value })} />
        </Field>
        {draft.id && d.input_image && (
          <div className="flex items-center gap-3 text-xs text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={uploadSrc(d.input_image)} alt="" className="checker h-14 w-14 rounded object-contain" />
            Prompt-specific reference image attached.
            <button className="text-bad" onClick={() => set({ input_image: null, ...({ clearImage: true } as object) })}>
              Remove
            </button>
          </div>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
        <button onClick={() => onSave(d)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
          Save
        </button>
      </div>
    </Modal>
  );
}

function ProductForm({ draft, onCancel, onSave }: { draft: Partial<Product>; onCancel: () => void; onSave: (d: Partial<Product>) => void }) {
  const [d, setD] = useState(draft);
  const set = (patch: Partial<Product>) => setD((c) => ({ ...c, ...patch }));
  return (
    <Modal title={draft.id ? `Edit ${draft.sku}` : "New product"} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="SKU">
          <input className={input} value={d.sku ?? ""} onChange={(e) => set({ sku: e.target.value })} />
        </Field>
        <Field label="Category">
          <input className={input} value={d.category ?? ""} onChange={(e) => set({ category: e.target.value })} />
        </Field>
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Product name">
          <input className={input} value={d.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Notes (why we test it)">
          <textarea className={input} rows={3} value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <p className="text-xs text-faint">Upload the reference image from the product card after saving.</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
        <button onClick={() => onSave(d)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
          Save
        </button>
      </div>
    </Modal>
  );
}

function ImportDialog({ kind, onClose, onDone }: { kind: "prompts" | "products"; onClose: () => void; onDone: (msg: string) => void }) {
  const [csv, setCsv] = useState("");
  const [replace, setReplace] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    try {
      const r = await api<{ inserted: number; warnings: string[] }>("/api/import", { method: "POST", json: { kind, csv, replace } });
      onDone(`Imported ${r.inserted} ${kind}.${r.warnings.length ? " " + r.warnings.join(" · ") : ""}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Modal title={`Import ${kind} from CSV`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        {kind === "prompts" ? (
          <>
            Headers are matched loosely: <code className="text-ink">Test ID, Ad Category, Target SKU, Prompt, What to Evaluate, Aspect Ratio</code>. Aspect
            ratio is inferred from the text (e.g. “9:16”) if there&apos;s no column. Rows mentioning “[Input:” or inpainting become image-to-image. Import
            products first so SKUs link up.
          </>
        ) : (
          <>
            Headers: <code className="text-ink">SKU, Name, Category, Notes</code>.
          </>
        )}{" "}
        From Excel/Sheets: <i>File → Download → CSV</i>, or copy the cells and paste below.
      </p>
      <label className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-2 py-4 text-sm text-muted hover:border-accent hover:text-ink">
        <Upload size={15} /> Choose .csv file
        <input
          type="file"
          accept=".csv,.tsv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
          }}
        />
      </label>
      <textarea className={`${input} font-mono text-xs`} rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="…or paste CSV / tab-separated rows here (first row = headers)" />
      <label className="mt-3 flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-[#8b6cff]" />
        Replace all existing {kind} (removes the example data{kind === "prompts" ? " and their generations" : ""})
      </label>
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
        <button disabled={!csv.trim()} onClick={submit} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Import
        </button>
      </div>
    </Modal>
  );
}
