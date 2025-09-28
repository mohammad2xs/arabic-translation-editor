import OpenAI from 'openai';

type LLMProvider = 'openai';

interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  maxTokens: number;
  timeout: number;
}

interface ChatRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  streaming?: boolean;
}

interface ChatResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: LLMProvider;
  cached: boolean;
}

interface StreamingChatResponse {
  stream: AsyncIterable<{ content: string; done: boolean }>;
  usage: Promise<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
}

interface ProviderStatus {
  provider: LLMProvider;
  model: string;
  configured: boolean;
  hasApiKey: boolean;
}

class LLMRouter {
  private config: LLMConfig;
  private client: OpenAI | null = null;
  private usageStats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalRequests: 0,
    errors: 0,
  };

  constructor() {
    const provider: LLMProvider = 'openai';
    const apiKey = process.env.OPENAI_API_KEY || '';
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const maxTokens = parseInt(process.env.LLM_MAX_TOKENS || '4000', 10);
    const timeout = parseInt(process.env.LLM_TIMEOUT || '20000', 10);

    this.config = {
      provider,
      apiKey,
      model,
      maxTokens,
      timeout,
    };

    if (apiKey) {
      this.client = new OpenAI({ apiKey, timeout });
    }
  }

  private ensureClient(): void {
    if (!this.client) {
      throw new Error('OPENAI_API_KEY environment variable is required to use the assistant.');
    }
  }

  private normalizeUsage(usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) {
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
    return { inputTokens, outputTokens, totalTokens };
  }

  private async makeRequestWithRetry<T>(request: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await request();
      } catch (error) {
        lastError = error as Error;

        const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
        if (message.includes('unauthorized') || message.includes('invalid') || message.includes('forbidden')) {
          throw error;
        }

        if (attempt < maxRetries - 1) {
          const backoff = Math.pow(2, attempt) * 250;
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private async chatWithOpenAI(request: ChatRequest): Promise<ChatResponse> {
    this.ensureClient();
    const client = this.client!;

    const completion = await client.chat.completions.create({
      model: this.config.model,
      max_tokens: request.maxTokens || this.config.maxTokens,
      temperature: request.temperature ?? 0.2,
      top_p: request.topP ?? 0.95,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
    });

    const content = completion.choices[0]?.message?.content || '';
    const usage = this.normalizeUsage(completion.usage);

    return {
      content,
      usage,
      model: this.config.model,
      provider: 'openai',
      cached: false,
    };
  }

  public async chat(request: ChatRequest): Promise<ChatResponse> {
    this.usageStats.totalRequests++;

    try {
      const response = await this.makeRequestWithRetry(() => this.chatWithOpenAI(request));
      this.usageStats.totalInputTokens += response.usage.inputTokens;
      this.usageStats.totalOutputTokens += response.usage.outputTokens;
      return response;
    } catch (error) {
      this.usageStats.errors++;
      throw error;
    }
  }

  public async chatStream(): Promise<StreamingChatResponse> {
    throw new Error('Streaming is not currently supported for the ChatGPT integration.');
  }

  public getProviderStatus(): ProviderStatus {
    return {
      provider: 'openai',
      model: this.config.model,
      configured: !!this.config.apiKey,
      hasApiKey: !!this.config.apiKey,
    };
  }

  public isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  public validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.apiKey) {
      errors.push('OPENAI_API_KEY environment variable is required');
    }

    if (!this.config.model) {
      errors.push('OPENAI_MODEL environment variable is required or fallback model failed to resolve');
    }

    if (this.config.maxTokens <= 0 || this.config.maxTokens > 200000) {
      errors.push('LLM_MAX_TOKENS must be between 1 and 200000');
    }

    if (this.config.timeout <= 0 || this.config.timeout > 300000) {
      errors.push('LLM_TIMEOUT must be between 1 and 300000 milliseconds');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public async testConnection(): Promise<{ success: boolean; error?: string; model?: string; provider?: LLMProvider }> {
    try {
      await this.chat({
        system: 'You are a friendly assistant.',
        user: 'Say "Hello!" and nothing else.',
        maxTokens: 20,
        temperature: 0,
      });

      return {
        success: true,
        model: this.config.model,
        provider: 'openai',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'openai',
      };
    }
  }

  public resetUsageStats(): void {
    this.usageStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalRequests: 0,
      errors: 0,
    };
  }

  public getUsageStats() {
    return this.usageStats;
  }
}

let globalRouter: LLMRouter | null = null;

export function getLLMRouter(): LLMRouter {
  if (!globalRouter) {
    globalRouter = new LLMRouter();
  }
  return globalRouter;
}

export type { ChatRequest, ChatResponse, StreamingChatResponse, ProviderStatus };
export { LLMProvider };
export default LLMRouter;
