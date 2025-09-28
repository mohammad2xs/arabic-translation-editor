import { getAnthropicClient } from './anthropic'
import { getAssistantCache } from './cache'

export interface AssistantHealthSummary {
  ok: boolean
  model: string
  key_present: boolean
  status: 'healthy' | 'degraded' | 'unhealthy'
  limits: {
    rpm: number
    daily: number
  }
}

export async function getAssistantHealthSummary(): Promise<AssistantHealthSummary> {
  try {
    // Check for API key presence first
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY

    if (!hasAnthropicKey) {
      return {
        ok: false,
        model: 'claude-3-5-sonnet-20241022',
        key_present: false,
        status: 'unhealthy',
        limits: {
          rpm: parseInt(process.env.MAX_RPM || '10'),
          daily: parseInt(process.env.MAX_DAILY_TOKENS || '250000'),
        },
      }
    }

    // Check Anthropic client configuration
    const anthropicClient = getAnthropicClient()
    const anthropicConfig = anthropicClient.getConfig()
    const anthropicUsage = anthropicClient.getUsageStats()

    // Basic health check
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

    if (!anthropicConfig.hasApiKey) {
      status = 'unhealthy'
    } else if (anthropicUsage.errors > anthropicUsage.totalRequests * 0.1) {
      // More than 10% error rate indicates degraded service
      status = 'degraded'
    }

    return {
      ok: status === 'healthy' || status === 'degraded',
      model: anthropicConfig.model,
      key_present: anthropicConfig.hasApiKey,
      status,
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