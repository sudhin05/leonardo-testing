"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, FolderOpen, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, fmtUsd, type TestRun } from "@/lib/client";
import { selectRun } from "@/components/Nav";

const when = (s: string | null) => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "—");

/** Every test run the team has made: open one, start a new one, rename or delete. */
export default function RunsPage() {
  const [runs, setRuns] = useState<TestRun[] | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<TestRun | null>(null);
  const [deleting, setDeleting] = useState<TestRun | null>(null);

  const load = useCallback(async () => {
    const d = await api<{ runs: TestRun[]; current: number | null }>("/api/test-runs");
    setRuns(d.runs);
    setCurrent(d.current);
  }, []);

  useEffect(() => {
    void load();
    if (new URLSearchParams(window.location.search).get("new")) setCreating(true);
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Test runs</h1>
          <p className="text-sm text-muted">
            Each test run is an independent set of prompts, results and team votes. Start a new one for each new batch of tests; old ones stay here to
            revisit. Switching only changes what <i>you</i> see.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">
          <Plus size={15} /> New test run
        </button>
      </div>

      {!runs && (
        <div className="grid place-items-center p-10 text-muted">
          <Loader2 className="animate-spin" />
        </div>
      )}
      {runs?.length === 0 && (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
          No test runs yet. Create one, then import a prompt sheet into it from Library.
        </div>
      )}

      <div className="grid gap-3">
        {runs?.map((r) => (
          <div
            key={r.id}
            className={`flex flex-wrap items-center gap-4 rounded-xl border bg-panel p-4 ${r.id === current ? "border-accent/50" : "border-line"}`}
          >
            <FolderOpen size={20} className={r.id === current ? "text-accent" : "text-faint"} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{r.name}</span>
                {r.id === current && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-2">VIEWING</span>}
              </div>
              <div className="mt-0.5 text-xs text-faint">
                Created {when(r.created_at)}
                {r.created_by_name ? ` by ${r.created_by_name}` : ""} · last generation {when(r.last_activity)}
              </div>
              {r.notes && <p className="mt-1 line-clamp-2 text-xs text-muted">{r.notes}</p>}
            </div>
            <div className="flex gap-5 text-center text-xs">
              <Stat label="Prompts" v={r.prompts} />
              <Stat label="Images" v={r.outputs} />
              <Stat label="Votes" v={r.votes} />
              <Stat label="Spent" v={fmtUsd(r.spent, 2)} />
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setRenaming(r)} title="Rename" className="rounded-md p-2 text-muted hover:bg-panel-3 hover:text-ink">
                <Pencil size={14} />
              </button>
              <button onClick={() => setDeleting(r)} title="Delete" className="rounded-md p-2 text-muted hover:bg-panel-3 hover:text-bad">
                <Trash2 size={14} />
              </button>
              <button
                onClick={() => selectRun(r.id)}
                className="ml-1 flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:border-accent/60 hover:text-ink"
              >
                Open <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {creating && <CreateDialog onClose={() => setCreating(false)} />}
      {renaming && (
        <RenameDialog
          run={renaming}
          onClose={() => setRenaming(null)}
          onDone={() => {
            setRenaming(null);
            void load();
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          run={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string | number }) {
  return (
    <div>
      <div className="font-mono text-sm text-ink">{v}</div>
      <div className="text-[10px] tracking-wide text-faint uppercase">{label}</div>
    </div>
  );
}

const input = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none focus:border-accent/60";

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line-2 bg-panel p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="ml-auto text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const create = async () => {
    setBusy(true);
    try {
      await api("/api/test-runs", { method: "POST", json: { name, notes } });
      window.location.href = "/library?import=1"; // new run is selected; next step is loading prompts into it
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="New test run" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Name</span>
          <input autoFocus className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Round 3 – skincare posters" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">What is this run testing? (optional)</span>
          <textarea className={input} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <p className="text-xs text-faint">It starts empty and opens for you. Model settings are shared across all runs.</p>
        {err && <p className="text-sm text-bad">{err}</p>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
        <button disabled={!name.trim() || busy} onClick={create} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Create and import prompts
        </button>
      </div>
    </Modal>
  );
}

function RenameDialog({ run, onClose, onDone }: { run: TestRun; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(run.name);
  const [notes, setNotes] = useState(run.notes ?? "");
  const [err, setErr] = useState("");
  const save = async () => {
    try {
      await api(`/api/test-runs/${run.id}`, { method: "PATCH", json: { name, notes } });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Modal title="Rename test run" onClose={onClose}>
      <div className="space-y-3">
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className={input} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
        {err && <p className="text-sm text-bad">{err}</p>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
        <button disabled={!name.trim()} onClick={save} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Save
        </button>
      </div>
    </Modal>
  );
}

function DeleteDialog({ run, onClose, onDone }: { run: TestRun; onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const del = async () => {
    setBusy(true);
    try {
      await api(`/api/test-runs/${run.id}?confirm=${encodeURIComponent(typed)}`, { method: "DELETE" });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Delete test run" onClose={onClose}>
      <p className="text-sm text-muted">
        This permanently deletes <b className="text-ink">{run.name}</b>: {run.prompts} prompts, {run.outputs} images and {run.votes} votes from the whole
        team. It can&apos;t be undone. Export the PDF or CSV first if you want a record.
      </p>
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-muted">Type the run&apos;s name to confirm</span>
        <input className={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={run.name} />
      </label>
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
        <button
          disabled={typed !== run.name || busy}
          onClick={del}
          className="rounded-lg bg-bad px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Delete permanently
        </button>
      </div>
    </Modal>
  );
}
