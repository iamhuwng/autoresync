/**
 * useDraftAutoSave Hook Tests
 * 
 * Unit tests for the draft auto-save hook.
 * Part of PRD-0022 Test Creation Modal with Draft Management.
 * 
 * Coverage:
 * - Debounced saving
 * - Periodic auto-save
 * - Visibility change handling
 * - Save immediate functionality
 * - Error handling
 * - Cleanup on unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraftAutoSave, formatLastSaved } from './useDraftAutoSave';
import type { DraftDocument } from '../types/draft.types';

// ─────────────────────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────────────────────

// Mock testDraftService
const mockUpdateDraft = vi.fn();

vi.mock('../services/draftCloudService', () => ({
    testDraftService: {
        updateDraft: (...args: unknown[]) => mockUpdateDraft(...args),
    },
}));

// ─────────────────────────────────────────────────────────────────────────────
// TEST UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const createMockUpdates = (): Partial<DraftDocument> => ({
    metadata: {
        title: 'Updated Title',
        duration: 60,
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────

describe('useDraftAutoSave', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockUpdateDraft.mockResolvedValue({ success: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Initial State Tests
    // ─────────────────────────────────────────────────────────────────────────

    describe('Initial State', () => {
        it('should return correct initial state', () => {
            const { result } = renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: true,
                })
            );

            expect(result.current.isSaving).toBe(false);
            expect(result.current.lastSaved).toBeNull();
            expect(result.current.error).toBeNull();
            expect(typeof result.current.save).toBe('function');
            expect(typeof result.current.saveImmediately).toBe('function');
        });

        it('should not save when disabled', async () => {
            const { result } = renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: false,
                })
            );

            act(() => {
                result.current.save(createMockUpdates());
            });

            // Advance past debounce
            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            expect(mockUpdateDraft).not.toHaveBeenCalled();
        });

        it('should not save when draftId is empty', async () => {
            const { result } = renderHook(() =>
                useDraftAutoSave({
                    draftId: '',
                    enabled: true,
                })
            );

            act(() => {
                result.current.save(createMockUpdates());
            });

            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            expect(mockUpdateDraft).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Debounced Save Tests
    // ─────────────────────────────────────────────────────────────────────────

    describe('Debounced Save', () => {
        it('should debounce save calls', async () => {
            const { result } = renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: true,
                    debounceDelay: 2000,
                })
            );

            // Make multiple save calls in quick succession
            act(() => {
                result.current.save({ metadata: { title: 'Update 1', duration: 60 } });
            });
            act(() => {
                result.current.save({ metadata: { title: 'Update 2', duration: 60 } });
            });
            act(() => {
                result.current.save({ metadata: { title: 'Update 3', duration: 60 } });
            });

            // Should not save immediately
            expect(mockUpdateDraft).not.toHaveBeenCalled();

            // Advance past debounce delay
            await act(async () => {
                vi.advanceTimersByTime(2500);
            });

            // Should only call once with merged updates
            expect(mockUpdateDraft).toHaveBeenCalledTimes(1);
        });

        it('should merge pending updates', async () => {
            const { result } = renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: true,
                    debounceDelay: 2000,
                })
            );

            act(() => {
                result.current.save({ metadata: { title: 'Title', duration: 60 } });
            });
            act(() => {
                result.current.save({ status: 'review' as const });
            });

            await act(async () => {
                vi.advanceTimersByTime(2500);
            });

            expect(mockUpdateDraft).toHaveBeenCalledWith(
                'test-draft-id',
                expect.objectContaining({
                    metadata: expect.objectContaining({ title: 'Title' }),
                    status: 'review',
                })
            );
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Save Immediately Tests
    // ─────────────────────────────────────────────────────────────────────────

    describe('Save Immediately', () => {
        it('should save pending changes immediately', async () => {
            const { result } = renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: true,
                    debounceDelay: 5000, // Long debounce to ensure it's pending
                })
            );

            act(() => {
                result.current.save(createMockUpdates());
            });

            // Should not save yet (still debouncing)
            expect(mockUpdateDraft).not.toHaveBeenCalled();

            // Call saveImmediately
            await act(async () => {
                await result.current.saveImmediately();
            });

            // Should have saved immediately
            expect(mockUpdateDraft).toHaveBeenCalledTimes(1);
        });

        it('should clear debounce timeout on immediate save', async () => {
            const { result } = renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: true,
                    debounceDelay: 2000,
                })
            );

            act(() => {
                result.current.save(createMockUpdates());
            });

            await act(async () => {
                await result.current.saveImmediately();
            });

            // Advance past original debounce time
            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            // Should only have saved once (immediate save)
            expect(mockUpdateDraft).toHaveBeenCalledTimes(1);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // State Update Tests
    // ─────────────────────────────────────────────────────────────────────────

    describe('State Updates', () => {
        it('should update isSaving during save', async () => {
            let resolvePromise: (value: any) => void;
            mockUpdateDraft.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        resolvePromise = resolve;
                    })
            );

            const { result } = renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: true,
                    debounceDelay: 100,
                })
            );

            act(() => {
                result.current.save(createMockUpdates());
            });

            await act(async () => {
                vi.advanceTimersByTime(200);
            });

            // Should be saving
            expect(result.current.isSaving).toBe(true);

            // Resolve the save
            await act(async () => {
                resolvePromise!({ success: true });
            });

            // Should not be saving
            expect(result.current.isSaving).toBe(false);
        });

        it('should update lastSaved on successful save', async () => {
            const { result } = renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: true,
                    debounceDelay: 100,
                })
            );

            expect(result.current.lastSaved).toBeNull();

            act(() => {
                result.current.save(createMockUpdates());
            });

            await act(async () => {
                vi.advanceTimersByTime(200);
            });

            // Wait for the async save operation to complete and state to update
            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.lastSaved).not.toBeNull();
        });

        it('should update error on failed save', async () => {
            mockUpdateDraft.mockResolvedValue({
                success: false,
                error: 'Save failed',
            });

            const { result } = renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: true,
                    debounceDelay: 100,
                })
            );

            act(() => {
                result.current.save(createMockUpdates());
            });

            await act(async () => {
                vi.advanceTimersByTime(200);
            });

            // Wait for the async save operation to complete and state to update
            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.error).toBe('Save failed');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Periodic Save Tests
    // ─────────────────────────────────────────────────────────────────────────

    describe('Periodic Save', () => {
        it('should trigger periodic save with pending changes', async () => {
            const { result } = renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: true,
                    autoSaveInterval: 5000,
                    debounceDelay: 30000, // Very long debounce
                })
            );

            // Queue up updates (won't trigger due to long debounce)
            act(() => {
                result.current.save(createMockUpdates());
            });

            expect(mockUpdateDraft).not.toHaveBeenCalled();

            // Advance to periodic save interval
            await act(async () => {
                vi.advanceTimersByTime(5500);
            });

            // Should have saved via periodic interval
            expect(mockUpdateDraft).toHaveBeenCalledTimes(1);
        });

        it('should not trigger periodic save without pending changes', async () => {
            renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: true,
                    autoSaveInterval: 5000,
                })
            );

            // Advance past multiple intervals
            await act(async () => {
                vi.advanceTimersByTime(15000);
            });

            // Should not have saved (no pending changes)
            expect(mockUpdateDraft).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Cleanup Tests
    // ─────────────────────────────────────────────────────────────────────────

    describe('Cleanup', () => {
        it('should clean up timers on unmount', () => {
            const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
            const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

            const { result, unmount } = renderHook(() =>
                useDraftAutoSave({
                    draftId: 'test-draft-id',
                    enabled: true,
                })
            );

            // Queue a save (creates debounce timeout)
            act(() => {
                result.current.save(createMockUpdates());
            });

            unmount();

            expect(clearTimeoutSpy).toHaveBeenCalled();
            expect(clearIntervalSpy).toHaveBeenCalled();
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatLastSaved Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('formatLastSaved', () => {
    it('should return "Not saved yet" for null', () => {
        expect(formatLastSaved(null)).toBe('Not saved yet');
    });

    it('should return "Just now" for recent saves', () => {
        const now = new Date();
        expect(formatLastSaved(now)).toBe('Just now');
    });

    it('should return seconds ago for saves within a minute', () => {
        const date = new Date(Date.now() - 30000); // 30 seconds ago
        expect(formatLastSaved(date)).toBe('30s ago');
    });

    it('should return minutes ago for saves within an hour', () => {
        const date = new Date(Date.now() - 5 * 60000); // 5 minutes ago
        expect(formatLastSaved(date)).toBe('5m ago');
    });

    it('should return time string for older saves', () => {
        const date = new Date(Date.now() - 2 * 3600000); // 2 hours ago
        const result = formatLastSaved(date);
        // Should be a time string like "10:30:00 AM"
        expect(result).toMatch(/:/);
    });
});
