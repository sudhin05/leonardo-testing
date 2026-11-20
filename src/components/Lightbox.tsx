"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Columns2, Download, ImageIcon, SplitSquareHorizontal, Square, X } from "lucide-react";
import { mediaSrc, uploadSrc, type Output } from "@/lib/client";
import { ScoreControls } from "./ScoreControls";
import { FIT, ZoomPane, type View } from "./ZoomPane";

/**
 * One thing to look at: a generated output (scorable) or a plain image such as a reference (src only).
 * `reference` = upload filename of the reference image that output was generated from (shown as a toggle).
 * `href` = where "Open in Compare" goes.
 */
export type LightItem = {
  output?: Output;
  src?: string;
  title: string;
  subtitle?: string;
  reference?: string | null;
  href?: string;
};

const srcOf = (it: LightItem) => (it.output ? mediaSrc(it.output) : (it.src ?? ""));
const keyOf = (it: LightItem) => (it.output ? `o${it.output.id}` : `s${it.src}`);
const isVideo = (it: LightItem) => it.output?.media_type === "video";

type Mode = "single" | "side" | "slider";

export function Lightbox({
  items,
  start = 0,
  compare,
  onClose,
}: {
  items: LightItem[];
  start?: number;
  compare?: LightItem[]; // when given (2+), opens in side-by-side
  onClose: () => void;
}) {
  const set = compare && compare.length >= 2 ? compare : null;
  const [mode, setMode] = useState<Mode>(set ? "side" : "single");
  const [i, setI] = useState(start);
  const [showRef, setShowRef] = useState(false);
  const cur = items[i];

  useEffect(() => setShowRef(false), [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") onClose();
      if (mode !== "single" || items.length < 2) return;
      if (e.key === "ArrowRight") setI((v) => (v + 1) % items.length);
      if (e.key === "ArrowLeft") setI((v) => (v - 1 + items.length) % items.length);
      if (e.key.toLowerCase() === "r" && items[i]?.reference) setShowRef((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [items, i, mode, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-2 text-sm md:gap-3 md:px-4">
        {set && (
          <div className="flex rounded-md border border-white/10 p-0.5">
            <ModeBtn on={mode === "single"} onClick={() => setMode("single")} icon={<Square size={14} />} label="Single" />
            <ModeBtn on={mode === "side"} onClick={() => setMode("side")} icon={<Columns2 size={14} />} label="Side by side" />
            {set.length === 2 && (
              <ModeBtn on={mode === "slider"} onClick={() => setMode("slider")} icon={<SplitSquareHorizontal size={14} />} label="Slider" />
            )}
          </div>
        )}
        {mode === "single" && cur && items.length > 1 && (
          <span className="text-muted">
            {i + 1} / {items.length}
          </span>
        )}
        <span className="hidden text-xs text-faint md:inline">
          Scroll to zoom · drag to pan · double-click to toggle{mode === "side" ? " · zoom is synced across panes" : ""}
        </span>
        <button onClick={onClose} className="ml-auto rounded-md p-1.5 text-muted hover:bg-white/10 hover:text-ink" title="Close (Esc)">
          <X size={18} />
        </button>
      </div>

      {mode === "single" && cur && (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="relative min-h-[45vh] min-w-0 flex-1 p-2 md:p-4">
            <div className="relative h-full w-full">
              <ZoomPane
                key={keyOf(cur) + (showRef ? "-ref" : "")}
                src={showRef && cur.reference ? uploadSrc(cur.reference) : srcOf(cur)}
                video={!showRef && isVideo(cur)}
              />
              {showRef && (
                <span className="pointer-events-none absolute top-3 left-3 rounded-md bg-warn px-2 py-1 text-xs font-semibold text-black">
                  Reference image
                </span>
              )}
            </div>
            {items.length > 1 && (
              <>
                <NavBtn side="left" onClick={() => setI((v) => (v - 1 + items.length) % items.length)} />
                <NavBtn side="right" onClick={() => setI((v) => (v + 1) % items.length)} />
              </>
            )}
          </div>
          <aside className="max-h-[48vh] w-full shrink-0 space-y-4 overflow-y-auto border-t border-white/10 bg-panel p-4 md:max-h-none md:w-72 md:border-t-0 md:border-l">
            <div>
              <div className="font-semibold">{cur.title}</div>
              {cur.subtitle && <div className="mt-0.5 text-xs text-muted">{cur.subtitle}</div>}
            </div>

            {cur.reference && (
              <button
                onClick={() => setShowRef((v) => !v)}
                className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition ${
                  showRef ? "border-warn/60 bg-warn/10" : "border-line hover:border-line-2"
                }`}
                title="Toggle between the result and the reference image it was generated from (R)"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadSrc(cur.reference)} alt="" className="checker h-14 w-14 rounded object-contain" />
                <span className="text-xs">
                  <span className="flex items-center gap-1 font-medium text-ink">
                    <ImageIcon size={12} /> {showRef ? "Showing reference" : "Reference image"}
                  </span>
                  <span className="text-faint">{showRef ? "Click to go back to the result" : "Click (or press R) to view it here"}</span>
                </span>
              </button>
            )}

            {cur.output && <ScoreControls key={cur.output.id} output={cur.output} />}

            <div className="space-y-2 text-xs">
              <a href={srcOf(cur)} download className="flex items-center gap-1.5 text-muted hover:text-ink">
                <Download size={13} /> Download original
              </a>
              {cur.href && (
                <Link href={cur.href} className="flex items-center gap-1.5 text-muted hover:text-ink">
                  <ArrowUpRight size={13} /> Open this prompt in Compare
                </Link>
              )}
            </div>
            {items.length > 1 && <p className="text-[11px] leading-relaxed text-faint">← → to browse · Esc to close</p>}
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
      className={`absolute top-1/2 z-10 -translate-y-1/2 ${side === "left" ? "left-3 md:left-6" : "right-3 md:right-6"} rounded-full bg-white/10 p-2 text-ink backdrop-blur hover:bg-white/20`}
    >
      {side === "left" ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
    </button>
  );
}

/** Plain media (no zoom) — used in cards and thumbnails. */
export function Media({ o, className }: { o: Output; className?: string }) {
  if (o.media_type === "video") {
    return <video src={mediaSrc(o)} className={className} controls loop muted playsInline autoPlay />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaSrc(o)} alt="" className={className} draggable={false} />;
}

function SideBySide({ items }: { items: LightItem[] }) {
  const [view, setView] = useState<View>(FIT);
  const cols = items.length <= 2 ? items.length : items.length <= 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);

  return (
    <div
      className="grid min-h-0 flex-1 gap-2 p-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
    >
      {items.map((it) => (
        <div key={keyOf(it)} className="relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-panel">
          <div className="relative min-h-0 flex-1">
            <ZoomPane src={srcOf(it)} video={isVideo(it)} view={view} onView={setView} controls={false} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{it.title}</div>
              {it.subtitle && <div className="truncate text-[11px] text-muted">{it.subtitle}</div>}
            </div>
            {it.output && (
              <div className="hidden w-48 shrink-0 sm:block">
                <ScoreControls output={it.output} compact />
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="pointer-events-none fixed right-6 bottom-6 z-10">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/10 bg-black/70 p-0.5 text-xs text-white/90 backdrop-blur">
          <button className="rounded-md px-2 py-1.5 hover:bg-white/15" onClick={() => setView((v) => clampSync({ ...v, s: v.s / 1.5 }))}>
            −
          </button>
          <span className="w-12 text-center font-mono">{Math.round(view.s * 100)}%</span>
          <button className="rounded-md px-2 py-1.5 hover:bg-white/15" onClick={() => setView((v) => clampSync({ ...v, s: v.s * 1.5 }))}>
            +
          </button>
          <button className="rounded-md px-2 py-1.5 hover:bg-white/15" onClick={() => setView(FIT)}>
            Fit
          </button>
        </div>
      </div>
    </div>
  );
}

/** keep the centre of the view fixed when zooming from the toolbar */
function clampSync(v: View): View {
  const s = Math.max(1, Math.min(12, v.s));
  if (s === 1) return FIT;
  return { s, fx: Math.min(0, Math.max(1 - s, 0.5 - s / 2)), fy: Math.min(0, Math.max(1 - s, 0.5 - s / 2)) };
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
  const img = (it: LightItem) =>
    isVideo(it) ? (
      <video src={srcOf(it)} className="absolute inset-0 h-full w-full object-contain" muted loop autoPlay playsInline />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={srcOf(it)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
      <div
        ref={box}
        className="relative h-full max-h-full w-full max-w-5xl cursor-ew-resize overflow-hidden rounded-lg select-none"
        onMouseDown={(e) => {
          dragging.current = true;
          move(e.clientX);
        }}
        onMouseMove={(e) => dragging.current && move(e.clientX)}
        onMouseUp={() => (dragging.current = false)}
        onMouseLeave={() => (dragging.current = false)}
      >
        {img(b)}
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {img(a)}
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
