import path from "node:path";
import fs from "node:fs";
import { createClient, type Client, type InArgs } from "@libsql/client";

/**
 * Database: libSQL (SQLite dialect).
 *  - Local:    file:data/lab.db (default)
 *  - Deployed: Turso — TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (or DATABASE_URL / DATABASE_AUTH_TOKEN)
 * Same SQL everywhere; every call is async.
 */

/** LAB_DATA_DIR lets a second local instance (tests, demos) use its own copy. */
export const DATA_DIR = process.env.LAB_DATA_DIR || path.join(process.cwd(), "data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const REMOTE_URL = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "";
export const IS_REMOTE_DB = /^(libsql|https?|wss?):/i.test(REMOTE_URL);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS test_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_run_id INTEGER REFERENCES test_runs(id) ON DELETE CASCADE,
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
  test_run_id INTEGER REFERENCES test_runs(id) ON DELETE CASCADE,
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
  source TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
  cost_source TEXT,
  create_response TEXT,
  ref_image TEXT,
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
CREATE INDEX IF NOT EXISTS idx_out_gen ON outputs(generation_id);
CREATE TABLE IF NOT EXISTS votes (
  output_id INTEGER NOT NULL REFERENCES outputs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_accuracy INTEGER,
  realism INTEGER,
  color INTEGER,
  keep INTEGER,
  notes TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (output_id, user_id)
);
CREATE TABLE IF NOT EXISTS media (
  key TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  content_type TEXT,
  size INTEGER
);
CREATE TABLE IF NOT EXISTS balance_log (ts INTEGER PRIMARY KEY, balance REAL NOT NULL);
`;

type G = typeof globalThis & { __labClient?: Client; __labReady?: Promise<void>; __labReadyVersion?: number };
/** Bump when migrate() changes, so a dev server holding a connection re-runs it after hot reload. */
const DB_VERSION = 3;

function client(): Client {
  const g = globalThis as G;
  if (g.__labClient) return g.__labClient;
  let c: Client;
  if (IS_REMOTE_DB) {
    c = createClient({ url: REMOTE_URL, authToken: process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN });
  } else {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    c = createClient({ url: `file:${path.join(DATA_DIR, "lab.db")}` });
  }
  g.__labClient = c;
  return c;
}

async function ready() {
  const g = globalThis as G;
  if (!g.__labReady || g.__labReadyVersion !== DB_VERSION) {
    g.__labReadyVersion = DB_VERSION;
    g.__labReady = (async () => {
      const c = client();
      if (!IS_REMOTE_DB) await c.execute("PRAGMA journal_mode = WAL");
      await c.execute("PRAGMA foreign_keys = ON");
      await migrateLegacy(c); // must run before SCHEMA so new indexes find their columns
      await c.executeMultiple(SCHEMA);
      await migrate(c);
    })().catch((e) => {
      g.__labReady = undefined;
      throw e;
    });
  }
  return g.__labReady;
}

async function columns(c: Client, table: string) {
  const rs = await c.execute(`PRAGMA table_info(${table})`);
  return rs.rows.map((r) => String(r.name));
}

/** Columns added by earlier single-user versions, for databases created before them. */
async function migrateLegacy(c: Client) {
  const tables = (await c.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => String(r.name));
  const add = async (table: string, col: string, decl: string) => {
    if (!tables.includes(table)) return;
    if (!(await columns(c, table)).includes(col)) await c.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  };
  await add("generations", "ref_image", "TEXT");
  await add("generations", "cost_source", "TEXT");
  await add("generations", "create_response", "TEXT");
  await add("prompts", "source", "TEXT DEFAULT ''");
  await add("prompts", "test_run_id", "INTEGER REFERENCES test_runs(id) ON DELETE CASCADE");
  await add("prompts", "created_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL");
  await add("products", "test_run_id", "INTEGER REFERENCES test_runs(id) ON DELETE CASCADE");
  await add("runs", "created_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL");
}

/** Data moves from the single-user layout: loose prompts become a test run; old single scores become votes. */
async function migrate(c: Client) {
  const orphan = await c.execute("SELECT COUNT(*) AS n FROM prompts WHERE test_run_id IS NULL");
  if (Number(orphan.rows[0].n) > 0) {
    const r = await c.execute({ sql: "INSERT INTO test_runs (name, notes) VALUES (?, ?)", args: ["Imported test run", "Created from the single-user version"] });
    const id = Number(r.lastInsertRowid);
    await c.execute({ sql: "UPDATE prompts SET test_run_id = ? WHERE test_run_id IS NULL", args: [id] });
    await c.execute({ sql: "UPDATE products SET test_run_id = ? WHERE test_run_id IS NULL", args: [id] });
  }
  const hasScores = (await c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='scores'")).rows.length > 0;
  if (hasScores) {
    const n = Number((await c.execute("SELECT COUNT(*) AS n FROM scores")).rows[0].n);
    if (n > 0) {
      await c.execute("INSERT OR IGNORE INTO users (name) VALUES ('Earlier scores')");
      await c.execute(`INSERT OR IGNORE INTO votes (output_id, user_id, text_accuracy, realism, color, keep, notes, updated_at)
        SELECT s.output_id, (SELECT id FROM users WHERE name = 'Earlier scores'), s.text_accuracy, s.realism, s.color, s.keep, s.notes, s.updated_at
        FROM scores s WHERE s.output_id IN (SELECT id FROM outputs)`);
    }
    await c.execute("DROP TABLE scores");
  }
}

// ── query helpers ──────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

export async function all<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  await ready();
  const rs = await client().execute({ sql, args });
  return rs.rows.map((r) => ({ ...r })) as T[];
}

export async function get<T = Row>(sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

export async function run(sql: string, args: InArgs = []): Promise<{ changes: number; id: number }> {
  await ready();
  const rs = await client().execute({ sql, args });
  return { changes: rs.rowsAffected, id: Number(rs.lastInsertRowid ?? 0) };
}

/** Several writes atomically. */
export async function tx(stmts: { sql: string; args?: InArgs }[]) {
  await ready();
  await client().batch(
    stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    "write",
  );
}

export async function getSetting(key: string, fallback: string): Promise<string> {
  return (await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]))?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
}
