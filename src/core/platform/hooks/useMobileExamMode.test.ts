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

const mockMediaState = vi.hoisted(() => ({
  coarse: false,
  hover: false,
  anyHover: false,
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
  mockMediaState.coarse = coarse;
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn((query: string) => ({
      matches:
        query === '(pointer: coarse)' ? mockMediaState.coarse
          : query === '(hover: hover)' ? mockMediaState.hover
            : query === '(any-hover: hover)' ? mockMediaState.anyHover
              : false,
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

function setHoverCapablePointer(hover: boolean) {
  mockMediaState.hover = hover;
  mockMediaState.anyHover = hover;
}

function setScreenDimensions(width: number, height: number) {
  Object.defineProperty(window, 'screen', {
    value: { ...window.screen, width, height },
    configurable: true,
  });
}

function setViewportDimensions(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: height,
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
    setHoverCapablePointer(false);
    setScreenDimensions(1280, 900);
    setViewportDimensions(1280, 900);
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
    setViewportDimensions(400, 800);

    const { result } = renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(result.current.isMobileExamMode).toBe(false);
    });
  });

  it('returns false with small viewport + coarse pointer when desktop UA is definitive', async () => {
    mockScreenSize.current = { isMobile: true, isTablet: false, isDesktop: false, width: 400, height: 800 };
    setUserAgent(DESKTOP_UA);
    setPointerCoarse(true);
    setViewportDimensions(400, 800);

    const { result } = renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(result.current.isMobileExamMode).toBe(false);
    });
  });

  it('returns false for touch hardware when desktop UA is definitive', async () => {
    mockScreenSize.current = { isMobile: false, isTablet: true, isDesktop: false, width: 980, height: 844 };
    setUserAgent(DESKTOP_UA);
    setPointerCoarse(true);
    setHoverCapablePointer(false);
    setScreenDimensions(980, 844);
    setViewportDimensions(980, 844);

    const { result } = renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(result.current.isMobileExamMode).toBe(false);
    });
  });

  it('returns false for a touch tablet-sized viewport without phone-class signals', async () => {
    mockScreenSize.current = { isMobile: false, isTablet: true, isDesktop: false, width: 820, height: 1180 };
    setUserAgent(DESKTOP_UA);
    setPointerCoarse(true);
    setHoverCapablePointer(false);
    setScreenDimensions(820, 1180);
    setViewportDimensions(820, 1180);

    const { result } = renderHook(() => useMobileExamMode());
    await waitFor(() => {
      expect(result.current.isMobileExamMode).toBe(false);
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
    setViewportDimensions(400, 800);
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
