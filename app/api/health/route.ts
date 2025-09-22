import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { validateEnvironment, detectDeployment } from '../../../lib/env'
import { storage } from '../../../lib/share/production-storage'
import { getAssistantHealthSummary } from '../assistant/health/route'

interface BuildMetadata {
  sha?: string
  shortSha?: string
  time?: string
  version?: string
  branch?: string
  buildDuration?: number
  quality?: {
    overallPass: boolean
    deploymentReady: boolean
    lpr: { average: number; minimum: number }
    coverage: { percentage: number }
    gates: { passed: string[]; failed: string[] }
  }
  artifacts?: {
    status: 'complete' | 'partial' | 'missing'
    count: number
    checksums: Record<string, string>
  }
  pipeline?: {
    buildDuration: number
    completedAt: string
    environment: string
  }
}

interface HealthResponse {
  ok: boolean
  status: 'ready' | 'degraded' | 'unhealthy'
  build: BuildMetadata
  provider: string
  storageDriver: string
  assistant: AssistantHealthSummary
  storage: { ping: boolean; driver: string; error?: string }
  environment: { mode: string; missing: string[]; warnings: string[] }
  services: { elevenlabs: boolean; optional: boolean }
  quality?: {
    overallPass: boolean
    deploymentReady: boolean
    lpr: { average: number; minimum: number }
    coverage: { percentage: number }
    gates: { passed: string[]; failed: string[] }
  }
  artifacts?: {
    status: 'complete' | 'partial' | 'missing'
    count: number
    checksums: Record<string, string>
  }
  pipeline?: {
    buildDuration: number
    completedAt: string
    environment: string
  }
}

interface AssistantHealthSummary {
  ok: boolean
  model: string
  key_present: boolean
  status: 'healthy' | 'degraded' | 'unhealthy'
  limits: {
    rpm: number
    daily: number
  }
}


// Load deployment configuration for expected artifacts
async function getExpectedArtifacts(): Promise<string[]> {
  try {
    const configPath = join(process.cwd(), 'config', 'deployment-gates.json')
    const configContent = await readFile(configPath, 'utf-8')
    const config = JSON.parse(configContent)
    return config.deploymentRequirements?.requiredArtifacts || []
  } catch {
    // Fallback to static list
    return [
      'outputs/book-final.docx',
      'outputs/triview.json',
      'outputs/book.epub',
      'reports/quality-gates.json'
    ]
  }
}

// Read enhanced build metadata from _meta.json if available
async function getBuildMetadata(): Promise<BuildMetadata> {
  try {
    const metaPath = join(process.cwd(), 'public', '_meta.json')
    const metaContent = await readFile(metaPath, 'utf-8')
    const metadata = JSON.parse(metaContent)

    // Calculate artifact status using dynamic expected artifacts
    let artifactStatus: 'complete' | 'partial' | 'missing' = 'missing'
    let artifactCount = 0
    if (metadata.artifacts?.checksums) {
      const checksums = metadata.artifacts.checksums
      artifactCount = Object.keys(checksums).length
      const expectedArtifacts = await getExpectedArtifacts()
      const hasAll = expectedArtifacts.every(artifact => checksums[artifact])
      artifactStatus = hasAll ? 'complete' : (artifactCount > 0 ? 'partial' : 'missing')
    }

    return {
      sha: metadata.sha || process.env.VERCEL_GIT_COMMIT_SHA,
      shortSha: metadata.shortSha || metadata.sha?.substring(0, 8),
      time: metadata.time || new Date().toISOString(),
      version: metadata.version || process.env.npm_package_version,
      branch: metadata.branch,
      buildDuration: metadata.buildDuration,
      quality: metadata.quality,
      artifacts: metadata.artifacts ? {
        status: artifactStatus,
        count: artifactCount,
        checksums: metadata.artifacts.checksums || {}
      } : undefined,
      pipeline: metadata.pipeline ? {
        buildDuration: metadata.pipeline.buildDuration || metadata.buildDuration,
        completedAt: metadata.pipeline.completedAt || metadata.time,
        environment: metadata.pipeline.environment || 'unknown'
      } : undefined
    }
  } catch {
    // Fallback to environment variables or defaults
    return {
      sha: process.env.VERCEL_GIT_COMMIT_SHA || 'local-dev',
      shortSha: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 8) || 'local',
      time: new Date().toISOString(),
      version: process.env.npm_package_version,
    }
  }
}

