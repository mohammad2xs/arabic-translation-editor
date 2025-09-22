import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '../../../../lib/assistant/anthropic';
import { getAssistantCache } from '../../../../lib/assistant/cache';

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  anthropic: {
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
    anthropicApiKey: boolean;
    cacheDirectory: boolean;
    diskSpace: boolean;
  };
}

function checkDiskSpace(): boolean {
  try {
    const { statSync } = require('fs');
    const { join } = require('path');

    const cacheDir = join(process.cwd(), 'outputs/tmp/assistant');
    const stats = statSync(cacheDir);

    // Basic check - if we can stat the directory, assume we have space
    // In production, you'd want a more sophisticated check
    return true;
  } catch (error) {
    return false;
  }
}

function checkCacheDirectory(): boolean {
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

async function performConnectionTest(client: any): Promise<{
  success: boolean;
  error?: string;
  responseTime?: number;
}> {
  try {
    const startTime = Date.now();

    const testResult = await client.testConnection();

    const responseTime = Date.now() - startTime;

    return {
      success: testResult.success,
      error: testResult.error,
      responseTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const timestamp = new Date().toISOString();

    // Check for minimal mode (default)
    const minimal = request.nextUrl.searchParams.get('minimal') !== 'false';

    // Check Anthropic client
    const anthropicClient = getAnthropicClient();
    const anthropicConfig = anthropicClient.getConfig();
    const anthropicUsage = anthropicClient.getUsageStats();

    // Return minimal response by default
    if (minimal) {
      return NextResponse.json({
        ok: true,
        model: anthropicConfig.model,
        key_present: anthropicConfig.hasApiKey,
        limits: {
          rpm: 10,
          daily: 250000,
        },
      });
    }

    // Check cache
    const cache = getAssistantCache();
    const cacheStats = cache.getStats();
    const cacheInfo = cache.getCacheInfo();

    // Environment variables
    const maxDailyTokens = parseInt(process.env.MAX_DAILY_TOKENS || '250000');
    const maxRPM = parseInt(process.env.MAX_RPM || '10');

    // Perform system checks
    const checks = {
      anthropicApiKey: anthropicConfig.hasApiKey,
      cacheDirectory: checkCacheDirectory(),
      diskSpace: checkDiskSpace(),
    };

    // Optional connection test (only if requested via query param)
    const shouldTestConnection = request.nextUrl.searchParams.get('test_connection') === 'true';
    let connectionTest: any = undefined;

    if (shouldTestConnection && anthropicConfig.hasApiKey) {
      connectionTest = await performConnectionTest(anthropicClient);
    }

    // Determine overall health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!checks.anthropicApiKey || !checks.cacheDirectory) {
      status = 'unhealthy';
    } else if (!checks.diskSpace || (connectionTest && !connectionTest.success)) {
      status = 'degraded';
    } else if (anthropicUsage.errors > anthropicUsage.totalRequests * 0.1) {
      // More than 10% error rate indicates degraded service
      status = 'degraded';
    }

    const healthResponse: HealthResponse = {
      status,
      timestamp,
      anthropic: {
        configured: anthropicClient.isConfigured(),
        model: anthropicConfig.model,
        hasApiKey: anthropicConfig.hasApiKey,
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
      usage: anthropicUsage,
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        hasBaseUrl: !!process.env.NEXT_PUBLIC_BASE_URL,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      checks,
    };

    // Set appropriate HTTP status based on health
    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

    return NextResponse.json(healthResponse, { status: httpStatus });

  } catch (error) {
    console.error('Health check failed:', error);

    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Health check failed',
      anthropic: {
        configured: false,
        model: 'unknown',
        hasApiKey: false,
      },
      cache: {
        size: 0,
        entries: 0,
        maxSize: 0,
        maxEntries: 0,
        usage: 0,
        hitRate: 0,
      },
      limits: {
        maxDailyTokens: parseInt(process.env.MAX_DAILY_TOKENS || '250000'),
        maxRPM: parseInt(process.env.MAX_RPM || '10'),
      },
      usage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalRequests: 0,
        errors: 1,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        hasBaseUrl: !!process.env.NEXT_PUBLIC_BASE_URL,
        timezone: 'unknown',
      },
      checks: {
        anthropicApiKey: false,
        cacheDirectory: false,
        diskSpace: false,
      },
    }, { status: 503 });
  }
}

// POST endpoint for administrative actions
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const action = body.action;

    // Simple action handlers for debugging/maintenance
    switch (action) {
      case 'clear_cache':
        const cache = getAssistantCache();
        cache.clear();
        return NextResponse.json({
          success: true,
          message: 'Cache cleared successfully',
          timestamp: new Date().toISOString(),
        });

      case 'prune_cache':
        const pruneCache = getAssistantCache();
        const pruned = pruneCache.prune();
        return NextResponse.json({
          success: true,
          message: `Pruned ${pruned} cache entries`,
          timestamp: new Date().toISOString(),
          pruned,
        });

      case 'reset_usage_stats':
        const anthropicClient = getAnthropicClient();
        anthropicClient.resetUsageStats();
        return NextResponse.json({
          success: true,
          message: 'Usage statistics reset',
          timestamp: new Date().toISOString(),
        });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Health action failed:', error);
    return NextResponse.json(
      {
        error: 'Action failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}