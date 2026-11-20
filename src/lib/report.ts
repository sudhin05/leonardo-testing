import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { all, get } from "./db";
import { listModels } from "./registry";
import { readFile, type Folder } from "./storage";
import { leaderboard, matrixCells, votesFor } from "./stats";

/**
 * PDF report = summary page (leaderboard) + the Matrix (prompt × model thumbnails), A3 landscape.
 * Models are split into groups of MODELS_PER_PAGE columns when there are more than fit across.
 */

const PAGE = { w: 1190.55, h: 841.89 }; // A3 landscape, points
const M = 36; // margin
const MODELS_PER_PAGE = 6;
const C = {
  ink: "#16181d",
  muted: "#5b6170",
  faint: "#9aa0ad",
  line: "#dfe2e8",
  panel: "#f4f5f8",
  accent: "#6d4dff",
  good: "#0f9f6e",
  bad: "#d64545",
  warn: "#b7791f",
};

type PromptRow = {
  id: number;
  test_id: string;
  ad_category: string;
  prompt: string;
  criteria: string;
  aspect_ratio: string;
  input_mode: string;
  input_image: string | null;
  product_ref_image: string | null;
  sku: string | null;
};

/**
 * A TTF with ₹, curly quotes etc. DejaVu ships with the app (npm dejavu-fonts-ttf) so hosted Linux builds have it;
 * Helvetica (Latin-1 only) is the last resort.
 */
function pickFonts() {
  const bundled = path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf");
  const candidates = [
    [path.join(bundled, "DejaVuSans.ttf"), path.join(bundled, "DejaVuSans-Bold.ttf")],
    ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"],
    ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
  ];
  for (const [r, b] of candidates) if (fs.existsSync(r) && fs.existsSync(b)) return { regular: r, bold: b, unicode: true };
  return { regular: "Helvetica", bold: "Helvetica-Bold", unicode: false };
}

const thumbCache = new Map<string, Buffer | null>();
async function thumb(file: string | null, folder: Folder, max = 520): Promise<Buffer | null> {
  if (!file || /\.(mp4|webm|mov)$/i.test(file)) return null;
  const key = `${folder}/${file}|${max}`;
  if (thumbCache.has(key)) return thumbCache.get(key)!;
  let out: Buffer | null = null;
  try {
    const data = await readFile(folder, file);
    if (data) {
      out = await sharp(data).rotate().resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
    }
  } catch {
    out = null;
  }
  thumbCache.set(key, out);
  return out;
}

const usd = (v: number | null | undefined, d?: number) => (v == null ? "—" : `$${v.toFixed(d ?? (Math.abs(v) < 1 ? 3 : 2))}`);
const num = (v: number | null | undefined, d = 1) => (v == null ? "—" : Number(v).toFixed(d));

