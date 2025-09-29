// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Download, ExternalLink, FileText, Folder, Code, Globe } from 'lucide-react'

interface ReviewReport {
  metadata: {
    projectName: string
    version: string
    description: string
    generatedAt: string
    generatedBy?: string
  }
  git: {
    branch?: string
    commit?: string
    lastCommit?: string
  }
  stats: {
    totalFiles: number
    totalSizeMB: string
    fileTypes: Record<string, number>
  }
  routes: Array<{
    path: string
    file: string
    type: 'page' | 'api'
  }>
  lint?: {
    totalFiles?: number
    errorCount?: number
    warningCount?: number
    fixableErrorCount?: number
    fixableWarningCount?: number
    error?: string
    message?: string
  }
  build?: {
    status: string
    pages?: number
    entrypoints?: number
    staticFiles?: number
    staticSizeMB?: string
    message?: string
  }
  typecheck?: {
    errors: number
    status: string
    message?: string
  }
  architecture: {
    framework: string
    language: string
    styling: string
    deployment: string
    features: string[]
  }
}

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  size?: number
}

const SAMPLE_FILE_TREE: FileNode = {
  name: 'SaadTranslator',
  path: '',
  type: 'directory',
  children: [
    {
      name: 'app',
      path: 'app',
      type: 'directory',
      children: [
        {
          name: '(components)',
          path: 'app/(components)',
          type: 'directory',
          children: [
            { name: 'AssistantSidebar.tsx', path: 'app/(components)/AssistantSidebar.tsx', type: 'file' },
            { name: 'CmdPalette.tsx', path: 'app/(components)/CmdPalette.tsx', type: 'file' },
            { name: 'DadHeader.tsx', path: 'app/(components)/DadHeader.tsx', type: 'file' },
            { name: 'IssueQueue.tsx', path: 'app/(components)/IssueQueue.tsx', type: 'file' },
            { name: 'MultiRowView.tsx', path: 'app/(components)/MultiRowView.tsx', type: 'file' },
            { name: 'RowCard.tsx', path: 'app/(components)/RowCard.tsx', type: 'file' }
          ]
        },
        {
          name: 'api',
          path: 'app/api',
          type: 'directory',
          children: [
            {
              name: 'rows',
              path: 'app/api/rows',
              type: 'directory',
              children: [
                { name: 'route.ts', path: 'app/api/rows/route.ts', type: 'file' }
              ]
            },
            {
              name: 'scripture',
              path: 'app/api/scripture',
              type: 'directory',
              children: [
                { name: 'route.ts', path: 'app/api/scripture/route.ts', type: 'file' }
              ]
            }
          ]
        },
        { name: 'tri', path: 'app/tri', type: 'directory', children: [
          { name: 'page.tsx', path: 'app/tri/page.tsx', type: 'file' }
        ]},
        { name: 'layout.tsx', path: 'app/layout.tsx', type: 'file' },
        { name: 'page.tsx', path: 'app/page.tsx', type: 'file' },
        { name: 'globals.css', path: 'app/globals.css', type: 'file' }
      ]
    },
    {
      name: 'lib',
      path: 'lib',
      type: 'directory',
      children: [
        {
          name: 'assistant',
          path: 'lib/assistant',
          type: 'directory',
          children: [
            { name: 'anthropic.ts', path: 'lib/assistant/anthropic.ts', type: 'file' }
          ]
        },
        {
          name: 'dadmode',
          path: 'lib/dadmode',
          type: 'directory',
          children: [
            { name: 'prefs.ts', path: 'lib/dadmode/prefs.ts', type: 'file' }
          ]
        },
        {
          name: 'ui',
          path: 'lib/ui',
          type: 'directory',
          children: [
            { name: 'fuzzy.ts', path: 'lib/ui/fuzzy.ts', type: 'file' },
            { name: 'shortcuts.ts', path: 'lib/ui/shortcuts.ts', type: 'file' }
          ]
        }
      ]
    },
    { name: 'package.json', path: 'package.json', type: 'file' },
    { name: 'tsconfig.json', path: 'tsconfig.json', type: 'file' },
    { name: 'README.md', path: 'README.md', type: 'file' }
  ]
}

function FileIcon({ fileName, isDirectory }: { fileName: string; isDirectory: boolean }) {
  if (isDirectory) return <Folder className="w-4 h-4 text-blue-500" />

  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'tsx':
    case 'ts':
      return <Code className="w-4 h-4 text-blue-600" />
    case 'json':
      return <FileText className="w-4 h-4 text-yellow-600" />
    case 'md':
      return <FileText className="w-4 h-4 text-gray-600" />
    case 'css':
      return <Code className="w-4 h-4 text-purple-600" />
    default:
      return <FileText className="w-4 h-4 text-gray-500" />
  }
}

