import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, basename } from "path";
import { loadTriviewForExport } from "../../lib/export/triview-adapter.mjs";

function loadJSON(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function safeRead(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function listSectionFiles(dir = "data/sections") {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
    .map(entry => join(dir, entry.name));
}

function collectSource() {
  const files = listSectionFiles();
  const out = new Map(); // sectionId -> [{id, original, enhanced}]
  for (const f of files) {
    const sectionId = basename(f, ".json");
    let j;
    try {
      j = loadJSON(f);
    } catch {
      continue;
    }
    const arr = Array.isArray(j) ? j : (j?.rows || j?.data || j?.items || []);
    const rows = arr.map((r, i) => {
      const id = (r?.id || r?.ID) ?? `${sectionId}-${String(i + 1).padStart(3, "0")}`;
      const original = String(r?.original ?? r?.ar ?? r?.arabic ?? r?.source ?? "").trim();
      const enhanced = String(r?.enhanced ?? r?.ar_enhanced ?? "").trim() || original;
      return { id: String(id), sectionId, original, enhanced };
    });
    out.set(sectionId, rows);
  }
  return out;
}

function collectTriview() {
  const { sections } = loadTriviewForExport(process.cwd());
  const byId = new Map();
  const bySection = new Map();
  for (const s of sections) {
    for (const r of (s.rows || [])) {
      const sectionId = r?.metadata?.sectionId || s.id;
      const english = String(r?.english ?? "").trim();
      const enhanced = String(r?.enhanced ?? "").trim();
      const original = String(r?.original ?? "").trim();
      const id = String(r?.id ?? "");
      const row = { id, sectionId, original, enhanced, english };
      byId.set(id, row);
      if (!bySection.has(sectionId)) bySection.set(sectionId, []);
      bySection.get(sectionId).push(row);
    }
  }
  return { byId, bySection };
}

function computeMissing(sourceMap, tv) {
  const missing = [];
  const englishEmpty = [];
  for (const [sectionId, rows] of sourceMap.entries()) {
    for (const r of rows) {
      const tvRow = tv.byId.get(r.id);
      if (!tvRow) {
        missing.push({ ...r, reason: "absent_in_triview" });
      } else if (!tvRow.english) {
        englishEmpty.push({
          id: r.id,
          sectionId,
          original: tvRow.original || r.original,
          enhanced: tvRow.enhanced || r.enhanced,
          reason: "missing_english"
        });
      }
    }
  }
  return { missing, englishEmpty };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

(function main() {
  mkdirSync("gaps/batches", { recursive: true });

  const source = collectSource();
  const tv = collectTriview();
  const { missing, englishEmpty } = computeMissing(source, tv);

  const all = [...missing, ...englishEmpty];

  const BATCH_SIZE = 25;
  const batches = chunk(all, BATCH_SIZE);

  const contract = safeRead("config/translation-contract.md") || `
### Translation Contract (English)
- Preserve the author's contemplative, scholarly register.
- Zero summarization; keep all meaning.
- Keep proper nouns, Qur'anic terms; introduce glossary on first mention: fiṭrah, nafs, rūḥ, qalb, taqwā, dunyā, ākhirah.
- LPR target 1.05–1.30 (EN words / AR words); never < 0.95.
- Scripture: do **not** paraphrase Arabic in the EN body; put brief rendering in footnotes if needed.
- Keep Arabic untouched.
`;

  batches.forEach((rows, idx) => {
    const md = [
      `# GAP BATCH ${String(idx + 1).padStart(2, "0")} (${rows.length} rows)`,
      "",
      contract.trim(),
      "",
      "> Fill the EN blocks only. Do **not** modify AR.",
      "",
      ...rows.map(r => [
        `---`,
        `### Row ${r.sectionId} • ${r.id}`,
        "",
        `**AR-ORIG**`,
        "```ar",
        r.original || "",
        "```",
        "",
        `**AR-ENH**`,
        "```ar",
        r.enhanced || r.original || "",
        "```",
        "",
        `**EN (fill this; keep tone/voice; no summarization)**`,
        "```en",
        "",
        "```",
        ""
      ].join("\n"))
    ].join("\n");
    const outPath = join("gaps/batches", `batch_${String(idx + 1).padStart(2, "0")}.md`);
    writeFileSync(outPath, md);
  });

  writeFileSync("gaps/README.md", `# Gaps Workflow
1) Open each \`gaps/batches/batch_XX.md\` and ask **Claude Max** to fill the \`EN\` blocks (do not touch Arabic).
2) Save the files.
3) Run: \`npm run gaps:ingest\`
4) Re-run: \`npm run audit:coverage\`
`);

  console.log(`Exported ${batches.length} batch file(s) into gaps/batches (total items: ${all.length}).`);
})();
