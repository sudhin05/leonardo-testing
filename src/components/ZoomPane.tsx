"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus } from "lucide-react";

/** Zoom state as fractions of the pane, so several panes of different pixel sizes can share it (synced compare). */
export type View = { s: number; fx: number; fy: number };
export const FIT: View = { s: 1, fx: 0, fy: 0 };
const MAX = 12;

/**
 * Image/video viewer: starts fitted to the pane; wheel or +/- to zoom around the cursor, drag to pan,
 * double-click toggles 2.5×, "1:1" shows actual pixels. Pass view/onView to sync several panes.
 */
export function ZoomPane({
  src,
  video = false,
  view: controlled,
  onView,
  controls = true,
  className = "",
}: {
  src: string;
  video?: boolean;
  view?: View;
  onView?: (v: View) => void;
  controls?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [local, setLocal] = useState<View>(FIT);
  const view = controlled ?? local;
  const setView = useCallback((v: View) => (onView ? onView(v) : setLocal(v)), [onView]);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number; v: View } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    if (!controlled) setLocal(FIT);
    setNatural(null);
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = useCallback((v: View): View => {
    const s = Math.max(1, Math.min(MAX, v.s));
    if (s === 1) return FIT;
    return { s, fx: Math.min(0, Math.max(1 - s, v.fx)), fy: Math.min(0, Math.max(1 - s, v.fy)) };
  }, []);

  /** zoom to scale s2 keeping the point (px, py) — fractions of the pane — fixed under the cursor */
  const zoomAt = useCallback(
    (s2: number, px = 0.5, py = 0.5) => {
      const v = viewRef.current;
      const k = Math.max(1, Math.min(MAX, s2)) / v.s;
      setView(clamp({ s: v.s * k, fx: px - (px - v.fx) * k, fy: py - (py - v.fy) * k }));
    },
    [clamp, setView],
  );

  // non-passive wheel listener so the page doesn't scroll while zooming
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(viewRef.current.s * Math.exp(-e.deltaY * 0.0015), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const actualPixels = () => {
    const el = box.current;
    if (!el || !natural) return;
    const r = el.getBoundingClientRect();
    const fitted = Math.min(r.width / natural.w, r.height / natural.h) * natural.w; // displayed width at s=1
    zoomAt(natural.w / fitted);
  };

  const pct = (() => {
    const el = box.current;
    if (!el || !natural) return `${Math.round(view.s * 100)}%`;
    const r = el.getBoundingClientRect();
    const fitScale = Math.min(r.width / natural.w, r.height / natural.h);
    return `${Math.round(fitScale * view.s * 100)}%`;
  })();

  return (
    <div
      ref={box}
      className={`relative h-full w-full touch-none overflow-hidden select-none ${view.s > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"} ${className}`}
      onPointerDown={(e) => {
        if (view.s <= 1 || (e.target as HTMLElement).closest("[data-zoom-controls]")) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, v: view };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        const el = box.current;
        if (!d || !el) return;
        const r = el.getBoundingClientRect();
        setView(clamp({ s: d.v.s, fx: d.v.fx + (e.clientX - d.x) / r.width, fy: d.v.fy + (e.clientY - d.y) / r.height }));
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-zoom-controls]")) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (view.s > 1) setView(FIT);
        else zoomAt(2.5, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }}
    >
      <div
        className="absolute inset-0 origin-top-left will-change-transform"
        style={{ transform: `translate(${view.fx * 100}%, ${view.fy * 100}%) scale(${view.s})` }}
      >
        {video ? (
          <video
            src={src}
            className="h-full w-full object-contain"
            controls={view.s === 1}
            loop
            muted
            playsInline
            autoPlay
            onLoadedMetadata={(e) => setNatural({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            draggable={false}
            className="h-full w-full object-contain"
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
        )}
      </div>

      {controls && (
        <div
          data-zoom-controls
          className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/70 p-0.5 text-xs text-white/90 backdrop-blur"
        >
          <ZBtn title="Zoom out" onClick={() => zoomAt(view.s / 1.5)}>
            <Minus size={13} />
          </ZBtn>
          <span className="w-11 text-center font-mono text-[11px] tabular-nums">{pct}</span>
          <ZBtn title="Zoom in (or scroll)" onClick={() => zoomAt(view.s * 1.5)}>
            <Plus size={13} />
          </ZBtn>
          <span className="mx-0.5 h-4 w-px bg-white/15" />
          <ZBtn title="Fit to screen" onClick={() => setView(FIT)} on={view.s === 1}>
            <Maximize size={12} />
            <span className="ml-1">Fit</span>
          </ZBtn>
          {natural && (
            <ZBtn title="Actual pixels" onClick={actualPixels}>
              1:1
            </ZBtn>
          )}
        </div>
      )}
    </div>
  );
}

function ZBtn({ children, onClick, title, on }: { children: React.ReactNode; onClick: () => void; title: string; on?: boolean }) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 transition hover:bg-white/15 ${on ? "bg-white/15" : ""}`}
    >
      {children}
    </button>
  );
}
