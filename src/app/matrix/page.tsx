"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, FileDown, Loader2 } from "lucide-react";
import { ACTIVE, api, aspectCss, fmtCost, mediaSrc, uploadSrc, type ModelInfo, type Output, type Prompt } from "@/lib/client";
import { Lightbox, type LightItem } from "@/components/Lightbox";

const refOf = (p: Prompt) => p.input_image ?? (p.input_mode === "reference" ? p.product_ref_image : null);

type Cell = {
  prompt_id: number;
  model_key: string;
  status: string;
  ref_image: string | null;
  credit_cost: number | null;
  cost_source: string | null;
  width: number | null;
  height: number | null;
  output_id: number | null;
  generation_id: number | null;
  idx: number | null;
  local_path: string | null;
  remote_url: string | null;
  media_type: "image" | "video";
  votes_n: number;
  keep_yes: number;
  keep_no: number;
  overall: number | null;
  my_keep: number | null;
};

/** Votes are loaded by the viewer itself (no `votes` here), so it always shows the latest team state. */
const toOutput = (c: Cell): Output => ({
  id: c.output_id!,
  generation_id: c.generation_id!,
  idx: c.idx ?? 0,
  local_path: c.local_path,
  remote_url: c.remote_url,
  media_type: c.media_type,
  text_accuracy: null,
  realism: null,
  color: null,
  keep: c.my_keep,
  notes: null,
});

