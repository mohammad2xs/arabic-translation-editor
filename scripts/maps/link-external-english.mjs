#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const MAP_PATH = path.join('config', 'translations-map.json')

function parseArgs(argv) {
  const args = { pattern: '**/*.md', name: 'english' }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--link') {
      const value = argv[++index]
      if (!value) throw new Error('Missing value for --link')
      args.link = value
      continue
    }
    if (token === '--pattern') {
      const value = argv[++index]
      if (!value) throw new Error('Missing value for --pattern')
      args.pattern = value
      continue
    }
    if (token === '--name') {
      const value = argv[++index]
      if (!value) throw new Error('Missing value for --name')
      args.name = value
      continue
    }
    throw new Error(`Unknown argument: ${token}`)
  }
  if (!args.link) {
    throw new Error('The --link argument is required')
  }
  return args
}

async function ensureDirectory(target) {
  await fs.mkdir(target, { recursive: true })
}

async function ensureSymlink(linkPath, targetPath) {
  try {
    const stats = await fs.lstat(linkPath)
    if (stats.isSymbolicLink()) {
      const existingTarget = await fs.readlink(linkPath).catch(() => null)
      if (existingTarget && path.resolve(existingTarget) === path.resolve(targetPath)) {
        return false
      }
      await fs.rm(linkPath, { recursive: true, force: true })
    } else if (stats.isDirectory()) {
      throw new Error(`Cannot replace existing directory at ${linkPath}; remove it manually or choose a different --name`)
    } else {
      await fs.rm(linkPath, { force: true })
    }
  } catch (error) {
    // Path does not exist; continue to create
  }

  const linkType = os.platform() === 'win32' ? 'junction' : 'dir'
  await fs.symlink(targetPath, linkPath, linkType)
  return true
}

async function ensureMapFile() {
  try {
    const raw = await fs.readFile(MAP_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.folders)) {
      parsed.folders = []
    }
    if (!Array.isArray(parsed.pairs)) {
      parsed.pairs = []
    }
    if (!parsed.provenance) {
      parsed.provenance = {}
    }
    if (!parsed.version) {
      parsed.version = 1
    }
    return parsed
  } catch (error) {
    const skeleton = {
      version: 1,
      generatedAt: new Date().toISOString(),
      pairs: [],
      folders: [],
      provenance: {
        generatedBy: 'scripts/maps/build-translations-map.mjs',
        inventory: 'artifacts/reports/translation-inventory.json'
      }
    }
    await fs.mkdir(path.dirname(MAP_PATH), { recursive: true })
    await fs.writeFile(MAP_PATH, JSON.stringify(skeleton, null, 2) + '\n', 'utf8')
    return skeleton
  }
}

async function updateMapFolders(mapData, rule) {
  const exists = mapData.folders.some(existing => existing.sourceDir === rule.sourceDir && existing.targetDir === rule.targetDir && existing.pattern === rule.pattern)
  if (!exists) {
    mapData.folders.push(rule)
  }
  mapData.generatedAt = new Date().toISOString()
  mapData.provenance = {
    ...mapData.provenance,
    updatedBy: 'scripts/maps/link-external-english.mjs',
    lastLink: rule.targetDir
  }
  await fs.writeFile(MAP_PATH, JSON.stringify(mapData, null, 2) + '\n', 'utf8')
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const absoluteTarget = path.resolve(args.link)
    const englishRoot = path.join('content', 'english')
    await ensureDirectory(englishRoot)

    const linkName = args.name.replace(/[^A-Za-z0-9_-]/g, '-') || 'english'
    const linkPath = path.join(englishRoot, linkName)
    const created = await ensureSymlink(linkPath, absoluteTarget)

    const mapData = await ensureMapFile()
    await updateMapFolders(mapData, {
      sourceDir: 'content/arabic',
      targetDir: path.posix.join('content', 'english', linkName),
      pattern: args.pattern
    })

    console.log(`[link] ${created ? 'Created' : 'Updated'} symlink: ${linkPath} -> ${absoluteTarget}`)
    console.log(`[link] Map folders updated with ${linkName}`)
  } catch (error) {
    console.error('[link] Failed to link external English directory:', error.message)
    process.exitCode = 1
  }
}

main()
