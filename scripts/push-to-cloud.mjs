// One-off: copy the local Model Lab (data/lab.db + images) into the hosted setup (Turso + Vercel Blob),
// so test runs, results and votes made locally appear in the deployed app.
//
//   node --env-file=.env.cloud scripts/push-to-cloud.mjs            (refuses if the cloud DB already has test runs)
//   node --env-file=.env.cloud scripts/push-to-cloud.mjs --force    (merge/overwrite rows with the same ids)
//
// .env.cloud needs TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and BLOB_READ_WRITE_TOKEN (same values as in Vercel).
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@libsql/client";
import { put } from "@vercel/blob";

const need = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "BLOB_READ_WRITE_TOKEN"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing ${missing.join(", ")} — run with: node --env-file=.env.cloud scripts/push-to-cloud.mjs`);
  process.exit(1);
}
const force = process.argv.includes("--force");
const dataDir = process.env.LAB_DATA_DIR || path.join(process.cwd(), "data");
const local = new DatabaseSync(path.join(dataDir, "lab.db"), { readOnly: true });
const remote = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const TABLES = ["users", "test_runs", "products", "prompts", "model_settings", "settings", "runs", "generations", "outputs", "votes", "balance_log", "media"];

// 1. schema (same definitions as the local database)
for (const t of TABLES) {
  const row = local.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  if (!row) throw new Error(`Local database has no ${t} table — open the app locally once so it migrates, then retry`);
  await remote.execute(row.sql.replace(/^CREATE TABLE\s+(IF NOT EXISTS\s+)?/i, "CREATE TABLE IF NOT EXISTS "));
}
for (const { sql } of local.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL").all()) {
  await remote.execute(sql.replace(/^CREATE (UNIQUE )?INDEX\s+(IF NOT EXISTS\s+)?/i, (_m, u) => `CREATE ${u ?? ""}INDEX IF NOT EXISTS `));
}

const existing = Number((await remote.execute("SELECT COUNT(*) AS n FROM test_runs")).rows[0].n);
if (existing && !force) {
  console.error(`The cloud database already has ${existing} test run(s). Re-run with --force to merge (rows with the same id are overwritten).`);
  process.exit(1);
}

// 2. rows
for (const t of TABLES.filter((t) => t !== "media")) {
  const rows = local.prepare(`SELECT * FROM ${t}`).all();
  if (!rows.length) continue;
  const cols = Object.keys(rows[0]);
  const sql = `INSERT OR REPLACE INTO ${t} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
  for (let i = 0; i < rows.length; i += 50) {
    await remote.batch(
      rows.slice(i, i + 50).map((r) => ({ sql, args: cols.map((c) => (r[c] === undefined ? null : r[c])) })),
      "write",
    );
  }
  console.log(`${t}: ${rows.length} rows`);
}

// 3. files → Vercel Blob, recorded in the media table (the deployed app redirects /api/media/... to these URLs)
const TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4" };
const files = [
  ...local.prepare("SELECT DISTINCT local_path AS f FROM outputs WHERE local_path IS NOT NULL").all().map((r) => ["media", r.f]),
  ...local
    .prepare("SELECT ref_image AS f FROM products WHERE ref_image IS NOT NULL UNION SELECT input_image FROM prompts WHERE input_image IS NOT NULL")
    .all()
    .map((r) => ["uploads", r.f]),
];
let done = 0;
let skipped = 0;
for (const [folder, name] of files) {
  const file = path.join(dataDir, folder, name);
  if (!fs.existsSync(file)) {
    skipped++;
    continue;
  }
  const key = `${folder}/${name}`;
  const have = await remote.execute({ sql: "SELECT 1 FROM media WHERE key = ?", args: [key] });
  if (have.rows.length && !force) continue;
  const data = fs.readFileSync(file);
  const contentType = TYPES[name.split(".").pop().toLowerCase()] ?? "application/octet-stream";
  const blob = await put(key, data, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType });
  await remote.execute({
    sql: "INSERT OR REPLACE INTO media (key, url, content_type, size) VALUES (?, ?, ?, ?)",
    args: [key, blob.url, contentType, data.length],
  });
  done++;
  if (done % 10 === 0) console.log(`  uploaded ${done}/${files.length} files…`);
}
console.log(`files: ${done} uploaded, ${skipped} missing locally (skipped)`);
console.log("Done. Open the deployed app — your test runs should be there.");
