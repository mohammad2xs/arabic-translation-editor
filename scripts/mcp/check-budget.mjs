import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const CONFIG_PATH = path.join(ROOT, 'mcp.json')

async function main() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8')
    const config = JSON.parse(raw)
    const servers = config?.mcp?.servers ?? {}
    let toolCount = 0
    const details = []
    for (const [name, server] of Object.entries(servers)) {
      const tools = Array.isArray(server?.capabilities?.tools) ? server.capabilities.tools.length : 0
      toolCount += tools
      details.push({ name, tools })
    }

    console.log(`[mcp] Servers: ${Object.keys(servers).length}, total tools: ${toolCount}`)
    details.forEach(detail => {
      console.log(` - ${detail.name}: ${detail.tools} tool(s) configured`)
    })

    if (toolCount > 80) {
      console.warn('[mcp] Warning: tool budget exceeds ~80. Consider disabling heavy servers.')
    }
  } catch (error) {
    console.error('[mcp] Unable to read mcp.json:', error.message)
    process.exitCode = 1
  }
}

main()

