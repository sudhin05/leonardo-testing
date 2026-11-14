"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Columns2,
  History,
  ImagePlus,
  LayoutGrid,
  Loader2,
  Play,
  Search,
  Target,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  ACTIVE,
  api,
  mediaSrc,
  uploadSrc,
  type Generation,
  type ModelInfo,
  type Output,
  type Prompt,
} from "@/lib/client";
import { ModelCard } from "@/components/ModelCard";
import { Lightbox, type LightItem } from "@/components/Lightbox";

type Scope = "prompt" | "category" | "all";

export default function ComparePage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [pid, setPid] = useState<number | null>(null);
  const [results, setResults] = useState<Generation[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [view, setView] = useState<"latest" | "history">("latest");
  const [cardW, setCardW] = useState(300);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [sel, setSel] = useState<Map<number, LightItem>>(new Map());
  const [lb, setLb] = useState<{ items: LightItem[]; start: number; compare?: LightItem[] } | null>(null);
  const [confirm, setConfirm] = useState<{ scope: Scope; promptIds: number[]; calls: number } | null>(null);
  const kickRef = useRef(0);

  const prompt = prompts.find((p) => p.id === pid) ?? null;
  const modelMap = useMemo(() => new Map(models.map((m) => [m.key, m])), [models]);

  // ── loading ──
  const loadPrompts = useCallback(() => api<Prompt[]>("/api/prompts").then(setPrompts), []);
  const loadResults = useCallback(async () => {
    if (!pid) return setResults([]);
    setResults(await api<Generation[]>(`/api/results?promptId=${pid}`));
  }, [pid]);

  useEffect(() => {
    void loadPrompts();
    api<ModelInfo[]>("/api/models").then(setModels);
    const saved = Number(new URLSearchParams(window.location.search).get("p"));
    if (saved) setPid(saved);
    try {
      const w = Number(localStorage.getItem("lab.cardW"));
      if (w) setCardW(w);
    } catch {}
  }, [loadPrompts]);

  useEffect(() => {
    if (!pid && prompts.length) setPid(prompts[0].id);
  }, [prompts, pid]);

  useEffect(() => {
    if (!pid) return;
    window.history.replaceState(null, "", `/?p=${pid}`);
    setSel(new Map());
    void loadResults();
  }, [pid, loadResults]);

  // model selection persisted per media kind
  const kind = prompt?.kind ?? "image";
  useEffect(() => {
    if (!models.length) return;
    let keys: string[] | null = null;
    try {
      keys = JSON.parse(localStorage.getItem(`lab.models.${kind}`) ?? "null");
    } catch {}
    const enabled = models.filter((m) => m.enabled && m.kind === kind).map((m) => m.key);
    setChosen(new Set((keys ?? enabled).filter((k) => enabled.includes(k))));
  }, [models, kind]);

  const toggleModel = (key: string) => {
    setChosen((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(`lab.models.${kind}`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  // ── polling while anything is generating ──
  const anyActive = results.some((g) => ACTIVE.has(g.status));
  useEffect(() => {
    if (!anyActive && Date.now() - kickRef.current > 8000) return;
    const t = setInterval(() => {
      void loadResults();
      void loadPrompts();
    }, 2000);
    return () => clearInterval(t);
  }, [anyActive, loadResults, loadPrompts]);

  // ── derived ──
  const visibleModels = useMemo(() => {
    const keys = new Set(chosen);
    for (const g of results) keys.add(g.model_key);
    return models.filter((m) => keys.has(m.key) && m.kind === kind);
  }, [chosen, results, models, kind]);

  const latestByModel = useMemo(() => {
    const m = new Map<string, Generation>();
    for (const g of results) if (!m.has(g.model_key)) m.set(g.model_key, g);
    return m;
  }, [results]);

  const runs = useMemo(() => {
    const byRun = new Map<number, Generation[]>();
    for (const g of results) {
      if (!byRun.has(g.run_id)) byRun.set(g.run_id, []);
      byRun.get(g.run_id)!.push(g);
    }
    return [...byRun.entries()];
  }, [results]);

  const grouped = useMemo(() => {
    const ql = q.toLowerCase();
    const list = prompts.filter(
      (p) => !ql || [p.test_id, p.prompt, p.ad_category, p.sku ?? "", p.product_name ?? ""].join(" ").toLowerCase().includes(ql),
    );
    const g = new Map<string, Prompt[]>();
    for (const p of list) {
      const k = p.ad_category || "Uncategorised";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(p);
    }
    return [...g.entries()];
  }, [prompts, q]);

  const itemFor = useCallback(
    (o: Output, g: Generation): LightItem => {
      const m = modelMap.get(g.model_key);
      return {
        output: o,
        title: m?.label ?? g.model_key,
        subtitle: `${prompt?.test_id ?? ""} · ${g.width}×${g.height} · ${g.credit_cost ?? "—"} credits${g.mock ? " · MOCK" : ""}`,
      };
    },
    [modelMap, prompt],
  );

  const viewItems = useMemo(() => {
    const gens = view === "latest" ? visibleModels.map((m) => latestByModel.get(m.key)).filter(Boolean) as Generation[] : results;
    return gens.flatMap((g) => g.outputs.map((o) => itemFor(o, g)));
  }, [view, visibleModels, latestByModel, results, itemFor]);

  const openOutput = (o: Output) => {
    const idx = viewItems.findIndex((it) => it.output.id === o.id);
    setLb({ items: viewItems, start: Math.max(0, idx) });
  };

  const toggleSel = (o: Output, g: Generation) => {
    setSel((cur) => {
      const next = new Map(cur);
      if (next.has(o.id)) next.delete(o.id);
      else if (next.size < 6) next.set(o.id, itemFor(o, g));
      return next;
    });
  };

  // ── actions ──
  const modelsForRun = [...chosen].filter((k) => modelMap.get(k)?.kind === kind);

  const askRun = (scope: Scope) => {
    if (!prompt) return;
    const ids =
      scope === "prompt"
        ? [prompt.id]
        : scope === "category"
          ? prompts.filter((p) => p.ad_category === prompt.ad_category && p.kind === kind).map((p) => p.id)
          : prompts.filter((p) => p.kind === kind).map((p) => p.id);
    const calls = ids.length * modelsForRun.length;
    if (scope === "prompt") return void run(ids);
    setConfirm({ scope, promptIds: ids, calls });
  };

  const run = async (promptIds: number[]) => {
    setConfirm(null);
    if (!modelsForRun.length) return setToast({ text: "Select at least one model", tone: "warn" });
    setBusy(true);
    try {
      const r = await api<{ queued: number; warnings: string[] }>("/api/runs", {
        method: "POST",
        json: { promptIds, modelKeys: modelsForRun, quantity },
      });
      kickRef.current = Date.now();
      setView("latest");
      setToast({
        text: `Queued ${r.queued} generation${r.queued === 1 ? "" : "s"}${r.warnings.length ? ` · ${r.warnings.join(" · ")}` : ""}`,
        tone: r.warnings.length ? "warn" : "ok",
      });
      await Promise.all([loadResults(), loadPrompts()]);
    } catch (e) {
      setToast({ text: (e as Error).message, tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const retry = async (g: Generation) => {
    await api(`/api/generations/${g.id}`, { method: "POST" });
    kickRef.current = Date.now();
    void loadResults();
  };

  const uploadRef = async (file: File) => {
    if (!prompt) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api(`/api/prompts/${prompt.id}/image`, { method: "POST", body: fd });
      await loadPrompts();
      setToast({ text: "Reference image attached — this prompt now runs as image-to-image", tone: "ok" });
    } catch (e) {
      setToast({ text: (e as Error).message, tone: "warn" });
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const refImg = prompt?.input_image ?? prompt?.product_ref_image ?? null;
  const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${cardW}px, 1fr))` };

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* ── Prompt sidebar ── */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-panel/50">
        <div className="p-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 focus-within:border-accent/60">
            <Search size={14} className="text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search prompts, SKUs…"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-faint"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {grouped.map(([cat, list]) => (
            <div key={cat} className="mb-3">
              <div className="px-2 pt-2 pb-1.5 text-[10px] font-semibold tracking-wider text-faint uppercase">{cat}</div>
              {list.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPid(p.id)}
                  className={`mb-0.5 w-full rounded-lg px-2.5 py-2 text-left transition ${
                    p.id === pid ? "bg-panel-3 ring-1 ring-line-2" : "hover:bg-panel-2"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-2">{p.test_id}</span>
                    {p.sku && <span className="font-mono text-[10px] text-faint">{p.sku}</span>}
                    <span className="ml-auto flex items-center gap-1.5 text-[10px] text-faint">
                      {p.input_mode === "reference" && <ImagePlus size={11} className="text-warn" />}
                      {p.aspect_ratio}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted">{p.prompt}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-faint">
                    {p.running > 0 ? (
                      <span className="flex items-center gap-1 text-accent-2">
                        <Loader2 size={10} className="animate-spin" /> {p.running} running
                      </span>
                    ) : (
                      <span>{p.models_done ? `${p.models_done} models · ${p.done} runs` : "Not run yet"}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))}
          {!prompts.length && (
            <div className="p-4 text-sm text-muted">
              No prompts yet. <Link href="/library" className="text-accent">Add or import a prompt sheet →</Link>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <section className="min-w-0 flex-1 overflow-y-auto">
        {prompt ? (
          <div className="mx-auto max-w-[1800px] space-y-5 p-5">
            {/* Prompt header */}
            <div className="rounded-xl border border-line bg-panel p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-accent/15 px-2 py-0.5 font-mono font-semibold text-accent-2">{prompt.test_id}</span>
                <span className="font-medium text-ink">{prompt.ad_category}</span>
                {prompt.sku && (
                  <span className="text-muted">
                    · <span className="font-mono">{prompt.sku}</span> {prompt.product_name}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <Badge>{prompt.aspect_ratio}</Badge>
                  <Badge tone={prompt.input_mode === "reference" ? "warn" : undefined}>
                    {prompt.input_mode === "reference" ? "Image → Image" : "Text → " + (prompt.kind === "video" ? "Video" : "Image")}
                  </Badge>
                  <Link href={`/library?edit=${prompt.id}`} className="text-muted hover:text-ink">
                    Edit
                  </Link>
                </span>
              </div>
              <div className="mt-3 flex gap-5">
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-[15px] leading-relaxed text-ink/90">{prompt.prompt}</p>
                  {prompt.criteria && (
                    <div className="flex gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">
                      <Target size={15} className="mt-0.5 shrink-0 text-accent" />
                      <div>
                        <span className="text-[10px] font-semibold tracking-wider text-faint uppercase">Pass / fail criteria</span>
                        <p className="text-muted">{prompt.criteria}</p>
                      </div>
                    </div>
                  )}
                </div>
                {prompt.input_mode === "reference" && (
                  <div className="w-36 shrink-0">
                    <div className="mb-1 text-[10px] font-semibold tracking-wider text-faint uppercase">Reference</div>
                    <label className="checker relative block aspect-square cursor-pointer overflow-hidden rounded-lg border border-dashed border-line-2 hover:border-accent">
                      {refImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={uploadSrc(refImg)} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-[11px] text-muted">
                          <Upload size={16} /> Upload product PNG
                        </span>
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && uploadRef(e.target.files[0])}
                      />
                    </label>
                    {refImg && !prompt.input_image && <p className="mt-1 text-[10px] text-faint">From product {prompt.sku}</p>}
                  </div>
                )}
              </div>
            </div>

            {/* Generate bar */}
            <div className="rounded-xl border border-line bg-panel p-4">
              <div className="mb-2.5 flex items-center gap-3 text-xs text-muted">
                <span className="font-semibold tracking-wider text-faint uppercase">Models</span>
                <button
                  className="hover:text-ink"
                  onClick={() => {
                    const all = models.filter((m) => m.enabled && m.kind === kind).map((m) => m.key);
                    setChosen(new Set(all));
                    try {
                      localStorage.setItem(`lab.models.${kind}`, JSON.stringify(all));
                    } catch {}
                  }}
                >
                  All
                </button>
                <button
                  className="hover:text-ink"
                  onClick={() => {
                    setChosen(new Set());
                    try {
                      localStorage.setItem(`lab.models.${kind}`, "[]");
                    } catch {}
                  }}
                >
                  None
                </button>
                <Link href="/models" className="ml-auto hover:text-ink">
                  Manage models →
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {models
                  .filter((m) => m.enabled && m.kind === kind)
                  .map((m) => {
                    const on = chosen.has(m.key);
                    const noRef = prompt.input_mode === "reference" && !m.supportsReference;
                    return (
                      <button
                        key={m.key}
                        onClick={() => toggleModel(m.key)}
                        title={noRef ? "This model has no image-reference input — it will be skipped for this prompt" : m.blurb}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          on
                            ? "border-accent/60 bg-accent/15 text-ink"
                            : "border-line text-muted hover:border-line-2 hover:text-ink"
                        } ${noRef ? "line-through opacity-60" : ""}`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                {!models.some((m) => m.enabled && m.kind === kind) && (
                  <span className="text-sm text-muted">
                    No {kind} models enabled — <Link href="/models" className="text-accent">enable some</Link>.
                  </span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted">
                  Outputs per model
                  <select
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="rounded-md border border-line bg-panel-2 px-2 py-1 text-ink outline-none"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => askRun("category")}
                    disabled={busy}
                    className="rounded-lg border border-line px-3 py-2 text-xs text-muted transition hover:border-line-2 hover:text-ink disabled:opacity-50"
                  >
                    Run whole category
                  </button>
                  <button
                    onClick={() => askRun("all")}
                    disabled={busy}
                    className="rounded-lg border border-line px-3 py-2 text-xs text-muted transition hover:border-line-2 hover:text-ink disabled:opacity-50"
                  >
                    Run entire sheet
                  </button>
                  <button
                    onClick={() => askRun("prompt")}
                    disabled={busy || !modelsForRun.length}
                    className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                    Generate across {modelsForRun.length} model{modelsForRun.length === 1 ? "" : "s"}
                  </button>
                </div>
              </div>
            </div>

            {/* View controls */}
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg border border-line bg-panel p-0.5 text-xs">
                <Seg on={view === "latest"} onClick={() => setView("latest")} icon={<LayoutGrid size={13} />}>
                  Latest per model
                </Seg>
                <Seg on={view === "history"} onClick={() => setView("history")} icon={<History size={13} />}>
                  All runs ({runs.length})
                </Seg>
              </div>
              <label className="ml-auto flex items-center gap-2 text-xs text-muted">
                Card size
                <input
                  type="range"
                  min={220}
                  max={560}
                  value={cardW}
                  onChange={(e) => {
                    setCardW(Number(e.target.value));
                    try {
                      localStorage.setItem("lab.cardW", e.target.value);
                    } catch {}
                  }}
                  className="accent-[#8b6cff]"
                />
              </label>
            </div>

            {/* Results */}
            {view === "latest" ? (
              <div className="grid gap-4" style={gridStyle}>
                {visibleModels.map((m) => {
                  const g = latestByModel.get(m.key) ?? null;
                  return (
                    <ModelCard
                      key={m.key + (g?.id ?? "")}
                      model={m}
                      gen={g}
                      aspect={prompt.aspect_ratio}
                      selected={new Set(sel.keys())}
                      onToggleSelect={(o) => g && toggleSel(o, g)}
                      onOpen={openOutput}
                      onRetry={retry}
                    />
                  );
                })}
                {!visibleModels.length && <Empty>Select models above, then hit Generate.</Empty>}
              </div>
            ) : (
              <div className="space-y-6">
                {runs.map(([runId, gens]) => (
                  <div key={runId}>
                    <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                      <span className="font-mono text-faint">Run #{runId}</span>
                      <span>{new Date(gens[0].run_created_at.replace(" ", "T") + "Z").toLocaleString()}</span>
                      <span className="text-faint">· {gens.length} models</span>
                    </div>
                    <div className="grid gap-4" style={gridStyle}>
                      {gens.map((g) => (
                        <ModelCard
                          key={g.id}
                          model={modelMap.get(g.model_key) ?? { key: g.model_key, label: g.model_key, vendor: "" }}
                          gen={g}
                          aspect={prompt.aspect_ratio}
                          selected={new Set(sel.keys())}
                          onToggleSelect={(o) => toggleSel(o, g)}
                          onOpen={openOutput}
                          onRetry={retry}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {!runs.length && <Empty>No runs yet for this prompt.</Empty>}
              </div>
            )}
          </div>
        ) : (
          <div className="grid h-full place-items-center text-muted">
            <Loader2 className="animate-spin" />
          </div>
        )}
      </section>

      {/* Compare tray */}
      {sel.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-line-2 bg-panel-2/95 p-2 pl-3 shadow-2xl backdrop-blur">
          <div className="flex -space-x-2">
            {[...sel.values()].map((it) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={it.output.id} src={mediaSrc(it.output)} alt="" className="h-9 w-9 rounded-md border-2 border-panel-2 object-cover" />
            ))}
          </div>
          <span className="text-sm text-muted">{sel.size} selected</span>
          <button
            disabled={sel.size < 2}
            onClick={() => setLb({ items: [...sel.values()], start: 0, compare: [...sel.values()] })}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Columns2 size={14} /> Compare side by side
          </button>
          <button onClick={() => setSel(new Map())} className="rounded-lg p-2 text-muted hover:bg-panel-3 hover:text-ink">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Confirm bulk run */}
      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl border border-line-2 bg-panel p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">
              Run {confirm.scope === "category" ? `“${prompt?.ad_category}”` : "the entire sheet"}?
            </h3>
            <p className="mt-2 text-sm text-muted">
              {confirm.promptIds.length} prompt{confirm.promptIds.length === 1 ? "" : "s"} × {modelsForRun.length} model
              {modelsForRun.length === 1 ? "" : "s"} × {quantity} output{quantity === 1 ? "" : "s"} ={" "}
              <b className="text-ink">{confirm.calls} API calls</b>. This spends credits on the live API.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
                Cancel
              </button>
              <button
                onClick={() => run(confirm.promptIds)}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
              >
                <Play size={14} /> Run {confirm.calls} generations
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed top-16 right-5 z-50 max-w-md rounded-xl border px-4 py-3 text-sm shadow-xl ${
            toast.tone === "ok" ? "border-good/30 bg-panel-2 text-ink" : "border-warn/40 bg-panel-2 text-warn"
          }`}
        >
          {toast.text}
        </div>
      )}

      {lb && <Lightbox items={lb.items} start={lb.start} compare={lb.compare} onClose={() => { setLb(null); void loadResults(); }} />}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "warn" }) {
  return (
    <span
      className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${
        tone === "warn" ? "border-warn/30 bg-warn/10 text-warn" : "border-line bg-panel-2 text-muted"
      }`}
    >
      {children}
    </span>
  );
}

function Seg({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${on ? "bg-panel-3 text-ink" : "text-muted hover:text-ink"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="col-span-full rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">{children}</div>;
}
