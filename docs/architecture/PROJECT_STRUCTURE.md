# Project Structure Overview

The repository is organized around three high-level concerns:

1. **Application source (`app/`, `lib/`, `styles/`)** – production-facing Next.js app routes, shared domain logic, and styling.
2. **Operations tooling (`scripts/`, `orchestrate/`, `build/`)** – MCP-aware automation for translation, quality, and deployment workflows.
3. **Generated artifacts (`artifacts/`, `outputs/`)** – machine-generated bundles, reports, and intermediate data that power release readiness.

## Key Directories

| Path | Purpose |
| --- | --- |
| `artifacts/reports/` | Canonical quality and deployment reports (`quality-gates.*`, `deployment-report.*`) consumed by MCP resources and deployment scripts. Historical snapshots live under `artifacts/reports/history/`. |
| `outputs/` | Active working set for translation assets (`triview.json`, docx/epub exports, audio). Prior runs are moved into `outputs/archive/` for traceability. |
| `scripts/utils/project-paths.mjs` & `config/project-paths.json` | Single source of truth for filesystem locations used across Node scripts and API routes. |
| `docs/` | Human-facing documentation, grouped by topic (`architecture/`, `deployment/`, `integrations/`, `setup/`, `reference/`). |
| `orchestrate/` | Pipeline entrypoints that coordinate MCP-enabled ingestion and quality validation. |
| `build/` | Export utilities for DOCX/EPUB/audio packaging. |

## MCP Alignment

- MCP resources pull artifacts from `artifacts/reports/` ensuring assistants surface consistent quality signals.
- CLI tooling shares the same path constants, preventing drift between human workflows and automated agents.
- Outputs are explicitly tiered (current vs. archived) so MCP pipelines can target fresh data without pruning history.

## 80/20 Maintenance Tips

- Regenerate quality gates with `npm run validate:quality`; artifacts land in `artifacts/reports/` automatically.
- Use `npm run orchestrate:mcp` for end-to-end processing; downstream scripts already reference the centralized paths.
- Archive bulky exports by moving them into `outputs/archive/` to keep working directories lean without data loss.

