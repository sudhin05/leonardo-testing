"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Coins, FlaskConical, Loader2 } from "lucide-react";
import { api, fmtUsd } from "@/lib/client";

type Status = {
  mock: boolean;
  hasKey: boolean;
  counts: Record<string, number>;
  balance: number | null;
  creditsPerUsd: number;
  usdSpent: number;
  unknownCost: number;
  estimatedCost: number;
  liveGenerations: number;
};

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

const LINKS = [
  { href: "/", label: "Compare" },
  { href: "/matrix", label: "Matrix" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/library", label: "Library" },
  { href: "/models", label: "Models" },
];

export function Nav() {
  const path = usePathname();
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api<Status>("/api/status").then((v) => alive && setS(v)).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const active = s ? (s.counts.queued ?? 0) + (s.counts.submitting ?? 0) + (s.counts.pending ?? 0) : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="flex h-14 items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent">
            <FlaskConical size={16} />
          </span>
          Model Lab
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 transition ${on ? "bg-panel-3 text-ink" : "text-muted hover:text-ink"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {active > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-muted">
              <Loader2 size={12} className="animate-spin text-accent" />
              {active} generating
            </span>
          )}
          {s && !s.mock && (
            <span
              className="flex items-center gap-2 rounded-full border border-line bg-panel px-2.5 py-1 text-muted"
              title={[
                s.balance != null
                  ? `Balance: ${fmt(s.balance)} API credits ≈ ${fmtUsd(s.balance / s.creditsPerUsd, 2)} (read live from Leonardo; includes usage outside this app).`
                  : "Balance unavailable.",
                `Spent by Model Lab: ${fmtUsd(s.usdSpent, 2)} ≈ ${fmt(s.usdSpent * s.creditsPerUsd)} credits over ${s.liveGenerations} live generations (failed ones are refunded and excluded).`,
                s.estimatedCost ? `${s.estimatedCost} of these costs are estimates.` : "",
                s.unknownCost ? `${s.unknownCost} generation(s) have unknown cost.` : "",
                `Conversion: ${s.creditsPerUsd} credits per USD (measured from balance changes).`,
              ]
                .filter(Boolean)
                .join("\n")}
            >
              <Coins size={12} className="text-accent" />
              <span>
                <b className="font-semibold text-ink">{s.balance == null ? "—" : fmt(s.balance)}</b> credits
                {s.balance != null && <span className="text-faint"> ≈ {fmtUsd(s.balance / s.creditsPerUsd, 2)}</span>}
              </span>
              <span className="text-faint">·</span>
              <span>
                <b className="font-semibold text-ink">{fmtUsd(s.usdSpent, 2)}</b> spent here
                {s.unknownCost ? <span className="text-warn"> (+{s.unknownCost} unknown)</span> : null}
              </span>
            </span>
          )}
          {s && (
            <span
              title={s.mock ? "No LEONARDO_API_KEY (or LEONARDO_MOCK=1) — generations are simulated placeholders" : "Calling the live Leonardo API"}
              className={`rounded-full px-2.5 py-1 font-medium ${
                s.mock ? "bg-warn/15 text-warn" : "bg-good/15 text-good"
              }`}
            >
              {s.mock ? "MOCK MODE" : "LIVE API"}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
