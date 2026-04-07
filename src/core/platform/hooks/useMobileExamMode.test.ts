import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobileExamMode } from './useMobileExamMode';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockSessionStoreGetString } = vi.hoisted(() => ({
  mockSessionStoreGetString: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../storage', () => ({
  sessionStore: {
    getString: mockSessionStoreGetString,
  },
}));

// Mock useScreenSize — default to desktop
const mockScreenSize = vi.hoisted(() => ({
  current: { isMobile: false, isTablet: false, isDesktop: true, width: 1280, height: 900 },
}));

vi.mock('./useScreenSize', () => ({
  useScreenSize: () => mockScreenSize.current,
}));

// Helper to control navigator.userAgent
function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    writable: true,
    configurable: true,
  });
}

// Helper to control matchMedia for pointer:coarse
function setPointerCoarse(coarse: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn((query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
    writable: true,
    configurable: true,
  });
}

describe('useMobileExamMode', () => {
  const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

  beforeEach(() => {
    vi.clearAllMocks();
    setUserAgent(DESKTOP_UA);
    setPointerCoarse(false);
    mockScreenSize.current = { isMobile: false, isTablet: false, isDesktop: true, width: 1280, height: 900 };
    mockSessionStoreGetString.mockResolvedValue(null);
  });

  it('returns false on desktop viewport with no touch (fail-safe)', async () => {
    const { result } = renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(result.current.isMobileExamMode).toBe(false);
    });
  });

  it('returns true when UA contains "Mobile" and pointer is coarse (Android phone)', async () => {
    setUserAgent(MOBILE_UA);
    setPointerCoarse(true);

    const { result } = renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(result.current.isMobileExamMode).toBe(true);
    });
  });

  it('returns true when UA is iPhone', async () => {
    setUserAgent(IPHONE_UA);

    const { result } = renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(result.current.isMobileExamMode).toBe(true);
    });
  });

  it('returns false when uncertain — small viewport but desktop UA and no touch (fail-safe)', async () => {
    // Small viewport but desktop-class UA and mouse pointer
    mockScreenSize.current = { isMobile: true, isTablet: false, isDesktop: false, width: 400, height: 800 };
    setUserAgent(DESKTOP_UA);
    setPointerCoarse(false);

    const { result } = renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(result.current.isMobileExamMode).toBe(false);
    });
  });

  it('returns true with small viewport + coarse pointer even without mobile UA', async () => {
    mockScreenSize.current = { isMobile: true, isTablet: false, isDesktop: false, width: 400, height: 800 };
    setUserAgent(DESKTOP_UA);
    setPointerCoarse(true);

    const { result } = renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(result.current.isMobileExamMode).toBe(true);
    });
  });

  // ── QA Override Tests ──────────────────────────────────────────────────────

  it('force-mobile override returns true on desktop', async () => {
    mockSessionStoreGetString.mockResolvedValue('force-mobile');

    const { result } = renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(result.current.isMobileExamMode).toBe(true);
    });
  });

  it('force-standard override returns false on mobile device', async () => {
    setUserAgent(MOBILE_UA);
    setPointerCoarse(true);
    mockScreenSize.current = { isMobile: true, isTablet: false, isDesktop: false, width: 400, height: 800 };
    mockSessionStoreGetString.mockResolvedValue('force-standard');

    const { result } = renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(result.current.isMobileExamMode).toBe(false);
    });
  });

  it('reads override through session-scoped storage abstraction, not persistent storage', async () => {
    mockSessionStoreGetString.mockResolvedValue('auto');

    renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(mockSessionStoreGetString).toHaveBeenCalledWith('__qa_mobile_exam_override__');
    });
  });
});
