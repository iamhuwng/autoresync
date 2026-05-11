import { useCallback } from 'react';

const writeWithAsyncClipboard = async (text: string): Promise<boolean> => {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const writeWithTextAreaFallback = (text: string): boolean => {
  if (typeof document === 'undefined' || !document.body || typeof document.execCommand !== 'function') {
    return false;
  }

  const textArea = document.createElement('textarea');
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '-9999px';
  textArea.style.opacity = '0';

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, text.length);

  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textArea);
    activeElement?.focus();
  }
};

export function useClipboard(): {
  readonly writeText: (text: string) => Promise<boolean>;
} {
  const writeText = useCallback(async (text: string): Promise<boolean> => {
    if (!text) {
      return false;
    }

    if (await writeWithAsyncClipboard(text)) {
      return true;
    }

    return writeWithTextAreaFallback(text);
  }, []);

  return { writeText };
}
