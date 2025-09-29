# Context Digest

## Executive Summary
- Implemented manuscript indexing pipeline with bilingual discovery and cache outputs.
- Delivered reviewer UI (Reader / Compare / Focus) with Dad mode, presentation toggle, QA badge, and export utilities.
- Shipping workflow scripted via `npm run ship`, preparing artifacts and deployment handoff notes.

## Active Directives
- Reviewer UI must honor manual translations only—no machine translation.
- Provide Dad mode (high-contrast, large type) and Presentation toggle for FaceTime walkthroughs.
- Keep alignment data under `.cache` fresh via `npm run index` and surface QA results inline.
- Ship-ready workflow via `npm run ship`, capturing deployment notes and shareable URLs.
- Context artifacts (digest, manifest, screenshots) live under `artifacts/` for Cursor-style workflows.

## Repo Map
- `app/`: Next.js routes and reviewer UI
- `components/`: Shared reviewer UI components (Topbar, Mode switch, views)
- `config/`: Project resources
- `data/`: Manuscript sections, metadata, scripture references
- `docs/`: Project resources
- `gaps/`: Project resources
- `glossary/`: Project resources
- `lib/`: Core libraries: language detection, QA, data access
- `orchestrate/`: Project resources
- `outputs/`: Archived translation outputs and bilingual assets
- `public/`: Project resources
- `rules/`: Project resources
- `scripts/`: CLI utilities: indexing, shipping, context sync
- `styles/`: Cursor-style CSS tokens and themes
- `types/`: Project-wide TypeScript definitions

## MCP Summary
- **project-insights** → tools: refresh_codex_support, run_quality_validation, run_next_build, git_status
- **web-to-mcp** → tools: translate_arabic, enhance_text, quality_check

## Recent Changes
- [ctx]
  - artifacts/
  - scripts/context/
- [ui]
  - app/review/page.tsx
  - components/
- [api]
  - app/api/export/
  - app/api/parallel/
- [qa]
  - lib/data/
  - lib/qa.ts
- [mcp]
  - "outputs 2/triview-mcp.json"
  - scripts/mcp/check-budget.mjs
  - scripts/ship/
- [docs]
  - docs/WORKFLOW.md
  - docs/architecture/
  - docs/deployment/
  - docs/integrations/
  - docs/reference/
  - docs/setup/

## Open TODOs
- No TODO markers found.
