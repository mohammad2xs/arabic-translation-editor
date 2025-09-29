# Arabic Translation Editor

Manual-first reviewer workspace for the Al-Insān manuscript. The toolchain indexes existing Arabic ⇄ English assets, exposes a Cursor-style Reviewer UI (Reader / Compare / Focus), and ships artifacts that stay in sync with MCP-driven workflows.

## Highlights
- **No Machine Translation** – `npm run index` discovers bilingual material (sections JSON, bilingual markdown/docx) and writes `.cache/parallel.jsonl` + `.cache/manifest.json`.
- **Reviewer UI** – Reader, Compare, and Focus modes with inline QA badges, Dad mode, presentation toggle, and export menu.
- **One-command ship** – `npm run ship` validates caches, prepares artifacts, and writes deployment handoff notes.
- **Always-in-context** – `npm run ctx:sync` produces digest + manifest, `npm run ctx:screens` captures Playwright screenshots.

---

## Quick Start (Reviewer UI, No MT)

1. **Install deps**
   ```bash
   npm install
   ```

2. **Index current translations**
   ```bash
   npm run index
   ```
   - Writes `.cache/parallel.jsonl` (aligned segments) and `.cache/manifest.json` (coverage summary).
   - If coverage < 95 %, Compare view keeps merge/split controls visible and MT UI stays hidden.

3. **Run the reviewer UI**
   ```bash
   npm run dev
   ```
   Visit <http://localhost:3000/review>

## Raising Coverage (No MT)

1. **Inventory everything** – catalog in-repo + manual inclusions.
   ```bash
   npm run find:translations -- --include "./**/*.md" --include "./**/*.txt" --include "./**/*.docx"
   ```
   Outputs `artifacts/reports/translation-inventory.json` + `.csv` with size, lang guess, snippet.
2. **Auto-map known pairs** – reuse existing basenames/chapters.
   ```bash
   npm run map:auto
   ```
   Writes `config/translations-map.json` (and `config/translations-map.backup.<ISO>.json`) with confidence ≥0.80.
3. **(Optional) Link external English** – keep content out of repo but indexable.
   ```bash
   npm run map:link -- --link "/absolute/path/to/english" --pattern "**/*.{md,txt,docx}" --name external
   ```
   Adds a symlink under `content/english/<name>` + a folder rule in `config/translations-map.json`.
4. **Re-index using the map (no MT)**.
   ```bash
   npm run index:map
   ```
   Refreshes `.cache/parallel.jsonl` + `.cache/manifest.json` and prints coverage + top misses.

Artifacts live under `artifacts/reports/`; coverage + alignment caches are always regenerated in `.cache/`.

### Modes & Shortcuts
| Mode | Purpose | Primary shortcuts |
| --- | --- | --- |
| Reader | Target-only, 70–85 ch width with ToC | – |
| Compare | RTL ↔ LTR alignment with merge/split and QA badges | – |
| Focus | Single segment review card | ⌘/Ctrl+E edit · ⌘/Ctrl+Enter accept · ⌘/Ctrl+←/→ navigate |

Additional shortcuts:
- **Comment drawer** – `Comments` button or Bottom Bar → Comment
- **Undo / Redo translations** – Bottom Bar buttons (tracked per segment)
- **Dad mode** – Toggle in topbar or append `?mode=dad` to URL (persists in `localStorage`)
- **Presentation** – Toggle `Screenshare` in topbar (adds `.presentation-mode` class for FaceTime walkthroughs)

### QA Badge
`lib/qa.ts` performs numbers parity, bracket/quote balance, ending punctuation, and length ratio checks (0.6–1.6 guard). Badges surface per segment and aggregate in the topbar.

---

## Exports
Topbar → **Export** delivers ready-to-share artifacts:
- **Target (.txt / .md / .docx)** – Reader-friendly targets for linear review.
- **Aligned (.json)** – Writes the current `.cache/parallel.jsonl` payload for downstream tooling.

---

## One-command Ship
```bash
SHIP_TOKEN=secret npm run ship
```
- Runs `npm run build`, verifies `.cache`, ensures `artifacts/reports/screens/` exists, and writes **artifacts/reports/DEPLOYMENT.md**.
- If `SHIP_TOKEN` is set, `DEPLOYMENT.md` reminds reviewers to append `?t=XXXX` or expect the PIN gate.
- Vercel CLI not detected? The script prints exact commands to run (`vercel deploy --prebuilt`, `vercel deploy --prebuilt --prod`) so you can ship manually.

---

## Always-In-Context Workflow
1. `npm run index` – refresh `.cache` before each reviewer session.
2. `npm run ctx:sync` – generates:
   - `artifacts/reports/context-digest.md`
   - `artifacts/reports/context-manifest.json`
3. `npm run ctx:screens` – (first run: `npx playwright install chromium`) then launches a temporary server and captures:
   - `reviewer-reader.png`
   - `reviewer-compare.png`
   - `reviewer-focus.png`
   - `reviewer-dad-mode.png`
   - `reviewer-presentation.png`
4. Attach `context-digest.md`, `context-manifest.json`, and screenshots in Cursor → Indexing alongside `mcp.json`.

---

## MCP Budget Check
Heavy MCP servers (git, quran, translate, crawl) can easily exceed Cursor’s tool budget. Run:
```bash
npm run mcp:budget
```
- Prints tool totals per server.
- Warns when allocations approach ~80 tools so you can disable optional servers before connecting to Cursor.

---

## Directory Map
- **app/** – Next.js app router (reviewer UI now lives at `/review`).
- **components/** – Topbar, ModeSwitch, Reader/Compare/Focus views, BottomBar, CommentDrawer, QA badge.
- **lib/** – `lang.ts`, `segment.ts`, `align.ts`, `data/parallel.ts`, `qa.ts`, speech recognition hook.
- **scripts/** – Indexing pipeline, shipping helpers, context sync, screenshot capture, MCP tooling.
- **types/** – Shared TypeScript definitions (`parallel`, `speech-recognition`, env vars).
- **artifacts/reports/** – Deployment notes, context digest, captured screenshots.
- **outputs/** – Archived bilingual assets (no new MT content generated).

Happy reviewing! 🚀
