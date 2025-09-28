// Unified LLM Router supporting Claude, OpenAI, and Gemini
// Provides consistent interface with deterministic behavior across providers

// Optional SDK clients may be installed in some environments. We default to
// lightweight REST fallbacks so missing packages never break the build.
let Anthropic: any = null;
let OpenAI: any = null;
let GoogleGenerativeAI: any = null;

export type LLMProvider = 'claude' | 'openai' | 'gemini';

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
  sdkAvailable: boolean;
}

class LLMRouter {
  private config: LLMConfig;
  private clients: {
    claude?: any;
    openai?: any;
    gemini?: any;
  } = {};

  private usageStats: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalRequests: number;
    errors: number;
    byProvider: Record<LLMProvider, {
      inputTokens: number;
      outputTokens: number;
      requests: number;
      errors: number;
    }>;
  } = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalRequests: 0,
    errors: 0,
    byProvider: {
      claude: { inputTokens: 0, outputTokens: 0, requests: 0, errors: 0 },
      openai: { inputTokens: 0, outputTokens: 0, requests: 0, errors: 0 },
      gemini: { inputTokens: 0, outputTokens: 0, requests: 0, errors: 0 },
    },
  };

  constructor() {
    const provider = (process.env.LLM_PROVIDER || 'claude') as LLMProvider;

    this.config = {
      provider,
      apiKey: this.getProviderApiKey(provider),
      model: this.getProviderModel(provider),
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '800'),
      timeout: parseInt(process.env.LLM_TIMEOUT || '20000'),
    };

    this.initializeClients();
  }

  private getProviderApiKey(provider: LLMProvider): string {
    switch (provider) {
      case 'claude':
        return process.env.ANTHROPIC_API_KEY || '';
      case 'openai':
        return process.env.OPENAI_API_KEY || '';
      case 'gemini':
        // Prefer GOOGLE_VERTEX_KEY, fallback to GOOGLE_API_KEY for backward compatibility
        return process.env.GOOGLE_VERTEX_KEY || process.env.GOOGLE_API_KEY || '';
      default:
        return '';
    }
  }

  private getProviderModel(provider: LLMProvider): string {
    switch (provider) {
      case 'claude':
        return process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet';
      case 'openai':
        return process.env.OPENAI_MODEL || 'gpt-4o';
      case 'gemini':
        return process.env.GOOGLE_MODEL || 'gemini-1.5-pro';
      default:
        return '';
    }
  }

  private initializeClients(): void {
    try {
      // Initialize Claude client
      if (Anthropic && process.env.ANTHROPIC_API_KEY) {
        this.clients.claude = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
          timeout: this.config.timeout,
        });
      }

      // Initialize OpenAI client
      if (OpenAI && process.env.OPENAI_API_KEY) {
        this.clients.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: this.config.timeout,
        });
      }

      // Initialize Gemini client
      const geminiApiKey = process.env.GOOGLE_VERTEX_KEY || process.env.GOOGLE_API_KEY;
      if (GoogleGenerativeAI && geminiApiKey) {
        this.clients.gemini = new GoogleGenerativeAI.GoogleGenerativeAI(
          geminiApiKey
        );
      }
    } catch (error) {
      console.error('Failed to initialize LLM clients:', error);
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

        // Exponential backoff with jitter
        if (attempt < maxRetries - 1) {
          const baseDelay = Math.pow(2, attempt) * 1000;
          const jitter = Math.random() * 400 - 200;
          const delay = baseDelay + jitter;
          console.warn(`LLM request failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${Math.round(delay)}ms:`, error);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private async chatWithClaude(request: ChatRequest): Promise<ChatResponse> {
    const client = this.clients.claude;
    if (!client) {
      return this.fallbackClaudeFetch(request);
    }

    const response = await client.messages.create({
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

    const content = response.content?.[0]?.type === 'text'
      ? response.content[0].text
      : '';

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    return {
      content,
      usage,
      model: this.config.model,
      provider: 'claude',
      cached: false,
    };
  }

  private async fallbackClaudeFetch(request: ChatRequest): Promise<ChatResponse> {
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
      throw new Error(`Claude API error: ${response.status} ${response.statusText} - ${errorText}`);
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
      provider: 'claude',
      cached: false,
    };
  }

  private async chatWithOpenAI(request: ChatRequest): Promise<ChatResponse> {
    const client = this.clients.openai;
    if (!client) {
      return this.fallbackOpenAIFetch(request);
    }

    const response = await client.chat.completions.create({
      model: this.config.model,
      max_tokens: request.maxTokens || this.config.maxTokens,
      temperature: request.temperature ?? 0.2,
      top_p: request.topP ?? 0.95,
      seed: request.seed ?? 42,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
    });

    const content = response.choices[0]?.message?.content || '';
    const usage = {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
    };

    return {
      content,
      usage,
      model: this.config.model,
      provider: 'openai',
      cached: false,
    };
  }

  private async fallbackOpenAIFetch(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: request.maxTokens || this.config.maxTokens,
        temperature: request.temperature ?? 0.2,
        top_p: request.topP ?? 0.95,
        seed: request.seed ?? 42,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0]?.message?.content || '',
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      model: this.config.model,
      provider: 'openai',
      cached: false,
    };
  }

  private async chatWithGemini(request: ChatRequest): Promise<ChatResponse> {
    const client = this.clients.gemini;
    if (!client) {
      return this.fallbackGeminiFetch(request);
    }

    const model = client.getGenerativeModel({
      model: this.config.model,
      generationConfig: {
        maxOutputTokens: request.maxTokens || this.config.maxTokens,
        temperature: request.temperature ?? 0.2,
        topP: request.topP ?? 0.95,
      },
    });

    const prompt = `${request.system}\n\nUser: ${request.user}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;

    const content = response.text() || '';

    // Gemini doesn't provide detailed token usage in the free tier
    // Estimate tokens for consistency
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedOutputTokens = Math.ceil(content.length / 4);

    const usage = {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      totalTokens: estimatedInputTokens + estimatedOutputTokens,
    };

    return {
      content,
      usage,
      model: this.config.model,
      provider: 'gemini',
      cached: false,
    };
  }

  private async fallbackGeminiFetch(request: ChatRequest): Promise<ChatResponse> {
    const apiKey = this.config.apiKey;
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${apiKey}`;
    const prompt = `${request.system}\n\nUser: ${request.user}`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: request.maxTokens || this.config.maxTokens,
        temperature: request.temperature ?? 0.2,
        topP: request.topP ?? 0.95,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedOutputTokens = Math.ceil(content.length / 4);

    return {
      content,
      usage: {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        totalTokens: estimatedInputTokens + estimatedOutputTokens,
      },
      model: this.config.model,
      provider: 'gemini',
      cached: false,
    };
  }

  private shouldUseGeminiForLongContext(request: ChatRequest): boolean {
    // Check if Gemini is available and properly configured
    const geminiApiKey = process.env.GOOGLE_VERTEX_KEY || process.env.GOOGLE_API_KEY;
    if (!geminiApiKey || !this.clients.gemini) {
      return false;
    }

    // Calculate total input size
    const totalContent = request.system + request.user;
    const characterCount = totalContent.length;
    const estimatedTokens = Math.ceil(characterCount / 4);

    // Use Gemini for long context scenarios (>8000 characters or >2000 tokens)
    return characterCount > 8000 || estimatedTokens > 2000;
  }

  public async chat(request: ChatRequest): Promise<ChatResponse> {
    this.usageStats.totalRequests++;

    // Determine which provider to use - check for long context first
    let effectiveProvider = this.config.provider;
    if (this.shouldUseGeminiForLongContext(request)) {
      effectiveProvider = 'gemini';
      console.log('Auto-switching to Gemini for long context request');
    }

    this.usageStats.byProvider[effectiveProvider].requests++;

    try {
      let response: ChatResponse;

      switch (effectiveProvider) {
        case 'claude':
          response = await this.makeRequestWithRetry(() => this.chatWithClaude(request));
          break;
        case 'openai':
          response = await this.makeRequestWithRetry(() => this.chatWithOpenAI(request));
          break;
        case 'gemini':
          response = await this.makeRequestWithRetry(() => this.chatWithGemini(request));
          break;
        default:
          throw new Error(`Unsupported provider: ${effectiveProvider}`);
      }

      // Update usage stats
      this.usageStats.totalInputTokens += response.usage.inputTokens;
      this.usageStats.totalOutputTokens += response.usage.outputTokens;
      this.usageStats.byProvider[effectiveProvider].inputTokens += response.usage.inputTokens;
      this.usageStats.byProvider[effectiveProvider].outputTokens += response.usage.outputTokens;

      return response;

    } catch (error) {
      this.usageStats.errors++;
      this.usageStats.byProvider[effectiveProvider].errors++;
      console.error(`${effectiveProvider} request failed:`, error);
      throw error;
    }
  }

  public async chatStream(request: ChatRequest): Promise<StreamingChatResponse> {
    // For now, only Claude supports streaming in our implementation
    if (this.config.provider !== 'claude') {
      throw new Error(`Streaming not supported for provider: ${this.config.provider}`);
    }

    const client = this.clients.claude;
    if (!client) {
      throw new Error('Claude streaming requires Anthropic SDK client');
    }

    this.usageStats.totalRequests++;
    this.usageStats.byProvider.claude.requests++;

    try {
      const stream = await this.makeRequestWithRetry(async () => {
        return client.messages.stream({
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
      this.usageStats.byProvider.claude.errors++;
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
      this.usageStats.byProvider.claude.inputTokens += usage.inputTokens;
      this.usageStats.byProvider.claude.outputTokens += usage.outputTokens;

      return usage;
    } catch (error) {
      console.error('Failed to extract usage from stream:', error);
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    }
  }

  public getUsageStats(): typeof this.usageStats {
    return { ...this.usageStats };
  }

  public getConfig(): Omit<LLMConfig, 'apiKey'> & { hasApiKey: boolean } {
    return {
      provider: this.config.provider,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      timeout: this.config.timeout,
      hasApiKey: !!this.config.apiKey,
    };
  }

  public getProviderStatus(): ProviderStatus {
    const provider = this.config.provider;
    return {
      provider,
      model: this.config.model,
      configured: this.isConfigured(),
      hasApiKey: !!this.config.apiKey,
      sdkAvailable: this.isSdkAvailable(provider),
    };
  }

  public getAllProviderStatus(): ProviderStatus[] {
    return (['claude', 'openai', 'gemini'] as LLMProvider[]).map(provider => ({
      provider,
      model: this.getProviderModel(provider),
      configured: !!this.getProviderApiKey(provider) && this.isSdkAvailable(provider),
      hasApiKey: !!this.getProviderApiKey(provider),
      sdkAvailable: this.isSdkAvailable(provider),
    }));
  }

  private isSdkAvailable(provider: LLMProvider): boolean {
    switch (provider) {
      case 'claude':
        return !!Anthropic;
      case 'openai':
        return !!OpenAI;
      case 'gemini':
        return !!GoogleGenerativeAI;
      default:
        return false;
    }
  }

  public isConfigured(): boolean {
    if (!this.config.apiKey) {
      return false;
    }

    // Claude and OpenAI can use fetch-based fallbacks, so only require API key
    if (this.config.provider === 'claude' || this.config.provider === 'openai') {
      return true;
    }

    // Gemini requires SDK presence
    if (this.config.provider === 'gemini') {
      return this.isSdkAvailable(this.config.provider);
    }

    return false;
  }

  public validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.apiKey) {
      switch (this.config.provider) {
        case 'claude':
          errors.push('ANTHROPIC_API_KEY environment variable is required');
          break;
        case 'openai':
          errors.push('OPENAI_API_KEY environment variable is required');
          break;
        case 'gemini':
          errors.push('GOOGLE_VERTEX_KEY or GOOGLE_API_KEY environment variable is required');
          break;
        default:
          errors.push(`${this.config.provider.toUpperCase()}_API_KEY environment variable is required`);
      }
    }

    if (!this.config.model) {
      errors.push(`Model not configured for provider: ${this.config.provider}`);
    }

    if (this.config.maxTokens <= 0 || this.config.maxTokens > 200000) {
      errors.push('LLM_MAX_TOKENS must be between 1 and 200000');
    }

    if (this.config.timeout <= 0 || this.config.timeout > 300000) {
      errors.push('LLM_TIMEOUT must be between 1 and 300000 milliseconds');
    }

    if (!this.isSdkAvailable(this.config.provider)) {
      errors.push(`SDK not available for provider: ${this.config.provider}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public async testConnection(): Promise<{ success: boolean; error?: string; model?: string; provider?: LLMProvider }> {
    try {
      const testResponse = await this.chat({
        system: 'You are a helpful assistant.',
        user: 'Say "Hello!" and nothing else.',
        maxTokens: 50,
        temperature: 0,
      });

      return {
        success: true,
        model: this.config.model,
        provider: this.config.provider,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: this.config.provider,
      };
    }
  }

  public resetUsageStats(): void {
    this.usageStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalRequests: 0,
      errors: 0,
      byProvider: {
        claude: { inputTokens: 0, outputTokens: 0, requests: 0, errors: 0 },
        openai: { inputTokens: 0, outputTokens: 0, requests: 0, errors: 0 },
        gemini: { inputTokens: 0, outputTokens: 0, requests: 0, errors: 0 },
      },
    };
  }
}

// Global router instance
let globalRouter: LLMRouter | null = null;

export function getLLMRouter(): LLMRouter {
  if (!globalRouter) {
    globalRouter = new LLMRouter();
  }
  return globalRouter;
}

export type { ChatRequest, ChatResponse, StreamingChatResponse, ProviderStatus, LLMProvider };
export default LLMRouter;