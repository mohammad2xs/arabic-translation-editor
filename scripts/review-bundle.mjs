#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import archiver from 'archiver'
import minimatch from 'minimatch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const INCLUDE_DIRS = [
  'app',
  'lib',
  'scripts',
  'styles',
  'public',
  'orchestrate',
  'rules'
]

const INCLUDE_FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'next.config.js',
  'next.config.mjs',
  'vercel.json',
  'README.md',
  'CLAUDE.md'
]

const EXCLUDE_PATTERNS = [
  'node_modules',
  '.next',
  '.git',
  '.vercel',
  'dist',
  'outputs/audio',
  '.env*',
  '*.log',
  '.DS_Store',
  'Thumbs.db'
]

function shouldExclude(filePath) {
  // Check against each exclude pattern using minimatch for proper glob matching
  return EXCLUDE_PATTERNS.some(pattern => {
    // Handle explicit .env file patterns
    if (pattern.startsWith('.env')) {
      const basename = path.basename(filePath)
      return basename === '.env' || basename.startsWith('.env.')
    }

    // Use minimatch for proper glob pattern matching
    // Check against both the full path and just the basename for flexibility
    return minimatch(filePath, pattern) ||
           minimatch(path.basename(filePath), pattern) ||
           filePath.includes(pattern) // Fallback for simple string matching
  })
}

function getFileStats(dirPath) {
  const stats = {
    totalFiles: 0,
    totalSize: 0,
    fileTypes: {},
    routes: []
  }

  function walkDir(dir) {
    try {
      const items = fs.readdirSync(dir)

      for (const item of items) {
        const fullPath = path.join(dir, item)
        const relativePath = path.relative(projectRoot, fullPath)

        if (shouldExclude(relativePath)) continue

        const stat = fs.statSync(fullPath)

        if (stat.isDirectory()) {
          walkDir(fullPath)
        } else {
          stats.totalFiles++
          stats.totalSize += stat.size

          const ext = path.extname(item).toLowerCase()
          stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1

          // Detect routes
          if (relativePath.includes('app/') && (item === 'page.tsx' || item === 'route.ts')) {
            const routePath = path.dirname(relativePath)
              .replace('app/', '/')
              .replace(/\(.*?\)/g, '') // Remove route groups
              .replace(/\[.*?\]/g, '[param]') // Simplify dynamic routes
            stats.routes.push({
              path: routePath,
              file: relativePath,
              type: item === 'page.tsx' ? 'page' : 'api'
            })
          }
        }
      }
    } catch (err) {
      console.warn(`Warning: Could not read directory ${dir}:`, err.message)
    }
  }

  walkDir(dirPath)
  return stats
}

