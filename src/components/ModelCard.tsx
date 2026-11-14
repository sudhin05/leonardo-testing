"use client";

import { useState } from "react";
import { AlertTriangle, Ban, Check, Clock, Coins, Loader2, Maximize2, RotateCw, Sparkles } from "lucide-react";
import { ACTIVE, aspectCss, fmtMs, type Generation, type ModelInfo, type Output } from "@/lib/client";
import { ScoreControls } from "./ScoreControls";
import { Media } from "./Lightbox";

export function sqliteTime(s: string) {
  return new Date(s.replace(" ", "T") + "Z").getTime();
}

export function ModelCard({
  model,
  gen,
  aspect,
  selected,
  onToggleSelect,
  onOpen,
  onRetry,
}: {
  model: Pick<ModelInfo, "key" | "label" | "vendor">;
  gen: Generation | null;
  aspect: string;
  selected: Set<number>;
  onToggleSelect: (o: Output) => void;
  onOpen: (o: Output) => void;
  onRetry: (g: Generation) => void;
}) {
  const [active, setActive] = useState(0);
  const outs = gen?.outputs ?? [];
  const cur = outs[Math.min(active, outs.length - 1)];

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-line bg-panel transition hover:border-line-2">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{model.label}</div>
          <div className="truncate text-[11px] text-faint">{model.vendor}</div>
        </div>
        <StatusPill gen={gen} />
      </div>

      <div className="relative mx-2 overflow-hidden rounded-lg checker" style={{ aspectRatio: aspectCss(aspect) }}>
        {cur ? (
          <>
            <button className="absolute inset-0 cursor-zoom-in" onClick={() => onOpen(cur)}>
              <Media o={cur} className="h-full w-full object-contain" />
            </button>
            <label
              className={`absolute top-2 left-2 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium backdrop-blur transition ${
                selected.has(cur.id) ? "bg-accent text-white" : "bg-black/55 text-white/85 opacity-0 group-hover:opacity-100"
              }`}
            >
              <input type="checkbox" className="hidden" checked={selected.has(cur.id)} onChange={() => onToggleSelect(cur)} />
              {selected.has(cur.id) ? <Check size={12} /> : null}
              Compare
            </label>
            <button
              onClick={() => onOpen(cur)}
              className="absolute top-2 right-2 rounded-md bg-black/55 p-1.5 text-white/85 opacity-0 backdrop-blur transition group-hover:opacity-100"
            >
              <Maximize2 size={13} />
            </button>
            {cur.keep != null && (
              <span
                className={`absolute right-2 bottom-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  cur.keep ? "bg-good text-black" : "bg-bad text-black"
                }`}
              >
                {cur.keep ? "KEEP" : "REJECT"}
              </span>
            )}
            {gen?.mock ? (
              <span className="absolute bottom-2 left-2 rounded bg-warn/90 px-1.5 py-0.5 text-[10px] font-bold text-black">MOCK</span>
            ) : null}
          </>
        ) : gen && ACTIVE.has(gen.status) ? (
          <div className="shimmer absolute inset-0 grid place-items-center">
            <Loader2 className="animate-spin text-accent" size={22} />
          </div>
        ) : gen?.status === "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bad/5 p-4 text-center">
            <AlertTriangle className="text-bad" size={20} />
            <p className="line-clamp-5 font-mono text-[11px] break-all text-bad/90">{gen.error}</p>
            <button
              onClick={() => onRetry(gen)}
              className="mt-1 flex items-center gap-1 rounded-md border border-line-2 px-2 py-1 text-xs text-muted hover:text-ink"
            >
              <RotateCw size={12} /> Retry
            </button>
          </div>
        ) : gen?.status === "skipped" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-faint">
            <Ban size={18} />
            <p className="text-xs">{gen.error}</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-faint">
            <Sparkles size={18} />
            <p className="text-xs">Not generated yet</p>
          </div>
        )}
      </div>

      {outs.length > 1 && (
        <div className="mx-2 mt-1.5 flex gap-1.5 overflow-x-auto">
          {outs.map((o, i) => (
            <button
              key={o.id}
              onClick={() => setActive(i)}
              className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-md border-2 ${i === active ? "border-accent" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              <Media o={o} className="h-full w-full object-cover" />
              {o.keep != null && <span className={`absolute right-0.5 bottom-0.5 h-2 w-2 rounded-full ${o.keep ? "bg-good" : "bg-bad"}`} />}
            </button>
          ))}
        </div>
      )}

      {gen && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2 text-[11px] text-muted">
          <span className="flex items-center gap-1" title="Time from submit to completion">
            <Clock size={11} /> {fmtMs(gen.latency_ms)}
          </span>
          <span className="flex items-center gap-1" title="API credits charged">
            <Coins size={11} /> {gen.credit_cost ?? "—"}
          </span>
          {gen.width && (
            <span className="font-mono" title="Requested size">
              {gen.width}×{gen.height}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto px-3 pt-2.5 pb-3">
        {cur ? (
          <ScoreControls key={cur.id} output={cur} />
        ) : (
          <div className="h-[86px]" />
        )}
      </div>
    </div>
  );
}

function StatusPill({ gen }: { gen: Generation | null }) {
  if (!gen) return null;
  const base = "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (ACTIVE.has(gen.status)) {
    const secs = Math.max(0, Math.round((Date.now() - sqliteTime(gen.created_at)) / 1000));
    return (
      <span className={`${base} bg-accent/15 text-accent-2`}>
        <Loader2 size={10} className="animate-spin" />
        {gen.status === "queued" ? "Queued" : "Generating"} {secs}s
      </span>
    );
  }
  if (gen.status === "complete") return <span className={`${base} bg-good/10 text-good`}>Done</span>;
  if (gen.status === "failed") return <span className={`${base} bg-bad/10 text-bad`}>Failed</span>;
  return <span className={`${base} bg-panel-3 text-faint`}>Skipped</span>;
}