function FileTreeNode({ node, level = 0, onFileSelect }: {
  node: FileNode
  level?: number
  onFileSelect: (filePath: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(level < 2)

  const handleClick = () => {
    if (node.type === 'directory') {
      setIsExpanded(!isExpanded)
    } else {
      onFileSelect(node.path)
    }
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 hover:bg-gray-50 cursor-pointer rounded text-sm"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {node.type === 'directory' && (
          isExpanded ?
            <ChevronDown className="w-3 h-3 text-gray-400" /> :
            <ChevronRight className="w-3 h-3 text-gray-400" />
        )}
        {node.type === 'file' && <div className="w-3" />}
        <FileIcon fileName={node.name} isDirectory={node.type === 'directory'} />
        <span className={node.type === 'directory' ? 'font-medium' : ''}>{node.name}</span>
      </div>

      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ReviewPage() {
  const [selectedFile, setSelectedFile] = useState<string>('')
  const [fileContent, setFileContent] = useState<string>('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [report, setReport] = useState<ReviewReport | null>(null)
  const [fileTree, setFileTree] = useState<FileNode>(SAMPLE_FILE_TREE)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch review report and file tree on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)

        // Fetch review report
        const reportResponse = await fetch('/api/review/report')
        if (!reportResponse.ok) {
          throw new Error('Failed to fetch review report')
        }
        const reportData = await reportResponse.json()
        setReport(reportData)

        // Fetch file tree
        const treeResponse = await fetch('/api/review/tree')
        if (treeResponse.ok) {
          const treeData = await treeResponse.json()
          setFileTree(treeData)
        }
        // If file tree fails, fall back to sample tree

      } catch (err) {
        console.error('Error fetching review data:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')

        // Use fallback sample data if API fails
        setReport({
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
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath)
    // In a real implementation, this would fetch the actual file content
    setFileContent(`// ${filePath}\n// This is a preview of the file content\n// Full content available in the downloaded bundle\n\nexport default function Component() {\n  return (\n    <div className="p-4">\n      <h1>File: {filePath}</h1>\n      <p>Download the review bundle to see complete source code.</p>\n    </div>\n  )\n}`)
  }

  const handleDownloadBundle = async () => {
    setIsDownloading(true)
    try {
      const response = await fetch('/api/review/bundle')
      if (!response.ok) throw new Error('Failed to generate bundle')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SaadTranslator-review-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download failed:', error)
      alert('Failed to download bundle. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading review data...</p>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load review data</p>
          {error && <p className="text-sm text-gray-500">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Code className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Code Review</h1>
                <p className="text-sm text-gray-500">{report.metadata.projectName}</p>
                {report.metadata.generatedBy && (
                  <p className="text-xs text-gray-400">Generated by: {report.metadata.generatedBy}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="/tri?mode=dad"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Globe className="w-4 h-4" />
                View Live App
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={handleDownloadBundle}
                disabled={isDownloading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isDownloading ? 'Generating...' : 'Download Review Bundle'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Project Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Project Info</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Version</dt>
                <dd className="text-sm text-gray-900">{report.metadata.version}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Framework</dt>
                <dd className="text-sm text-gray-900">{report.architecture.framework}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Language</dt>
                <dd className="text-sm text-gray-900">{report.architecture.language}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Current Branch</dt>
                <dd className="text-sm text-gray-900 font-mono">{report.git.branch}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Codebase Stats</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Files</dt>
                <dd className="text-sm text-gray-900">{report.stats.totalFiles}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Bundle Size</dt>
                <dd className="text-sm text-gray-900">{report.stats.totalSizeMB} MB</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">File Types</dt>
                <dd className="text-sm text-gray-900">
                  {Object.entries(report.stats.fileTypes).map(([ext, count]) => (
                    <span key={ext} className="inline-block mr-3">
                      {ext}: {count}
                    </span>
                  ))}
                </dd>
              </div>
              {report.lint && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Lint Status</dt>
                  <dd className="text-sm text-gray-900">
                    {report.lint.error ? (
                      <span className="text-yellow-600">{report.lint.error}</span>
                    ) : (
                      <span className="text-green-600">
                        {report.lint.errorCount || 0} errors, {report.lint.warningCount || 0} warnings
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {report.typecheck && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">TypeScript</dt>
                  <dd className="text-sm text-gray-900">
                    <span className={report.typecheck.status === 'passed' ? 'text-green-600' : 'text-red-600'}>
                      {report.typecheck.errors} errors ({report.typecheck.status})
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Key Features</h3>
            <ul className="space-y-2">
              {report.architecture.features.map((feature) => (
                <li key={feature} className="text-sm text-gray-600 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                  {feature}
                </li>
              ))}
            </ul>
            {report.build && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Build Info</h4>
                <div className="text-sm text-gray-600">
                  <div>Status: <span className={report.build.status === 'available' ? 'text-green-600' : 'text-yellow-600'}>{report.build.status}</span></div>
                  {report.build.pages && <div>Pages: {report.build.pages}</div>}
                  {report.build.staticSizeMB && <div>Static Size: {report.build.staticSizeMB} MB</div>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* File Tree */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-lg font-medium text-gray-900">Project Structure</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Explore the codebase structure. Click files to preview.
                </p>
              </div>
              <div className="p-2 max-h-96 overflow-y-auto">
                <FileTreeNode
                  node={fileTree}
                  onFileSelect={handleFileSelect}
                />
              </div>
            </div>
          </div>

          {/* File Viewer */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-lg font-medium text-gray-900">
                  {selectedFile || 'File Preview'}
                </h3>
                {selectedFile && (
                  <p className="text-sm text-gray-500 mt-1">
                    Preview mode - download bundle for complete source
                  </p>
                )}
              </div>
              <div className="p-4">
                {selectedFile ? (
                  <pre className="bg-gray-50 rounded-md p-4 text-sm overflow-auto max-h-64">
                    <code>{fileContent}</code>
                  </pre>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>Select a file from the tree to preview its content</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Routes Overview */}
        <div className="mt-8">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-lg font-medium text-gray-900">Application Routes</h3>
              <p className="text-sm text-gray-500 mt-1">
                Available pages and API endpoints
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Route
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {report.routes.map((route) => (
                    <tr key={route.path}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {route.path}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          route.type === 'page'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {route.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {route.file}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}