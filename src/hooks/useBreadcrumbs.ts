/**
 * Breadcrumb Tracker — Captures last 10 user actions for debugging context
 * PRD-0037: Production Reporting & Observability System (FR-15, FR-16, FR-17, FR-18)
 *
 * This is NOT a React hook — it's a plain TypeScript module.
 * Filename kept as useBreadcrumbs.ts for consistency with the PRD naming.
 *
 * Exports:
 * - initBreadcrumbs(): Set up delegated event listeners on document.body
 * - addBreadcrumb(type, target): Add a breadcrumb entry
 * - addNavigationBreadcrumb(url): Record a navigation event
 * - getBreadcrumbs(): Get a copy of the current breadcrumb buffer
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BreadcrumbEntry {
  type: 'navigation' | 'click' | 'submit';
  target: string;
  timestamp: number;
  timeSincePageLoad: number;
}

// ─── State ──────────────────────────────────────────────────────────────────

const MAX_BREADCRUMBS = 10;
let breadcrumbs: BreadcrumbEntry[] = [];
let lastPageLoadTime: number = Date.now();
let isInitialized = false;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize breadcrumb tracking.
 * Call once at app startup. Sets up delegated event listeners on document.body.
 */
export function initBreadcrumbs(): void {
  if (isInitialized) return;
  isInitialized = true;
  lastPageLoadTime = Date.now();

  // Delegated click listener on document.body
  document.body.addEventListener('click', (event) => {
    try {
      const target = event.target as HTMLElement;
      if (!target) return;

      // Check if the clicked element or its ancestor is a button, link, or has data-track
      const trackable = target.closest('button, a, [data-track]');
      if (!trackable) return;

      // Extract text: prefer data-track attribute, fallback to textContent
      const trackAttr = trackable.getAttribute('data-track');
      const text = trackAttr || trackable.textContent?.trim()?.substring(0, 80) || 'unknown';

      addBreadcrumb('click', text);
    } catch {
      // Silently fail — breadcrumbs are non-critical
    }
  });

  // Delegated submit listener on document.body
  document.body.addEventListener('submit', (event) => {
    try {
      const form = event.target as HTMLFormElement;
      if (!form || form.tagName !== 'FORM') return;

      const formName = form.getAttribute('name') || form.getAttribute('id') || 'unnamed-form';
      addBreadcrumb('submit', formName);
    } catch {
      // Silently fail
    }
  });
}

/**
 * Add a breadcrumb entry to the circular buffer.
 */
export function addBreadcrumb(type: BreadcrumbEntry['type'], target: string): void {
  const entry: BreadcrumbEntry = {
    type,
    target,
    timestamp: Date.now(),
    timeSincePageLoad: Date.now() - lastPageLoadTime,
  };

  breadcrumbs.push(entry);

  // Circular buffer: remove oldest when exceeding max
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
}

/**
 * Record a navigation event and reset page load timer.
 */
export function addNavigationBreadcrumb(url: string): void {
  addBreadcrumb('navigation', url);
  lastPageLoadTime = Date.now();
}

/**
 * Get a copy of the current breadcrumb buffer.
 */
export function getBreadcrumbs(): BreadcrumbEntry[] {
  return [...breadcrumbs];
}
