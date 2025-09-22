import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { validateEnvironment, detectDeployment } from '../../../lib/env'
import { storage } from '../../../lib/share/production-storage'
// import { getAssistantHealthSummary } from '../../../lib/assistant/health-utils'

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
  environment: {
    mode: string
    missing: string[]
    warnings: string[]
    validated: boolean
    hasWarnings: boolean
    missingRequired?: string[]
    missingOptional?: string[]
  }
  services: Record<string, ServiceHealthStatus>
  deployment: {
    ready: boolean
    checks: Array<{
      name: string
      status: 'pass' | 'fail' | 'warn'
      message?: string
    }>
  }
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
  lastUpdated: string
}

interface ServiceHealthStatus {
  status: 'healthy' | 'degraded' | 'unavailable'
  critical: boolean
  message?: string
  lastCheck?: string
  responseTime?: number
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

// Simple assistant health summary function
async function getAssistantHealthSummary(): Promise<AssistantHealthSummary> {
  try {
    // Check for API key presence first
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY

    return {
      ok: hasAnthropicKey,
      model: 'claude-3-5-sonnet-20241022',
      key_present: hasAnthropicKey,
      status: hasAnthropicKey ? 'healthy' : 'degraded',
      limits: {
        rpm: parseInt(process.env.MAX_RPM || '10'),
        daily: parseInt(process.env.MAX_DAILY_TOKENS || '250000'),
      },
    }
  } catch (error) {
    console.error('Assistant health check failed:', error)

    return {
      ok: false,
      model: 'claude-3-5-sonnet-20241022',
      key_present: !!process.env.ANTHROPIC_API_KEY,
      status: 'unhealthy',
      limits: {
        rpm: parseInt(process.env.MAX_RPM || '10'),
        daily: parseInt(process.env.MAX_DAILY_TOKENS || '250000'),
      },
    }
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
    const warnings = request.nextUrl.searchParams.get('warnings') === 'true'

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

    // Enhanced service status checking
    const services = await checkServiceHealth()

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
      environment: formatEnvironmentWarnings(environmentValidation, deployment),
      services,
      deployment: formatDeploymentChecks(buildMetadata, deployment, storageHealth, assistantHealth),
      quality: buildMetadata.quality,
      artifacts: buildMetadata.artifacts,
      pipeline: buildMetadata.pipeline,
      lastUpdated: new Date().toISOString(),
    }

    // Return warnings-focused response if requested
    if (warnings) {
      return NextResponse.json({
        ok: healthResponse.ok,
        status: healthResponse.status,
        environment: healthResponse.environment,
        services: healthResponse.services,
        deployment: healthResponse.deployment,
        warnings: generateUserFriendlyWarnings(healthResponse),
        lastUpdated: healthResponse.lastUpdated,
      }, {
        status: status === 'unhealthy' ? 503 : 200,
      })
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

// Enhanced service health checking
async function checkServiceHealth(): Promise<Record<string, ServiceHealthStatus>> {
  const services: Record<string, ServiceHealthStatus> = {}
  const now = new Date().toISOString()

  // ElevenLabs TTS Service
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY
  services.elevenlabs = {
    status: elevenLabsKey ? 'healthy' : 'unavailable',
    critical: false,
    message: elevenLabsKey
      ? 'Text-to-speech functionality available'
      : 'Configure ELEVENLABS_API_KEY for audio generation',
    lastCheck: now
  }

  // LLM Provider (Critical service)
  const llmProvider = process.env.LLM_PROVIDER || 'claude'
  const llmKey = llmProvider === 'claude'
    ? process.env.ANTHROPIC_API_KEY
    : process.env.OPENAI_API_KEY

  services.llm_provider = {
    status: llmKey ? 'healthy' : 'unavailable',
    critical: true,
    message: llmKey
      ? `${llmProvider.toUpperCase()} API available`
      : `Configure ${llmProvider.toUpperCase()}_API_KEY for AI functionality`,
    lastCheck: now
  }

  // Storage Service (Critical for sharing functionality)
  try {
    const testKey = `health-${Date.now()}`
    await storage.set(testKey, { test: true, expiry: new Date(Date.now() + 1000).toISOString(), createdAt: now })
    await storage.get(testKey)
    await storage.delete(testKey)

    services.storage = {
      status: 'healthy',
      critical: true,
      message: 'Storage system operational',
      lastCheck: now
    }
  } catch (error) {
    services.storage = {
      status: 'unavailable',
      critical: true,
      message: `Storage system error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      lastCheck: now
    }
  }

  // Optional Analytics/Monitoring
  const analyticsKey = process.env.ANALYTICS_API_KEY || process.env.VERCEL_ANALYTICS_ID
  if (analyticsKey) {
    services.analytics = {
      status: 'healthy',
      critical: false,
      message: 'Analytics tracking available',
      lastCheck: now
    }
  }

  return services
}

// Format environment warnings for UI consumption
function formatEnvironmentWarnings(environmentValidation: any, deployment: any) {
  const requiredEnvVars = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    // Note: At least one of the above should be present
  ].filter(key => !process.env[key])

  const optionalEnvVars = [
    'ELEVENLABS_API_KEY',
    'VERCEL_ANALYTICS_ID',
    'KV_REST_API_URL',
    'DATABASE_URL'
  ].filter(key => !process.env[key])

  // Determine which required vars are actually missing
  const missingRequired = []
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    missingRequired.push('LLM_API_KEY (either ANTHROPIC_API_KEY or OPENAI_API_KEY)')
  }

  return {
    mode: deployment.isProduction ? 'production' : 'development',
    missing: environmentValidation.missing,
    warnings: environmentValidation.warnings,
    validated: environmentValidation.success,
    hasWarnings: environmentValidation.warnings.length > 0 || missingRequired.length > 0,
    missingRequired,
    missingOptional: optionalEnvVars
  }
}

// Format deployment checks for UI consumption
function formatDeploymentChecks(buildMetadata: BuildMetadata, deployment: any, storageHealth: any, assistantHealth: any) {
  const checks = []

  // Environment validation check
  checks.push({
    name: 'Environment Configuration',
    status: (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) ? 'fail' : 'pass',
    message: (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY)
      ? 'Missing required LLM API key'
      : 'LLM provider configured'
  })

  // Storage check
  checks.push({
    name: 'Storage System',
    status: storageHealth.ping ? 'pass' : 'fail',
    message: storageHealth.ping ? 'Storage operational' : storageHealth.error || 'Storage unavailable'
  })

  // Assistant health check
  checks.push({
    name: 'AI Assistant',
    status: assistantHealth.ok ? 'pass' : 'fail',
    message: assistantHealth.ok ? 'Assistant ready' : 'Assistant unavailable'
  })

  // Build quality check
  if (buildMetadata.quality) {
    checks.push({
      name: 'Build Quality',
      status: buildMetadata.quality.overallPass ? 'pass' : 'warn',
      message: buildMetadata.quality.overallPass
        ? 'All quality gates passed'
        : `${buildMetadata.quality.gates.failed.length} quality gates failed`
    })
  }

  // Artifact completeness check
  if (buildMetadata.artifacts) {
    checks.push({
      name: 'Build Artifacts',
      status: buildMetadata.artifacts.status === 'complete' ? 'pass' :
              buildMetadata.artifacts.status === 'partial' ? 'warn' : 'fail',
      message: `${buildMetadata.artifacts.count} artifacts - ${buildMetadata.artifacts.status}`
    })
  }

  const allPassing = checks.every(check => check.status === 'pass')
  const hasFailures = checks.some(check => check.status === 'fail')

  return {
    ready: allPassing,
    checks
  }
}

// Generate user-friendly warnings for the warnings endpoint
function generateUserFriendlyWarnings(healthResponse: HealthResponse) {
  const warnings = []

  // Critical environment warnings
  if (healthResponse.environment.missingRequired?.length > 0) {
    warnings.push({
      id: 'missing-required-env',
      level: 'error',
      title: 'Critical Configuration Missing',
      message: `${healthResponse.environment.missingRequired.length} required environment variable(s) not configured`,
      details: healthResponse.environment.missingRequired.join(', '),
      actions: [
        { type: 'link', label: 'Setup Guide', url: '/docs/deployment' },
        { type: 'link', label: 'Environment Template', url: '/.env.example' }
      ]
    })
  }

  // Service warnings
  const degradedServices = Object.entries(healthResponse.services)
    .filter(([, service]) => service.status !== 'healthy')

  const criticalServiceIssues = degradedServices.filter(([, service]) => service.critical)
  const optionalServiceIssues = degradedServices.filter(([, service]) => !service.critical)

  if (criticalServiceIssues.length > 0) {
    warnings.push({
      id: 'critical-services-down',
      level: 'error',
      title: 'Critical Services Unavailable',
      message: `${criticalServiceIssues.length} essential service(s) are not responding`,
      details: criticalServiceIssues.map(([name, service]) => `${name}: ${service.message}`).join(', '),
      actions: [
        { type: 'link', label: 'Service Configuration', url: '/docs/services' }
      ]
    })
  }

  if (optionalServiceIssues.length > 0) {
    // Special handling for TTS service
    const ttsIssue = optionalServiceIssues.find(([name]) => name === 'elevenlabs')
    if (ttsIssue) {
      warnings.push({
        id: 'tts-service-unavailable',
        level: 'warning',
        title: 'Audio Generation Unavailable',
        message: 'Text-to-speech features are in preview-only mode',
        details: 'Configure ElevenLabs API key to enable audio generation',
        actions: [
          { type: 'link', label: 'Enable TTS', url: '/docs/tts-setup' }
        ]
      })
    }

    const otherIssues = optionalServiceIssues.filter(([name]) => name !== 'elevenlabs')
    if (otherIssues.length > 0) {
      warnings.push({
        id: 'optional-services-degraded',
        level: 'warning',
        title: 'Optional Features Limited',
        message: `${otherIssues.length} optional service(s) unavailable`,
        details: otherIssues.map(([name, service]) => `${name}: ${service.message}`).join(', '),
        actions: [
          { type: 'link', label: 'Optional Features', url: '/docs/optional-services' }
        ]
      })
    }
  }

  // Deployment readiness warnings
  if (!healthResponse.deployment.ready) {
    const failedChecks = healthResponse.deployment.checks.filter(check => check.status === 'fail')
    if (failedChecks.length > 0) {
      warnings.push({
        id: 'deployment-not-ready',
        level: 'warning',
        title: 'Deployment Not Ready',
        message: `${failedChecks.length} deployment check(s) failing`,
        details: failedChecks.map(check => `${check.name}: ${check.message}`).join(', '),
        actions: [
          { type: 'link', label: 'Deployment Guide', url: '/docs/deployment' }
        ]
      })
    }
  }

  // Optional features available
  if (healthResponse.environment.missingOptional?.length > 0) {
    warnings.push({
      id: 'missing-optional-env',
      level: 'info',
      title: 'Additional Features Available',
      message: `${healthResponse.environment.missingOptional.length} optional feature(s) can be enabled`,
      details: healthResponse.environment.missingOptional.join(', '),
      actions: [
        { type: 'link', label: 'Optional Features', url: '/docs/optional-features' }
      ]
    })
  }

  return warnings
}