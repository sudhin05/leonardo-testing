"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { api } from "@/lib/client";

type Status = { mock: boolean; hasKey: boolean; counts: Record<string, number>; creditsSpent: number };

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
            <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-muted">
              {Math.round(s.creditsSpent).toLocaleString()} credits used
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
