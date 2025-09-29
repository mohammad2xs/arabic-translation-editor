// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)

export async function GET(request: NextRequest) {
  try {
    console.log('🚀 Starting review bundle generation...')

    // Get project root (assuming we're in app/api/review/bundle)
    const projectRoot = path.resolve(process.cwd())
    const scriptPath = path.join(projectRoot, 'scripts', 'review-bundle.mjs')

    // Verify script exists
    if (!fs.existsSync(scriptPath)) {
      console.error('❌ Review bundle script not found:', scriptPath)
      return NextResponse.json(
        { error: 'Review bundle script not found' },
        { status: 500 }
      )
    }

    // Execute the review bundle script
    console.log('🔄 Executing review bundle script...')
    const { stdout, stderr } = await execAsync(`node "${scriptPath}"`, {
      cwd: projectRoot,
      timeout: 60000, // 60 second timeout
      env: {
        ...process.env,
        NODE_ENV: 'production' // Ensure clean build
      }
    })

    if (stderr) {
      console.warn('⚠️ Script warnings:', stderr)
    }

    console.log('✅ Script output:', stdout)

    // Find the generated bundle
    const distDir = path.join(projectRoot, 'dist')
    const bundleFiles = fs.readdirSync(distDir)
      .filter(file => file.startsWith('SaadTranslator-review-') && file.endsWith('.zip'))
      .sort() // Get the latest one
      .reverse()

    if (bundleFiles.length === 0) {
      console.error('❌ No bundle file found in dist directory')
      return NextResponse.json(
        { error: 'Bundle generation failed - no output file found' },
        { status: 500 }
      )
    }

    const bundleFile = bundleFiles[0]
    const bundlePath = path.join(distDir, bundleFile)

    // Verify bundle exists and get stats
    const stats = fs.statSync(bundlePath)
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)

    console.log(`📦 Bundle ready: ${bundleFile} (${sizeMB}MB)`)

    // Warn about potential serverless limits (typically 50MB for Vercel)
    if (stats.size > 50 * 1024 * 1024) {
      console.warn(`⚠️ Bundle size (${sizeMB}MB) may exceed serverless function limits`)
    }

    // For serverless compatibility, read the file as buffer instead of streaming
    // This ensures it works in both Node.js server and serverless environments
    const fileBuffer = fs.readFileSync(bundlePath)

    // Set appropriate headers
    const headers = new Headers({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${bundleFile}"`,
      'Content-Length': stats.size.toString(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    })

    // Return the file buffer (compatible with both server and serverless)
    return new NextResponse(fileBuffer, {
      status: 200,
      headers
    })

  } catch (error) {
    console.error('❌ Bundle generation failed:', error)

    // Provide more specific error messages
    let errorMessage = 'Failed to generate review bundle'
    let statusCode = 500

    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        errorMessage = 'Bundle generation timed out. Please try again.'
        statusCode = 408
      } else if (error.message.includes('ENOENT')) {
        errorMessage = 'Required dependencies not found. Please ensure all tools are installed.'
        statusCode = 500
      } else if (error.message.includes('permission')) {
        errorMessage = 'Permission denied. Please check file permissions.'
        statusCode = 403
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error?.toString() : undefined
      },
      { status: statusCode }
    )
  }
}

// Disable caching for this endpoint
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'