function generateReviewReport() {
  console.log('🔍 Analyzing codebase...')

  const stats = getFileStats(projectRoot)

  // Get package info
  let packageInfo = {}
  try {
    packageInfo = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  } catch (err) {
    console.warn('Could not read package.json:', err.message)
  }

  // Get git info
  let gitInfo = {}
  try {
    gitInfo = {
      branch: execSync('git branch --show-current', { cwd: projectRoot, encoding: 'utf8' }).trim(),
      commit: execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf8' }).trim().slice(0, 8),
      lastCommit: execSync('git log -1 --format=%s', { cwd: projectRoot, encoding: 'utf8' }).trim()
    }
  } catch (err) {
    console.warn('Could not get git info:', err.message)
  }

  // Get lint stats
  let lintStats = {}
  try {
    console.log('Running lint check...')
    const lintOutput = execSync('npm run lint -- --format json', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    })
    const lintResults = JSON.parse(lintOutput)
    lintStats = {
      totalFiles: lintResults.length,
      errorCount: lintResults.reduce((sum, file) => sum + file.errorCount, 0),
      warningCount: lintResults.reduce((sum, file) => sum + file.warningCount, 0),
      fixableErrorCount: lintResults.reduce((sum, file) => sum + file.fixableErrorCount, 0),
      fixableWarningCount: lintResults.reduce((sum, file) => sum + file.fixableWarningCount, 0)
    }
  } catch (err) {
    console.warn('Could not get lint stats:', err.message)
    lintStats = { error: 'Lint check failed', message: err.message }
  }

  // Get TypeScript check stats
  let typecheckStats = {}
  try {
    console.log('Running TypeScript check...')
    execSync('tsc --noEmit', { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe' })
    typecheckStats = { errors: 0, status: 'passed' }
  } catch (err) {
    const errorOutput = err.stdout || err.stderr || err.message
    const errorCount = (errorOutput.match(/error TS\d+:/g) || []).length
    typecheckStats = {
      errors: errorCount,
      status: 'failed',
      message: errorOutput.split('\n').slice(0, 10).join('\n') // First 10 lines
    }
  }

  // Get Next.js build stats (if .next exists)
  let buildStats = {}
  try {
    const nextBuildPath = path.join(projectRoot, '.next')
    if (fs.existsSync(nextBuildPath)) {
      console.log('Analyzing Next.js build...')

      // Try to read build-manifest.json
      const buildManifestPath = path.join(nextBuildPath, 'build-manifest.json')
      if (fs.existsSync(buildManifestPath)) {
        const buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8'))
        buildStats.pages = Object.keys(buildManifest.pages || {}).length
        buildStats.entrypoints = Object.keys(buildManifest.entrypoints || {}).length
      }

      // Try to get static files info
      const staticPath = path.join(nextBuildPath, 'static')
      if (fs.existsSync(staticPath)) {
        const staticStats = getFileStats(staticPath)
        buildStats.staticFiles = staticStats.totalFiles
        buildStats.staticSizeMB = (staticStats.totalSize / (1024 * 1024)).toFixed(2)
      }

      buildStats.status = 'available'
    } else {
      buildStats = { status: 'not_built', message: 'Run npm run build first' }
    }
  } catch (err) {
    console.warn('Could not analyze Next.js build:', err.message)
    buildStats = { status: 'error', message: err.message }
  }

  const report = {
    metadata: {
      projectName: packageInfo.name || 'SaadTranslator',
      version: packageInfo.version || '1.0.0',
      description: packageInfo.description || 'Arabic Translation Editor with MCP Integration',
      generatedAt: new Date().toISOString(),
      generatedBy: 'review-bundle.mjs'
    },
    git: gitInfo,
    stats: {
      totalFiles: stats.totalFiles,
      totalSizeMB: (stats.totalSize / (1024 * 1024)).toFixed(2),
      fileTypes: stats.fileTypes
    },
    routes: stats.routes.sort((a, b) => a.path.localeCompare(b.path)),
    dependencies: {
      runtime: Object.keys(packageInfo.dependencies || {}),
      development: Object.keys(packageInfo.devDependencies || {}),
      scripts: packageInfo.scripts || {}
    },
    lint: lintStats,
    build: buildStats,
    typecheck: typecheckStats,
    architecture: {
      framework: 'Next.js 14',
      language: 'TypeScript',
      styling: 'Tailwind CSS',
      deployment: 'Vercel',
      features: [
        'Arabic Translation Editor',
        'Dad-Mode Interface',
        'Claude Assistant Integration',
        'Real-time Collaboration',
        'PWA Support',
        'Mobile Optimization'
      ]
    }
  }

  return report
}

function createBundle() {
  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const bundleName = `SaadTranslator-review-${timestamp}.zip`
  const distDir = path.join(projectRoot, 'dist')
  const bundlePath = path.join(distDir, bundleName)

  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true })
  }

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(bundlePath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      const sizeB = archive.pointer()
      const sizeMB = (sizeB / (1024 * 1024)).toFixed(2)

      if (sizeB > 50 * 1024 * 1024) {
        console.warn(`⚠️  Bundle size (${sizeMB}MB) exceeds 50MB limit`)
      }

      console.log(`✅ Bundle created: ${bundleName} (${sizeMB}MB)`)
      resolve({ path: bundlePath, name: bundleName, size: sizeMB })
    })

    output.on('error', reject)
    archive.on('error', reject)

    archive.pipe(output)

    console.log('📦 Creating review bundle...')

    // Add included directories
    for (const dir of INCLUDE_DIRS) {
      const dirPath = path.join(projectRoot, dir)
      if (fs.existsSync(dirPath)) {
        archive.directory(dirPath, dir, {
          ignore: (name) => shouldExclude(path.relative(projectRoot, name))
        })
      }
    }

    // Add included files
    for (const file of INCLUDE_FILES) {
      const filePath = path.join(projectRoot, file)
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file })
      }
    }

    // Generate and add review report
    const report = generateReviewReport()
    archive.append(JSON.stringify(report, null, 2), { name: 'review-report.json' })

    // Add review notes template if it doesn't exist
    const reviewNotesPath = path.join(projectRoot, 'REVIEW_NOTES.md')
    if (!fs.existsSync(reviewNotesPath)) {
      const reviewNotesTemplate = `# Review Notes

## Overview
This is a review bundle for the SaadTranslator project - an Arabic Translation Editor with Claude MCP Integration.

## Key Areas to Review
- [ ] Translation pipeline accuracy and performance
- [ ] Dad-Mode interface usability
- [ ] Claude assistant integration
- [ ] Real-time collaboration features
- [ ] Security and data handling
- [ ] Code organization and maintainability

## Questions for Developer
1.
2.
3.

## Findings
### Positive
-

### Areas for Improvement
-

### Security Concerns
-

## Recommendations
-
`
      archive.append(reviewNotesTemplate, { name: 'REVIEW_NOTES.md' })
    }

    archive.finalize()
  })
}

async function createReportOnly() {
  console.log('🔍 Generating review report only...')

  const distDir = path.join(projectRoot, 'dist')
  const reportPath = path.join(distDir, 'review-report.json')

  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true })
  }

  const report = generateReviewReport()
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log(`✅ Review report generated: ${reportPath}`)
  return { path: reportPath, name: 'review-report.json' }
}

async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2)
    const reportOnly = args.includes('--report-only')

    if (reportOnly) {
      console.log('🚀 Starting report-only generation...')
      const result = await createReportOnly()

      console.log('📋 Report Summary:')
      console.log(`   Path: ${result.path}`)
      console.log(`   Ready for review!`)

      return result
    } else {
      console.log('🚀 Starting review bundle creation...')

      const result = await createBundle()

      console.log('📋 Bundle Summary:')
      console.log(`   Path: ${result.path}`)
      console.log(`   Size: ${result.size}MB`)
      console.log(`   Ready for review!`)

      return result
    }
  } catch (error) {
    console.error('❌ Operation failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { createBundle, generateReviewReport, createReportOnly }