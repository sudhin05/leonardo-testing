// Merge an archived round (data/archive/<name>/ from the old "New round" button) back into the live
// local database as its own test run, with its images.
//
//   node scripts/merge-archive.mjs "<archive folder>" "<test run name>" [YYYY-MM-DD]
//
// Original ids are kept when they're free (ids never collide for archives made by this app, since
// AUTOINCREMENT kept counting). The script refuses to run if any id is already taken.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [archiveDir, runName, date] = process.argv.slice(2);
if (!archiveDir || !runName) {
  console.error('usage: node scripts/merge-archive.mjs "<archive folder>" "<test run name>" [YYYY-MM-DD]');
  process.exit(1);
}
const root = process.cwd();
const src = path.resolve(archiveDir);
const db = new DatabaseSync(path.join(root, "data", "lab.db"));
db.exec("PRAGMA foreign_keys = OFF");
db.exec(`ATTACH DATABASE '${path.join(src, "lab.db").replace(/'/g, "''")}' AS arc`);

for (const t of ["products", "prompts", "runs", "generations", "outputs"]) {
  const clash = db.prepare(`SELECT COUNT(*) AS n FROM main.${t} WHERE id IN (SELECT id FROM arc.${t})`).get().n;
  if (clash) throw new Error(`${clash} ${t} ids already exist in the live database; this archive needs id remapping`);
}

db.exec("BEGIN");
try {
  const created = date ? `${date} 09:00:00` : null;
  const runId = Number(
    db.prepare("INSERT INTO test_runs (name, notes, created_at) VALUES (?, ?, COALESCE(?, datetime('now')))")
      .run(runName, `Merged from archive ${path.basename(src)}`, created).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO main.products (id, test_run_id, sku, name, category, notes, ref_image, ref_leonardo_id, created_at)
     SELECT id, ?, sku, name, category, notes, ref_image, NULL, created_at FROM arc.products`,
  ).run(runId);
  db.prepare(
    `INSERT INTO main.prompts (id, test_run_id, test_id, ad_category, product_id, prompt, aspect_ratio, criteria, input_mode, input_image, input_leonardo_id, kind, source, created_at)
     SELECT id, ?, test_id, ad_category, product_id, prompt, aspect_ratio, criteria, input_mode, input_image, NULL, kind, COALESCE(source, ''), created_at FROM arc.prompts`,
  ).run(runId);
  db.exec(`INSERT INTO main.runs (id, prompt_id, prompt_text, aspect_ratio, quantity, created_at)
           SELECT id, prompt_id, prompt_text, aspect_ratio, quantity, created_at FROM arc.runs`);
  db.exec(`INSERT INTO main.generations (id, run_id, prompt_id, model_key, status, leonardo_id, request, error, credit_cost, cost_source, create_response, ref_image, width, height, mock, created_at, submitted_at, completed_at, last_polled_at)
           SELECT id, run_id, prompt_id, model_key, status, leonardo_id, request, error, credit_cost, cost_source, create_response, ref_image, width, height, mock, created_at, submitted_at, completed_at, last_polled_at FROM arc.generations`);
  db.exec(`INSERT INTO main.outputs (id, generation_id, idx, remote_url, local_path, media_type)
           SELECT id, generation_id, idx, remote_url, local_path, media_type FROM arc.outputs`);
  db.exec("COMMIT");
  console.log(`test run ${runId} "${runName}":`, {
    prompts: db.prepare("SELECT COUNT(*) AS n FROM prompts WHERE test_run_id = ?").get(runId).n,
    generations: db.prepare("SELECT COUNT(*) AS n FROM generations g JOIN prompts p ON p.id = g.prompt_id WHERE p.test_run_id = ?").get(runId).n,
  });
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}

// copy (not move) the files, so the archive stays intact
let copied = 0;
for (const sub of ["media", "uploads"]) {
  const from = path.join(src, sub);
  const to = path.join(root, "data", sub);
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    if (!fs.existsSync(path.join(to, f))) {
      fs.copyFileSync(path.join(from, f), path.join(to, f));
      copied++;
    }
  }
}
console.log(`copied ${copied} files`);
