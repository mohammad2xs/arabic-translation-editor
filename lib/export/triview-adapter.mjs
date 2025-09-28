import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Normalizes outputs/triview.json to { meta, sections: [{id,title?,rows:[]}] }
 * Falls back to data/sections/*.json when triview.json is missing or invalid.
 */
export function loadTriviewForExport(baseDir = process.cwd()) {
  const manifestInfo = loadManifest(baseDir);
  const triviewPath = join(baseDir, "outputs", "triview.json");

  if (existsSync(triviewPath)) {
    try {
      const raw = JSON.parse(readFileSync(triviewPath, "utf8"));
      const normalized = normalizeTriview(raw, manifestInfo);
      if (normalized.sections.length > 0) {
        return normalized;
      }
      console.warn("loadTriviewForExport: triview.json contains no rows; falling back to section files.");
    } catch (error) {
      console.warn(`loadTriviewForExport: failed to read triview.json (${error.message}); falling back to section files.`);
    }
  } else {
    console.warn("loadTriviewForExport: outputs/triview.json not found; falling back to section files.");
  }

  const fallback = loadSectionsFallback(baseDir, manifestInfo);
  if (!fallback.sections.length) {
    console.error('loadTriviewForExport: No translation rows available. Run the pipeline first.');
    process.exit(1);
  }
  return fallback;
}


function loadManifest(baseDir) {
  const manifestPath = join(baseDir, "data", "manifest.json");
  const info = {
    manifest: null,
    titleMap: new Map(),
    orderMap: new Map(),
  };

  if (!existsSync(manifestPath)) {
    return info;
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    info.manifest = manifest;

    if (Array.isArray(manifest.sections)) {
      manifest.sections.forEach((section, index) => {
        if (!section?.id) return;
        info.orderMap.set(section.id, index);
        if (section.title) {
          info.titleMap.set(section.id, section.title);
        }
      });
    }
  } catch (error) {
    console.warn(`loadTriviewForExport: failed to parse manifest.json (${error.message}).`);
  }

  return info;
}

function normalizeTriview(raw, manifestInfo) {
  const meta = raw.meta ?? raw.metadata ?? {};

  if (Array.isArray(raw.sections) && raw.sections.length > 0) {
    const sections = raw.sections.map(section => normalizeSection(section, manifestInfo));
    return { meta, sections: sortSections(sections, manifestInfo.orderMap) };
  }

  if (Array.isArray(raw.rows) && raw.rows.length > 0) {
    const bySection = new Map();

    for (const row of raw.rows) {
      const sid = row?.metadata?.sectionId || "S000";
      if (!bySection.has(sid)) {
        bySection.set(sid, {
          id: sid,
          title: manifestInfo.titleMap.get(sid) || sid,
          rows: [],
          metadata: {},
        });
      }
      bySection.get(sid).rows.push(normalizeRow(row));
    }

    return {
      meta,
      sections: sortSections(Array.from(bySection.values()), manifestInfo.orderMap),
    };
  }

  return { meta, sections: [] };
}

function loadSectionsFallback(baseDir, manifestInfo) {
  const sectionsDir = join(baseDir, "data", "sections");

  if (!existsSync(sectionsDir)) {
    console.warn("loadTriviewForExport: data/sections directory not found; returning empty dataset.");
    return { meta: { source: "sections" }, sections: [] };
  }

  let sectionIds = [];
  if (manifestInfo.manifest?.sections) {
    sectionIds = manifestInfo.manifest.sections.map(section => section.id).filter(Boolean);
  } else {
    sectionIds = readdirSync(sectionsDir)
      .filter(name => name.endsWith(".json"))
      .map(name => name.replace(/\.json$/, ""));
  }

  const sections = [];

  for (const id of sectionIds) {
    const sectionPath = join(sectionsDir, `${id}.json`);
    if (!existsSync(sectionPath)) continue;

    try {
      const sectionData = JSON.parse(readFileSync(sectionPath, "utf8"));
      sections.push(normalizeSection(sectionData, manifestInfo, id));
    } catch (error) {
      console.warn(`loadTriviewForExport: failed to parse section file ${id}.json (${error.message}).`);
    }
  }

  return {
    meta: {
      source: "sections",
      manifestVersion: manifestInfo.manifest?.version ?? null,
    },
    sections: sortSections(sections, manifestInfo.orderMap),
  };
}

function normalizeSection(section, manifestInfo, fallbackId) {
  const id = section?.id || section?.metadata?.sectionId || fallbackId || "S000";
  const title = section?.title || manifestInfo.titleMap.get(id) || id;
  const metadata = section?.metadata ?? {};
  const rows = Array.isArray(section?.rows) ? section.rows.map(normalizeRow) : [];

  return { id, title, rows, metadata };
}

function normalizeRow(row) {
  return {
    id: row?.id,
    original: row?.original ?? "",
    enhanced: row?.enhanced ?? row?.arabic_enhanced ?? "",
    english: row?.english ?? "",
    footnotes: row?.footnotes ?? {},
    scriptureRefs: row?.scriptureRefs ?? [],
    metadata: row?.metadata ?? {},
  };
}

function sortSections(sections, orderMap) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return [];
  }

  const withIndex = orderMap instanceof Map && orderMap.size > 0;

  return sections.slice().sort((a, b) => {
    if (withIndex) {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bi = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
    }

    const na = parseInt(String(a.id).replace(/\D+/g, ""), 10) || 0;
    const nb = parseInt(String(b.id).replace(/\D+/g, ""), 10) || 0;
    return na - nb;
  });
}
