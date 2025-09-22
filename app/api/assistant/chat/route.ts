import { NextRequest, NextResponse } from 'next/server';
import { getRoleFromRequest, canComment, validateRoleAccess } from '../../../../lib/dadmode/access';
import { getLLMRouter } from '../../../../lib/llm/router';
import { buildContext, getCompactContext } from '../../../../lib/assistant/context';
import { getPromptForTask } from '../../../../lib/assistant/prompt';
import { generateWordDiff, calculateConfidence, generateContentHash } from '../../../../lib/assistant/tools';
import { getAssistantCache, createCacheRequest } from '../../../../lib/assistant/cache';
import { formatScriptureForAssistant, generateScriptureFootnote, validateScripturePreservation } from '../../../../lib/scripture/index';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface ChatRequestBody {
  row_id: string;
  section_id: string;
  task: string;
  query?: string;
  selection?: string;
  lang?: 'en' | 'ar';
  temperature?: number;
  seed?: number;
}

interface Suggestion {
  id: string;
  type: string; // task type
  title: string;
  preview: string; // first ~120 chars of proposed change
  en: string; // proposed English text
  ar?: string; // optional Arabic for backtranslate
  footnote?: string; // formatted if scripture_check/footnote_suggest
  diff: Array<{
    type: 'add' | 'remove' | 'keep';
    content: string;
  }>;
  confidence: number;
  cost?: number; // computed from usage
}

