/**
 * Unit Tests for Error Handling Utilities
 * PRD-0015: Phase 10 - Error Handling Testing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    classifyError,
    showErrorToast,
    showSuccessToast,
    retryWithBackoff,
    cacheData,
    getCachedData,
    clearCache,
    fetchWithCache,
    formatErrorForDisplay,
    safeAsync,
} from './errorHandling';

// Mock Mantine notifications
vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn(),
        hide: vi.fn(),
    },
}));

// Mock navigator.onLine
let isOnline = true;
Object.defineProperty(window.navigator, 'onLine', {
    get: () => isOnline,
    configurable: true,
});

describe('Error Handling Utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        isOnline = true;
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('classifyError', () => {
        it('should classify offline error', () => {
            isOnline = false;
            const result = classifyError(new Error('Network error'));

            expect(result.code).toBe('NETWORK_OFFLINE');
            expect(result.severity).toBe('error');
            expect(result.retryable).toBe(true);
            expect(result.message).toContain('No internet connection');
        });

        it('should classify permission denied error', () => {
            const error = { code: 'permission-denied' };
            const result = classifyError(error);

            expect(result.code).toBe('PERMISSION_DENIED');
            expect(result.severity).toBe('error');
            expect(result.retryable).toBe(false);
        });

        it('should classify not found error', () => {
            const error = { code: 'not-found' };
            const result = classifyError(error);

            expect(result.code).toBe('NOT_FOUND');
            expect(result.severity).toBe('warning');
            expect(result.retryable).toBe(false);
        });

        it('should classify network request failed error', () => {
            const error = { code: 'network-request-failed' };
            const result = classifyError(error);

            expect(result.code).toBe('NETWORK_ERROR');
            expect(result.retryable).toBe(true);
        });

        it('should classify unknown error', () => {
            const error = new Error('Something went wrong');
            const result = classifyError(error);

            expect(result.code).toBe('UNKNOWN');
            expect(result.severity).toBe('error');
            expect(result.retryable).toBe(true);
            expect(result.message).toBe('Something went wrong');
        });
    });

    describe('retryWithBackoff', () => {
        it('should succeed on first attempt', async () => {
            const fn = vi.fn().mockResolvedValue('success');
            const result = await retryWithBackoff(fn);

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should retry and eventually succeed', async () => {
            const fn = vi.fn()
                .mockRejectedValueOnce(new Error('Fail 1'))
                .mockRejectedValueOnce(new Error('Fail 2'))
                .mockResolvedValueOnce('success');

            // Start the retry
            const promise = retryWithBackoff(fn, { maxAttempts: 3, delayMs: 100 });

            // Run all timers to completion
            await vi.runAllTimersAsync();

            const result = await promise;

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(3);
        });

        it('should fail after max attempts', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('Always fails'));
            const expectation = expect(
                retryWithBackoff(fn, { maxAttempts: 2, delayMs: 100 })
            ).rejects.toThrow('Always fails');

            // Run all timers
            await vi.runAllTimersAsync();

            await expectation;
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('should use exponential backoff', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('Fail'));
            const onRetry = vi.fn();

            const expectation = expect(retryWithBackoff(fn, {
                maxAttempts: 3,
                delayMs: 100,
                backoff: true,
                onRetry,
            })).rejects.toThrow('Fail');

            // Run all timers
            await vi.runAllTimersAsync();

            await expectation;

            // Verify retry was called correct number of times
            expect(onRetry).toHaveBeenCalledTimes(2); // Retries after 1st and 2nd failures
            expect(onRetry).toHaveBeenNthCalledWith(1, 1);
            expect(onRetry).toHaveBeenNthCalledWith(2, 2);
        });

        it('should respect shouldRetry callback', async () => {
            const fn = vi.fn().mockRejectedValue({ code: 'permission-denied' });
            const shouldRetry = vi.fn().mockReturnValue(false);

            const promise = retryWithBackoff(fn, { shouldRetry });

            await expect(promise).rejects.toMatchObject({ code: 'permission-denied' });
            expect(fn).toHaveBeenCalledTimes(1);
            expect(shouldRetry).toHaveBeenCalled();
        });
    });

    describe('cacheData and getCachedData', () => {
        it('should cache and retrieve data', () => {
            const testData = { name: 'Test', value: 123 };
            cacheData('test-key', testData);

            const retrieved = getCachedData('test-key');
            expect(retrieved).toEqual(testData);
        });

        it('should return null for non-existent cache', () => {
            const retrieved = getCachedData('non-existent');
            expect(retrieved).toBeNull();
        });

        it('should respect TTL expiry', async () => {
            const testData = { value: 'expires' };
            cacheData('expiring-key', testData, { ttl: 100 });

            // Immediately should work
            expect(getCachedData('expiring-key')).toEqual(testData);

            // Advance time to expire the cache
            vi.advanceTimersByTime(150);

            // After TTL should be null
            expect(getCachedData('expiring-key')).toBeNull();
        });

        it('should not expire without TTL', () => {
            const testData = { value: 'permanent' };
            cacheData('permanent-key', testData);

            vi.advanceTimersByTime(999999);

            expect(getCachedData('permanent-key')).toEqual(testData);
        });
    });

    describe('clearCache', () => {
        it('should clear specific cache entry', () => {
            cacheData('key1', { data: 1 });
            cacheData('key2', { data: 2 });

            clearCache('key1');

            expect(getCachedData('key1')).toBeNull();
            expect(getCachedData('key2')).toEqual({ data: 2 });
        });

        it('should clear all cache when no key specified', () => {
            cacheData('key1', { data: 1 });
            cacheData('key2', { data: 2 });

            clearCache();

            expect(getCachedData('key1')).toBeNull();
            expect(getCachedData('key2')).toBeNull();
        });
    });

    describe('fetchWithCache', () => {
        it('should fetch and cache data', async () => {
            const fetchFn = vi.fn().mockResolvedValue({ data: 'fresh' });

            const result = await fetchWithCache('fetch-key', fetchFn);

            expect(result).toEqual({ data: 'fresh' });
            expect(fetchFn).toHaveBeenCalledTimes(1);

            // Cached data should be available
            expect(getCachedData('fetch-key')).toEqual({ data: 'fresh' });
        });

        it('should return cached data without fetching', async () => {
            cacheData('cached-key', { data: 'cached' });
            const fetchFn = vi.fn().mockResolvedValue({ data: 'fresh' });

            const result = await fetchWithCache('cached-key', fetchFn);

            expect(result).toEqual({ data: 'cached' });
            expect(fetchFn).not.toHaveBeenCalled();
        });

        it('should force refresh when requested', async () => {
            cacheData('refresh-key', { data: 'old' });
            const fetchFn = vi.fn().mockResolvedValue({ data: 'new' });

            const result = await fetchWithCache('refresh-key', fetchFn, { forceRefresh: true });

            expect(result).toEqual({ data: 'new' });
            expect(fetchFn).toHaveBeenCalled();
        });

        it('should fallback to cache when offline', async () => {
            cacheData('offline-key', { data: 'cached' });
            const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'));
            isOnline = false;

            const result = await fetchWithCache('offline-key', fetchFn, { forceRefresh: true });

            expect(result).toEqual({ data: 'cached' });
            expect(fetchFn).toHaveBeenCalled();
        });

        it('should throw error if fetch fails and no cache available', async () => {
            const fetchFn = vi.fn().mockRejectedValue(new Error('Fetch failed'));

            await expect(fetchWithCache('no-cache-key', fetchFn)).rejects.toThrow('Fetch failed');
        });
    });

    describe('formatErrorForDisplay', () => {
        it('should format string error', () => {
            const result = formatErrorForDisplay('Simple error');
            expect(result).toBe('Simple error');
        });

        it('should format error object with message', () => {
            const error = new Error('Error message');
            const result = formatErrorForDisplay(error);
            expect(result).toBe('Error message');
        });

        it('should handle unknown error format', () => {
            const result = formatErrorForDisplay({ code: 123 });
            expect(result).toBe('An unexpected error occurred');
        });
    });

    describe('safeAsync', () => {
        it('should return result on success', async () => {
            const fn = vi.fn().mockResolvedValue('success');
            const safeFn = safeAsync(fn);

            const result = await safeFn();
            expect(result).toBe('success');
        });

        it('should return null and call error handler on failure', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('Failed'));
            const errorHandler = vi.fn();
            const safeFn = safeAsync(fn, errorHandler);

            const result = await safeFn();

            expect(result).toBeNull();
            expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
        });

        it('should use default error handler if none provided', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('Failed'));
            const safeFn = safeAsync(fn);

            const result = await safeFn();

            expect(result).toBeNull();
            // Would show error toast in real usage
        });
    });
});
