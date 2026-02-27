import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useUIStore } from './ui.store';
import type { Notification } from './ui.store';

describe('UI Store', () => {
  beforeEach(() => {
    // Reset store before each test
    useUIStore.setState({
      showDraftManager: false,
      showSettings: false,
      showConfirmDialog: false,
      confirmDialogConfig: null,
      notifications: [],
      globalLoading: false,
      loadingMessage: null,
    });
  });

  afterEach(() => {
    // Clear any timers
    vi.clearAllTimers();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useUIStore.getState();

      expect(state.showDraftManager).toBe(false);
      expect(state.showSettings).toBe(false);
      expect(state.showConfirmDialog).toBe(false);
      expect(state.confirmDialogConfig).toBeNull();
      expect(state.notifications).toEqual([]);
      expect(state.globalLoading).toBe(false);
      expect(state.loadingMessage).toBeNull();
    });
  });

  describe('Draft Manager Modal', () => {
    it('should open draft manager', () => {
      const { openDraftManager } = useUIStore.getState();

      openDraftManager();

      expect(useUIStore.getState().showDraftManager).toBe(true);
    });

    it('should close draft manager', () => {
      const { openDraftManager, closeDraftManager } = useUIStore.getState();

      openDraftManager();
      closeDraftManager();

      expect(useUIStore.getState().showDraftManager).toBe(false);
    });

    it('should toggle draft manager', () => {
      const { openDraftManager, closeDraftManager } = useUIStore.getState();

      openDraftManager();
      expect(useUIStore.getState().showDraftManager).toBe(true);

      closeDraftManager();
      expect(useUIStore.getState().showDraftManager).toBe(false);

      openDraftManager();
      expect(useUIStore.getState().showDraftManager).toBe(true);
    });
  });

  describe('Settings Modal', () => {
    it('should open settings', () => {
      const { openSettings } = useUIStore.getState();

      openSettings();

      expect(useUIStore.getState().showSettings).toBe(true);
    });

    it('should close settings', () => {
      const { openSettings, closeSettings } = useUIStore.getState();

      openSettings();
      closeSettings();

      expect(useUIStore.getState().showSettings).toBe(false);
    });
  });

  describe('Confirm Dialog', () => {
    it('should show confirm dialog with config', () => {
      const { showConfirm } = useUIStore.getState();

      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      showConfirm({
        title: 'Delete Item?',
        message: 'Are you sure you want to delete this item?',
        onConfirm,
        onCancel,
        confirmText: 'Delete',
        cancelText: 'Cancel',
      });

      const state = useUIStore.getState();
      expect(state.showConfirmDialog).toBe(true);
      expect(state.confirmDialogConfig).toBeTruthy();
      expect(state.confirmDialogConfig?.title).toBe('Delete Item?');
      expect(state.confirmDialogConfig?.message).toBe('Are you sure you want to delete this item?');
      expect(state.confirmDialogConfig?.confirmText).toBe('Delete');
      expect(state.confirmDialogConfig?.cancelText).toBe('Cancel');
    });

    it('should use default button texts if not provided', () => {
      const { showConfirm } = useUIStore.getState();

      showConfirm({
        title: 'Confirm',
        message: 'Are you sure?',
        onConfirm: vi.fn(),
      });

      const config = useUIStore.getState().confirmDialogConfig;
      expect(config?.confirmText).toBe('Confirm');
      expect(config?.cancelText).toBe('Cancel');
    });

    it('should provide default onCancel if not provided', () => {
      const { showConfirm } = useUIStore.getState();

      showConfirm({
        title: 'Confirm',
        message: 'Are you sure?',
        onConfirm: vi.fn(),
      });

      const config = useUIStore.getState().confirmDialogConfig;
      expect(config?.onCancel).toBeTypeOf('function');

      // Call onCancel
      config?.onCancel();

      // Should hide dialog
      expect(useUIStore.getState().showConfirmDialog).toBe(false);
    });

    it('should hide confirm dialog', () => {
      const { showConfirm, hideConfirm } = useUIStore.getState();

      showConfirm({
        title: 'Test',
        message: 'Test',
        onConfirm: vi.fn(),
      });

      hideConfirm();

      const state = useUIStore.getState();
      expect(state.showConfirmDialog).toBe(false);
      expect(state.confirmDialogConfig).toBeNull();
    });

    it('should call onConfirm when confirmed', () => {
      const { showConfirm } = useUIStore.getState();

      const onConfirm = vi.fn();

      showConfirm({
        title: 'Test',
        message: 'Test',
        onConfirm,
      });

      const config = useUIStore.getState().confirmDialogConfig;
      config?.onConfirm();

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when cancelled', () => {
      const { showConfirm } = useUIStore.getState();

      const onCancel = vi.fn();

      showConfirm({
        title: 'Test',
        message: 'Test',
        onConfirm: vi.fn(),
        onCancel,
      });

      const config = useUIStore.getState().confirmDialogConfig;
      config?.onCancel();

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Notifications', () => {
    it('should add notification', () => {
      const { addNotification } = useUIStore.getState();

      addNotification({
        type: 'success',
        title: 'Success',
        message: 'Operation completed successfully',
        duration: 3000,
      });

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('success');
      expect(notifications[0].title).toBe('Success');
      expect(notifications[0].message).toBe('Operation completed successfully');
      expect(notifications[0].id).toBeTruthy();
    });

    it('should add multiple notifications', () => {
      const { addNotification } = useUIStore.getState();

      addNotification({
        type: 'success',
        title: 'Success',
        message: 'First notification',
        duration: 3000,
      });

      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Second notification',
        duration: 3000,
      });

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(2);
    });

    it('should generate unique IDs for notifications', () => {
      const { addNotification } = useUIStore.getState();

      addNotification({
        type: 'info',
        title: 'Info',
        message: 'First',
        duration: 3000,
      });

      addNotification({
        type: 'info',
        title: 'Info',
        message: 'Second',
        duration: 3000,
      });

      const notifications = useUIStore.getState().notifications;
      expect(notifications[0].id).not.toBe(notifications[1].id);
    });

    it('should remove notification by ID', () => {
      const { addNotification, removeNotification } = useUIStore.getState();

      addNotification({
        type: 'success',
        title: 'Success',
        message: 'Test',
        duration: 3000,
      });

      const notificationId = useUIStore.getState().notifications[0].id;
      removeNotification(notificationId);

      expect(useUIStore.getState().notifications).toHaveLength(0);
    });

    it('should remove specific notification without affecting others', () => {
      const { addNotification, removeNotification } = useUIStore.getState();

      addNotification({
        type: 'success',
        title: 'First',
        message: 'First',
        duration: 3000,
      });

      addNotification({
        type: 'error',
        title: 'Second',
        message: 'Second',
        duration: 3000,
      });

      addNotification({
        type: 'warning',
        title: 'Third',
        message: 'Third',
        duration: 3000,
      });

      const notifications = useUIStore.getState().notifications;
      const secondId = notifications[1].id;

      removeNotification(secondId);

      const remaining = useUIStore.getState().notifications;
      expect(remaining).toHaveLength(2);
      expect(remaining[0].title).toBe('First');
      expect(remaining[1].title).toBe('Third');
    });

    it('should auto-remove notification after duration', async () => {
      vi.useFakeTimers();

      const { addNotification } = useUIStore.getState();

      addNotification({
        type: 'success',
        title: 'Auto-remove',
        message: 'This will disappear',
        duration: 3000,
      });

      expect(useUIStore.getState().notifications).toHaveLength(1);

      // Fast-forward 3 seconds
      vi.advanceTimersByTime(3000);

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(useUIStore.getState().notifications).toHaveLength(0);

      vi.useRealTimers();
    });

    it('should not auto-remove notification without duration', async () => {
      vi.useFakeTimers();

      const { addNotification } = useUIStore.getState();

      addNotification({
        type: 'info',
        title: 'Persistent',
        message: 'This stays',
      });

      expect(useUIStore.getState().notifications).toHaveLength(1);

      // Fast-forward time
      vi.advanceTimersByTime(10000);

      // Should still be there
      expect(useUIStore.getState().notifications).toHaveLength(1);

      vi.useRealTimers();
    });

    it('should handle different notification types', () => {
      const { addNotification } = useUIStore.getState();

      const types = ['success', 'error', 'warning', 'info'] as const;

      types.forEach(type => {
        addNotification({
          type,
          title: `${type} notification`,
          message: 'Test message',
          duration: 3000,
        });
      });

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(4);
      expect(notifications.map((n: Notification) => n.type)).toEqual(types);
    });
  });

  describe('Global Loading', () => {
    it('should set global loading', () => {
      const { setGlobalLoading } = useUIStore.getState();

      setGlobalLoading(true, 'Loading data...');

      const state = useUIStore.getState();
      expect(state.globalLoading).toBe(true);
      expect(state.loadingMessage).toBe('Loading data...');
    });

    it('should clear global loading', () => {
      const { setGlobalLoading } = useUIStore.getState();

      setGlobalLoading(true, 'Loading...');
      setGlobalLoading(false);

      const state = useUIStore.getState();
      expect(state.globalLoading).toBe(false);
      expect(state.loadingMessage).toBeNull();
    });

    it('should set loading without message', () => {
      const { setGlobalLoading } = useUIStore.getState();

      setGlobalLoading(true);

      const state = useUIStore.getState();
      expect(state.globalLoading).toBe(true);
      expect(state.loadingMessage).toBeNull();
    });

    it('should update loading message', () => {
      const { setGlobalLoading } = useUIStore.getState();

      setGlobalLoading(true, 'Loading...');
      setGlobalLoading(true, 'Still loading...');

      const state = useUIStore.getState();
      expect(state.globalLoading).toBe(true);
      expect(state.loadingMessage).toBe('Still loading...');
    });
  });

  describe('Complex Workflows', () => {
    it('should handle multiple modals and notifications together', () => {
      const {
        openDraftManager,
        openSettings,
        addNotification,
        setGlobalLoading,
      } = useUIStore.getState();

      // Open modals
      openDraftManager();
      openSettings();

      // Add notifications
      addNotification({
        type: 'success',
        title: 'Success',
        message: 'Test 1',
        duration: 3000,
      });

      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Test 2',
        duration: 3000,
      });

      // Set loading
      setGlobalLoading(true, 'Processing...');

      const state = useUIStore.getState();
      expect(state.showDraftManager).toBe(true);
      expect(state.showSettings).toBe(true);
      expect(state.notifications).toHaveLength(2);
      expect(state.globalLoading).toBe(true);
    });

    it('should handle confirm dialog workflow', () => {
      const { showConfirm, hideConfirm } = useUIStore.getState();

      let confirmed = false;
      let cancelled = false;

      showConfirm({
        title: 'Delete?',
        message: 'Are you sure?',
        onConfirm: () => {
          confirmed = true;
        },
        onCancel: () => {
          cancelled = true;
        },
      });

      // Confirm
      useUIStore.getState().confirmDialogConfig?.onConfirm();
      expect(confirmed).toBe(true);

      // Show again
      showConfirm({
        title: 'Delete?',
        message: 'Are you sure?',
        onConfirm: () => {},
        onCancel: () => {
          cancelled = true;
        },
      });

      // Cancel
      useUIStore.getState().confirmDialogConfig?.onCancel();
      expect(cancelled).toBe(true);
    });

    it('should clear state progressively', () => {
      const {
        openDraftManager,
        closeDraftManager,
        addNotification,
        removeNotification,
        setGlobalLoading,
      } = useUIStore.getState();

      // Set up state
      openDraftManager();
      addNotification({
        type: 'info',
        title: 'Info',
        message: 'Test',
        duration: 3000,
      });
      setGlobalLoading(true, 'Loading...');

      // Clear progressively
      closeDraftManager();
      expect(useUIStore.getState().showDraftManager).toBe(false);

      const notifId = useUIStore.getState().notifications[0].id;
      removeNotification(notifId);
      expect(useUIStore.getState().notifications).toHaveLength(0);

      setGlobalLoading(false);
      expect(useUIStore.getState().globalLoading).toBe(false);
    });

    it('should handle notification queue', async () => {
      vi.useFakeTimers();

      const { addNotification } = useUIStore.getState();

      // Add multiple notifications with staggered durations
      addNotification({
        type: 'success',
        title: 'First',
        message: 'First',
        duration: 1000,
      });

      addNotification({
        type: 'success',
        title: 'Second',
        message: 'Second',
        duration: 2000,
      });

      addNotification({
        type: 'success',
        title: 'Third',
        message: 'Third',
        duration: 3000,
      });

      expect(useUIStore.getState().notifications).toHaveLength(3);

      // After 1 second, first should be removed
      vi.advanceTimersByTime(1000);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(useUIStore.getState().notifications).toHaveLength(2);

      // After another second, second should be removed
      vi.advanceTimersByTime(1000);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(useUIStore.getState().notifications).toHaveLength(1);

      // After another second, third should be removed
      vi.advanceTimersByTime(1000);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(useUIStore.getState().notifications).toHaveLength(0);

      vi.useRealTimers();
    });
  });
});
