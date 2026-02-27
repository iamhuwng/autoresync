/**
 * Accessibility Utilities
 * Helpers for ARIA labels, keyboard navigation, and screen reader support
 */

/**
 * Focus management utilities
 */
export const focusManagement = {
  /**
   * Focus an element by ID
   */
  focusById(id: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },

  /**
   * Focus first focusable element in container
   */
  focusFirstIn(container: HTMLElement): void {
    const focusable = this.getFocusableElements(container);
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  },

  /**
   * Get all focusable elements in container
   */
  getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    return Array.from(container.querySelectorAll(selector)) as HTMLElement[];
  },

  /**
   * Trap focus within container
   */
  trapFocus(container: HTMLElement): () => void {
    const focusable = this.getFocusableElements(container);
    const firstFocusable = focusable[0];
    const lastFocusable = focusable[focusable.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
          lastFocusable.focus();
          e.preventDefault();
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable) {
          firstFocusable.focus();
          e.preventDefault();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    // Return cleanup function
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  },
};

/**
 * Screen reader announcements
 */
export const announceToScreenReader = (
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void => {
  // Create or get live region
  let liveRegion = document.getElementById('sr-live-region');
  
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'sr-live-region';
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.position = 'absolute';
    liveRegion.style.left = '-10000px';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    document.body.appendChild(liveRegion);
  }

  // Update priority if changed
  liveRegion.setAttribute('aria-live', priority);

  // Clear and announce
  liveRegion.textContent = '';
  setTimeout(() => {
    if (liveRegion) {
      liveRegion.textContent = message;
    }
  }, 100);
};

/**
 * Keyboard navigation helpers
 */
export const keyboardNav = {
  /**
   * Handle arrow key navigation in list
   */
  handleArrowKeys(
    e: KeyboardEvent,
    currentIndex: number,
    itemCount: number,
    onIndexChange: (index: number) => void
  ): void {
    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        newIndex = (currentIndex + 1) % itemCount;
        e.preventDefault();
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        newIndex = (currentIndex - 1 + itemCount) % itemCount;
        e.preventDefault();
        break;
      case 'Home':
        newIndex = 0;
        e.preventDefault();
        break;
      case 'End':
        newIndex = itemCount - 1;
        e.preventDefault();
        break;
      default:
        return;
    }

    onIndexChange(newIndex);
  },

  /**
   * Handle escape key
   */
  handleEscape(e: KeyboardEvent, callback: () => void): void {
    if (e.key === 'Escape') {
      callback();
      e.preventDefault();
    }
  },

  /**
   * Handle enter/space key
   */
  handleActivate(e: KeyboardEvent, callback: () => void): void {
    if (e.key === 'Enter' || e.key === ' ') {
      callback();
      e.preventDefault();
    }
  },
};

/**
 * ARIA attribute helpers
 */
export const ariaHelpers = {
  /**
   * Generate unique ID for ARIA relationships
   */
  generateId(prefix: string = 'aria'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Create describedby relationship
   */
  createDescribedBy(elementId: string, descriptionId: string): {
    'aria-describedby': string;
  } {
    return {
      'aria-describedby': descriptionId,
    };
  },

  /**
   * Create labelledby relationship
   */
  createLabelledBy(labelId: string): {
    'aria-labelledby': string;
  } {
    return {
      'aria-labelledby': labelId,
    };
  },

  /**
   * Create expanded state
   */
  createExpanded(isExpanded: boolean): {
    'aria-expanded': boolean;
  } {
    return {
      'aria-expanded': isExpanded,
    };
  },

  /**
   * Create checked state
   */
  createChecked(isChecked: boolean): {
    'aria-checked': boolean;
  } {
    return {
      'aria-checked': isChecked,
    };
  },

  /**
   * Create selected state
   */
  createSelected(isSelected: boolean): {
    'aria-selected': boolean;
  } {
    return {
      'aria-selected': isSelected,
    };
  },

  /**
   * Create invalid state
   */
  createInvalid(isInvalid: boolean, errorId?: string): {
    'aria-invalid': boolean;
    'aria-errormessage'?: string;
  } {
    const attrs: any = {
      'aria-invalid': isInvalid,
    };

    if (isInvalid && errorId) {
      attrs['aria-errormessage'] = errorId;
    }

    return attrs;
  },

  /**
   * Create live region attributes
   */
  createLiveRegion(priority: 'polite' | 'assertive' = 'polite'): {
    'aria-live': string;
    'aria-atomic': boolean;
  } {
    return {
      'aria-live': priority,
      'aria-atomic': true,
    };
  },
};

/**
 * Color contrast checker
 * Returns true if contrast ratio meets WCAG AA standards (4.5:1)
 */
export function meetsContrastStandards(
  foreground: string,
  background: string
): boolean {
  const ratio = calculateContrastRatio(foreground, background);
  return ratio >= 4.5; // WCAG AA standard
}

/**
 * Calculate contrast ratio between two colors
 */
function calculateContrastRatio(color1: string, color2: string): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Get relative luminance of color
 */
function getRelativeLuminance(color: string): number {
  // This is a simplified version - in production, use a proper library
  const rgb = hexToRgb(color);
  if (!rgb) return 0;

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((val) => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Skip link component helper
 * Creates attributes for skip navigation links
 */
export function createSkipLink(targetId: string): {
  href: string;
  className: string;
  onClick: (e: React.MouseEvent) => void;
} {
  return {
    href: `#${targetId}`,
    className: 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded',
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      focusManagement.focusById(targetId);
    },
  };
}

/**
 * Screen reader only CSS class
 * Add to Tailwind config: sr-only
 */
export const srOnlyClass = 'absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0';
