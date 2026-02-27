import type { Result } from '../types/result.types';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Base delay in milliseconds */
  baseDelay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Backoff multiplier */
  backoffMultiplier?: number;
  /** Whether to use exponential backoff */
  exponential?: boolean;
  /** Function to determine if error is retryable */
  shouldRetry?: (error: Error) => boolean;
  /** Callback on each retry attempt */
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  exponential: true,
  shouldRetry: () => true,
  onRetry: () => {},
};

/**
 * Retry an async operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry this error
      if (!config.shouldRetry(lastError)) {
        throw lastError;
      }

      // Don't wait after last attempt
      if (attempt < config.maxRetries - 1) {
        // Calculate delay
        let delay = config.exponential
          ? config.baseDelay * Math.pow(config.backoffMultiplier, attempt)
          : config.baseDelay;

        // Cap at max delay
        delay = Math.min(delay, config.maxDelay);

        // Add jitter (randomize ±25% to avoid thundering herd)
        const jitter = delay * 0.25;
        delay = delay + (Math.random() * 2 - 1) * jitter;

        // Call retry callback
        config.onRetry(attempt + 1, lastError);

        // Wait before retry
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Retry with Result type
 */
export async function retryWithResult<T>(
  operation: () => Promise<Result<T>>,
  options: RetryOptions = {}
): Promise<Result<T>> {
  try {
    return await retryWithBackoff(async () => {
      const result = await operation();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    }, options);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Operation failed',
    };
  }
}

/**
 * Helper function to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Predefined retry strategies
 */
export const retryStrategies = {
  /**
   * Strategy for AI API calls
   * - Don't retry on invalid API key or auth errors
   * - Retry on rate limits and network errors
   */
  aiApi: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 15000,
    exponential: true,
    shouldRetry: (error: Error) => {
      const message = error.message.toLowerCase();

      // Don't retry these errors
      if (
        message.includes('api key') ||
        message.includes('invalid key') ||
        message.includes('authentication') ||
        message.includes('unauthorized')
      ) {
        return false;
      }

      // Retry these errors
      return (
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('500')
      );
    },
    onRetry: (attempt: number, error: Error) => {
      console.log(`[Retry] AI API attempt ${attempt}: ${error.message}`);
    },
  } as RetryOptions,

  /**
   * Strategy for network requests
   */
  network: {
    maxRetries: 2,
    baseDelay: 1000,
    maxDelay: 5000,
    exponential: true,
    shouldRetry: (error: Error) => {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('fetch') ||
        message.includes('connection')
      );
    },
  } as RetryOptions,

  /**
   * Strategy for Firebase operations
   */
  firebase: {
    maxRetries: 3,
    baseDelay: 1500,
    maxDelay: 10000,
    exponential: true,
    shouldRetry: (error: Error) => {
      const message = error.message.toLowerCase();
      
      // Don't retry permission errors
      if (
        message.includes('permission') ||
        message.includes('unauthorized') ||
        message.includes('forbidden')
      ) {
        return false;
      }

      return true;
    },
    onRetry: (attempt: number, error: Error) => {
      console.log(`[Retry] Firebase attempt ${attempt}: ${error.message}`);
    },
  } as RetryOptions,

  /**
   * Strategy for file operations
   */
  fileOperation: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 2000,
    exponential: false,
    shouldRetry: (error: Error) => {
      const message = error.message.toLowerCase();
      
      // Don't retry invalid files
      if (
        message.includes('invalid') ||
        message.includes('unsupported') ||
        message.includes('corrupted')
      ) {
        return false;
      }

      return true;
    },
  } as RetryOptions,
};

/**
 * Retry with timeout
 * Adds a timeout to the operation
 */
export async function retryWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  retryOptions: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(async () => {
    return Promise.race([
      operation(),
      sleep(timeoutMs).then(() => {
        throw new Error(`Operation timed out after ${timeoutMs}ms`);
      }),
    ]);
  }, retryOptions);
}

/**
 * Circuit breaker pattern
 * Stops retrying if too many failures occur
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private resetTimeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      
      if (timeSinceLastFailure < this.resetTimeout) {
        throw new Error('Circuit breaker is OPEN - too many failures');
      }
      
      // Try half-open state
      this.state = 'half-open';
    }

    try {
      const result = await operation();
      
      // Success - reset circuit
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      // Open circuit if threshold reached
      if (this.failures >= this.threshold) {
        this.state = 'open';
        console.error(`[CircuitBreaker] OPENED after ${this.failures} failures`);
      }

      throw error;
    }
  }

  reset() {
    this.failures = 0;
    this.state = 'closed';
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}
