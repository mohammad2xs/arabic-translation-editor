// scripts/audit-coverage.mjs
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from "fs";
import { join, basename } from "path";
import { loadTriviewForExport } from "../lib/export/triview-adapter.mjs";

function safeJson(p) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

function collectSourceSections(dir = "data/sections") {
  const out = new Map(); // sectionId -> { sectionId, rows:[{id}] }
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!/\.json$/i.test(f)) continue;
    const sectionId = basename(f, ".json");
    const full = join(dir, f);
    const st = statSync(full);
    if (!st.isFile()) continue;
    const j = safeJson(full);
    if (!j) continue;

    let arr = [];
    if (Array.isArray(j)) arr = j;
    else if (Array.isArray(j.rows)) arr = j.rows;
    else if (Array.isArray(j.data)) arr = j.data;
    else if (Array.isArray(j.items)) arr = j.items;

    const rows = arr.map((r, i) => {
      const id = (r && (r.id || r.ID)) ? (r.id || r.ID) : `${sectionId}-${String(i+1).padStart(3,"0")}`;
      return { id, sectionId };
    });

    out.set(sectionId, { sectionId, rows });
  }
  return out;
}

function collectTriviewRows() {
  const { sections } = loadTriviewForExport(process.cwd());
  const flat = [];
  for (const s of sections) {
    for (const r of (s.rows || [])) {
      // try to infer sectionId from metadata or from id prefix
      const sectionId = r?.metadata?.sectionId || (String(r.id).split("-")[0] || s.id);
      flat.push({
        id: String(r.id),
        sectionId,
        english: (r.english ?? "").trim(),
        enhanced: (r.enhanced ?? "").trim(),
      });
    }
  }
  const byId = new Map(flat.map(r => [r.id, r]));
  const bySection = new Map();
  for (const r of flat) {
    if (!bySection.has(r.sectionId)) bySection.set(r.sectionId, []);
    bySection.get(r.sectionId).push(r);
  }
  return { flat, byId, bySection };
}

function scanRuntimeRisks() {
  const paths = ["app", "lib"];
  const hits = [];
  const patt = /(\/api\/translate|\/api\/mcp\/translate|@anthropic-ai\/sdk|@google\/generative-ai|openai)/i;
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
        try {
          const txt = readFileSync(p, "utf8");
          if (patt.test(txt)) hits.push(p);
        } catch {}
      }
    }
  }
  paths.forEach(walk);
  // highlight anything under app/(components) used by /dad or /tri
  const risky = hits.filter(p => /app\/(\(components\)|dad|tri)/.test(p));
  return { hits, risky };
}

function write(file, content) {
  mkdirSync("outputs", { recursive: true });
  writeFileSync(file, content);
}

