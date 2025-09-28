import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { minimatch } from 'minimatch'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  size?: number
}

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
  '.env',
  '*.log',
  '.DS_Store',
  'Thumbs.db'
]

function shouldExclude(filePath: string): boolean {
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

function buildFileTree(dirPath: string, relativePath: string = '', maxDepth: number = 3, currentDepth: number = 0): FileNode | null {
  if (currentDepth > maxDepth) return null

  try {
    const stat = fs.statSync(dirPath)
    const name = path.basename(dirPath)

    if (shouldExclude(relativePath)) return null

    if (stat.isDirectory()) {
      const children: FileNode[] = []

      try {
        const items = fs.readdirSync(dirPath)

        for (const item of items) {
          const childPath = path.join(dirPath, item)
          const childRelativePath = path.join(relativePath, item)

          const childNode = buildFileTree(childPath, childRelativePath, maxDepth, currentDepth + 1)
          if (childNode) {
            children.push(childNode)
          }
        }
      } catch (err) {
        // Skip directories we can't read
      }

      return {
        name,
        path: relativePath,
        type: 'directory',
        children: children.sort((a, b) => {
          // Directories first, then files
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })
      }
    } else {
      return {
        name,
        path: relativePath,
        type: 'file',
        size: stat.size
      }
    }
  } catch (err) {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const projectRoot = process.cwd()
    const projectName = path.basename(projectRoot)

    const root: FileNode = {
      name: projectName,
      path: '',
      type: 'directory',
      children: []
    }

    // Add included directories
    for (const dir of INCLUDE_DIRS) {
      const dirPath = path.join(projectRoot, dir)
      if (fs.existsSync(dirPath)) {
        const node = buildFileTree(dirPath, dir)
        if (node) {
          root.children!.push(node)
        }
      }
    }

    // Add included files
    for (const file of INCLUDE_FILES) {
      const filePath = path.join(projectRoot, file)
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath)
        root.children!.push({
          name: file,
          path: file,
          type: 'file',
          size: stat.size
        })
      }
    }

    // Sort children
    root.children!.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json(root)
  } catch (error) {
    console.error('Error building file tree:', error)
    return NextResponse.json(
      { error: 'Failed to build file tree', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}