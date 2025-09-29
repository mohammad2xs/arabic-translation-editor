import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()
const REPORT_PATH = path.join(ROOT, 'artifacts', 'reports', 'DEPLOYMENT.md')

function commandExists(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' })
    return true
  } catch (error) {
    return false
  }
}

function readGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
  } catch (error) {
    return 'unknown'
  }
}

async function writeReport(content) {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await fs.writeFile(REPORT_PATH, content, 'utf8')
}

async function main() {
  const branch = readGitBranch()
  const vercelAvailable = commandExists('vercel')
  const shipToken = process.env.SHIP_TOKEN ?? null

  let stagingInstruction = 'Install Vercel CLI and run `vercel deploy --prebuilt`'
  let productionInstruction = 'Install Vercel CLI and run `vercel deploy --prebuilt --prod`'

  if (vercelAvailable) {
    stagingInstruction = 'Run `vercel deploy --prebuilt` to publish a staging preview'
    productionInstruction = 'Run `vercel deploy --prebuilt --prod` to ship to production'
  }

  const gitInstructions = `git push --set-upstream origin ${branch}`

  const reportLines = [
    '# Deployment Summary',
    '',
    `- **Branch**: ${branch}`,
    `- **Git Push**: \`${gitInstructions}\``,
    `- **Staging**: ${stagingInstruction}`,
    `- **Production**: ${productionInstruction}`,
    `- **Ship Token**: ${shipToken ? 'Configured' : 'Not set'}`,
    shipToken
      ? `- **Token Hint**: Append \`?t=${shipToken}\` to share links or expect the PIN modal.`
      : '- **Token Hint**: Set SHIP_TOKEN to require a reviewer PIN.'
  ]

  await writeReport(reportLines.join('\n') + '\n')

  console.log('[ship/deploy] Branch:', branch)
  console.log('[ship/deploy] Git push:', gitInstructions)
  console.log('[ship/deploy] STAGING_URL:', stagingInstruction)
  console.log('[ship/deploy] PROD_URL:', productionInstruction)
  if (shipToken) {
    console.log('[ship/deploy] SHIP_TOKEN detected. Protect links with ?t=' + shipToken)
  }
  console.log('[ship/deploy] Report written to', path.relative(ROOT, REPORT_PATH))
}

main().catch(error => {
  console.error('[ship/deploy] Failed:', error.message)
  process.exitCode = 1
})

