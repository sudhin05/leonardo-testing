"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Columns2, Download, SplitSquareHorizontal, Square, X, ZoomIn } from "lucide-react";
import { mediaSrc, type Output } from "@/lib/client";
import { ScoreControls } from "./ScoreControls";

export type LightItem = { output: Output; title: string; subtitle?: string };

type Mode = "single" | "side" | "slider";

export function Lightbox({
  items,
  start = 0,
  compare,
  onClose,
}: {
  items: LightItem[];
  start?: number;
  compare?: LightItem[]; // when given, opens directly in side-by-side
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(compare && compare.length >= 2 ? "side" : "single");
  const [i, setI] = useState(start);
  const set = compare && compare.length >= 2 ? compare : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") onClose();
      if (mode === "single" && e.key === "ArrowRight") setI((v) => (v + 1) % items.length);
      if (mode === "single" && e.key === "ArrowLeft") setI((v) => (v - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [items.length, mode, onClose]);

  const cur = items[i];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-4 text-sm">
        {set && (
          <div className="flex rounded-md border border-white/10 p-0.5">
            <ModeBtn on={mode === "single"} onClick={() => setMode("single")} icon={<Square size={14} />} label="Single" />
            <ModeBtn on={mode === "side"} onClick={() => setMode("side")} icon={<Columns2 size={14} />} label="Side by side" />
            {set.length === 2 && (
              <ModeBtn on={mode === "slider"} onClick={() => setMode("slider")} icon={<SplitSquareHorizontal size={14} />} label="Slider" />
            )}
          </div>
        )}
        {mode === "single" && cur && (
          <span className="text-muted">
            {i + 1} / {items.length}
          </span>
        )}
        {mode !== "single" && <span className="flex items-center gap-1 text-muted"><ZoomIn size={13} /> Click to zoom 2.5× (synced), move to pan</span>}
        <button onClick={onClose} className="ml-auto rounded-md p-1.5 text-muted hover:bg-white/10 hover:text-ink">
          <X size={18} />
        </button>
      </div>

      {mode === "single" && cur && (
        <div className="flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 items-center justify-center p-6">
            <Media o={cur.output} className="max-h-full max-w-full object-contain" />
            {items.length > 1 && (
              <>
                <NavBtn side="left" onClick={() => setI((v) => (v - 1 + items.length) % items.length)} />
                <NavBtn side="right" onClick={() => setI((v) => (v + 1) % items.length)} />
              </>
            )}
          </div>
          <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-l border-white/10 bg-panel p-4">
            <div>
              <div className="font-semibold">{cur.title}</div>
              {cur.subtitle && <div className="mt-0.5 text-xs text-muted">{cur.subtitle}</div>}
            </div>
            <ScoreControls key={cur.output.id} output={cur.output} />
            <a
              href={mediaSrc(cur.output)}
              download
              className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
            >
              <Download size={13} /> Download original
            </a>
            <p className="text-[11px] leading-relaxed text-faint">← → to browse · Esc to close</p>
          </aside>
        </div>
      )}

      {mode === "side" && set && <SideBySide items={set} />}
      {mode === "slider" && set && set.length === 2 && <Slider a={set[0]} b={set[1]} />}
    </div>
  );
}

function ModeBtn({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs ${on ? "bg-white/15 text-ink" : "text-muted hover:text-ink"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function NavBtn({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-3" : "right-3"} rounded-full bg-white/10 p-2 text-ink backdrop-blur hover:bg-white/20`}
    >
      {side === "left" ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
    </button>
  );
}

export function Media({ o, className }: { o: Output; className?: string }) {
  if (o.media_type === "video") {
    return <video src={mediaSrc(o)} className={className} controls loop muted playsInline autoPlay />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaSrc(o)} alt="" className={className} draggable={false} />;
}

function SideBySide({ items }: { items: LightItem[] }) {
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const cols = items.length <= 2 ? items.length : items.length <= 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);

  return (
    <div
      className="grid min-h-0 flex-1 gap-2 p-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
    >
      {items.map((it) => (
        <div key={it.output.id} className="relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-panel">
          <div
            className={`relative min-h-0 flex-1 overflow-hidden ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`}
            onClick={(e) => {
              if (zoom) return setZoom(null);
              const r = e.currentTarget.getBoundingClientRect();
              setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
            onMouseMove={(e) => {
              if (!zoom) return;
              const r = e.currentTarget.getBoundingClientRect();
              setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                transform: zoom ? "scale(2.5)" : "none",
                transformOrigin: zoom ? `${zoom.x}% ${zoom.y}%` : "50% 50%",
              }}
            >
              <Media o={it.output} className="h-full w-full object-contain" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{it.title}</div>
              {it.subtitle && <div className="truncate text-[11px] text-muted">{it.subtitle}</div>}
            </div>
            <div className="w-48 shrink-0">
              <ScoreControls output={it.output} compact />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Slider({ a, b }: { a: LightItem; b: LightItem }) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
      <div
        ref={box}
        className="relative h-full max-h-full w-full max-w-5xl cursor-ew-resize select-none overflow-hidden rounded-lg"
        onMouseDown={(e) => {
          dragging.current = true;
          move(e.clientX);
        }}
        onMouseMove={(e) => dragging.current && move(e.clientX)}
        onMouseUp={() => (dragging.current = false)}
        onMouseLeave={() => (dragging.current = false)}
      >
        <Media o={b.output} className="absolute inset-0 h-full w-full object-contain" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <Media o={a.output} className="absolute inset-0 h-full w-full object-contain" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,.6)]" style={{ left: `${pos}%` }}>
          <div className="absolute top-1/2 left-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-black">
            <SplitSquareHorizontal size={14} />
          </div>
        </div>
        <span className="absolute top-3 left-3 rounded bg-black/70 px-2 py-1 text-xs">{a.title}</span>
        <span className="absolute top-3 right-3 rounded bg-black/70 px-2 py-1 text-xs">{b.title}</span>
      </div>
    </div>
  );
}
