// official SDK for usage tokens; falls back to fetch if missing
let Anthropic: any = null;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (error) {
  // SDK not available, will use fetch fallback
}

interface AnthropicConfig {
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
  seed?: number;
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

class AnthropicClient {
  private client: any | null = null;
  private config: AnthropicConfig;
  private usageStats: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalRequests: number;
    errors: number;
  } = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalRequests: 0,
    errors: 0,
  };

  constructor() {
    this.config = {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet',
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '800'),
      timeout: parseInt(process.env.ANTHROPIC_TIMEOUT || '20000'),
    };

    if (this.config.apiKey && Anthropic) {
      this.initializeClient();
    }
  }

  private initializeClient(): void {
    try {
      if (Anthropic) {
        this.client = new Anthropic({
          apiKey: this.config.apiKey,
          timeout: this.config.timeout,
        });
      } else {
        this.client = null;
      }
    } catch (error) {
      console.error('Failed to initialize Anthropic client:', error);
      this.client = null;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async makeRequestWithRetry<T>(
    request: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await request();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on auth errors or invalid requests
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();
          if (errorMessage.includes('unauthorized') ||
              errorMessage.includes('forbidden') ||
              errorMessage.includes('invalid')) {
            throw error;
          }
        }

        // Exponential backoff with jitter: 1s±200ms, 2s±400ms
        if (attempt < maxRetries - 1) {
          const baseDelay = Math.pow(2, attempt) * 1000;
          const jitter = Math.random() * 400 - 200;
          const delay = baseDelay + jitter;
          console.warn(`Anthropic request failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${Math.round(delay)}ms:`, error);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private async fallbackFetch(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: request.maxTokens || this.config.maxTokens,
        temperature: request.temperature ?? 0.2,
        top_p: request.topP ?? 0.95,
        seed: request.seed ?? 42,
        system: request.system,
        messages: [{
          role: 'user',
          content: request.user,
        }],
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.content?.[0]?.text || '',
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      model: this.config.model,
      cached: false,
    };
  }

  public async chat(request: ChatRequest): Promise<ChatResponse> {
    this.usageStats.totalRequests++;

    try {
      // Try official SDK first
      if (this.client) {
        const response = await this.makeRequestWithRetry(async () => {
          const message = await this.client!.messages.create({
            model: this.config.model,
            max_tokens: request.maxTokens || this.config.maxTokens,
            temperature: request.temperature ?? 0.2,
            top_p: request.topP ?? 0.95,
            seed: request.seed ?? 42,
            system: request.system,
            messages: [{
              role: 'user',
              content: request.user,
            }],
          });

          return message;
        });

        const content = response.content?.[0]?.type === 'text'
          ? response.content[0].text
          : '';

        const usage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        };

        this.usageStats.totalInputTokens += usage.inputTokens;
        this.usageStats.totalOutputTokens += usage.outputTokens;

        return {
          content,
          usage,
          model: this.config.model,
          cached: false,
        };
      }

      // Fallback to direct fetch
      const fallbackResponse = await this.makeRequestWithRetry(() =>
        this.fallbackFetch(request)
      );

      this.usageStats.totalInputTokens += fallbackResponse.usage.inputTokens;
      this.usageStats.totalOutputTokens += fallbackResponse.usage.outputTokens;

      return fallbackResponse;

    } catch (error) {
      this.usageStats.errors++;
      console.error('Anthropic request failed:', error);
      throw error;
    }
  }

  public async chatStream(request: ChatRequest): Promise<StreamingChatResponse> {
    if (!this.client) {
      throw new Error('Streaming requires Anthropic SDK client');
    }

    this.usageStats.totalRequests++;

    try {
      const stream = await this.makeRequestWithRetry(async () => {
        return this.client!.messages.stream({
          model: this.config.model,
          max_tokens: request.maxTokens || this.config.maxTokens,
          temperature: request.temperature ?? 0.2,
          top_p: request.topP ?? 0.95,
          seed: request.seed ?? 42,
          system: request.system,
          messages: [{
            role: 'user',
            content: request.user,
          }],
        });
      });

      const transformedStream = this.transformStream(stream);
      const usagePromise = this.extractUsageFromStream(stream);

      return {
        stream: transformedStream,
        usage: usagePromise,
      };

    } catch (error) {
      this.usageStats.errors++;
      throw error;
    }
  }

  private async* transformStream(stream: any): AsyncIterable<{ content: string; done: boolean }> {
    try {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          yield { content: chunk.delta.text, done: false };
        }
      }
      yield { content: '', done: true };
    } catch (error) {
      console.error('Stream error:', error);
      throw error;
    }
  }

  private async extractUsageFromStream(stream: any): Promise<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }> {
    try {
      const finalMessage = await stream.finalMessage();
      const usage = {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
        totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
      };

      this.usageStats.totalInputTokens += usage.inputTokens;
      this.usageStats.totalOutputTokens += usage.outputTokens;

      return usage;
    } catch (error) {
      console.error('Failed to extract usage from stream:', error);
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    }
  }

  public getUsageStats(): typeof this.usageStats {
    return { ...this.usageStats };
  }

  public getConfig(): Omit<AnthropicConfig, 'apiKey'> & { hasApiKey: boolean } {
    return {
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      timeout: this.config.timeout,
      hasApiKey: !!this.config.apiKey,
    };
  }

  public isConfigured(): boolean {
    return !!this.config.apiKey && !!this.client;
  }

  public validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.apiKey) {
      errors.push('ANTHROPIC_API_KEY environment variable is required');
    }

    if (!this.config.model) {
      errors.push('ANTHROPIC_MODEL environment variable is required');
    }

    if (this.config.maxTokens <= 0 || this.config.maxTokens > 200000) {
      errors.push('ANTHROPIC_MAX_TOKENS must be between 1 and 200000');
    }

    if (this.config.timeout <= 0 || this.config.timeout > 300000) {
      errors.push('ANTHROPIC_TIMEOUT must be between 1 and 300000 milliseconds');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public async testConnection(): Promise<{ success: boolean; error?: string; model?: string }> {
    try {
      const testResponse = await this.chat({
        system: 'You are a helpful assistant.',
        user: 'Say "Hello, Claude!" and nothing else.',
        maxTokens: 50,
        temperature: 0,
      });

      return {
        success: true,
        model: this.config.model,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
}

// Global client instance
let globalClient: AnthropicClient | null = null;

export function getAnthropicClient(): AnthropicClient {
  if (!globalClient) {
    globalClient = new AnthropicClient();
  }
  return globalClient;
}

export type { ChatRequest, ChatResponse, StreamingChatResponse };
export default AnthropicClient;