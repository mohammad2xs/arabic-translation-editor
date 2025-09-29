import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()
const REPORT_DIR = path.join(ROOT, 'artifacts', 'reports')
const DIGEST_PATH = path.join(REPORT_DIR, 'context-digest.md')
const MANIFEST_PATH = path.join(REPORT_DIR, 'context-manifest.json')

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    return null
  }
}

function runGit(command) {
  try {
    return execSync(command, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch (error) {
    return ''
  }
}

async function collectRepoMap() {
  const directories = await fs.readdir(ROOT, { withFileTypes: true })
  const map = []
  for (const entry of directories) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    if (['node_modules', 'build', 'dist', 'artifacts'].includes(entry.name)) continue
    map.push(`- \`${entry.name}/\`: ${describeDirectory(entry.name)}`)
  }
  return map.join('\n')
}

function describeDirectory(name) {
  switch (name) {
    case 'app':
      return 'Next.js routes and reviewer UI'
    case 'components':
      return 'Shared reviewer UI components (Topbar, Mode switch, views)'
    case 'lib':
      return 'Core libraries: language detection, QA, data access'
    case 'scripts':
      return 'CLI utilities: indexing, shipping, context sync'
    case 'types':
      return 'Project-wide TypeScript definitions'
    case 'styles':
      return 'Cursor-style CSS tokens and themes'
    case 'data':
      return 'Manuscript sections, metadata, scripture references'
    case 'outputs':
      return 'Archived translation outputs and bilingual assets'
    default:
      return 'Project resources'
  }
}

async function collectActiveDirectives() {
  const directives = [
    'Reviewer UI must honor manual translations only—no machine translation.',
    'Provide Dad mode (high-contrast, large type) and Presentation toggle for FaceTime walkthroughs.',
    'Keep alignment data under `.cache` fresh via `npm run index` and surface QA results inline.',
    'Ship-ready workflow via `npm run ship`, capturing deployment notes and shareable URLs.',
    'Context artifacts (digest, manifest, screenshots) live under `artifacts/` for Cursor-style workflows.'
  ]
  return directives.map(item => `- ${item}`).join('\n')
}

async function collectRecentChanges() {
  const diff = runGit('git status --short')
  const summaries = {
    ctx: [],
    ui: [],
    api: [],
    qa: [],
    mcp: [],
    docs: []
  }

  const lines = diff.split('\n').filter(Boolean)
  for (const line of lines) {
    const file = line.slice(3)
    if (file.startsWith('app/review') || file.startsWith('components')) {
      summaries.ui.push(file)
    } else if (file.startsWith('app/api')) {
      summaries.api.push(file)
    } else if (file.startsWith('lib/qa') || file.startsWith('lib/data')) {
      summaries.qa.push(file)
    } else if (file.startsWith('scripts/context') || file.startsWith('artifacts')) {
      summaries.ctx.push(file)
    } else if (file.startsWith('scripts/ship') || file.includes('mcp')) {
      summaries.mcp.push(file)
    } else if (file.startsWith('docs')) {
      summaries.docs.push(file)
    }
  }

  const formatList = (items) => (items.length ? items.map(item => `  - ${item}`).join('\n') : '  - (no tracked changes yet)')

  return [
    `- [ctx]\n${formatList(summaries.ctx)}`,
    `- [ui]\n${formatList(summaries.ui)}`,
    `- [api]\n${formatList(summaries.api)}`,
    `- [qa]\n${formatList(summaries.qa)}`,
    `- [mcp]\n${formatList(summaries.mcp)}`,
    `- [docs]\n${formatList(summaries.docs)}`
  ].join('\n')
}

async function collectOpenTodos() {
  try {
    const todoScan = execSync('rg --no-heading "TODO"', { cwd: ROOT, encoding: 'utf8' })
    if (!todoScan.trim()) return '- No TODO markers found.'
    return todoScan
      .trim()
      .split('\n')
      .slice(0, 10)
      .map(line => `- ${line}`)
      .join('\n')
  } catch (error) {
    return '- No TODO markers found.'
  }
}

async function collectMcpSummary() {
  const config = await readJson(path.join(ROOT, 'mcp.json'))
  if (!config?.mcp?.servers) {
    return '- No MCP servers configured.'
  }
  const entries = Object.entries(config.mcp.servers).map(([key, server]) => {
    const tools = Array.isArray(server?.capabilities?.tools) ? server.capabilities.tools.join(', ') : 'n/a'
    return `- **${key}** → tools: ${tools}`
  })
  return entries.join('\n')
}

async function collectExecutiveSummary() {
  const points = [
    'Implemented manuscript indexing pipeline with bilingual discovery and cache outputs.',
    'Delivered reviewer UI (Reader / Compare / Focus) with Dad mode, presentation toggle, QA badge, and export utilities.',
    'Shipping workflow scripted via `npm run ship`, preparing artifacts and deployment handoff notes.'
  ]
  return points.map(item => `- ${item}`).join('\n')
}

async function main() {
  await fs.mkdir(REPORT_DIR, { recursive: true })

  const executiveSummary = await collectExecutiveSummary()
  const activeDirectives = await collectActiveDirectives()
  const repoMap = await collectRepoMap()
  const mcpSummary = await collectMcpSummary()
  const recentChanges = await collectRecentChanges()
  const openTodos = await collectOpenTodos()
  const gitBranch = readGitBranch()

  const digest = `# Context Digest\n\n` +
    `## Executive Summary\n${executiveSummary}\n\n` +
    `## Active Directives\n${activeDirectives}\n\n` +
    `## Repo Map\n${repoMap}\n\n` +
    `## MCP Summary\n${mcpSummary}\n\n` +
    `## Recent Changes\n${recentChanges}\n\n` +
    `## Open TODOs\n${openTodos}\n`

  await fs.writeFile(DIGEST_PATH, digest, 'utf8')

  const manifest = {
    generatedAt: new Date().toISOString(),
    branch: gitBranch,
    files: {
      digest: path.relative(ROOT, DIGEST_PATH)
    }
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')

  if (process.env.PROJECT_MEMORY === 'true') {
    const bullets = [
      'Reviewer workspace ready with Dad mode, presentation toggle, QA and export flows.',
      'Indexing script populates `.cache` from translation assets (docx, markdown, JSON batches).',
      '`npm run ship` orchestrates cache verification and deployment handoff messaging.'
    ]
    console.log('[context] PROJECT_MEMORY enabled → summary:')
    bullets.forEach(bullet => console.log(' -', bullet))
  }

  console.log('[context] Digest written to', path.relative(ROOT, DIGEST_PATH))
  console.log('[context] Manifest written to', path.relative(ROOT, MANIFEST_PATH))
}

function readGitBranch() {
  return runGit('git rev-parse --abbrev-ref HEAD') || 'unknown'
}

main().catch(error => {
  console.error('[context] Failed:', error.message)
  process.exitCode = 1
})
