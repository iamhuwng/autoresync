import { useEffect, useSyncExternalStore } from 'react';
import './ToastNotification.css';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastNotificationProps {
  title: string;
  message: string;
  tone?: ToastTone;
  duration?: number;
  onClose: () => void;
}

export interface ToastContainerProps {
  className?: string;
}

export interface ToastOptions {
  title?: string;
  message: string;
  tone?: ToastTone;
  duration?: number;
}

interface ToastRecord {
  id: string;
  title: string;
  message: string;
  tone: ToastTone;
  leaving?: boolean;
}

const DEFAULT_TITLES: Record<ToastTone, string> = {
  success: 'Success',
  error: 'Error',
  info: 'Info',
  warning: 'Warning',
};

const listeners = new Set<() => void>();
const exitTimers = new Map<string, number>();
const dismissTimers = new Map<string, number>();
let toastQueue: ToastRecord[] = [];
const DEFAULT_DURATION_MS = 5000;
const EXIT_DURATION_MS = 650;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return toastQueue;
}

function createToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function removeToast(id: string) {
  toastQueue = toastQueue.filter((toastRecord) => toastRecord.id !== id);
  const timeoutId = exitTimers.get(id);
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    exitTimers.delete(id);
  }
  const dismissTimeoutId = dismissTimers.get(id);
  if (dismissTimeoutId) {
    window.clearTimeout(dismissTimeoutId);
    dismissTimers.delete(id);
  }
  emitChange();
}

function clearToasts() {
  [...exitTimers.values(), ...dismissTimers.values()].forEach((timeoutId) => {
    window.clearTimeout(timeoutId);
  });
  exitTimers.clear();
  dismissTimers.clear();
  toastQueue = [];
  emitChange();
}

function dismissToast(id: string) {
  let changed = false;

  toastQueue = toastQueue.map((toastRecord) => {
    if (toastRecord.id !== id || toastRecord.leaving) {
      return toastRecord;
    }

    changed = true;
    return {
      ...toastRecord,
      leaving: true,
    };
  });

  if (!changed) {
    return;
  }

  emitChange();

  const timeoutId = window.setTimeout(() => {
    removeToast(id);
  }, EXIT_DURATION_MS);

  exitTimers.set(id, timeoutId);
}

function pushToast({ message, tone = 'info', title, duration = DEFAULT_DURATION_MS }: ToastOptions) {
  const id = createToastId();

  toastQueue = [
    ...toastQueue,
    {
      id,
      message,
      tone,
      title: title || DEFAULT_TITLES[tone],
    },
  ];

  emitChange();

  if (duration > 0) {
    const timeoutId = window.setTimeout(() => {
      dismissToast(id);
    }, duration);
    dismissTimers.set(id, timeoutId);
  }

  return id;
}

function ToastCard({
  toastRecord,
  onClose,
}: {
  toastRecord: ToastRecord;
  onClose: () => void;
}) {
  const isError = toastRecord.tone === 'error';

  return (
    <div
      className={`toast-card toast-card--${toastRecord.tone} ${toastRecord.leaving ? 'toast-card--leaving' : ''}`.trim()}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div className="toast-card__content">
        <div className="toast-card__title">{toastRecord.title}</div>
        <div className="toast-card__message">{toastRecord.message}</div>
      </div>
      <button
        type="button"
        className="toast-card__close"
        onClick={onClose}
        aria-label="Dismiss announcement"
      >
        ×
      </button>
    </div>
  );
}

export const toast = {
  success(message: string) {
    return pushToast({ message, tone: 'success' });
  },
  error(message: string) {
    return pushToast({ message, tone: 'error' });
  },
  info(message: string) {
    return pushToast({ message, tone: 'info' });
  },
  warning(message: string) {
    return pushToast({ message, tone: 'warning' });
  },
  show(options: ToastOptions) {
    return pushToast(options);
  },
  dismiss(id: string) {
    dismissToast(id);
  },
  clear() {
    clearToasts();
  },
};

export function ToastContainer({ className = '' }: ToastContainerProps) {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <div className={`toast-container ${className}`.trim()}>
      {toasts.map((toastRecord) => (
        <ToastCard
          key={toastRecord.id}
          toastRecord={toastRecord}
          onClose={() => dismissToast(toastRecord.id)}
        />
      ))}
    </div>
  );
}

function ToastNotification({
  title,
  message,
  tone = 'info',
  duration = 4000,
  onClose,
}: ToastNotificationProps) {
  useEffect(() => {
    if (duration <= 0) {
      return undefined;
    }

    const timeoutId = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timeoutId);
  }, [duration, onClose]);

  return (
    <div className="toast-container toast-container--single">
      <ToastCard
        toastRecord={{
          id: 'standalone-toast',
          title,
          message,
          tone,
        }}
        onClose={onClose}
      />
    </div>
  );
}

export default ToastNotification;
