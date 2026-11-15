"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, Download, Trophy } from "lucide-react";
import { api, fmtMs, fmtNum, fmtUsd } from "@/lib/client";

type Row = {
  model_key: string;
  label: string;
  vendor: string;
  gens: number;
  ok: number;
  failed: number;
  latency_ms: number | null;
  avg_cost: number | null;
  cost_per_image: number | null;
  total_cost: number | null;
  cost_unknown: number | null;
  outputs?: number;
  scored?: number;
  text_accuracy?: number | null;
  realism?: number | null;
  color?: number | null;
  keep_rate?: number | null;
  kept?: number;
  overall?: number | null;
};
type Heat = { model_key: string; ad_category: string; overall: number | null; keep_rate: number | null; n: number };
type Data = { rows: Row[]; heat: Heat[]; categories: string[] };

type SortKey = "overall" | "keep_rate" | "text_accuracy" | "realism" | "color" | "latency_ms" | "cost_per_image";

export default function LeaderboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [cat, setCat] = useState("");
  const [mock, setMock] = useState(false);
  const [sort, setSort] = useState<SortKey>("overall");
  const [metric, setMetric] = useState<"overall" | "keep_rate">("overall");

  useEffect(() => {
    api<Data>(`/api/leaderboard?category=${encodeURIComponent(cat)}&mock=${mock ? 1 : 0}`).then(setData);
  }, [cat, mock]);

  const rows = useMemo(() => {
    const r = [...(data?.rows ?? [])];
    const asc = sort === "latency_ms" || sort === "cost_per_image";
    r.sort((a, b) => {
      const av = a[sort] ?? (asc ? Infinity : -Infinity);
      const bv = b[sort] ?? (asc ? Infinity : -Infinity);
      return asc ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return r;
  }, [data, sort]);

  const heatModels = rows.map((r) => r.model_key);
  const heatMap = new Map((data?.heat ?? []).map((h) => [`${h.model_key}|${h.ad_category}`, h]));
  const labelOf = new Map(rows.map((r) => [r.model_key, r.label]));
  const leader = rows.find((r) => r.overall != null);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Leaderboard</h1>
          <p className="text-sm text-muted">Averages of your scores (1–5) per model. Keep rate = kept ÷ (kept + rejected).</p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-md border border-line bg-panel-2 px-2 py-1.5 text-ink outline-none">
            <option value="">All categories</option>
            {data?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} className="accent-[#8b6cff]" />
            Include mock runs
          </label>
          <a href="/api/export" className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-ink hover:border-line-2">
            <Download size={13} /> Export CSV
          </a>
        </div>
      </div>

      {leader && (
        <div className="flex items-center gap-4 rounded-xl border border-line bg-panel p-5">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent/15 text-accent">
            <Trophy size={22} />
          </div>
          <div>
            <div className="text-xs tracking-wider text-faint uppercase">Current leader {cat ? `· ${cat}` : ""}</div>
            <div className="text-2xl font-semibold">{leader.label}</div>
          </div>
          <div className="ml-8 flex gap-8">
            <Stat label="Overall" value={fmtNum(leader.overall, 2)} />
            <Stat label="Keep rate" value={leader.keep_rate == null ? "—" : `${Math.round(leader.keep_rate * 100)}%`} />
            <Stat label="Scored" value={`${leader.scored ?? 0} / ${leader.outputs ?? 0}`} />
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Model</th>
              <SortTh k="overall" sort={sort} setSort={setSort}>Overall</SortTh>
              <SortTh k="text_accuracy" sort={sort} setSort={setSort}>Text</SortTh>
              <SortTh k="realism" sort={sort} setSort={setSort}>Realism</SortTh>
              <SortTh k="color" sort={sort} setSort={setSort}>Brand colour</SortTh>
              <SortTh k="keep_rate" sort={sort} setSort={setSort}>Keep rate</SortTh>
              <th className="px-4 py-3">Scored</th>
              <th className="px-4 py-3">Success</th>
              <SortTh k="latency_ms" sort={sort} setSort={setSort}>Avg time</SortTh>
              <SortTh k="cost_per_image" sort={sort} setSort={setSort}>$ / image</SortTh>
              <th className="px-4 py-3">Total $</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.model_key} className="border-b border-line/60 last:border-0 hover:bg-panel-2">
                <td className="px-4 py-3 font-mono text-faint">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-[11px] text-faint">{r.vendor}</div>
                </td>
                <td className="px-4 py-3">
                  <Bar v={r.overall} max={5} strong />
                </td>
                <td className="px-4 py-3"><Bar v={r.text_accuracy} max={5} /></td>
                <td className="px-4 py-3"><Bar v={r.realism} max={5} /></td>
                <td className="px-4 py-3"><Bar v={r.color} max={5} /></td>
                <td className="px-4 py-3">
                  <Bar v={r.keep_rate == null ? null : r.keep_rate * 100} max={100} suffix="%" digits={0} />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  {r.scored ?? 0}/{r.outputs ?? 0}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted" title={`${r.failed} failed`}>
                  {r.gens ? Math.round((r.ok / r.gens) * 100) : 0}%
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{fmtMs(r.latency_ms)}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted" title={`Per call: ${fmtUsd(r.avg_cost)} · ≈ ${Math.round((r.cost_per_image ?? 0) * 669)} credits / image`}>
                  {fmtUsd(r.cost_per_image)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  {fmtUsd(r.total_cost, 2)}
                  {r.cost_unknown ? (
                    <span className="text-warn" title={`${r.cost_unknown} completed generation(s) with unknown cost`}>
                      {" "}
                      +?
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={12} className="p-10 text-center text-muted">
                  No results yet{mock ? "" : " from the live API (tick “Include mock runs” to see simulated ones)"}. Generate and score some outputs first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!!data?.categories.length && !!heatModels.length && (
        <div className="rounded-xl border border-line bg-panel p-5">
          <div className="mb-4 flex items-center gap-3">
            <div>
              <h2 className="font-semibold">Model × category</h2>
              <p className="text-xs text-muted">Which model wins where. Darker = weaker, brighter = stronger. Hover a cell for the sample size.</p>
            </div>
            <div className="ml-auto flex rounded-lg border border-line p-0.5 text-xs">
              {(["overall", "keep_rate"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`rounded-md px-3 py-1 ${metric === m ? "bg-panel-3 text-ink" : "text-muted hover:text-ink"}`}
                >
                  {m === "overall" ? "Avg score" : "Keep rate"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-[3px] text-xs">
              <thead>
                <tr>
                  <th />
                  {data.categories.map((c) => (
                    <th key={c} className="max-w-36 px-2 pb-2 text-left align-bottom font-medium text-muted">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatModels.map((mk) => (
                  <tr key={mk}>
                    <td className="pr-3 text-right whitespace-nowrap text-muted">{labelOf.get(mk)}</td>
                    {data.categories.map((c) => {
                      const h = heatMap.get(`${mk}|${c}`);
                      const raw = metric === "overall" ? h?.overall : h?.keep_rate;
                      const t = raw == null ? null : metric === "overall" ? (raw - 1) / 4 : raw;
                      return (
                        <td
                          key={c}
                          title={h ? `${labelOf.get(mk)} · ${c}\n${metric === "overall" ? `avg ${fmtNum(h.overall, 2)}` : `keep ${Math.round((h.keep_rate ?? 0) * 100)}%`} · n=${h.n}` : "No scores"}
                          className="h-10 w-28 rounded-[4px] text-center font-mono"
                          style={{
                            background: t == null ? "transparent" : `color-mix(in oklab, #8b6cff ${Math.round(12 + t * 78)}%, #121419)`,
                            border: t == null ? "1px dashed #262a34" : "none",
                            color: t != null && t > 0.55 ? "#fff" : "#e8eaf0",
                          }}
                        >
                          {raw == null ? "" : metric === "overall" ? fmtNum(raw, 1) : `${Math.round(raw * 100)}%`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] tracking-wider text-faint uppercase">{label}</div>
      <div className="font-mono text-lg">{value}</div>
    </div>
  );
}

function SortTh({ k, sort, setSort, children }: { k: SortKey; sort: SortKey; setSort: (k: SortKey) => void; children: React.ReactNode }) {
  return (
    <th className="px-4 py-3">
      <button onClick={() => setSort(k)} className={`flex items-center gap-1 uppercase ${sort === k ? "text-ink" : "hover:text-muted"}`}>
        {children}
        {sort === k && <ArrowDownWideNarrow size={11} />}
      </button>
    </th>
  );
}

function Bar({ v, max, strong, suffix = "", digits = 2 }: { v: number | null | undefined; max: number; strong?: boolean; suffix?: string; digits?: number }) {
  if (v == null) return <span className="text-faint">—</span>;
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-panel-3">
        <div className={`h-full rounded-full ${strong ? "bg-accent" : "bg-accent/60"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-mono text-xs ${strong ? "text-ink" : "text-muted"}`}>
        {fmtNum(v, digits)}
        {suffix}
      </span>
    </div>
  );
}
