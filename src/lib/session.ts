/**
 * Team sign-in: one shared password (TEAM_PASSWORD) + each person picks their name.
 * The session is a signed cookie (HMAC-SHA256 via Web Crypto), so it can be checked in middleware
 * (edge runtime) without a database. Edge-safe: no Node imports here.
 */

export const SESSION_COOKIE = "lab_session";
export const RUN_COOKIE = "lab_run";
export const SESSION_DAYS = 60;

export type Session = { uid: number; name: string; iat: number };

function secret() {
  // A dedicated SESSION_SECRET is best; otherwise derive from the team password (rotating it signs everyone out).
  return process.env.SESSION_SECRET || `model-lab:${process.env.TEAM_PASSWORD ?? "local-dev"}`;
}

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signSession(s: Session): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(s)));
  return `${body}.${await hmac(body)}`;
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if ((await hmac(body)) !== sig) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (!s.uid || Date.now() - s.iat > SESSION_DAYS * 864e5) return null;
    return s;
  } catch {
    return null;
  }
}

/** Constant-time-ish comparison for the team password. */
export function passwordOk(given: string) {
  const want = process.env.TEAM_PASSWORD ?? "";
  if (!want) return true; // local dev without a password: anyone on this machine
  if (given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