export async function buildReport(opts: { runId: number; userId: number; category?: string }): Promise<Buffer> {
  thumbCache.clear(); // retried generations overwrite their files, so never reuse thumbs across reports
  const category = opts.category ?? "";
  const fonts = pickFonts();
  const clean = (s: string) => (fonts.unicode ? s : s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xff]/g, "?"));

  const testRun = await get<{ name: string }>("SELECT name FROM test_runs WHERE id = ?", [opts.runId]);
  const prompts = await all<PromptRow>(
    `SELECT p.id, p.test_id, p.ad_category, p.prompt, p.criteria, p.aspect_ratio, p.input_mode, p.input_image,
            pr.ref_image AS product_ref_image, pr.sku
     FROM prompts p LEFT JOIN products pr ON pr.id = p.product_id
     WHERE p.test_run_id = ? AND p.kind = 'image' AND (? = '' OR p.ad_category = ?) ORDER BY p.test_id`,
    [opts.runId, category, category],
  );
  const cells = (await matrixCells(opts.runId, opts.userId)).filter((c) => prompts.some((p) => p.id === c.prompt_id));
  const cellMap = new Map(cells.map((c) => [`${c.prompt_id}|${c.model_key}`, c]));
  const used = new Set(cells.map((c) => c.model_key));
  const models = (await listModels()).filter((m) => m.kind === "image" && used.has(m.key));
  const voteRows = await votesFor(cells.map((c) => c.output_id).filter((x): x is number => !!x));
  const votesByOutput = new Map<number, typeof voteRows>();
  for (const v of voteRows) votesByOutput.set(v.output_id, [...(votesByOutput.get(v.output_id) ?? []), v]);
  const voterNames = [...new Set(voteRows.map((v) => v.name))];

  const live = await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM generations g JOIN prompts p ON p.id = g.prompt_id WHERE p.test_run_id = ? AND g.mock = 0",
    [opts.runId],
  );
  const lb = await leaderboard(opts.runId, category, (live?.n ?? 0) === 0);
  const spend = cells.reduce((a, c) => a + (c.credit_cost ?? 0), 0);

  const doc = new PDFDocument({ size: "A3", layout: "landscape", margin: M, info: { Title: "Model Lab report", Creator: "Model Lab" } });
  doc.registerFont("r", fonts.regular);
  doc.registerFont("b", fonts.bold);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const now = new Date();
  const stamp = now.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
  let pageNo = 1;
  const footer = () => {
    // the footer sits inside the bottom margin; drop the margin while drawing it, or pdfkit starts a blank page
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("r").fontSize(8).fillColor(C.faint);
    doc.text(`Model Lab · ${stamp} · page ${pageNo}`, M, PAGE.h - M + 10, { width: PAGE.w - 2 * M, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  };
  const newPage = () => {
    footer();
    doc.addPage();
    pageNo++;
  };

  // ── Summary page ──
  doc.font("b").fontSize(26).fillColor(C.ink).text("Model comparison report", M, M);
  doc
    .font("r")
    .fontSize(11)
    .fillColor(C.muted)
    .text(
      `Test run: ${clean(testRun?.name ?? "")}${category ? ` · Category: ${clean(category)}` : ""} · Generated ${stamp}${
        voterNames.length ? ` · Voters: ${clean(voterNames.join(", "))}` : ""
      }`,
      M,
      doc.y + 4,
    );

  const stats: [string, string][] = [
    ["Prompts", String(prompts.length)],
    ["Models compared", String(models.length)],
    ["Team votes", String(voteRows.length)],
    ["Cost of matrix results", usd(spend, 2)],
  ];
  let sx = M;
  const sy = doc.y + 18;
  for (const [k, v] of stats) {
    doc.roundedRect(sx, sy, 200, 56, 6).fill(C.panel);
    doc.font("r").fontSize(9).fillColor(C.muted).text(k.toUpperCase(), sx + 14, sy + 11, { characterSpacing: 0.6 });
    doc.font("b").fontSize(20).fillColor(C.ink).text(v, sx + 14, sy + 25);
    sx += 214;
  }

  // leaderboard table
  let y = sy + 90;
  doc.font("b").fontSize(14).fillColor(C.ink).text("Leaderboard", M, y);
  doc
    .font("r")
    .fontSize(9)
    .fillColor(C.muted)
    .text("Averages over every team member's votes (1–5). Keep rate = keep votes ÷ (keep + reject votes). Costs in USD as reported by Leonardo.", M, doc.y + 2);
  y = doc.y + 10;
  const cols: { h: string; w: number; get: (r: (typeof lb.rows)[number], i: number) => string; align?: "left" | "right" }[] = [
    { h: "#", w: 30, get: (_r, i) => String(i + 1) },
    { h: "Model", w: 230, get: (r) => `${r.label}  ·  ${r.vendor}` },
    { h: "Overall", w: 80, get: (r) => num(r.overall, 2), align: "right" },
    { h: "Text", w: 70, get: (r) => num(r.text_accuracy, 2), align: "right" },
    { h: "Realism", w: 70, get: (r) => num(r.realism, 2), align: "right" },
    { h: "Brand colour", w: 90, get: (r) => num(r.color, 2), align: "right" },
    { h: "Keep rate", w: 80, get: (r) => (r.keep_rate == null ? "—" : `${Math.round(r.keep_rate * 100)}%`), align: "right" },
    { h: "Votes", w: 80, get: (r) => `${r.votes ?? 0} (${r.scored ?? 0}/${r.outputs ?? 0})`, align: "right" },
    { h: "Success", w: 70, get: (r) => (r.gens ? `${Math.round((r.ok / r.gens) * 100)}%` : "—"), align: "right" },
    { h: "Avg time", w: 80, get: (r) => (r.latency_ms == null ? "—" : `${(r.latency_ms / 1000).toFixed(1)}s`), align: "right" },
    { h: "$ / image", w: 80, get: (r) => usd(r.cost_per_image), align: "right" },
    { h: "Total $", w: 80, get: (r) => usd(r.total_cost, 2), align: "right" },
  ];
  const tableW = cols.reduce((a, c) => a + c.w, 0);
  const drawHead = () => {
    doc.rect(M, y, tableW, 22).fill(C.ink);
    let x = M;
    doc.font("b").fontSize(9).fillColor("#ffffff");
    for (const c of cols) {
      doc.text(c.h, x + 8, y + 7, { width: c.w - 16, align: c.align ?? "left", lineBreak: false });
      x += c.w;
    }
    y += 22;
  };
  drawHead();
  lb.rows.forEach((r, i) => {
    if (y > PAGE.h - M - 40) {
      newPage();
      y = M;
      drawHead();
    }
    if (i % 2 === 0) doc.rect(M, y, tableW, 22).fill(C.panel);
    let x = M;
    for (const c of cols) {
      doc.font(c.h === "Model" || c.h === "Overall" ? "b" : "r").fontSize(9.5).fillColor(C.ink);
      doc.text(clean(c.get(r, i)), x + 8, y + 7, { width: c.w - 16, align: c.align ?? "left", lineBreak: false, ellipsis: true });
      x += c.w;
    }
    y += 22;
  });
  if (!lb.rows.length) doc.font("r").fontSize(10).fillColor(C.muted).text("No generations yet.", M, y + 8);

  // ── Matrix pages ──
  const groups: (typeof models)[] = [];
  for (let i = 0; i < models.length; i += MODELS_PER_PAGE) groups.push(models.slice(i, i + MODELS_PER_PAGE));
  const PROMPT_W = 220;
  const REF_W = 110;

  for (const [gi, group] of groups.entries()) {
    const cellW = (PAGE.w - 2 * M - PROMPT_W - REF_W) / group.length;
    const boxW = cellW - 12;
    const boxH = Math.min(boxW * 1.25, 230);
    const rowH = boxH + 42;

    const header = () => {
      doc.font("b").fontSize(14).fillColor(C.ink).text("Matrix", M, M);
      doc
        .font("r")
        .fontSize(9)
        .fillColor(C.muted)
        .text(
          `Newest result per prompt × model. Inset in the reference column = image sent to the models.${
            groups.length > 1 ? `  Models ${gi * MODELS_PER_PAGE + 1}–${gi * MODELS_PER_PAGE + group.length} of ${models.length}.` : ""
          }`,
          M,
          M + 18,
        );
      const hy = M + 36;
      doc.rect(M, hy, PAGE.w - 2 * M, 30).fill(C.ink);
      doc.font("b").fontSize(9).fillColor("#ffffff");
      doc.text("Prompt", M + 8, hy + 10, { width: PROMPT_W - 16, lineBreak: false });
      doc.text("Reference", M + PROMPT_W + 8, hy + 10, { width: REF_W - 16, lineBreak: false });
      group.forEach((m, i) => {
        const x = M + PROMPT_W + REF_W + i * cellW;
        doc.font("b").fontSize(9).fillColor("#ffffff").text(clean(m.label), x + 6, hy + 5, { width: cellW - 12, lineBreak: false, ellipsis: true });
        doc.font("r").fontSize(7.5).fillColor("#c9cbe0").text(clean(m.vendor), x + 6, hy + 17, { width: cellW - 12, lineBreak: false, ellipsis: true });
      });
      return hy + 30;
    };

    newPage();
    let ry = header();
    for (const [pi, p] of prompts.entries()) {
      if (ry + rowH > PAGE.h - M) {
        newPage();
        ry = header();
      }
      if (pi % 2 === 1) doc.rect(M, ry, PAGE.w - 2 * M, rowH).fill("#fafbfc");
      doc.moveTo(M, ry + rowH).lineTo(PAGE.w - M, ry + rowH).lineWidth(0.5).strokeColor(C.line).stroke();

      // prompt column
      const px = M + 8;
      doc.font("b").fontSize(10).fillColor(C.accent).text(clean(p.test_id), px, ry + 8, { continued: true });
      doc.font("r").fontSize(8).fillColor(C.muted).text(`   ${p.aspect_ratio}${p.input_mode === "reference" ? " · image→image" : ""}${p.sku ? ` · ${clean(p.sku)}` : ""}`);
      doc.font("b").fontSize(9).fillColor(C.ink).text(clean(p.ad_category || "—"), px, doc.y + 2, { width: PROMPT_W - 16 });
      const textTop = doc.y + 3;
      const textH = rowH - (textTop - ry) - (p.criteria ? 30 : 8);
      doc.font("r").fontSize(7.5).fillColor(C.muted).text(clean(p.prompt), px, textTop, { width: PROMPT_W - 16, height: Math.max(20, textH), ellipsis: true });
      if (p.criteria) {
        doc.font("b").fontSize(7).fillColor(C.ink).text("Check: ", px, ry + rowH - 26, { continued: true, width: PROMPT_W - 16 });
        doc.font("r").fontSize(7).fillColor(C.muted).text(clean(p.criteria), { width: PROMPT_W - 16, height: 20, ellipsis: true });
      }

      // reference column
      const refFile = p.input_image ?? (p.input_mode === "reference" ? p.product_ref_image : null);
      const rx = M + PROMPT_W + 8;
      const refBox = Math.min(REF_W - 16, boxH);
      const refImg = await thumb(refFile, "uploads", 360);
      if (refImg) {
        doc.rect(rx, ry + 8, refBox, refBox).fill(C.panel);
        doc.image(refImg, rx, ry + 8, { fit: [refBox, refBox], align: "center", valign: "center" });
      } else {
        doc.font("r").fontSize(8).fillColor(C.faint).text(p.input_mode === "reference" ? "missing" : "text only", rx, ry + 12, { width: refBox });
      }

      // model cells
      for (const [mi, m] of group.entries()) {
        const x = M + PROMPT_W + REF_W + mi * cellW + 6;
        const c = cellMap.get(`${p.id}|${m.key}`);
        const by = ry + 8;
        doc.rect(x, by, boxW, boxH).fill(C.panel);
        if (!c) {
          doc.font("r").fontSize(8).fillColor(C.faint).text("not run", x, by + boxH / 2 - 4, { width: boxW, align: "center" });
          continue;
        }
        if (c.status === "failed") {
          doc.font("b").fontSize(8).fillColor(C.bad).text("FAILED", x, by + boxH / 2 - 4, { width: boxW, align: "center" });
          continue;
        }
        if (!c.output_id) {
          doc.font("r").fontSize(8).fillColor(C.faint).text(c.status, x, by + boxH / 2 - 4, { width: boxW, align: "center" });
          continue;
        }
        const img = c.media_type === "video" ? null : await thumb(c.local_path, "media");
        if (img) doc.image(img, x, by, { fit: [boxW, boxH], align: "center", valign: "center" });
        else doc.font("r").fontSize(8).fillColor(C.faint).text(c.media_type === "video" ? "video" : "image not downloaded", x, by + boxH / 2 - 4, { width: boxW, align: "center" });

        if (c.ref_image) {
          const ins = await thumb(c.ref_image, "uploads", 160);
          if (ins) {
            const s = Math.min(boxW, boxH) * 0.26;
            doc.rect(x + 3, by + 3, s, s).fill("#ffffff");
            doc.image(ins, x + 4, by + 4, { fit: [s - 2, s - 2], align: "center", valign: "center" });
          }
        }
        // team tally badge: keep · reject
        if (c.keep_yes || c.keep_no) {
          const label = `KEEP ${c.keep_yes} · REJ ${c.keep_no}`;
          const bw = 66;
          const tone = c.keep_yes > c.keep_no ? C.good : c.keep_no > c.keep_yes ? C.bad : C.warn;
          doc.roundedRect(x + boxW - bw - 4, by + boxH - 16, bw, 12, 2).fill(tone);
          doc.font("b").fontSize(7).fillColor("#ffffff").text(label, x + boxW - bw - 4, by + boxH - 13.5, { width: bw, align: "center", lineBreak: false });
        }

        const ty = by + boxH + 5;
        doc
          .font("b")
          .fontSize(8)
          .fillColor(C.ink)
          .text(c.overall == null ? "no votes" : `${Number(c.overall).toFixed(1)} / 5 · ${c.votes_n} vote${c.votes_n === 1 ? "" : "s"}`, x, ty, {
            width: (boxW * 2) / 3,
            lineBreak: false,
          });
        doc.font("r").fontSize(8).fillColor(C.muted).text(usd(c.credit_cost), x + (boxW * 2) / 3, ty, { width: boxW / 3, align: "right", lineBreak: false });
        const vs = votesByOutput.get(c.output_id) ?? [];
        if (vs.length) {
          const line = vs.map((v) => `${v.name.split(" ")[0]} ${v.keep === 1 ? "✓" : v.keep === 0 ? "✗" : "·"}${v.notes ? ` "${v.notes}"` : ""}`).join("  ");
          doc.font("r").fontSize(7).fillColor(C.muted).text(clean(line), x, ty + 11, { width: boxW, height: 18, ellipsis: true });
        }
      }
      ry += rowH;
    }
  }
  if (!prompts.length) {
    newPage();
    doc.font("r").fontSize(12).fillColor(C.muted).text("No prompts in this selection.", M, M);
  }

  footer();
  doc.end();
  return done;
}
