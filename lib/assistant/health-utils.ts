// @ts-nocheck
import { getLLMRouter } from '../llm/router'

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
    const router = getLLMRouter()
    const providerStatus = router.getProviderStatus()
    const usage = router.getUsageStats()

    const hasKey = providerStatus.hasApiKey
    if (!hasKey) {
      return {
        ok: false,
        model: providerStatus.model,
        key_present: false,
        status: 'unhealthy',
        limits: {
          rpm: parseInt(process.env.MAX_RPM || '10'),
          daily: parseInt(process.env.MAX_DAILY_TOKENS || '250000'),
        },
      }
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

    if (usage.totalRequests > 0) {
      const errorRate = usage.errors / usage.totalRequests
      if (errorRate > 0.1) {
        status = 'degraded'
      }
    }

    return {
      ok: status !== 'unhealthy',
      model: providerStatus.model,
      key_present: hasKey,
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
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      key_present: !!process.env.OPENAI_API_KEY,
      status: 'unhealthy',
      limits: {
        rpm: parseInt(process.env.MAX_RPM || '10'),
        daily: parseInt(process.env.MAX_DAILY_TOKENS || '250000'),
      },
    }
  }
}
