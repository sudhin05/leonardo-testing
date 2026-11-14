import path from "node:path";
import fs from "node:fs";
import type { DatabaseSync as DatabaseSyncT } from "node:sqlite";
import { SEED_PRODUCTS, SEED_PROMPTS } from "./seed";

// Load node:sqlite via getBuiltinModule so the bundler never tries to resolve it.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

export const DATA_DIR = path.join(process.cwd(), "data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  ref_image TEXT,
  ref_leonardo_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id TEXT NOT NULL,
  ad_category TEXT DEFAULT '',
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  aspect_ratio TEXT DEFAULT '1:1',
  criteria TEXT DEFAULT '',
  input_mode TEXT DEFAULT 'text',
  input_image TEXT,
  input_leonardo_id TEXT,
  kind TEXT DEFAULT 'image',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS model_settings (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  overrides TEXT DEFAULT '',
  custom INTEGER NOT NULL DEFAULT 0,
  custom_kind TEXT DEFAULT 'image'
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES runs(id) ON DELETE CASCADE,
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE CASCADE,
  model_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  leonardo_id TEXT,
  request TEXT,
  error TEXT,
  credit_cost REAL,
  width INTEGER,
  height INTEGER,
  mock INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  submitted_at INTEGER,
  completed_at INTEGER,
  last_polled_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_gen_prompt ON generations(prompt_id, model_key);
CREATE INDEX IF NOT EXISTS idx_gen_status ON generations(status);
CREATE TABLE IF NOT EXISTS outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generation_id INTEGER REFERENCES generations(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  remote_url TEXT,
  local_path TEXT,
  media_type TEXT DEFAULT 'image'
);
CREATE TABLE IF NOT EXISTS scores (
  output_id INTEGER PRIMARY KEY REFERENCES outputs(id) ON DELETE CASCADE,
  text_accuracy INTEGER,
  realism INTEGER,
  color INTEGER,
  keep INTEGER,
  notes TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);
`;

type G = typeof globalThis & { __labDb?: DatabaseSyncT };

export function db(): DatabaseSyncT {
  const g = globalThis as G;
  if (g.__labDb) return g.__labDb;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const d = new DatabaseSync(path.join(DATA_DIR, "lab.db"));
  d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  d.exec(SCHEMA);
  seedIfEmpty(d);
  g.__labDb = d;
  return d;
}

function seedIfEmpty(d: DatabaseSyncT) {
  const row = d.prepare("SELECT value FROM settings WHERE key = 'seeded'").get() as { value: string } | undefined;
  if (row) return;
  const insP = d.prepare("INSERT INTO products (sku, name, category, notes) VALUES (?, ?, ?, ?)");
  const skuToId = new Map<string, number>();
  for (const p of SEED_PRODUCTS) {
    const r = insP.run(p.sku, p.name, p.category, p.notes);
    skuToId.set(p.sku, Number(r.lastInsertRowid));
  }
  const insQ = d.prepare(
    "INSERT INTO prompts (test_id, ad_category, product_id, prompt, aspect_ratio, criteria, input_mode) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const q of SEED_PROMPTS) {
    insQ.run(q.test_id, q.ad_category, skuToId.get(q.sku) ?? null, q.prompt, q.aspect_ratio, q.criteria, q.input_mode);
  }
  d.prepare("INSERT INTO settings (key, value) VALUES ('seeded', '1')").run();
}

export function getSetting(key: string, fallback: string): string {
  const r = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
