# Vibe Coding Workflow

## 1. How We Work
- Cut a tiny branch from `main` (e.g., `feat/vibe-setup`).
- Push to GitHub and open a PR.
- GitHub Actions posts the Vercel Preview URL on the PR.
- Dad opens the preview link, enters “Dad Mode”, and reviews the live experience.

## 2. Local Commands
| Purpose | Command |
| --- | --- |
| Full production build | `npm run build` |
| Quality gates | `npm run validate:quality` |
| Export DOCX | `npm run export:docx` |
| Export EPUB | `npm run export:epub` |
| Export Audio bundle | `npm run export:audio` |
| Build share bundle zip | `npm run share:bundle` |
| Launch Chrome DevTools MCP | `npm run mcp:devtools` |

## 3. Export Artifacts
After running the export commands:
- DOCX: `outputs/book-final.docx`
- EPUB: `outputs/book-final.epub`
- Audio assets: `outputs/audiobook/`
- Share bundle: `outputs/share_bundle.zip`

## 4. Chrome DevTools MCP
1. Run `npm run mcp:devtools` (installs via `npx` if necessary).
2. Chrome launches with a debug port (default `localhost:9222`).
3. Point your MCP-capable agent (Cursor, ChatGPT, etc.) at the printed host/port.
4. Inspect Vercel previews in real time—console logs, network traces, DOM—during “Dad Mode” reviews.

## 5. Secrets & Deployment
- Never commit API tokens or credentials.
- Store `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` as GitHub repository secrets for the Preview workflow.
- For OpenAI, define `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) in your environment or platform secrets before deploying.