(function main() {
  const src = collectSourceSections();
  const { flat: tvRows, byId: tvById, bySection: tvBySection } = collectTriviewRows();

  const haveSource = src.size > 0;
  const sourceCounts = [];
  let sourceTotal = 0;
  for (const [sid, { rows }] of src.entries()) {
    sourceCounts.push({ sectionId: sid, count: rows.length });
    sourceTotal += rows.length;
  }
  sourceCounts.sort((a,b) => a.sectionId.localeCompare(b.sectionId));

  const triviewTotal = tvRows.length;

  // Build coverage & missing lists
  const missingInTriview = [];
  const missingEnglish = [];
  const missingEnhanced = [];

  if (haveSource) {
    for (const [sid, { rows }] of src.entries()) {
      for (const r of rows) {
        if (!tvById.has(String(r.id))) {
          missingInTriview.push({ sectionId: sid, id: String(r.id), reason: "absent_in_triview" });
        }
      }
    }
  }

  for (const r of tvRows) {
    if (!r.english) missingEnglish.push({ sectionId: r.sectionId, id: r.id, reason: "missing_english" });
    if (!r.enhanced) missingEnhanced.push({ sectionId: r.sectionId, id: r.id, reason: "missing_enhanced_arabic" });
  }

  // Per-section coverage
  const bySecSummary = [];
  const allSectionIds = new Set([
    ...Array.from(src.keys()),
    ...Array.from(tvBySection.keys()),
  ]);
  for (const sid of allSectionIds) {
    const srcCount = src.get(sid)?.rows.length ?? 0;
    const tvCount = tvBySection.get(sid)?.length ?? 0;
    const coverage = srcCount ? +(100 * tvCount / srcCount).toFixed(2) : (tvCount ? 100 : 0);
    const englishMissing = missingEnglish.filter(x => x.sectionId === sid).length;
    const enhancedMissing = missingEnhanced.filter(x => x.sectionId === sid).length;
    bySecSummary.push({ sectionId: sid, srcCount, tvCount, coveragePct: coverage, englishMissing, enhancedMissing });
  }
  bySecSummary.sort((a,b) => a.sectionId.localeCompare(b.sectionId));

  // Runtime risk scan
  const risk = scanRuntimeRisks();

  const summary = {
    timestamp: new Date().toISOString(),
    source_present: haveSource,
    source_total: sourceTotal,
    triview_total: triviewTotal,
    by_section: bySecSummary,
    missing_counts: {
      absent_in_triview: missingInTriview.length,
      missing_english: missingEnglish.length,
      missing_enhanced_arabic: missingEnhanced.length,
    },
    runtime_risks: {
      hits: risk.hits,
      risky_in_ui: risk.risky,
    },
    verdict: {
      fully_translated_en: missingEnglish.length === 0 && triviewTotal > 0,
      fully_enhanced_ar: missingEnhanced.length === 0 && triviewTotal > 0,
      fully_covered_vs_source: haveSource ? (missingInTriview.length === 0) : null,
      ui_appears_static: risk.risky.length === 0, // heuristic: no translate calls inside /dad or /tri components
    }
  };

  write("outputs/completion-report.json", JSON.stringify(summary, null, 2));

  // NDJSON of missing
  const nd = [...missingInTriview, ...missingEnglish, ...missingEnhanced]
    .map(o => JSON.stringify(o))
    .join("\n");
  write("outputs/missing-rows.ndjson", nd + (nd ? "\n" : ""));

  const md = [
    "# Completion Report",
    `Generated: ${summary.timestamp}`,
    "",
    "## Totals",
    `- Source present: ${haveSource ? "yes" : "no (using triview as truth)"}`,
    `- Source rows: ${sourceTotal}`,
    `- Triview rows: ${triviewTotal}`,
    "",
    "## Coverage by Section",
    "",
    "| Section | Source | Triview | Coverage % | Missing EN | Missing ENH |",
    "|---|---:|---:|---:|---:|---:|",
    ...bySecSummary.map(s =>
      `| ${s.sectionId} | ${s.srcCount} | ${s.tvCount} | ${s.coveragePct} | ${s.englishMissing} | ${s.enhancedMissing} |`
    ),
    "",
    "## Missing (counts)",
    `- Absent in triview vs source: ${missingInTriview.length}`,
    `- Missing English: ${missingEnglish.length}`,
    `- Missing Enhanced Arabic: ${missingEnhanced.length}`,
    "",
    "## Runtime-translation risk (heuristic)",
    `- Any hits in app/lib: ${summary.runtime_risks.hits.length}`,
    `- Hits inside /dad or /tri UI: ${summary.runtime_risks.risky_in_ui.length}`,
    ...(summary.runtime_risks.risky_in_ui.length
      ? ["", "Files of concern:", ...summary.runtime_risks.risky_in_ui.map(p => `- ${p}`)]
      : []),
    "",
    "## Verdict",
    `- Fully translated (EN): ${summary.verdict.fully_translated_en ? "YES" : "NO"}`,
    `- Fully enhanced (AR): ${summary.verdict.fully_enhanced_ar ? "YES" : "NO"}`,
    `- Fully covered vs source: ${summary.verdict.fully_covered_vs_source === null ? "N/A (no source files found)" : (summary.verdict.fully_covered_vs_source ? "YES" : "NO")}`,
    `- UI appears static (no runtime translation in /dad or /tri): ${summary.verdict.ui_appears_static ? "LIKELY YES" : "POTENTIAL RISK"}`,
    "",
    "## Next steps",
    "- If any missing rows exist, see `outputs/missing-rows.ndjson`.",
    "- If runtime risks are listed under `/dad` or `/tri`, refactor to load only prebuilt `outputs/triview.json`.",
    ""
  ].join("\n");
  write("outputs/completion-report.md", md);

  // Exit non-zero if anything missing
  const missingAny = missingInTriview.length + missingEnglish.length + missingEnhanced.length > 0;
  if (missingAny) {
    console.error("❌ Missing items detected. See outputs/completion-report.* and outputs/missing-rows.ndjson");
    process.exit(2);
  } else {
    console.log("✅ Full coverage & enhancement verified; UI likely static.");
  }
})();
