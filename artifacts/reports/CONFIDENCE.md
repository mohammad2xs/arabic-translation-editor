# Confidence Report
Generated: 2025-09-28T22:16:00-04:00

## Repository State
- **Current Branch**: ship/production-tonight
- **Last 5 Commits**:
  - 90cb075a Clean up project structure and prepare for testing (2025-09-28 22:10:48 -0400)
  - d8af9b05 chore(ts): disable checking for legacy modules (2025-09-28 20:17:19 -0400)
  - fc65dd90 fix(ts): satisfy strict checks in ui and env (2025-09-28 20:16:36 -0400)
  - 6e873e5b chore(tooling): tighten tsconfig and npm scripts (2025-09-28 20:16:09 -0400)
  - c32df5b5 feat(types): add speech recognition shim and hook (2025-09-28 20:15:54 -0400)

## Scripts Available
- **discover-translations.mjs** (11KB) - `node scripts/discover-translations.mjs`
- **index-manuscript.ts** (32KB) - `tsx scripts/index-manuscript.ts`

## Cache & Config Files
- **.cache/manifest.json**: 351B ✓
- **.cache/parallel.jsonl**: 3.9MB ✓
- **artifacts/reports/translation-inventory.csv**: 14KB ✓
- **config/translations-map.json**: 319B ✓

## UI Routes/Components
Found components referencing Reader/Compare/Focus:
- app/(components)/ContextSwitcher.tsx
- app/(components)/RowCard.tsx
- app/(components)/CmdPalette.tsx
- app/(components)/StickyNoteDrawer.tsx
- app/(components)/AudiobookPanel.tsx