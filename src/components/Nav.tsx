"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Coins, FlaskConical, FolderOpen, Loader2, LogOut, Plus } from "lucide-react";
import { api, fmtUsd, initials, type TestRun } from "@/lib/client";

type Status = {
  setupProblems?: string[];
  storage?: string;
  user: { id: number; name: string };
  run: { id: number; name: string } | null;
  mock: boolean;
  hasKey: boolean;
  active: number;
  balance: number | null;
  creditsPerUsd: number;
  usdSpent: number;
  runUsdSpent: number;
  unknownCost: number;
  estimatedCost: number;
  liveGenerations: number;
};

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

const LINKS = [
  { href: "/runs", label: "Runs" },
  { href: "/", label: "Compare" },
  { href: "/matrix", label: "Matrix" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/library", label: "Library" },
  { href: "/models", label: "Models" },
];

/** Switch the test run *you* are viewing, then reload so every page shows it. */
export async function selectRun(id: number) {
  await api("/api/test-runs/select", { method: "POST", json: { id } });
  window.location.href = window.location.pathname === "/runs" ? "/" : window.location.pathname;
}

export function Nav() {
  const path = usePathname();
  const [s, setS] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<TestRun[] | null>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (path === "/login") return;
    let alive = true;
    // this poll also drives generation on the server: keep it running on every page
    const load = () => api<Status>("/api/status").then((v) => alive && setS(v)).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [path]);

  useEffect(() => {
    if (!open) return;
    api<{ runs: TestRun[] }>("/api/test-runs").then((d) => setRuns(d.runs));
    const close = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  if (path === "/login") return null;

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 md:h-14 md:flex-nowrap md:gap-4 md:px-5 md:py-0">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent">
            <FlaskConical size={16} />
          </span>
          <span className="hidden sm:inline">Model Lab</span>
        </Link>

        {/* test run switcher */}
        <div ref={menu} className="relative min-w-0">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex max-w-[56vw] items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm hover:border-line-2 md:max-w-64"
            title="Switch test run"
          >
            <FolderOpen size={14} className="shrink-0 text-accent" />
            <span className="truncate">{s?.run?.name ?? (s ? "No test run yet" : "…")}</span>
            <ChevronDown size={14} className="shrink-0 text-faint" />
          </button>
          {open && (
            <div className="absolute top-full left-0 z-50 mt-1.5 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line-2 bg-panel-2 shadow-2xl">
              <div className="max-h-80 overflow-y-auto p-1.5">
                {runs === null && <div className="p-3 text-xs text-muted">Loading…</div>}
                {runs?.length === 0 && <div className="p-3 text-xs text-muted">No test runs yet.</div>}
                {runs?.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => selectRun(r.id)}
                    className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-panel-3 ${r.id === s?.run?.id ? "bg-panel-3" : ""}`}
                  >
                    <Check size={14} className={`mt-0.5 shrink-0 ${r.id === s?.run?.id ? "text-accent" : "text-transparent"}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{r.name}</span>
                      <span className="block text-[11px] text-faint">
                        {r.prompts} prompts · {r.outputs} images · {r.votes} votes
                        {r.created_by_name ? ` · by ${r.created_by_name}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex border-t border-line">
                <Link href="/runs?new=1" onClick={() => setOpen(false)} className="flex flex-1 items-center gap-1.5 px-3 py-2.5 text-sm text-accent hover:bg-panel-3">
                  <Plus size={14} /> New test run
                </Link>
                <Link href="/runs" onClick={() => setOpen(false)} className="px-3 py-2.5 text-sm text-muted hover:bg-panel-3 hover:text-ink">
                  All runs
                </Link>
              </div>
            </div>
          )}
        </div>

        <nav className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto text-sm whitespace-nowrap md:order-none md:mx-0 md:w-auto md:overflow-visible">
          {LINKS.map((l) => {
            const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={`rounded-md px-3 py-1.5 transition ${on ? "bg-panel-3 text-ink" : "text-muted hover:text-ink"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 text-xs md:gap-2.5">
          {s && s.active > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-muted">
              <Loader2 size={12} className="animate-spin text-accent" />
              {s.active}<span className="hidden sm:inline"> generating</span>
            </span>
          )}
          {s && !s.mock && (
            <span
              className="hidden items-center gap-2 rounded-full border border-line bg-panel px-2.5 py-1 text-muted xl:flex"
              title={[
                s.balance != null
                  ? `Balance: ${fmt(s.balance)} API credits ≈ ${fmtUsd(s.balance / s.creditsPerUsd, 2)} (read live from Leonardo).`
                  : "Balance unavailable.",
                `This test run: ${fmtUsd(s.runUsdSpent, 2)}. All runs: ${fmtUsd(s.usdSpent, 2)} over ${s.liveGenerations} live generations (failed ones are refunded and excluded).`,
                s.unknownCost ? `${s.unknownCost} generation(s) have unknown cost.` : "",
              ]
                .filter(Boolean)
                .join("\n")}
            >
              <Coins size={12} className="text-accent" />
              <span>
                <b className="font-semibold text-ink">{s.balance == null ? "—" : fmt(s.balance)}</b> credits
              </span>
              <span className="text-faint">·</span>
              <span>
                <b className="font-semibold text-ink">{fmtUsd(s.runUsdSpent, 2)}</b> this run
              </span>
            </span>
          )}
          {s && (
            <span
              title={s.mock ? "No LEONARDO_API_KEY (or LEONARDO_MOCK=1) — generations are simulated placeholders" : "Calling the live Leonardo API"}
              className={`hidden rounded-full px-2.5 py-1 font-medium sm:inline ${s.mock ? "bg-warn/15 text-warn" : "bg-good/15 text-good"}`}
            >
              {s.mock ? "MOCK" : "LIVE"}
            </span>
          )}
          {s && (
            <button
              onClick={signOut}
              title={`Signed in as ${s.user.name} — click to sign out`}
              className="group flex items-center gap-1.5 rounded-full border border-line bg-panel py-0.5 pr-2 pl-0.5 text-muted hover:text-ink"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/20 text-[10px] font-bold text-accent-2">{initials(s.user.name)}</span>
              <span className="hidden max-w-24 truncate sm:inline">{s.user.name}</span>
              <LogOut size={12} className="text-faint group-hover:text-ink" />
            </button>
          )}
        </div>
      </div>
      {!!s?.setupProblems?.length && (
        <div className="border-t border-bad/40 bg-bad/10 px-5 py-2 text-xs text-bad">
          Setup problem: {s.setupProblems.join(" · ")}. Fix it in Vercel → Settings → Environment Variables (or Storage → connect), then redeploy.
        </div>
      )}
    </header>
  );
}
