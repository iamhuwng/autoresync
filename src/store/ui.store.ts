import { create } from 'zustand';

/**
 * Notification types
 */
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number; // ms, undefined = persistent
}

/**
 * UI store state
 * Manages global UI state (modals, notifications, loading)
 */
export interface UIStore {
  // ========== Modals ==========
  showDraftManager: boolean;
  showSettings: boolean;
  showConfirmDialog: boolean;
  confirmDialogConfig: {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
  } | null;
  
  // ========== Notifications ==========
  notifications: Notification[];
  
  // ========== Loading States ==========
  globalLoading: boolean;
  loadingMessage: string | null;
  
  // ========== Actions ==========
  // Modals
  openDraftManager: () => void;
  closeDraftManager: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  showConfirm: (config: {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  }) => void;
  hideConfirm: () => void;
  
  // Notifications
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  
  // Loading
  setGlobalLoading: (loading: boolean, message?: string) => void;
}

/**
 * UI store implementation
 */
export const useUIStore = create<UIStore>((set, get) => ({
  // ========== State ==========
  showDraftManager: false,
  showSettings: false,
  showConfirmDialog: false,
  confirmDialogConfig: null,
  notifications: [],
  globalLoading: false,
  loadingMessage: null,
  
  // ========== Modal Actions ==========
  openDraftManager: () => set({ showDraftManager: true }),
  closeDraftManager: () => set({ showDraftManager: false }),
  openSettings: () => set({ showSettings: true }),
  closeSettings: () => set({ showSettings: false }),
  
  showConfirm: (config) => {
    set({
      showConfirmDialog: true,
      confirmDialogConfig: {
        ...config,
        onCancel: config.onCancel || (() => get().hideConfirm()),
        confirmText: config.confirmText || 'Confirm',
        cancelText: config.cancelText || 'Cancel',
      },
    });
  },
  
  hideConfirm: () => {
    set({
      showConfirmDialog: false,
      confirmDialogConfig: null,
    });
  },
  
  // ========== Notification Actions ==========
  addNotification: (notification) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNotif: Notification = { ...notification, id };
    
    set({ notifications: [...get().notifications, newNotif] });
    
    // Auto-remove after duration
    if (notification.duration) {
      setTimeout(() => {
        get().removeNotification(id);
      }, notification.duration);
    }
  },
  
  removeNotification: (id) => {
    set({ notifications: get().notifications.filter(n => n.id !== id) });
  },
  
  // ========== Loading Actions ==========
  setGlobalLoading: (loading, message) => {
    set({ globalLoading: loading, loadingMessage: message || null });
  },
}));
