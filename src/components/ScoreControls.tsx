"use client";

import { useEffect, useState } from "react";
import { Check, MessageSquare, X } from "lucide-react";
import { SCORE_DIMS, api, type Output } from "@/lib/client";

type Score = Pick<Output, "text_accuracy" | "realism" | "color" | "keep" | "notes">;

export function useScore(o: Output | null) {
  const [s, setS] = useState<Score>(blank(o));
  useEffect(() => setS(blank(o)), [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (patch: Partial<Score>) => {
    if (!o) return;
    setS((cur) => ({ ...cur, ...patch }));
    void api("/api/scores", { method: "PUT", json: { outputId: o.id, ...patch } });
  };
  return [s, update] as const;
}

function blank(o: Output | null): Score {
  return {
    text_accuracy: o?.text_accuracy ?? null,
    realism: o?.realism ?? null,
    color: o?.color ?? null,
    keep: o?.keep ?? null,
    notes: o?.notes ?? "",
  };
}

export function ScoreControls({ output, compact = false }: { output: Output; compact?: boolean }) {
  const [s, update] = useScore(output);
  const [showNotes, setShowNotes] = useState(!!output.notes);

  return (
    <div className="space-y-2">
      <div className={`grid gap-x-3 gap-y-1.5 ${compact ? "grid-cols-1" : "grid-cols-1"}`}>
        {SCORE_DIMS.map((d) => (
          <div key={d.key} className="flex items-center justify-between gap-2">
            <span className="w-11 text-[11px] uppercase tracking-wide text-faint" title={d.label}>
              {d.short}
            </span>
            <Dots value={s[d.key]} onChange={(v) => update({ [d.key]: v })} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => update({ keep: s.keep === 1 ? null : 1 })}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md border py-1 text-xs font-medium transition ${
            s.keep === 1 ? "border-good/50 bg-good/15 text-good" : "border-line text-muted hover:border-line-2 hover:text-ink"
          }`}
        >
          <Check size={13} /> Keep
        </button>
        <button
          onClick={() => update({ keep: s.keep === 0 ? null : 0 })}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md border py-1 text-xs font-medium transition ${
            s.keep === 0 ? "border-bad/50 bg-bad/15 text-bad" : "border-line text-muted hover:border-line-2 hover:text-ink"
          }`}
        >
          <X size={13} /> Reject
        </button>
        <button
          onClick={() => setShowNotes((v) => !v)}
          title="Notes"
          className={`rounded-md border px-2 py-1 transition ${
            s.notes ? "border-accent/40 text-accent" : "border-line text-muted hover:text-ink"
          }`}
        >
          <MessageSquare size={13} />
        </button>
      </div>
      {showNotes && (
        <textarea
          defaultValue={s.notes ?? ""}
          onBlur={(e) => e.target.value !== (s.notes ?? "") && update({ notes: e.target.value })}
          placeholder="e.g. 'SHOP ON WHATSAPP' misspelt; extra finger on cup"
          rows={2}
          className="w-full resize-none rounded-md border border-line bg-panel-2 px-2 py-1.5 text-xs outline-none focus:border-accent/60"
        />
      )}
    </div>
  );
}

export function Dots({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(value === n ? null : n)}
          className={`h-4 w-4 rounded-full border transition ${
            n <= shown
              ? shown >= 4
                ? "border-good bg-good/80"
                : shown >= 3
                  ? "border-warn bg-warn/80"
                  : "border-bad bg-bad/80"
              : "border-line-2 bg-transparent hover:border-muted"
          }`}
          aria-label={`${n}`}
        />
      ))}
      <span className="ml-1 w-3 text-right font-mono text-[11px] text-muted">{value ?? ""}</span>
    </div>
  );
}
