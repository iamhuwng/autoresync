/**
 * Error Handling Utilities
 * PRD-0015: Phase 10 - Standardized Error Handling
 * 
 * Provides:
 * - Standardized error toast notifications
 * - Retry logic helpers
 * - Offline detection
 * - Error classification
 * - Local caching for offline resilience
 */

import { notifications } from '@mantine/notifications';

// ============================================================================
// Error Types & Classification
// ============================================================================

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AppError {
    message: string;
    severity: ErrorSeverity;
    code?: string;
    retryable?: boolean;
    details?: any;
}

/**
 * Classify error based on type and content
 */
export function classifyError(error: any): AppError {
    // Network errors
    if (!navigator.onLine) {
        return {
            message: 'No internet connection. Please check your network.',
            severity: 'error',
            code: 'NETWORK_OFFLINE',
            retryable: true,
        };
    }

    // Firebase errors
    if (error?.code) {
        if (error.code.includes('permission-denied')) {
            return {
                message: 'You do not have permission to perform this action.',
                severity: 'error',
                code: 'PERMISSION_DENIED',
                retryable: false,
            };
        }
        if (error.code.includes('not-found')) {
            return {
                message: 'The requested data was not found.',
                severity: 'warning',
                code: 'NOT_FOUND',
                retryable: false,
            };
        }
        if (error.code.includes('network-request-failed')) {
            return {
                message: 'Network request failed. Please try again.',
                severity: 'error',
                code: 'NETWORK_ERROR',
                retryable: true,
            };
        }
    }

    // Generic error
    return {
        message: error?.message || 'An unexpected error occurred.',
        severity: 'error',
        code: 'UNKNOWN',
        retryable: true,
        details: error,
    };
}

// ============================================================================
// Toast Notifications
// ============================================================================

/**
 * Show standardized error toast notification
 */
export function showErrorToast(
    title: string,
    message?: string,
    options?: {
        autoClose?: number | false;
        onRetry?: () => void;
        severity?: ErrorSeverity;
    }
) {
    const severity = options?.severity || 'error';
    const color = {
        info: 'blue',
        warning: 'yellow',
        error: 'red',
        critical: 'red',
    }[severity];

    notifications.show({
        title,
        message: message || undefined,
        color,
        autoClose: options?.autoClose !== undefined ? options.autoClose : 5000,
        ...(options?.onRetry && {
            action: {
                label: 'Retry',
                onClick: options.onRetry,
            },
        }),
    });
}

/**
 * Show success toast notification
 */
export function showSuccessToast(title: string, message?: string) {
    notifications.show({
        title,
        message: message || undefined,
        color: 'green',
        autoClose: 3000,
    });
}

/**
 * Show offline notification with retry option
 */
export function showOfflineToast(onRetry?: () => void) {
    notifications.show({
        id: 'offline-notification',
        title: 'You are offline',
        message: 'Some features may not be available.',
        color: 'orange',
        autoClose: false,
        withCloseButton: true,
        ...(onRetry && {
            action: {
                label: 'Retry',
                onClick: onRetry,
            },
        }),
    });
}

/**
 * Hide offline notification
 */
export function hideOfflineToast() {
    notifications.hide('offline-notification');
}

// ============================================================================
// Retry Logic
// ============================================================================

