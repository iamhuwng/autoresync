import type { Chunk, ReadingLabeledOption } from '../../types/document.types';
import type { Result } from '../../types/result.types';
import type { IAIService, AIParseResult, ProviderStatus } from './ai.service';
import { geminiProvider } from './gemini.provider';
import { groqProvider } from './groq.provider';

/**
 * Provider selection strategy
 */
type ProviderStrategy = 'gemini-first' | 'groq-first' | 'gemini-only' | 'groq-only';

/**
 * Router configuration
 */
interface RouterConfig {
  strategy: ProviderStrategy;
  enableFallback: boolean;
  retryAttempts: number;
  retryDelay: number; // ms
}

/**
 * AI Router Service
 * Routes requests to available providers with automatic fallback
 */
class AIRouterService implements IAIService {
  private config: RouterConfig = {
    strategy: 'gemini-first',
    enableFallback: true,
    retryAttempts: 1,  // Reduced from 2 to minimize RPM usage (each retry = additional API request)
    retryDelay: 500,   // Reduced from 1000ms since we only retry once
  };

  private providers = {
    gemini: geminiProvider,
    groq: groqProvider,
  };

  /**
   * Parse passages only (2-call split parsing - Call 1)
   */
  async parsePassagesOnly(text: string): Promise<Result<{ passages: AIParseResult['passages']; confidence: number; }>> {
    const providerOrder = this.getProviderOrder();

    for (const providerName of providerOrder) {
      const provider = this.providers[providerName];
      const result = await provider.parsePassagesOnly(text);

      if (result.success) {
        console.log(`✅ Passages parsed with ${providerName}`);
        return result;
      }

      console.error(`❌ ${providerName} passages parsing failed: ${result.error}`);

      if (!this.config.enableFallback) {
        return result;
      }
    }

    return {
      success: false,
      error: 'All AI providers failed to parse passages',
    };
  }

  /**
   * Parse questions and answers (2-call split parsing - Call 2)
   */
  async parseQuestionsAndAnswers(text: string): Promise<Result<{ questions: AIParseResult['questions']; answerKey: AIParseResult['answerKey']; confidence: number; }>> {
    const providerOrder = this.getProviderOrder();

    for (const providerName of providerOrder) {
      const provider = this.providers[providerName];
      const result = await provider.parseQuestionsAndAnswers(text);

      if (result.success) {
        console.log(`✅ Questions+Answers parsed with ${providerName}`);
        return result;
      }

      console.error(`❌ ${providerName} questions+answers parsing failed: ${result.error}`);

      if (!this.config.enableFallback) {
        return result;
      }
    }

    return {
      success: false,
      error: 'All AI providers failed to parse questions and answers',
    };
  }

  /**
   * Generate answers from test content (passages + questions)
   * This asks AI to actually solve the questions based on passage content
   * Used for missing answer key dialog auto-suggestions
   */
  async generateAnswersFromContent(
    passagesText: string,
    questions: Array<{
      number: number;
      questionText: string;
      type?: string;
      options?: Array<string | ReadingLabeledOption>;
      labeledOptions?: ReadingLabeledOption[];
    }>
  ): Promise<Result<{ answerKey: Record<number, string>; confidence: number }>> {
    const providerOrder = this.getProviderOrder();

    for (const providerName of providerOrder) {
      const provider = this.providers[providerName];

      // Only gemini has this method currently
      if (providerName === 'gemini' && 'generateAnswersFromContent' in provider) {
        const result = await (provider as any).generateAnswersFromContent(passagesText, questions);

        if (result.success) {
          console.log(`✅ Answers generated with ${providerName}`);
          return result;
        }

        console.error(`❌ ${providerName} answer generation failed: ${result.error}`);

        if (!this.config.enableFallback) {
          return result;
        }
      }
    }

    return {
      success: false,
      error: 'Could not generate answers from content',
    };
  }

  /**
   * Parse answer key only from raw text
   * Used for missing answer key dialog manual paste
   */
  async parseAnswerKeyOnly(
    text: string,
    startQuestion: number,
    endQuestion: number
  ): Promise<Result<{ answerKey: Record<number, string>; confidence: number }>> {
    // Create a fake chunk with the answer key text for parsing
    const chunk = {
      id: 'answer-key-only',
      number: 1,
      text: `ANSWER KEY (Questions ${startQuestion}-${endQuestion}):\n${text}`,
      wordCount: text.split(/\s+/).length,
      startIndex: 0,
      endIndex: text.length,
      isLast: true,
    };

    const providerOrder = this.getProviderOrder();

    for (const providerName of providerOrder) {
      const provider = this.providers[providerName];
      const result = await provider.parseChunk(chunk);

      if (result.success && result.data) {
        // Extract just the answer key
        const answerKey = result.data.answerKey || {};
        const answerCount = Object.keys(answerKey).length;

        if (answerCount > 0) {
          console.log(`✅ Answer key parsed with ${providerName}: ${answerCount} answers`);
          return {
            success: true,
            data: {
              answerKey: answerKey as Record<number, string>,
              confidence: result.data.confidence || 80,
            },
          };
        }
      }

      console.error(`❌ ${providerName} answer key parsing failed`);

      if (!this.config.enableFallback) {
        break;
      }
    }

    return {
      success: false,
      error: 'Could not parse answer key from the provided text',
    };
  }

