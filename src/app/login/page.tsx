"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Loader2, LogIn } from "lucide-react";

/** Team sign-in: the shared team password + who you are. Votes are recorded under this name. */
export default function LoginPage() {
  const [names, setNames] = useState<string[]>([]);
  const [needPassword, setNeedPassword] = useState(true);
  const [name, setName] = useState("");
  const [custom, setCustom] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [loadErr, setLoadErr] = useState("");

  // Only hide the password box when the server explicitly says none is needed; a failed lookup keeps it visible.
  const loadUsers = () => {
    setLoadErr("");
    fetch("/api/auth/users", { cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { names?: string[]; passwordRequired?: boolean; error?: string };
        if (!r.ok) throw new Error(d.error ?? `Server error (${r.status})`);
        setNames(d.names ?? []);
        setNeedPassword(d.passwordRequired !== false);
        setCustom(!d.names?.length);
      })
      .catch((e: Error) => {
        setNeedPassword(true);
        setCustom(true);
        setLoadErr(`Couldn't load the team list — ${e.message}. You can still sign in by typing your name.`);
      });
  };
  useEffect(loadUsers, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Sign-in failed");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") ? next : "/";
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-panel p-7 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
            <FlaskConical size={18} />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Model Lab</h1>
            <p className="text-xs text-muted">Team sign-in</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted">Who are you?</label>
          {!custom && names.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {names.map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setName(n)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      name === n ? "border-accent/60 bg-accent/15 text-ink" : "border-line text-muted hover:border-line-2 hover:text-ink"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => (setCustom(true), setName(""))} className="text-xs text-accent hover:underline">
                I&apos;m new here
              </button>
            </>
          ) : (
            <>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your first name"
                maxLength={40}
                className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none focus:border-accent/60"
              />
              {names.length > 0 && (
                <button type="button" onClick={() => setCustom(false)} className="text-xs text-accent hover:underline">
                  Pick an existing name
                </button>
              )}
            </>
          )}
        </div>

        {needPassword && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted">Team password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </div>
        )}

        {loadErr && (
          <p className="text-xs text-warn">
            {loadErr}{" "}
            <button type="button" onClick={loadUsers} className="underline">
              Retry
            </button>
          </p>
        )}
        {err && <p className="text-sm text-bad">{err}</p>}

        <button
          type="submit"
          disabled={busy || !name.trim() || (needPassword && !password)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} Sign in
        </button>
        <p className="text-center text-[11px] text-faint">Your votes are shown to the team under this name.</p>
      </form>
    </div>
  );
}
