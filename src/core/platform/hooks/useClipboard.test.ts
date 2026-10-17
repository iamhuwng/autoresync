import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useClipboard } from './useClipboard';

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalPermissionsDescriptor = Object.getOwnPropertyDescriptor(navigator, 'permissions');
const originalExecCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');

const setClipboard = (clipboard: Partial<Pick<Clipboard, 'read' | 'writeText'>> | undefined): void => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  });
};

const setPermissions = (state: PermissionState): void => {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state }) },
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

    if (originalPermissionsDescriptor) {
      Object.defineProperty(navigator, 'permissions', originalPermissionsDescriptor);
    } else {
      delete (navigator as Navigator & { permissions?: Permissions }).permissions;
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

  it('reads the first image from the async Clipboard API', async () => {
    const blob = new Blob(['screenshot'], { type: 'image/png' });
    const read = vi.fn().mockResolvedValue([{
      types: ['text/plain', 'image/png'],
      getType: vi.fn().mockResolvedValue(blob),
    }]);
    setClipboard({ read });

    const { result } = renderHook(() => useClipboard());
    let image: File | null = null;

    await act(async () => {
      image = await result.current.readImage();
    });

    expect(image).toEqual(expect.objectContaining({ name: 'clipboard-image.png', type: 'image/png' }));
    expect(read).toHaveBeenCalledOnce();
  });

  it('exposes an available image only after clipboard-read permission is granted', async () => {
    const blob = new Blob(['screenshot'], { type: 'image/png' });
    setClipboard({
      read: vi.fn().mockResolvedValue([{
        types: ['image/png'],
        getType: vi.fn().mockResolvedValue(blob),
      }]),
    });
    setPermissions('granted');

    const { result } = renderHook(() => useClipboard({ watchImages: true }));

    await waitFor(() => expect(result.current.availableImage?.type).toBe('image/png'));
  });
});
