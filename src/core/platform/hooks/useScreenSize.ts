/**
 * Platform Screen Size Hook
 *
 * Provides responsive breakpoint information using a platform-agnostic API.
 * Web: uses window.matchMedia()
 * React Native (future): swap to Dimensions/useWindowDimensions
 *
 * @see documentation/rules/mobile-portability.md — Rule 19, Rule 22
 */

import { useState, useEffect } from 'react';

export interface ScreenSize {
  /** Screen width < 768px */
  isMobile: boolean;
  /** Screen width >= 768px and < 1024px */
  isTablet: boolean;
  /** Screen width >= 1024px */
  isDesktop: boolean;
  /** Current viewport width in pixels */
  width: number;
  /** Current viewport height in pixels */
  height: number;
}

function getScreenSize(): ScreenSize {
  if (typeof window === 'undefined') {
    return { isMobile: false, isTablet: false, isDesktop: true, width: 1024, height: 768 };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    isMobile: w < 768,
    isTablet: w >= 768 && w < 1024,
    isDesktop: w >= 1024,
    width: w,
    height: h,
  };
}

export function useScreenSize(): ScreenSize {
  const [size, setSize] = useState<ScreenSize>(getScreenSize);

  useEffect(() => {
    const handleResize = () => setSize(getScreenSize());

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}
