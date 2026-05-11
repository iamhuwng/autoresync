import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useClipboard } from './useClipboard';

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExecCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');

const setClipboard = (clipboard: Pick<Clipboard, 'writeText'> | undefined): void => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  });
};

const setExecCommand = (execCommand: Document['execCommand'] | undefined): void => {
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: execCommand,
  });
};

describe('useClipboard', () => {
  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
    } else {
      delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
    }

    if (originalExecCommandDescriptor) {
      Object.defineProperty(document, 'execCommand', originalExecCommandDescriptor);
    } else {
      delete (document as Document & { execCommand?: Document['execCommand'] }).execCommand;
    }

    vi.restoreAllMocks();
  });

  it('writes text with the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    setExecCommand(undefined);

    const { result } = renderHook(() => useClipboard());
    let copied = false;

    await act(async () => {
      copied = await result.current.writeText('copy me');
    });

    expect(copied).toBe(true);
    expect(writeText).toHaveBeenCalledWith('copy me');
  });

  it('falls back to a selected textarea when Clipboard API write is blocked', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'));
    const copiedValues: string[] = [];
    setClipboard({ writeText });
    setExecCommand(vi.fn((command: string) => {
      copiedValues.push((document.activeElement as HTMLTextAreaElement | null)?.value ?? '');
      return command === 'copy';
    }));

    const { result } = renderHook(() => useClipboard());
    let copied = false;

    await act(async () => {
      copied = await result.current.writeText('fallback prompt');
    });

    expect(copied).toBe(true);
    expect(writeText).toHaveBeenCalledWith('fallback prompt');
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(copiedValues).toEqual(['fallback prompt']);
  });
});
