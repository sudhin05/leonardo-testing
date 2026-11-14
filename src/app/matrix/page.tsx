"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ACTIVE, api, aspectCss, mediaSrc, type ModelInfo, type Prompt } from "@/lib/client";

type Cell = {
  prompt_id: number;
  model_key: string;
  status: string;
  output_id: number | null;
  local_path: string | null;
  remote_url: string | null;
  media_type: "image" | "video";
  keep: number | null;
};

export default function MatrixPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [size, setSize] = useState(150);
  const [cat, setCat] = useState("");

  useEffect(() => {
    const load = () => {
      api<Prompt[]>("/api/prompts").then(setPrompts);
      api<Cell[]>("/api/matrix").then(setCells);
    };
    load();
    api<ModelInfo[]>("/api/models").then(setModels);
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const cellMap = useMemo(() => new Map(cells.map((c) => [`${c.prompt_id}|${c.model_key}`, c])), [cells]);
  const cols = useMemo(() => {
    const used = new Set(cells.map((c) => c.model_key));
    return models.filter((m) => m.kind === "image" && (m.enabled || used.has(m.key)));
  }, [models, cells]);
  const categories = [...new Set(prompts.map((p) => p.ad_category))].filter(Boolean);
  const rows = prompts.filter((p) => p.kind === "image" && (!cat || p.ad_category === cat));

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Matrix</h1>
          <p className="text-sm text-muted">Every prompt × every model, newest result. Click a cell to open it in Compare.</p>
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
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-line bg-panel">
        <table className="border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 min-w-64 border-r border-b border-line bg-panel px-3 py-2 text-left text-xs font-semibold text-faint">
                Prompt
              </th>
              {cols.map((m) => (
                <th key={m.key} className="sticky top-0 z-10 border-b border-line bg-panel px-2 py-2 text-left" style={{ minWidth: size + 16 }}>
                  <div className="text-xs font-semibold">{m.label}</div>
                  <div className="text-[10px] font-normal text-faint">{m.vendor}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 border-r border-b border-line bg-panel px-3 py-2 align-top">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-2">{p.test_id}</span>
                    <span className="text-[10px] text-faint">{p.aspect_ratio}</span>
                  </div>
                  <div className="mt-1 text-xs font-medium">{p.ad_category}</div>
                  <p className="mt-0.5 line-clamp-3 max-w-60 text-[11px] text-muted">{p.prompt}</p>
                </td>
                {cols.map((m) => {
                  const c = cellMap.get(`${p.id}|${m.key}`);
                  return (
                    <td key={m.key} className="border-b border-line p-2 align-top">
                      <Link
                        href={`/?p=${p.id}`}
                        className="checker relative block overflow-hidden rounded-md ring-accent transition hover:ring-2"
                        style={{ width: size, aspectRatio: aspectCss(p.aspect_ratio) }}
                      >
                        {c?.output_id ? (
                          c.media_type === "video" ? (
                            <video src={mediaSrc(c)} muted className="h-full w-full object-cover" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mediaSrc(c)} alt="" loading="lazy" className="h-full w-full object-cover" />
                          )
                        ) : c && ACTIVE.has(c.status) ? (
                          <span className="shimmer absolute inset-0 grid place-items-center">
                            <Loader2 size={16} className="animate-spin text-accent" />
                          </span>
                        ) : c?.status === "failed" ? (
                          <span className="absolute inset-0 grid place-items-center bg-bad/5 text-bad">
                            <AlertTriangle size={16} />
                          </span>
                        ) : (
                          <span className="absolute inset-0 grid place-items-center text-[10px] text-faint">—</span>
                        )}
                        {c?.keep != null && (
                          <span className={`absolute right-1 bottom-1 rounded px-1 text-[9px] font-bold text-black ${c.keep ? "bg-good" : "bg-bad"}`}>
                            {c.keep ? "KEEP" : "REJ"}
                          </span>
                        )}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
