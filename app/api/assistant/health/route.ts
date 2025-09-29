// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAssistantCache } from '../../../../lib/assistant/cache';
import { getAssistantHealthSummary } from '../../../../lib/assistant/health-utils';
import { getLLMRouter } from '../../../../lib/llm/router';

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  assistant: {
    configured: boolean;
    model: string;
    hasApiKey: boolean;
    connectionTest?: {
      success: boolean;
      error?: string;
      responseTime?: number;
    };
  };
  cache: {
    size: number;
    entries: number;
    maxSize: number;
    maxEntries: number;
    usage: number;
    hitRate: number;
  };
  limits: {
    maxDailyTokens: number;
    maxRPM: number;
  };
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalRequests: number;
    errors: number;
  };
  environment: {
    nodeEnv: string;
    hasBaseUrl: boolean;
    timezone: string;
  };
  checks: {
    apiKey: boolean;
    cacheDirectory: boolean;
  };
}

function ensureCacheDirectory(): boolean {
  try {
    const { existsSync, mkdirSync } = require('fs');
    const { join } = require('path');
    const cacheDir = join(process.cwd(), 'outputs/tmp/assistant');
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    return existsSync(cacheDir);
  } catch (error) {
    return false;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const timestamp = new Date().toISOString();
    const minimal = request.nextUrl.searchParams.get('minimal') !== 'false';
    const summary = await getAssistantHealthSummary();

    if (minimal) {
      return NextResponse.json({
        ok: summary.ok,
        model: summary.model,
        key_present: summary.key_present,
        limits: summary.limits,
      });
    }

    const cache = getAssistantCache();
    const cacheStats = cache.getStats();
    const cacheInfo = cache.getCacheInfo();

    const maxDailyTokens = parseInt(process.env.MAX_DAILY_TOKENS || '250000', 10);
    const maxRPM = parseInt(process.env.MAX_RPM || '10', 10);

    const checks = {
      apiKey: summary.key_present,
      cacheDirectory: ensureCacheDirectory(),
    };

    // Optional connection test if query param provided
    let connectionTest: { success: boolean; error?: string; responseTime?: number } | undefined;
    if (request.nextUrl.searchParams.get('test_connection') === 'true' && summary.key_present) {
      const start = Date.now();
      const testResult = await getLLMRouter().testConnection();
      connectionTest = {
        success: testResult.success,
        error: testResult.error,
        responseTime: Date.now() - start,
      };
    }

    const status: 'healthy' | 'degraded' | 'unhealthy' = summary.ok
      ? (summary.status === 'degraded' ? 'degraded' : 'healthy')
      : 'unhealthy';

    const usage = getLLMRouter().getUsageStats();

    const response: HealthResponse = {
      status,
      timestamp,
      assistant: {
        configured: summary.ok,
        model: summary.model,
        hasApiKey: summary.key_present,
        connectionTest,
      },
      cache: {
        size: cacheInfo.size,
        entries: cacheInfo.entries,
        maxSize: cacheInfo.maxSize,
        maxEntries: cacheInfo.maxEntries,
        usage: cacheInfo.usage,
        hitRate: cacheStats.hitRate,
      },
      limits: {
        maxDailyTokens,
        maxRPM,
      },
      usage,
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        hasBaseUrl: !!process.env.NEXT_PUBLIC_BASE_URL,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      checks,
    };

    const httpStatus = status === 'healthy' || status === 'degraded' ? 200 : 503;
    return NextResponse.json(response, { status: httpStatus });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Assistant health check failed'
    }, { status: 503 });
  }
}