  /**
   * Parse chunk with automatic provider selection and fallback
   */
  async parseChunk(chunk: Chunk): Promise<Result<AIParseResult>> {
    const providerOrder = this.getProviderOrder();

    for (const providerName of providerOrder) {
      const provider = this.providers[providerName];

      // Attempt with retry (providers will initialize on first use)
      const result = await this.attemptWithRetry(provider, chunk);

      if (result.success) {
        console.log(`✅ Successfully parsed with ${providerName}`);
        return result;
      }

      // Log failure and continue to next provider (if fallback enabled)
      console.error(`❌ ${providerName} failed: ${result.error}`);

      // If initialization failed (no API key), skip to next provider
      if (result.error?.includes('No') && result.error?.includes('API key')) {
        console.warn(`⚠️ ${providerName} not configured, skipping...`);
        if (!this.config.enableFallback) {
          return result;
        }
        continue;
      }

      if (!this.config.enableFallback) {
        return result;
      }
    }

    return {
      success: false,
      error: 'All AI providers failed',
    };
  }

  /**
   * Attempt parsing with retry logic
   */
  private async attemptWithRetry(
    provider: IAIService,
    chunk: Chunk
  ): Promise<Result<AIParseResult>> {
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      const result = await provider.parseChunk(chunk);

      if (result.success) {
        return result;
      }

      // Check if it's a retryable error
      const isRetryable = this.isRetryableError(result.error || '');

      if (!isRetryable || attempt === this.config.retryAttempts) {
        return result;
      }

      // Wait before retry
      console.log(`🔄 Retrying (attempt ${attempt + 1}/${this.config.retryAttempts})...`);
      await this.delay(this.config.retryDelay);
    }

    return {
      success: false,
      error: 'Max retry attempts reached',
    };
  }

  /**
   * Check if error is retryable (network issues, timeouts)
   */
  private isRetryableError(error: string): boolean {
    const retryablePatterns = [
      'timeout',
      'network',
      'ECONNRESET',
      'ETIMEDOUT',
      'fetch failed',
    ];

    return retryablePatterns.some(pattern =>
      error.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Get provider order based on strategy
   */
  private getProviderOrder(): Array<'gemini' | 'groq'> {
    switch (this.config.strategy) {
      case 'gemini-first':
        return ['gemini', 'groq'];
      case 'groq-first':
        return ['groq', 'gemini'];
      case 'gemini-only':
        return ['gemini'];
      case 'groq-only':
        return ['groq'];
      default:
        return ['gemini', 'groq'];
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Grade a writing answer with provider fallback (Phase 2 — Task 6.4)
   */
  async gradeWritingAnswer(
    studentAnswer: string,
    modelAnswers: string[],
    originalSentence: string,
    context?: { sentenceStarter?: string; keyword?: string }
  ): Promise<Result<{ score: number; confidence: number; feedback: string }>> {
    const providerOrder = this.getProviderOrder();

    for (const providerName of providerOrder) {
      const provider = this.providers[providerName];
      const result = await provider.gradeWritingAnswer(studentAnswer, modelAnswers, originalSentence, context);

      if (result.success) {
        console.log(`✅ Writing graded with ${providerName}`);
        return result;
      }

      console.error(`❌ ${providerName} writing grading failed: ${result.error}`);

      if (!this.config.enableFallback) {
        return result;
      }
    }

    return {
      success: false,
      error: 'All AI providers failed to grade writing answer',
    };
  }

  /**
   * Suggest alternative answers with provider fallback (Phase 2 — Task 6.6d)
   */
  async suggestAlternativeAnswers(
    originalSentence: string,
    existingAnswers: string[],
    questionType: 'fill-in' | 'writing',
    context?: { sentenceStarter?: string; keyword?: string }
  ): Promise<Result<Array<{ answer: string; confidence: number }>>> {
    const providerOrder = this.getProviderOrder();

    for (const providerName of providerOrder) {
      const provider = this.providers[providerName];
      const result = await provider.suggestAlternativeAnswers(originalSentence, existingAnswers, questionType, context);

      if (result.success) {
        console.log(`✅ Alternatives suggested with ${providerName}`);
        return result;
      }

      console.error(`❌ ${providerName} suggestion failed: ${result.error}`);

      if (!this.config.enableFallback) {
        return result;
      }
    }

    return {
      success: false,
      error: 'All AI providers failed to suggest alternatives',
    };
  }

  /**
   * Get status of all providers
   */
  getStatus(): ProviderStatus {
    // Return primary provider status
    const primary = this.config.strategy.startsWith('gemini') ? 'gemini' : 'groq';
    return this.providers[primary].getStatus();
  }

  /**
   * Get all provider statuses
   */
  getAllStatuses(): Record<string, ProviderStatus> {
    return {
      gemini: this.providers.gemini.getStatus(),
      groq: this.providers.groq.getStatus(),
    };
  }

  /**
   * Test connection for all providers
   */
  async testConnection(): Promise<Result> {
    const results = await Promise.all([
      this.providers.gemini.testConnection(),
      this.providers.groq.testConnection(),
    ]);

    const allSuccess = results.every(r => r.success);
    const anySuccess = results.some(r => r.success);

    if (allSuccess) {
      return {
        success: true,
        data: 'All providers connected',
      };
    }

    if (anySuccess) {
      return {
        success: true,
        data: 'At least one provider connected',
      };
    }

    return {
      success: false,
      error: 'No providers available',
    };
  }

  /**
   * Reset all providers
   */
  reset(): void {
    this.providers.gemini.reset();
    this.providers.groq.reset();
  }

  /**
   * Update router configuration
   */
  setConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('🔧 Router config updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): RouterConfig {
    return { ...this.config };
  }
}

/**
 * Singleton instance
 */
export const aiService = new AIRouterService();
