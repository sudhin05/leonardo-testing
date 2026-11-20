import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, MEDIA_DIR, UPLOAD_DIR, db } from "./db";

/**
 * A "round" = one prompt sheet's worth of testing. Starting a new round archives the current one
 * (database snapshot + generated media + reference uploads) to data/archive/<stamp>/ and clears it,
 * keeping model settings. Nothing is deleted outright.
 */

export const ARCHIVE_DIR = path.join(DATA_DIR, "archive");

export type ArchiveInfo = { name: string; created: string; prompts: number; generations: number; spentUsd: number };

export function listArchives(): ArchiveInfo[] {
  if (!fs.existsSync(ARCHIVE_DIR)) return [];
  return fs
    .readdirSync(ARCHIVE_DIR)
    .filter((n) => fs.existsSync(path.join(ARCHIVE_DIR, n, "round.json")))
    .map((n) => JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, n, "round.json"), "utf8")) as ArchiveInfo)
    .sort((a, b) => b.created.localeCompare(a.created));
}

export function startNewRound(label = ""): ArchiveInfo {
  const d = db();
  const active = (d.prepare("SELECT COUNT(*) AS n FROM generations WHERE status IN ('queued','submitting','pending')").get() as { n: number }).n;
  if (active) throw new Error(`${active} generation(s) still running — wait for them to finish before starting a new round`);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const name = slug ? `${stamp}_${slug}` : stamp;
  const dir = path.join(ARCHIVE_DIR, name);
  fs.mkdirSync(dir, { recursive: true });

  const count = (sql: string) => (d.prepare(sql).get() as { n: number }).n;
  const info: ArchiveInfo = {
    name,
    created: now.toISOString(),
    prompts: count("SELECT COUNT(*) AS n FROM prompts"),
    generations: count("SELECT COUNT(*) AS n FROM generations"),
    spentUsd: (d.prepare("SELECT COALESCE(SUM(credit_cost),0) AS n FROM generations WHERE mock = 0 AND status = 'complete'").get() as { n: number }).n,
  };

  // 1. consistent copy of the whole database (open it later with any SQLite viewer, or swap it back in)
  d.exec(`VACUUM INTO '${path.join(dir, "lab.db").replace(/'/g, "''")}'`);
  // 2. move the files (fast rename, same disk), then recreate empty folders
  for (const [src, sub] of [
    [MEDIA_DIR, "media"],
    [UPLOAD_DIR, "uploads"],
  ] as const) {
    if (fs.existsSync(src)) fs.renameSync(src, path.join(dir, sub));
    fs.mkdirSync(src, { recursive: true });
  }
  // 3. clear round data; ids keep counting up (AUTOINCREMENT), so cached /api/media URLs never point at new files
  d.exec(`
    DELETE FROM scores; DELETE FROM outputs; DELETE FROM generations; DELETE FROM runs;
    DELETE FROM prompts; DELETE FROM products; DELETE FROM balance_log;
  `);
  fs.writeFileSync(path.join(dir, "round.json"), JSON.stringify(info, null, 2));
  return info;
}
