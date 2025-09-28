import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
  try {
    const projectRoot = process.cwd()
    const reportPath = path.join(projectRoot, 'dist', 'review-report.json')

    // Check if report exists
    if (!fs.existsSync(reportPath)) {
      // Return a default/sample report if real one doesn't exist
      const sampleReport = {
        metadata: {
          projectName: 'SaadTranslator',
          version: '1.0.0',
          description: 'Arabic Translation Editor with MCP Integration',
          generatedAt: new Date().toISOString(),
          generatedBy: 'fallback-sample'
        },
        git: {
          branch: 'master',
          commit: '5c422da7',
          lastCommit: 'fix: Remove node_modules from git tracking'
        },
        stats: {
          totalFiles: 156,
          totalSizeMB: '2.8',
          fileTypes: {
            '.tsx': 24,
            '.ts': 18,
            '.json': 4,
            '.css': 3,
            '.md': 2,
            '.js': 1
          }
        },
        routes: [
          { path: '/', file: 'app/page.tsx', type: 'page' },
          { path: '/tri', file: 'app/tri/page.tsx', type: 'page' },
          { path: '/review', file: 'app/review/page.tsx', type: 'page' },
          { path: '/api/rows', file: 'app/api/rows/route.ts', type: 'api' },
          { path: '/api/scripture', file: 'app/api/scripture/route.ts', type: 'api' }
        ],
        lint: { error: 'Not available', message: 'Run npm run review:report to generate' },
        build: { status: 'not_available', message: 'Run npm run review:report to generate' },
        typecheck: { error: 'Not available', message: 'Run npm run review:report to generate' },
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

      return NextResponse.json(sampleReport)
    }

    // Read and return the actual report
    const reportContent = fs.readFileSync(reportPath, 'utf-8')
    const report = JSON.parse(reportContent)

    return NextResponse.json(report)
  } catch (error) {
    console.error('Error reading review report:', error)
    return NextResponse.json(
      { error: 'Failed to read review report', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}