interface ChatResponse {
  suggestions: Suggestion[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cached: boolean;
  requestId: string;
}

// Rate limiting state (in memory - use Redis in production)
const rateLimits = new Map<string, {
  dailyTokens: number;
  requestCount: number;
  lastReset: Date;
}>();

const MAX_DAILY_TOKENS = parseInt(process.env.MAX_DAILY_TOKENS || '250000');
const MAX_RPM = 10; // Fixed RPM=10 per spec
const requestHistory = new Map<string, number[]>();

function getRateLimitKey(request: NextRequest): string {
  // Use magic-link token as primary key for rate limiting
  const magicToken = request.headers.get('x-magic-token');
  if (magicToken) {
    return `token:${magicToken}`;
  }

  // Fallback to role+IP for non-token requests
  const userRole = getRoleFromRequest(request);
  const clientIP = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
  return `${userRole}:${clientIP}`;
}

function checkRateLimit(key: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const daily = rateLimits.get(key);

  // Reset daily counters if needed
  if (!daily || daily.lastReset.getDate() !== new Date().getDate()) {
    rateLimits.set(key, {
      dailyTokens: 0,
      requestCount: 0,
      lastReset: new Date(),
    });
  }

  const current = rateLimits.get(key)!;

  // Check daily token limit
  if (current.dailyTokens >= MAX_DAILY_TOKENS) {
    return {
      allowed: false,
      reason: `Daily token limit exceeded (${MAX_DAILY_TOKENS}). Resets at midnight.`,
    };
  }

  // Check requests per minute
  const rpm = requestHistory.get(key) || [];
  const recentRequests = rpm.filter(time => now - time < 60000); // Last minute

  if (recentRequests.length >= MAX_RPM) {
    return {
      allowed: false,
      reason: "We're pausing briefly to keep things smooth—try again in a moment.",
    };
  }

  return { allowed: true };
}

function updateRateLimit(key: string, tokensUsed: number): void {
  const current = rateLimits.get(key)!;
  current.dailyTokens += tokensUsed;
  current.requestCount += 1;

  // Update request history
  const now = Date.now();
  const rpm = requestHistory.get(key) || [];
  rpm.push(now);

  // Keep only last minute of requests
  const recent = rpm.filter(time => now - time < 60000);
  requestHistory.set(key, recent);
}

function logUsage(data: any): void {
  try {
    const logDir = join(process.cwd(), 'outputs/tmp/assistant');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const logFile = join(logDir, 'usage.ndjson');
    const logEntry = JSON.stringify({
      ...data,
      timestamp: new Date().toISOString(),
    }) + '\n';

    writeFileSync(logFile, logEntry, { flag: 'a' });
  } catch (error) {
    console.error('Failed to log usage:', error);
  }
}

async function parseClaudeResponse(
  content: string,
  originalText: string,
  task: string,
  context: any,
  usage?: any
): Promise<Suggestion[]> {
  try {
    // Claude should return JSON, but handle both JSON and structured text
    let parsed: any;

    try {
      parsed = JSON.parse(content);
    } catch {
      // Fallback: extract structured information from text
      parsed = {
        title: 'Translation Suggestion',
        en: content,
        confidence: 0.8,
      };
    }

    // Ensure we have an array of suggestions
    const suggestions = Array.isArray(parsed) ? parsed : [parsed];

    return suggestions.map((item, index) => {
      const proposedEn = item.en || item.suggestion || item.text || item.content || content;
      const diff = generateWordDiff(originalText, proposedEn);

      // Generate preview (first ~120 chars)
      const preview = proposedEn.slice(0, 120) + (proposedEn.length > 120 ? '...' : '');

      // Compute cost from usage if available
      const cost = usage ? (usage.inputTokens * 0.003 + usage.outputTokens * 0.015) / 1000 : undefined;

      // Handle scripture footnote for scripture_check/footnote_suggest tasks
      let footnote: string | undefined;
      if ((task === 'scripture_check' || task === 'footnote_suggest') && context.scripture?.length > 0) {
        try {
          footnote = generateScriptureFootnote(context.scripture);
        } catch (error) {
          console.warn('Failed to generate scripture footnote:', error);
        }
      }

      // For backtranslate task, include Arabic
      const ar = task === 'backtranslate' ? item.ar : undefined;

      return {
        id: item.id || `sug_${Date.now()}_${index}`,
        type: task,
        title: item.title || 'Translation Suggestion',
        preview,
        en: proposedEn,
        ar,
        footnote,
        diff,
        confidence: (() => {
          // Check scripture preservation if this is a scripture-related task
          let preservesScripture = true;
          if (task === 'scripture_check' || task === 'footnote_suggest') {
            try {
              const validation = validateScripturePreservation(originalText, proposedEn);
              preservesScripture = validation.preserved;
            } catch (error) {
              console.warn('Failed to validate scripture preservation:', error);
            }
          }

          return item.confidence || calculateConfidence(
            originalText.length,
            proposedEn.length,
            preservesScripture,
            true  // TODO: Implement terminology validation
          );
        })(),
        cost,
      };
    });
  } catch (error) {
    console.error('Failed to parse Claude response:', error);

    // Fallback suggestion
    return [{
      id: `sug_${Date.now()}_fallback`,
      type: task,
      title: 'Processing Error',
      preview: 'Unable to process response',
      en: content.slice(0, 200) + '...',
      diff: generateWordDiff(originalText, content.slice(0, 200) + '...'),
      confidence: 0.3,
    }];
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    // Parse request body
    let body: ChatRequestBody;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.row_id || !body.section_id || !body.task) {
      return NextResponse.json(
        { error: 'Missing required fields: row_id, section_id, task' },
        { status: 400 }
      );
    }

    // Get user role and check permissions
    const userRole = getRoleFromRequest(request);
    if (!canComment(userRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Commenter access required.' },
        { status: 403 }
      );
    }

    // Rate limiting
    const rateLimitKey = getRateLimitKey(request);
    const rateCheck = checkRateLimit(rateLimitKey);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.reason },
        { status: 429 }
      );
    }

    // Build context for the request
    const context = await buildContext(
      body.row_id,
      body.section_id,
      body.selection,
      body.task
    );

    // Enforce scripture check cache-only policy
    if (body.task === 'scripture_check' && (!context.scripture || context.scripture.length === 0)) {
      return NextResponse.json({ error: 'Scripture check requires cached reference. No API call allowed without cache hit.' }, { status: 400 });
    }

    // Check cache first
    const cache = getAssistantCache();
    const cacheRequest = createCacheRequest(
      body.row_id,
      {
        ar_original: context.row.ar_original,
        en_translation: context.row.en_translation,
      },
      body.task,
      body.query,
      body.selection,
      generateContentHash(getCompactContext(context))
    );

    const cached = cache.get(cacheRequest);
    if (cached) {
      logUsage({
        requestId,
        userRole,
        rowId: body.row_id,
        task: body.task,
        cached: true,
        tokensUsed: 0,
      });

      return NextResponse.json({
        suggestions: cached.suggestions,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cached: true,
        requestId,
      });
    }

    // Get prompts for the task
    const prompts = getPromptForTask(body.task, context, body.query);

    // Call LLM via router (supports Claude default, optional Gemini)
    const router = getLLMRouter();
    if (!router.isConfigured()) {
      return NextResponse.json(
        { error: 'LLM service not configured. Please contact administrator.' },
        { status: 503 }
      );
    }

    const chatResponse = await router.chat({
      system: prompts.system,
      user: prompts.user,
      maxTokens: 2000,
      temperature: body.temperature ?? 0.2,
      seed: body.seed ?? 42,
    });

    // Parse response into suggestions
    const suggestions = await parseClaudeResponse(
      chatResponse.content,
      context.row.en_translation,
      body.task,
      context,
      chatResponse.usage
    );

    // Update rate limits
    updateRateLimit(rateLimitKey, chatResponse.usage.totalTokens);

    // Cache the response
    cache.set(cacheRequest, {
      suggestions,
      generatedAt: new Date().toISOString(),
    });

    // Log usage
    logUsage({
      requestId,
      userRole,
      rowId: body.row_id,
      sectionId: body.section_id,
      task: body.task,
      query: body.query,
      selection: body.selection,
      cached: false,
      tokensUsed: chatResponse.usage.totalTokens,
      inputTokens: chatResponse.usage.inputTokens,
      outputTokens: chatResponse.usage.outputTokens,
      suggestionsCount: suggestions.length,
      model: chatResponse.model,
      provider: chatResponse.provider,
    });

    const response: ChatResponse = {
      suggestions,
      usage: chatResponse.usage,
      cached: false,
      requestId,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Assistant chat error:', error);

    logUsage({
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      rowId: body?.row_id,
      task: body?.task,
    });

    if (error instanceof Error && error.message.includes('rate limit')) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    if (error instanceof Error && error.message.includes('unauthorized')) {
      return NextResponse.json(
        { error: 'Invalid API credentials. Please contact administrator.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET(): Promise<NextResponse> {
  const router = getLLMRouter();
  const config = router.getConfig();
  const stats = router.getUsageStats();
  const providerStatus = router.getProviderStatus();

  return NextResponse.json({
    status: 'healthy',
    configured: router.isConfigured(),
    provider: providerStatus.provider,
    model: config.model,
    maxTokens: config.maxTokens,
    usage: stats,
    providerStatus: router.getAllProviderStatus(),
    limits: {
      maxDailyTokens: MAX_DAILY_TOKENS,
      maxRPM: MAX_RPM,
    },
  });
}