// Test storage connection
async function testStorageConnection(): Promise<{ ping: boolean; driver: string; error?: string }> {
  try {
    // Try to set and get a test value
    const testKey = `health-check-${Date.now()}`
    const testValue = { test: true, timestamp: new Date().toISOString() }

    await storage.set(testKey, {
      role: 'dad',
      expiry: new Date(Date.now() + 1000).toISOString(),
      createdAt: new Date().toISOString(),
    })

    const retrieved = await storage.get(testKey)
    await storage.delete(testKey) // Cleanup

    const isWorking = retrieved !== null

    // Determine storage driver
    let driver = 'memory'
    if (process.env.VERCEL || process.env.KV_REST_API_URL || process.env.KV_URL) {
      driver = 'vercel-kv'
    }

    return {
      ping: isWorking,
      driver,
    }
  } catch (error) {
    return {
      ping: false,
      driver: 'unknown',
      error: error instanceof Error ? error.message : 'Storage test failed',
    }
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const detailed = request.nextUrl.searchParams.get('detailed') === 'true'
    const quality = request.nextUrl.searchParams.get('quality') === 'true'

    // Gather all health data
    const [
      buildMetadata,
      assistantHealth,
      storageHealth,
      environmentValidation,
      deployment,
    ] = await Promise.all([
      getBuildMetadata(),
      getAssistantHealthSummary(),
      testStorageConnection(),
      Promise.resolve(validateEnvironment()),
      Promise.resolve(detectDeployment()),
    ])

    // Determine LLM provider
    const provider = process.env.LLM_PROVIDER || 'claude'

    // Check optional services
    const services = {
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      optional: true, // ElevenLabs is optional
    }

    // Determine overall health status
    let status: 'ready' | 'degraded' | 'unhealthy' = 'ready'

    // Check if quality gates should affect health status
    const includeQualityInHealth = process.env.HEALTH_INCLUDE_QUALITY === 'true'

    // Quality gate checks
    const qualityHealthy = !buildMetadata.quality || buildMetadata.quality.overallPass
    const deploymentReady = !buildMetadata.quality || buildMetadata.quality.deploymentReady

    // Unhealthy conditions (always check env validation and assistant health)
    if (!environmentValidation.success || !assistantHealth.ok) {
      status = 'unhealthy'
    }
    // Include quality gates in health check if flag is set
    else if (includeQualityInHealth && buildMetadata.quality && !qualityHealthy) {
      status = 'unhealthy'
    }
    // Degraded conditions
    else if (!storageHealth.ping || assistantHealth.status === 'degraded') {
      status = 'degraded'
    }
    // Include deployment readiness in degraded check if flag is set
    else if (includeQualityInHealth && buildMetadata.quality && !deploymentReady) {
      status = 'degraded'
    }

    const healthResponse: HealthResponse = {
      ok: status === 'ready' || status === 'degraded',
      status,
      build: buildMetadata,
      provider,
      storageDriver: storageHealth.driver,
      assistant: assistantHealth,
      storage: storageHealth,
      environment: {
        mode: deployment.isProduction ? 'production' : 'development',
        missing: environmentValidation.missing,
        warnings: environmentValidation.warnings,
      },
      services,
      quality: buildMetadata.quality,
      artifacts: buildMetadata.artifacts,
      pipeline: buildMetadata.pipeline,
    }

    // Return quality-focused response if requested
    if (quality) {
      return NextResponse.json({
        ok: healthResponse.ok,
        status: healthResponse.status,
        build: {
          sha: healthResponse.build.shortSha || healthResponse.build.sha?.substring(0, 8),
          time: healthResponse.build.time,
          deploymentReady: healthResponse.quality?.deploymentReady ?? true
        },
        quality: healthResponse.quality,
        artifacts: healthResponse.artifacts ? {
          status: healthResponse.artifacts.status,
          count: healthResponse.artifacts.count
        } : undefined,
      }, {
        status: status === 'unhealthy' ? 503 : 200,
      })
    }

    // Return detailed response if requested
    if (detailed) {
      return NextResponse.json(healthResponse, {
        status: status === 'unhealthy' ? 503 : 200,
      })
    }

    // Default optimized response for deployment verification
    return NextResponse.json({
      ok: healthResponse.ok,
      status: healthResponse.status,
      provider: healthResponse.provider,
      storage: healthResponse.storageDriver,
      build: healthResponse.build.sha ? {
        sha: healthResponse.build.shortSha || healthResponse.build.sha.substring(0, 8),
        time: healthResponse.build.time,
        deploymentReady: healthResponse.quality?.deploymentReady
      } : undefined,
    }, {
      status: status === 'unhealthy' ? 503 : 200,
    })

  } catch (error) {
    console.error('Health check failed:', error)

    return NextResponse.json({
      ok: false,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString(),
    }, { status: 503 })
  }
}