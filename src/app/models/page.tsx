"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ImagePlus, Plus, Trash2, Video } from "lucide-react";
import { api, type ModelInfo } from "@/lib/client";

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newKind, setNewKind] = useState<"image" | "video">("image");
  const [err, setErr] = useState("");

  const load = useCallback(() => api<ModelInfo[]>("/api/models").then(setModels), []);
  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (key: string, body: object) => {
    try {
      setErr("");
      await api("/api/models", { method: "PATCH", json: { key, ...body } });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const add = async () => {
    try {
      setErr("");
      await api("/api/models", { method: "POST", json: { key: newKey.trim(), kind: newKind } });
      setNewKey("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-3 md:p-5">
      <div>
        <h1 className="text-xl font-semibold">Models</h1>
        <p className="text-sm text-muted">
          Enabled models appear as chips on the Compare page. Overrides are JSON merged into the request&apos;s <code>parameters</code> — e.g.{" "}
          <code className="text-ink">{`{"quality":"HIGH"}`}</code> or <code className="text-ink">{`{"mode":"ULTRA"}`}</code>.
        </p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-2 text-sm text-bad">{err}</div>}

      {(["image", "video"] as const).map((kind) => (
        <section key={kind}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
            {kind === "image" ? <ImagePlus size={15} /> : <Video size={15} />}
            {kind === "image" ? "Image models" : "Video models"}
            {kind === "video" && <span className="text-xs font-normal text-faint">— use with prompts whose Output is “Video”</span>}
          </h2>
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            {models
              .filter((m) => m.kind === kind)
              .map((m) => (
                <div key={m.key} className="border-b border-line/60 last:border-0">
                  <div className="flex items-center gap-4 px-4 py-3">
                    <Toggle on={m.enabled} onChange={(v) => patch(m.key, { enabled: v })} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.label}</span>
                        <span className="text-xs text-faint">{m.vendor}</span>
                        <code className="rounded bg-panel-3 px-1.5 py-0.5 text-[11px] text-muted">{m.key}</code>
                        {m.supportsReference && <span className="rounded bg-good/10 px-1.5 py-0.5 text-[10px] text-good">ref image</span>}
                        {m.overrides.trim() && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent-2">overrides</span>}
                      </div>
                      <p className="text-xs text-muted">{m.blurb}</p>
                    </div>
                    {m.custom && (
                      <button
                        title="Remove custom model"
                        onClick={async () => {
                          await api(`/api/models?key=${encodeURIComponent(m.key)}`, { method: "DELETE" });
                          void load();
                        }}
                        className="rounded-md p-1.5 text-muted hover:text-bad"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button onClick={() => setOpen(open === m.key ? null : m.key)} className="flex items-center gap-1 text-xs text-muted hover:text-ink">
                      Configure <ChevronDown size={13} className={open === m.key ? "rotate-180" : ""} />
                    </button>
                  </div>
                  {open === m.key && (
                    <div className="grid gap-4 border-t border-line/60 bg-panel-2/50 px-4 py-4 md:grid-cols-2">
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1 text-xs font-medium text-muted">Parameter overrides (JSON)</div>
                          <textarea
                            defaultValue={m.overrides}
                            onBlur={(e) => e.target.value !== m.overrides && patch(m.key, { overrides: e.target.value })}
                            rows={4}
                            placeholder='{"quality": "HIGH"}'
                            className="w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs outline-none focus:border-accent/60"
                          />
                          <p className="mt-1 text-[11px] text-faint">Saved when you click away. Keep these identical across a test round so the comparison stays fair.</p>
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-medium text-muted">Size sent per aspect ratio</div>
                          <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px]">
                            {Object.entries(m.sizes).map(([ar, s]) => (
                              <div key={ar} className="rounded bg-panel px-2 py-1">
                                <span className="text-faint">{ar}</span> <span className="text-muted">{s.width}×{s.height}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-medium text-muted">Request body (1:1 sample)</div>
                        <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-panel p-3 font-mono text-[11px] text-muted">
                          {JSON.stringify(m.sample, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-sm font-semibold">Add a model by its API string</h2>
        <p className="mt-0.5 text-xs text-muted">
          For any Leonardo v2 model not listed above (e.g. <code>krea/krea-3</code>, <code>kling-4.0</code>). It uses generic sizing; tune with overrides.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="model string"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm outline-none focus:border-accent/60"
          />
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as "image" | "video")} className="rounded-lg border border-line bg-panel-2 px-3 text-sm">
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
          <button disabled={!newKey.trim()} onClick={add} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            <Plus size={14} /> Add
          </button>
        </div>
      </section>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-panel-3"}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}
