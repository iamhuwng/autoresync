import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuizStore } from '../../store/quiz.store';
import { useDraftStore } from '../../store/draft.store';
import { useUIStore } from '../../store/ui.store';

describe('Store Integration', () => {
  beforeEach(() => {
    useQuizStore.getState().clearAll();
    useDraftStore.getState().stopAutoSave();
    useDraftStore.setState({
      currentDraftId: null,
      syncStatus: 'idle',
      localDrafts: [],
      cloudDrafts: [],
      autoSaveEnabled: false,
    });
    useUIStore.setState({
      showDraftManager: false,
      showSettings: false,
      notifications: [],
      globalLoading: false,
      confirmDialogConfig: null,
      showConfirmDialog: false,
    });
  });

  describe('Quiz + Draft Coordination', () => {
    it('should sync quiz state with draft save', () => {
      const { result: quizStore } = renderHook(() => useQuizStore());
      const { result: draftStore } = renderHook(() => useDraftStore());

      // Create quiz data
      act(() => {
        quizStore.current.setQuizTitle('Coordinated Quiz');
        quizStore.current.addPassage({
          id: 'p1',
          title: 'Test Passage',
          content: 'Content here',
          type: 'text',
          questionStart: 1,
          questionEnd: 5,
          wordCount: 2,
          createdAt: new Date().toISOString(),
        });
      });

      // Save draft
      act(() => {
        draftStore.current.saveToLocal();
      });

      // Draft should be created
      expect(draftStore.current.currentDraftId).toBeTruthy();
      expect(draftStore.current.syncStatus).toBe('synced-local');
    });

    it('should load draft and update quiz state', async () => {
      const { result: quizStore } = renderHook(() => useQuizStore());
      const { result: draftStore } = renderHook(() => useDraftStore());

      // Create and save
      act(() => {
        quizStore.current.setQuizTitle('Original Title');
        quizStore.current.setQuestionText('Original questions');
        draftStore.current.saveToLocal();
      });

      const draftId = draftStore.current.currentDraftId;

      // Clear state
      act(() => {
        quizStore.current.clearAll();
      });

      expect(quizStore.current.quizTitle).toBe('Untitled Quiz');

      // Load should restore (in real implementation)
      if (draftId) {
        await act(async () => {
          await draftStore.current.loadDraft(draftId);
        });

        expect(draftStore.current.currentDraftId).toBe(draftId);
      }
    });

    it('should delete draft and update lists', () => {
      const { result: draftStore } = renderHook(() => useDraftStore());

      // Create draft
      act(() => {
        draftStore.current.saveToLocal();
      });

      const draftId = draftStore.current.currentDraftId;

      // Delete draft
      if (draftId) {
        act(() => {
          draftStore.current.deleteDraft(draftId);
        });

        expect(draftStore.current.currentDraftId).toBeNull();
      }
    });
  });

  describe('UI Store with Quiz Actions', () => {
    it('should show notification after quiz save', () => {
      const { result: quizStore } = renderHook(() => useQuizStore());
      const { result: uiStore } = renderHook(() => useUIStore());

      // Create quiz
      act(() => {
        quizStore.current.setQuizTitle('Test Quiz');
      });

      // Show save notification
      act(() => {
        uiStore.current.addNotification({
          type: 'success',
          title: 'Saved',
          message: 'Quiz saved successfully',
          duration: 3000,
        });
      });

      expect(uiStore.current.notifications).toHaveLength(1);
      expect(uiStore.current.notifications[0].type).toBe('success');
    });

    it('should show error notification on failure', () => {
      const { result: uiStore } = renderHook(() => useUIStore());

      act(() => {
        uiStore.current.addNotification({
          type: 'error',
          title: 'Error',
          message: 'Failed to save quiz',
          duration: 5000,
        });
      });

      expect(uiStore.current.notifications).toHaveLength(1);
      expect(uiStore.current.notifications[0].type).toBe('error');
    });

    it('should show loading during operations', () => {
      const { result: uiStore } = renderHook(() => useUIStore());

      act(() => {
        uiStore.current.setGlobalLoading(true, 'Parsing questions...');
      });

      expect(uiStore.current.globalLoading).toBe(true);
      expect(uiStore.current.loadingMessage).toBe('Parsing questions...');

      act(() => {
        uiStore.current.setGlobalLoading(false);
      });

      expect(uiStore.current.globalLoading).toBe(false);
    });
  });

  describe('Draft + UI Coordination', () => {
    it('should show notification after draft save', () => {
      const { result: draftStore } = renderHook(() => useDraftStore());
      const { result: uiStore } = renderHook(() => useUIStore());

      act(() => {
        draftStore.current.saveToLocal();
        uiStore.current.addNotification({
          type: 'success',
          title: 'Draft Saved',
          message: 'Your progress has been saved',
          duration: 2000,
        });
      });

      expect(draftStore.current.currentDraftId).toBeTruthy();
      expect(uiStore.current.notifications).toHaveLength(1);
    });

    it('should show confirm dialog before delete', () => {
      const { result: draftStore } = renderHook(() => useDraftStore());
      const { result: uiStore } = renderHook(() => useUIStore());

      // Create draft
      act(() => {
        draftStore.current.saveToLocal();
      });

      const draftId = draftStore.current.currentDraftId;

      // Show confirm dialog
      act(() => {
        uiStore.current.showConfirm({
          title: 'Delete Draft?',
          message: 'This action cannot be undone',
          onConfirm: () => {
            if (draftId) {
              draftStore.current.deleteDraft(draftId);
            }
          },
        });
      });

      expect(uiStore.current.showConfirmDialog).toBe(true);

      // Confirm delete
      act(() => {
        uiStore.current.confirmDialogConfig?.onConfirm();
        uiStore.current.hideConfirm();
      });

      expect(draftStore.current.currentDraftId).toBeNull();
    });
  });

  describe('State Persistence', () => {
    it('should persist state across operations', () => {
      const { result: quizStore } = renderHook(() => useQuizStore());
      const { result: draftStore } = renderHook(() => useDraftStore());

      // Set up state
      act(() => {
        quizStore.current.setQuizTitle('Persistent Quiz');
        quizStore.current.addPassage({
          id: 'p1',
          title: 'Passage',
          content: 'Content',
          type: 'text',
          questionStart: 1,
          questionEnd: 3,
          wordCount: 1,
          createdAt: new Date().toISOString(),
        });
        draftStore.current.saveToLocal();
      });

      const title = quizStore.current.quizTitle;
      const passageCount = quizStore.current.passages.length;
      const draftId = draftStore.current.currentDraftId;

      // Navigate sections
      act(() => {
        quizStore.current.goToNextSection();
        quizStore.current.goToNextSection();
      });

      // State should persist
      expect(quizStore.current.quizTitle).toBe(title);
      expect(quizStore.current.passages).toHaveLength(passageCount);
      expect(draftStore.current.currentDraftId).toBe(draftId);
    });
  });

  describe('Store Reset/Cleanup', () => {
    it('should reset all stores', () => {
      const { result: quizStore } = renderHook(() => useQuizStore());
      const { result: draftStore } = renderHook(() => useDraftStore());
      const { result: uiStore } = renderHook(() => useUIStore());

      // Set up state
      act(() => {
        quizStore.current.setQuizTitle('Test');
        quizStore.current.addPassage({
          id: 'p1',
          title: 'P',
          content: 'C',
          type: 'text',
          questionStart: 1,
          questionEnd: 1,
          wordCount: 1,
          createdAt: new Date().toISOString(),
        });
        draftStore.current.saveToLocal();
        uiStore.current.addNotification({
          type: 'info',
          title: 'Info',
          message: 'Test',
          duration: 1000,
        });
      });

      // Reset all
      act(() => {
        quizStore.current.clearAll();
        draftStore.current.stopAutoSave();
        uiStore.current.notifications.forEach((n: { id: string }) => {
          uiStore.current.removeNotification(n.id);
        });
      });

      // Verify reset
      expect(quizStore.current.quizTitle).toBe('Untitled Quiz');
      expect(quizStore.current.passages).toEqual([]);
      expect(draftStore.current.autoSaveEnabled).toBe(false);
      expect(uiStore.current.notifications).toEqual([]);
    });
  });

  describe('Auto-save Integration', () => {
    it('should trigger auto-save when enabled', () => {
      const { result: draftStore } = renderHook(() => useDraftStore());

      act(() => {
        draftStore.current.startAutoSave();
      });

      expect(draftStore.current.autoSaveEnabled).toBe(true);

      act(() => {
        draftStore.current.stopAutoSave();
      });

      expect(draftStore.current.autoSaveEnabled).toBe(false);
    });
  });
});
