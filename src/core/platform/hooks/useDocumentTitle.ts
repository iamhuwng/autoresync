/**
 * Platform Document Title Hook
 *
 * Sets the browser tab title through the platform layer.
 * Web: uses document.title
 * React Native (future): no-op or maps to native screen options
 *
 * @see documentation/rules/mobile-portability.md - Rule 19
 */

import { useEffect } from 'react';
import { formatDocumentTitle } from '../documentTitle';

export function useDocumentTitle(pageTitle?: string | null): void {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.title = formatDocumentTitle(pageTitle);
  }, [pageTitle]);
}