export interface RetryOptions {
    maxAttempts?: number;
    delayMs?: number;
    backoff?: boolean; // Exponential backoff
    onRetry?: (attempt: number) => void;
    shouldRetry?: (error: any) => boolean;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxAttempts = 3,
        delayMs = 1000,
        backoff = true,
        onRetry,
        shouldRetry,
    } = options;

    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Check if we should retry
            if (shouldRetry && !shouldRetry(error)) {
                throw error;
            }

            // Don't retry on last attempt
            if (attempt === maxAttempts) {
                throw error;
            }

            // Calculate delay (exponential backoff if enabled)
            const delay = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;

            // Notify retry callback
            if (onRetry) {
                onRetry(attempt);
            }

            console.log(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms...`);

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Wrapper for retry with user feedback
 */
export async function retryWithFeedback<T>(
    fn: () => Promise<T>,
    operationName: string,
    options: RetryOptions = {}
): Promise<T> {
    try {
        return await retryWithBackoff(fn, {
            ...options,
            onRetry: (attempt) => {
                console.log(`${operationName}: Retry attempt ${attempt}...`);
                if (options.onRetry) {
                    options.onRetry(attempt);
                }
            },
        });
    } catch (error) {
        const classified = classifyError(error);
        showErrorToast(
            `${operationName} failed`,
            classified.message,
            {
                severity: classified.severity,
                onRetry: classified.retryable ? () => retryWithFeedback(fn, operationName, options) : undefined,
            }
        );
        throw error;
    }
}

// ============================================================================
// Offline Detection
// ============================================================================

export interface OfflineDetectorOptions {
    onOnline?: () => void;
    onOffline?: () => void;
    checkInterval?: number; // Ping check interval (ms)
    pingUrl?: string;
}

/**
 * Detect online/offline status with event listeners
 */
export function createOfflineDetector(options: OfflineDetectorOptions = {}) {
    const { onOnline, onOffline, checkInterval, pingUrl } = options;

    let isCurrentlyOnline = navigator.onLine;
    let pingIntervalId: NodeJS.Timeout | null = null;

    const handleOnline = () => {
        if (!isCurrentlyOnline) {
            isCurrentlyOnline = true;
            console.log('✅ Connection restored');
            hideOfflineToast();
            if (onOnline) {
                onOnline();
            }
        }
    };

    const handleOffline = () => {
        if (isCurrentlyOnline) {
            isCurrentlyOnline = false;
            console.log('❌ Connection lost');
            showOfflineToast();
            if (onOffline) {
                onOffline();
            }
        }
    };

    // Check connectivity with ping (optional)
    const checkConnectivity = async () => {
        if (!pingUrl) return;

        try {
            await fetch(pingUrl, { method: 'HEAD', mode: 'no-cors' });
            handleOnline();
        } catch {
            handleOffline();
        }
    };

    // Start monitoring
    const start = () => {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        if (checkInterval && pingUrl) {
            pingIntervalId = setInterval(checkConnectivity, checkInterval);
        }

        // Check initial status
        if (!navigator.onLine) {
            handleOffline();
        }
    };

    // Stop monitoring
    const stop = () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);

        if (pingIntervalId) {
            clearInterval(pingIntervalId);
            pingIntervalId = null;
        }
    };

    return { start, stop, isOnline: () => isCurrentlyOnline };
}

// ============================================================================
// Local Caching (Offline Resilience)
// ============================================================================

const CACHE_PREFIX = 'app_cache_';

export interface CacheOptions {
    ttl?: number; // Time to live in milliseconds
}

/**
 * Save data to localStorage with expiry
 */
export function cacheData<T>(key: string, data: T, options: CacheOptions = {}): void {
    try {
        const cacheKey = CACHE_PREFIX + key;
        const cacheData = {
            data,
            timestamp: Date.now(),
            ttl: options.ttl,
        };

        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        console.log(`💾 Cached: ${key}`);
    } catch (error) {
        console.error('Failed to cache data:', error);
    }
}

/**
 * Retrieve cached data from localStorage
 */
export function getCachedData<T>(key: string): T | null {
    try {
        const cacheKey = CACHE_PREFIX + key;
        const cached = localStorage.getItem(cacheKey);

        if (!cached) {
            return null;
        }

        const { data, timestamp, ttl } = JSON.parse(cached);

        // Check expiry
        if (ttl && Date.now() - timestamp > ttl) {
            console.log(`🗑️ Expired cache: ${key}`);
            localStorage.removeItem(cacheKey);
            return null;
        }

        console.log(`📦 Retrieved from cache: ${key}`);
        return data as T;
    } catch (error) {
        console.error('Failed to retrieve cached data:', error);
        return null;
    }
}

/**
 * Clear cached data
 */
export function clearCache(key?: string): void {
    if (key) {
        const cacheKey = CACHE_PREFIX + key;
        localStorage.removeItem(cacheKey);
        console.log(`🗑️ Cleared cache: ${key}`);
    } else {
        // Clear all app cache
        Object.keys(localStorage).forEach((storageKey) => {
            if (storageKey.startsWith(CACHE_PREFIX)) {
                localStorage.removeItem(storageKey);
            }
        });
        console.log('🗑️ Cleared all cache');
    }
}

/**
 * Fetch data with cache fallback
 */
export async function fetchWithCache<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions & { forceRefresh?: boolean } = {}
): Promise<T> {
    const { forceRefresh = false, ...cacheOptions } = options;

    // Try to get from cache if not forcing refresh
    if (!forceRefresh) {
        const cached = getCachedData<T>(key);
        if (cached !== null) {
            return cached;
        }
    }

    // Fetch fresh data
    try {
        const data = await fetchFn();
        cacheData(key, data, cacheOptions);
        return data;
    } catch (error) {
        // If fetch fails and we're offline, try cache as fallback
        if (!navigator.onLine) {
            const cached = getCachedData<T>(key);
            if (cached !== null) {
                console.log('⚠️ Using cached data (offline)');
                return cached;
            }
        }
        throw error;
    }
}

// ============================================================================
// Error Boundary Helpers
// ============================================================================

/**
 * Format error for display
 */
export function formatErrorForDisplay(error: any): string {
    if (typeof error === 'string') {
        return error;
    }

    if (error?.message) {
        return error.message;
    }

    return 'An unexpected error occurred';
}

/**
 * Log error to console with context
 */
export function logError(context: string, error: any, additionalInfo?: any): void {
    console.error(`[${context}]`, error);
    if (additionalInfo) {
        console.error('Additional info:', additionalInfo);
    }

    // In production, you might send this to an error tracking service
    // e.g., Sentry, LogRocket, etc.
}

/**
 * Safe async wrapper that catches and handles errors
 */
export function safeAsync<T>(
    fn: () => Promise<T>,
    errorHandler?: (error: any) => void
): () => Promise<T | null> {
    return async () => {
        try {
            return await fn();
        } catch (error) {
            if (errorHandler) {
                errorHandler(error);
            } else {
                const classified = classifyError(error);
                showErrorToast('Operation failed', classified.message);
            }
            return null;
        }
    };
}
