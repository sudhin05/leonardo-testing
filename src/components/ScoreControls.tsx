"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MessageSquare, Users, X } from "lucide-react";
import { SCORE_DIMS, api, getMe, initials, tally, type Me, type Output, type Vote } from "@/lib/client";

type Score = Pick<Vote, "text_accuracy" | "realism" | "color" | "keep" | "notes">;
const EMPTY: Score = { text_accuracy: null, realism: null, color: null, keep: null, notes: "" };

/**
 * The team's votes on one output. My own vote is editable (optimistic); everyone's votes come back from the
 * server after each change, and are refreshed whenever the parent passes newer `output.votes`.
 */
export function useVotes(o: Output | null) {
  const [me, setMe] = useState<Me | null>(null);
  const [votes, setVotes] = useState<Vote[]>(o?.votes ?? []);
  const pending = useRef(0);

  useEffect(() => {
    void getMe().then(setMe);
  }, []);

  // load (when the parent didn't supply votes) and follow parent refreshes
  useEffect(() => {
    if (!o) return;
    if (o.votes) {
      if (!pending.current) setVotes(o.votes);
      return;
    }
    let alive = true;
    api<Vote[]>(`/api/votes?outputId=${o.id}`)
      .then((v) => alive && !pending.current && setVotes(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [o?.id, JSON.stringify(o?.votes ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine: Score = (me && votes.find((v) => v.user_id === me.id)) || EMPTY;

  const update = (patch: Partial<Score>) => {
    if (!o || !me) return;
    const next = { ...mine, ...patch };
    setVotes((cur) => [
      ...cur.filter((v) => v.user_id !== me.id),
      { ...next, output_id: o.id, user_id: me.id, name: me.name, updated_at: new Date().toISOString() } as Vote,
    ]);
    pending.current++;
    void api<Vote[]>("/api/votes", { method: "PUT", json: { outputId: o.id, ...patch } })
      .then((all) => {
        pending.current--;
        if (!pending.current) setVotes(all);
      })
      .catch(() => {
        pending.current--;
      });
  };
  return { me, mine, votes, update };
}

export function ScoreControls({ output, compact = false }: { output: Output; compact?: boolean }) {
  const { me, mine, votes, update } = useVotes(output);
  const [showNotes, setShowNotes] = useState(!!mine.notes);
  const others = votes.filter((v) => v.user_id !== me?.id);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] tracking-wide text-faint uppercase">
        <span>Your vote{me ? ` · ${me.name}` : ""}</span>
      </div>
      <div className="grid gap-y-1.5">
        {SCORE_DIMS.map((d) => (
          <div key={d.key} className="flex items-center justify-between gap-2">
            <span className="w-11 text-[11px] tracking-wide text-faint uppercase" title={d.label}>
              {d.short}
            </span>
            <Dots value={mine[d.key]} onChange={(v) => update({ [d.key]: v })} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => update({ keep: mine.keep === 1 ? null : 1 })}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md border py-1 text-xs font-medium transition ${
            mine.keep === 1 ? "border-good/50 bg-good/15 text-good" : "border-line text-muted hover:border-line-2 hover:text-ink"
          }`}
        >
          <Check size={13} /> Keep
        </button>
        <button
          onClick={() => update({ keep: mine.keep === 0 ? null : 0 })}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md border py-1 text-xs font-medium transition ${
            mine.keep === 0 ? "border-bad/50 bg-bad/15 text-bad" : "border-line text-muted hover:border-line-2 hover:text-ink"
          }`}
        >
          <X size={13} /> Reject
        </button>
        <button
          onClick={() => setShowNotes((v) => !v)}
          title="Notes"
          className={`rounded-md border px-2 py-1 transition ${mine.notes ? "border-accent/40 text-accent" : "border-line text-muted hover:text-ink"}`}
        >
          <MessageSquare size={13} />
        </button>
      </div>
      {showNotes && (
        <textarea
          key={output.id}
          defaultValue={mine.notes ?? ""}
          onBlur={(e) => e.target.value !== (mine.notes ?? "") && update({ notes: e.target.value })}
          placeholder="e.g. 'SHOP ON WHATSAPP' misspelt; extra finger on cup"
          rows={2}
          className="w-full resize-none rounded-md border border-line bg-panel-2 px-2 py-1.5 text-xs outline-none focus:border-accent/60"
        />
      )}
      <TeamVotes votes={votes} meId={me?.id ?? null} compact={compact} othersCount={others.length} />
    </div>
  );
}

/** Everyone's votes: chips with a tooltip (compact) or a row per person (full). */
export function TeamVotes({ votes, meId, compact, othersCount }: { votes: Vote[]; meId: number | null; compact?: boolean; othersCount?: number }) {
  const t = tally(votes);
  if (!votes.length) {
    return (
      <div className="flex items-center gap-1.5 border-t border-line pt-2 text-[11px] text-faint">
        <Users size={12} /> No team votes yet
      </div>
    );
  }
  const sorted = [...votes].sort((a, b) => (a.user_id === meId ? -1 : b.user_id === meId ? 1 : a.name.localeCompare(b.name)));
  return (
    <div className="space-y-1.5 border-t border-line pt-2">
      <div className="flex items-center gap-2 text-[11px]">
        <Users size={12} className="text-faint" />
        <span className="font-medium text-good">Keep {t.keep}</span>
        <span className="text-faint">·</span>
        <span className="font-medium text-bad">Reject {t.reject}</span>
        {t.avg != null && (
          <>
            <span className="text-faint">·</span>
            <span className="text-muted">avg {t.avg.toFixed(1)}</span>
          </>
        )}
        {othersCount === 0 && <span className="ml-auto text-faint">only you so far</span>}
      </div>
      {compact ? (
        <div className="flex flex-wrap gap-1">
          {sorted.map((v) => (
            <span
              key={v.user_id}
              title={voteTitle(v)}
              className={`grid h-6 min-w-6 place-items-center rounded-full border px-1 text-[10px] font-semibold ${
                v.keep === 1 ? "border-good/50 bg-good/15 text-good" : v.keep === 0 ? "border-bad/50 bg-bad/15 text-bad" : "border-line-2 text-muted"
              } ${v.user_id === meId ? "ring-1 ring-accent/60" : ""}`}
            >
              {initials(v.name)}
            </span>
          ))}
        </div>
      ) : (
        <ul className="space-y-1">
          {sorted.map((v) => (
            <li key={v.user_id} className="rounded-md bg-panel-2 px-2 py-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">{v.user_id === meId ? `${v.name} (you)` : v.name}</span>
                <span className="font-mono text-faint">{scoreLine(v)}</span>
                <span
                  className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    v.keep === 1 ? "bg-good/15 text-good" : v.keep === 0 ? "bg-bad/15 text-bad" : "text-faint"
                  }`}
                >
                  {v.keep === 1 ? "KEEP" : v.keep === 0 ? "REJECT" : "—"}
                </span>
              </div>
              {v.notes && <p className="mt-0.5 text-muted">“{v.notes}”</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function scoreLine(v: Vote) {
  return [v.text_accuracy != null ? `T${v.text_accuracy}` : "", v.realism != null ? `R${v.realism}` : "", v.color != null ? `C${v.color}` : ""]
    .filter(Boolean)
    .join(" ");
}

function voteTitle(v: Vote) {
  return [`${v.name}: ${v.keep === 1 ? "Keep" : v.keep === 0 ? "Reject" : "no keep/reject"}`, scoreLine(v), v.notes ? `“${v.notes}”` : ""]
    .filter(Boolean)
    .join(" · ");
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
