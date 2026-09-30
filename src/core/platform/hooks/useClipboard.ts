import { useCallback, useEffect, useState } from 'react';

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

export function useClipboard(options: { watchImages?: boolean } = {}): {
  readonly writeText: (text: string) => Promise<boolean>;
  readonly readImage: () => Promise<File | null>;
  readonly availableImage: File | null;
  readonly refreshImage: () => Promise<File | null>;
} {
  const watchImages = options.watchImages === true;
  const [availableImage, setAvailableImage] = useState<File | null>(null);
  const writeText = useCallback(async (text: string): Promise<boolean> => {
    if (!text) {
      return false;
    }

    if (await writeWithAsyncClipboard(text)) {
      return true;
    }

    return writeWithTextAreaFallback(text);
  }, []);

  const readImage = useCallback(async (): Promise<File | null> => {
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.read !== 'function') {
      return null;
    }

    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const extension = imageType.split('/')[1]?.split('+')[0] || 'png';
        return new File([blob], `clipboard-image.${extension}`, { type: imageType });
      }
    } catch {
      return null;
    }

    return null;
  }, []);

  const refreshImage = useCallback(async (): Promise<File | null> => {
    if (!watchImages || typeof navigator === 'undefined' || !navigator.permissions) {
      setAvailableImage(null);
      return null;
    }

    try {
      const permission = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
      if (permission.state !== 'granted') {
        setAvailableImage(null);
        return null;
      }
    } catch {
      setAvailableImage(null);
      return null;
    }

    const image = await readImage();
    setAvailableImage(image);
    return image;
  }, [readImage, watchImages]);

  useEffect(() => {
    if (!watchImages || typeof window === 'undefined') return undefined;
    const handleFocus = () => { void refreshImage(); };
    void refreshImage();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshImage, watchImages]);

  return { writeText, readImage, availableImage, refreshImage };
}
