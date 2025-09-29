import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const OUTPUT_DIR = path.join(ROOT, 'artifacts', 'reports', 'screens')
const SERVER_PORT = 4000
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
}

async function waitForServer(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await fetch(`${BASE_URL}/api/health`)
      return true
    } catch (error) {
      // ignore until server is ready
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('npm', ['run', 'start', '--', '-p', String(SERVER_PORT), '-H', '127.0.0.1'], {
      cwd: ROOT,
      stdio: ['ignore', 'inherit', 'inherit']
    })

    waitForServer().then(ready => {
      if (ready) {
        resolve(server)
      } else {
        server.kill()
        reject(new Error('Server startup timed out'))
      }
    }).catch(error => {
      server.kill()
      reject(error)
    })
  })
}

async function captureScreenshots(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  // Reader view (default)
  await page.goto(`${BASE_URL}/review`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.locator('body').screenshot({ path: path.join(OUTPUT_DIR, 'reviewer-reader.png'), animations: 'disabled' })

  // Compare view
  await page.locator('button:has-text("Compare")').click()
  await page.waitForTimeout(1200)
  await page.locator('body').screenshot({ path: path.join(OUTPUT_DIR, 'reviewer-compare.png'), animations: 'disabled' })

  // Focus view
  await page.locator('button:has-text("Focus")').first().click()
  await page.waitForTimeout(1200)
  await page.locator('body').screenshot({ path: path.join(OUTPUT_DIR, 'reviewer-focus.png'), animations: 'disabled' })

  // Dad mode (via query param)
  await page.goto(`${BASE_URL}/review?mode=dad`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await page.locator('body').screenshot({ path: path.join(OUTPUT_DIR, 'reviewer-dad-mode.png'), animations: 'disabled' })

  // Presentation mode toggle
  await page.locator('button:has-text("Screenshare")').click()
  await page.waitForTimeout(1200)
  await page.locator('body').screenshot({ path: path.join(OUTPUT_DIR, 'reviewer-presentation.png'), animations: 'disabled' })

  await context.close()
}

async function main() {
  await ensureOutputDir()
  let server
  try {
    server = await startServer()
    const browser = await chromium.launch()
    try {
      await captureScreenshots(browser)
      console.log('[context] Screenshots captured in artifacts/reports/screens')
    } finally {
      await browser.close()
    }
  } finally {
    if (server) {
      server.kill()
    }
  }
}

main().catch(error => {
  console.error('[context] Failed to capture screenshots:', error)
  process.exitCode = 1
})
