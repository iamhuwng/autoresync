import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';
import '@testing-library/jest-dom';

/**
 * Fix for Mantine Modal + JSDOM compatibility
 * 
 * Mantine's useModal hook calls event.target?.getAttribute('data-mantine-stop-propagation')
 * but JSDOM sometimes provides events where target doesn't have getAttribute
 * (e.g., when target is window, document, or a text node)
 * 
 * This patch ensures getAttribute always exists on event targets
 */
const originalAddEventListener = document.addEventListener.bind(document);
document.addEventListener = function(
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
) {
  const wrappedListener = function(this: Document, event: Event) {
    // Ensure event.target has getAttribute method
    if (event.target && typeof (event.target as any).getAttribute !== 'function') {
      Object.defineProperty(event, 'target', {
        value: {
          ...event.target,
          getAttribute: () => null,
          hasAttribute: () => false,
          closest: () => null,
        },
        writable: false,
      });
    }
    
    if (typeof listener === 'function') {
      listener.call(this, event);
    } else if (listener && typeof listener.handleEvent === 'function') {
      listener.handleEvent(event);
    }
  };
  
  return originalAddEventListener(type, wrappedListener as EventListener, options);
};

// Also patch window.addEventListener for completeness
const originalWindowAddEventListener = window.addEventListener.bind(window);
window.addEventListener = function(
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
) {
  const wrappedListener = function(this: Window, event: Event) {
    // Ensure event.target has getAttribute method
    if (event.target && typeof (event.target as any).getAttribute !== 'function') {
      Object.defineProperty(event, 'target', {
        value: {
          ...event.target,
          getAttribute: () => null,
          hasAttribute: () => false,
          closest: () => null,
        },
        writable: false,
      });
    }
    
    if (typeof listener === 'function') {
      listener.call(this, event);
    } else if (listener && typeof listener.handleEvent === 'function') {
      listener.handleEvent(event);
    }
  };
  
  return originalWindowAddEventListener(type, wrappedListener as EventListener, options);
};

// Mock window.matchMedia for Mantine components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Setup MSW server
export const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