export default function MatrixPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [size, setSize] = useState(150);
  const [cat, setCat] = useState("");
  const [lb, setLb] = useState<{ items: LightItem[]; start: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api<Prompt[]>("/api/prompts").then(setPrompts);
    api<Cell[]>("/api/matrix").then(setCells);
  }, []);

  useEffect(() => {
    load();
    api<ModelInfo[]>("/api/models").then(setModels);
    const t = setInterval(() => !document.querySelector("[data-lightbox-open]") && load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  const cellMap = useMemo(() => new Map(cells.map((c) => [`${c.prompt_id}|${c.model_key}`, c])), [cells]);
  const cols = useMemo(() => {
    const used = new Set(cells.map((c) => c.model_key));
    return models.filter((m) => m.kind === "image" && (m.enabled || used.has(m.key)));
  }, [models, cells]);
  const categories = [...new Set(prompts.map((p) => p.ad_category))].filter(Boolean);
  const rows = prompts.filter((p) => p.kind === "image" && (!cat || p.ad_category === cat));

  // every viewable result in table order (row by row), so ← → walks the matrix
  const items = useMemo(() => {
    const list: { key: string; item: LightItem }[] = [];
    for (const p of rows) {
      for (const m of cols) {
        const c = cellMap.get(`${p.id}|${m.key}`);
        if (!c?.output_id) continue;
        list.push({
          key: `${p.id}|${m.key}`,
          item: {
            output: toOutput(c),
            title: `${m.label} · ${p.test_id}`,
            subtitle: `${p.ad_category} · ${c.width}×${c.height} · ${fmtCost(c.credit_cost, c.cost_source).text}`,
            reference: c.ref_image,
            href: `/?p=${p.id}`,
          },
        });
      }
    }
    return list;
  }, [rows, cols, cellMap]);

  const open = (key: string) => {
    const i = items.findIndex((x) => x.key === key);
    if (i >= 0) setLb({ items: items.map((x) => x.item), start: i });
  };

  const exportPdf = async () => {
    setExporting(true);
    setErr("");
    try {
      const res = await fetch(`/api/report?category=${encodeURIComponent(cat)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Export failed (${res.status})`);
      const blob = await res.blob();
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "model-lab-report.pdf";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Matrix</h1>
          <p className="text-sm text-muted">
            Every prompt × every model, newest result. Click a result to vote on it and see the team&apos;s votes. Badges show team keep·reject; a
            purple dot means teammates voted and you haven&apos;t. The inset is the reference image that generation was given.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-md border border-line bg-panel-2 px-2 py-1.5 text-ink outline-none">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-2">
            Thumb size
            <input type="range" min={90} max={320} value={size} onChange={(e) => setSize(Number(e.target.value))} className="accent-[#8b6cff]" />
          </label>
          <button
            onClick={exportPdf}
            disabled={exporting}
            title={`Download a PDF report: leaderboard summary + this matrix${cat ? ` (${cat} only)` : ""}`}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {exporting ? "Building PDF…" : "Export PDF"}
          </button>
        </div>
      </div>
      {err && <div className="mb-3 rounded-lg border border-bad/40 bg-bad/10 px-4 py-2 text-sm text-bad">{err}</div>}

      <div className="overflow-auto rounded-xl border border-line bg-panel">
        <table className="border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 min-w-64 border-r border-b border-line bg-panel px-3 py-2 text-left text-xs font-semibold text-faint">
                Prompt
              </th>
              <th className="sticky top-0 z-10 border-r border-b border-line bg-panel px-2 py-2 text-left text-xs font-semibold text-faint">Reference</th>
              {cols.map((m) => (
                <th key={m.key} className="sticky top-0 z-10 border-b border-line bg-panel px-2 py-2 text-left" style={{ minWidth: size + 16 }}>
                  <div className="text-xs font-semibold">{m.label}</div>
                  <div className="text-[10px] font-normal text-faint">{m.vendor}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const ref = refOf(p);
              return (
                <tr key={p.id}>
                  <td className="sticky left-0 z-10 border-r border-b border-line bg-panel px-3 py-2 align-top">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/?p=${p.id}`}
                        title="Open in Compare"
                        className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-2 hover:bg-accent/30"
                      >
                        {p.test_id}
                      </Link>
                      <span className="text-[10px] text-faint">{p.aspect_ratio}</span>
                      {p.input_mode === "reference" && <span className="text-[10px] text-warn">Image → Image</span>}
                    </div>
                    <div className="mt-1 text-xs font-medium">{p.ad_category}</div>
                    <p className="mt-0.5 line-clamp-3 max-w-60 text-[11px] text-muted">{p.prompt}</p>
                  </td>
                  <td className="border-r border-b border-line p-2 align-top">
                    {ref ? (
                      <button
                        onClick={() =>
                          setLb({ items: [{ src: uploadSrc(ref), title: "Reference image", subtitle: `${p.test_id} · ${p.ad_category}`, href: `/?p=${p.id}` }], start: 0 })
                        }
                        className="checker block cursor-zoom-in overflow-hidden rounded-md ring-warn/70 transition hover:ring-2"
                        style={{ width: Math.round(size * 0.75), aspectRatio: "1 / 1" }}
                        title="Reference image for this prompt — click to view"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={uploadSrc(ref)} alt="" className="h-full w-full object-contain" />
                      </button>
                    ) : (
                      <div
                        className="grid place-items-center rounded-md border border-dashed border-line text-[10px] text-faint"
                        style={{ width: Math.round(size * 0.75), aspectRatio: "1 / 1" }}
                      >
                        {p.input_mode === "reference" ? "missing" : "text only"}
                      </div>
                    )}
                  </td>
                  {cols.map((m) => {
                    const c = cellMap.get(`${p.id}|${m.key}`);
                    const key = `${p.id}|${m.key}`;
                    const body = c?.output_id ? (
                      <>
                        {c.media_type === "video" ? (
                          <video src={mediaSrc(c)} muted className="h-full w-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaSrc(c)} alt="" loading="lazy" className="h-full w-full object-cover" />
                        )}
                        {c.ref_image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={uploadSrc(c.ref_image)}
                            alt=""
                            title="Reference image sent with this generation"
                            className="absolute top-1 left-1 w-[28%] rounded border border-white/70 bg-black/40 object-contain shadow-md"
                            style={{ aspectRatio: "1 / 1" }}
                          />
                        )}
                        {c.keep_yes + c.keep_no > 0 && (
                          <span
                            title={`Team: ${c.keep_yes} keep, ${c.keep_no} reject${c.overall != null ? `, avg ${Number(c.overall).toFixed(1)}` : ""}`}
                            className={`absolute right-1 bottom-1 rounded px-1 text-[9px] font-bold text-black ${
                              c.keep_yes > c.keep_no ? "bg-good" : c.keep_no > c.keep_yes ? "bg-bad" : "bg-warn"
                            }`}
                          >
                            {c.keep_yes}·{c.keep_no}
                          </span>
                        )}
                        {c.votes_n > 0 && c.my_keep == null && (
                          <span title="Teammates voted; you haven't marked keep/reject" className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />
                        )}
                      </>
                    ) : c && ACTIVE.has(c.status) ? (
                      <span className="shimmer absolute inset-0 grid place-items-center">
                        <Loader2 size={16} className="animate-spin text-accent" />
                      </span>
                    ) : c?.status === "failed" ? (
                      <span className="absolute inset-0 grid place-items-center bg-bad/5 text-bad" title="Failed — open in Compare to see why">
                        <AlertTriangle size={16} />
                      </span>
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-[10px] text-faint">—</span>
                    );
                    const boxClass = "checker relative block overflow-hidden rounded-md ring-accent transition hover:ring-2";
                    const boxStyle = { width: size, aspectRatio: aspectCss(p.aspect_ratio) };
                    return (
                      <td key={m.key} className="border-b border-line p-2 align-top">
                        {c?.output_id ? (
                          <button onClick={() => open(key)} className={`${boxClass} cursor-zoom-in`} style={boxStyle}>
                            {body}
                          </button>
                        ) : (
                          <Link href={`/?p=${p.id}`} title="Open in Compare" className={boxClass} style={boxStyle}>
                            {body}
                          </Link>
                        )}
                        {c?.output_id && c.credit_cost != null && (
                          <div className="mt-1 font-mono text-[10px] text-faint" title={fmtCost(c.credit_cost, c.cost_source).title}>
                            {fmtCost(c.credit_cost, c.cost_source).text}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lb && (
        <div data-lightbox-open>
          <Lightbox
            items={lb.items}
            start={lb.start}
            onClose={() => {
              setLb(null);
              load(); // pick up score / keep changes made in the viewer
            }}
          />
        </div>
      )}
    </div>
  );
}
