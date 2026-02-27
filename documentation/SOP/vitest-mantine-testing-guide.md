# Vitest + Mantine Testing SOP

> **Purpose:** Guide for testing React components that use Mantine UI in this project.
> **Audience:** All developers, especially juniors new to the codebase.
> **Last Updated:** 2026-01-31

---

## ⚠️ THE GOLDEN RULE

> **If you've spent more than 30 minutes debugging a Mantine testing error, STOP.**
> 
> The goal is to **verify the implementation works**, not to fight the testing framework.
> Move to E2E testing with Playwright instead.

---

## 1. Project Testing Stack

| Tool | Purpose | When to Use |
|------|---------|-------------|
| **Vitest** | Unit/Integration tests | Services, utilities, hooks, simple components |
| **Playwright** | E2E browser tests | Complex UI components, full user flows |
| **React Testing Library** | Component rendering | Components WITHOUT heavy Mantine usage |

**Key Insight:** Mantine components (modals, dropdowns, date pickers) often break in JSDOM. This is NOT your code's fault.

---

## 2. Vitest Configuration

Our `vitest.config.ts` is already configured. Key settings:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
```

---

## 3. Required Test Setup File

**File:** `src/test/setup.ts`

```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ============================================
// MANTINE REQUIRED MOCKS
// ============================================

// Mock window.matchMedia (Mantine uses this for responsive design)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver (Mantine modals/popovers need this)
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
window.ResizeObserver = ResizeObserverMock;

// Mock IntersectionObserver (Mantine lazy loading)
class IntersectionObserverMock {
  root = null;
  rootMargin = '';
  thresholds = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}
window.IntersectionObserver = IntersectionObserverMock;

// Mock scrollTo (prevents errors during navigation)
window.scrollTo = vi.fn();

// Mock getComputedStyle (Mantine transitions)
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (element: Element) => {
  return originalGetComputedStyle(element);
};

// ============================================
// FIREBASE MOCKS (if using Firebase)
// ============================================

vi.mock('../firebase/config', () => ({
  auth: { currentUser: null },
  db: {},
}));

// ============================================
// GLOBAL TEST TIMEOUT
// ============================================

// Increase timeout for async operations
vi.setConfig({ testTimeout: 10000 });
```

---

## 4. The Mantine Test Wrapper

**ALWAYS wrap Mantine components in MantineProvider:**

```typescript
// src/test/test-utils.tsx
import { ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Custom wrapper that includes all providers
function AllProviders({ children }: { children: ReactNode }) {
  return (
    <MantineProvider>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </MantineProvider>
  );
}

// Custom render function
const customRender = (ui: React.ReactElement, options?: RenderOptions) =>
  render(ui, { wrapper: AllProviders, ...options });

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };
```

**Usage:**
```typescript
// ❌ WRONG - Will fail with Mantine errors
import { render } from '@testing-library/react';

// ✅ CORRECT - Uses our wrapper
import { render } from '../test/test-utils';
```

---

## 5. What to Test Where

### ✅ TEST WITH VITEST (Unit Tests)

| Type | Examples |
|------|----------|
| **Services** | `profileService.ts`, `badgeService.ts`, `academicRecordService.ts` |
| **Utilities** | `errorHandling.ts`, `formatters.ts`, `validators.ts` |
| **Hooks** | `useAcademicRecord.ts`, `useProfileCompletion.ts` |
| **Simple Components** | Components with minimal Mantine usage |

### ⚠️ CAUTION WITH VITEST

| Component | Issue | Solution |
|-----------|-------|----------|
| **Modals** | Portal rendering breaks in JSDOM | Mock the modal or use Playwright |
| **Select/Combobox** | Requires user events that don't work | Test logic separately, E2E for UI |
| **DatePicker** | Complex DOM manipulation | Use Playwright |
| **Notifications** | Toast system uses portals | Mock `notifications.show()` |
| **Tabs** | Works, but async issues common | Use `findByRole` with `waitFor` |

### ❌ DON'T WASTE TIME - USE PLAYWRIGHT

| Component Type | Why Playwright? |
|----------------|-----------------|
| **Full Pages** | Too many integrated Mantine components |
| **Form Flows** | Multiple inputs, validation, submission |
| **Navigation** | Router + Tab + Modal combinations |
| **Drag & Drop** | Complex interactions |

---

## 6. Common Mantine Errors & Fixes

### Error 1: "MantineProvider is required"

```
Error: @mantine/core: MantineProvider is required
```

**Fix:** Wrap in MantineProvider (see Section 4)

---

### Error 2: "ResizeObserver is not defined"

```
ReferenceError: ResizeObserver is not defined
```

**Fix:** Add to setup.ts:
```typescript
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
window.ResizeObserver = ResizeObserverMock;
```

---

### Error 3: "matchMedia is not a function"

```
TypeError: window.matchMedia is not a function
```

**Fix:** Add to setup.ts (see Section 3)

---

### Error 4: Modal/Dropdown Not Finding Elements

```
Unable to find an element with the role "dialog"
```

**Cause:** Mantine modals render in portals outside the test container.

**Fix Option 1:** Mock the modal:
```typescript
vi.mock('@mantine/core', async () => {
  const actual = await vi.importActual('@mantine/core');
  return {
    ...actual,
    Modal: ({ children, opened }: any) => opened ? <div role="dialog">{children}</div> : null,
  };
});
```

**Fix Option 2 (Recommended):** Test with Playwright instead.

---

### Error 5: "act() warnings"

```
Warning: An update to Component inside a test was not wrapped in act(...)
```

**Fix:** Use `waitFor` or `findBy` queries:
```typescript
// ❌ Wrong
const button = screen.getByRole('button');

// ✅ Correct
const button = await screen.findByRole('button');
```

---

### Error 6: Tests Hanging/Never Completing

**Cause:** Mantine animations or transitions never completing in JSDOM.

**Fix:** Disable animations:
```typescript
// In your test file or setup
vi.mock('@mantine/core', async () => {
  const actual = await vi.importActual('@mantine/core');
  return {
    ...actual,
    Transition: ({ children, mounted }: any) => mounted ? children({}) : null,
  };
});
```

**Or just use Playwright.**

---

## 7. Template for Testing Mantine Components

### Service Test (No Mantine - Easy)

```typescript
// src/services/badgeService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkFirstTestBadge } from './badgeService';

describe('BadgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should award FIRST_TEST badge on first submission', async () => {
    // Arrange
    const studentId = 'test-student';
    
    // Act
    const result = await checkFirstTestBadge(studentId);
    
    // Assert
    expect(result).toBe(true);
  });
});
```

### Simple Component Test (Light Mantine)

```typescript
// src/components/badges/BadgeDisplay.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/test-utils'; // Our custom render!
import { BadgeDisplay } from './BadgeDisplay';

describe('BadgeDisplay', () => {
  it('renders badge icon and name', () => {
    render(<BadgeDisplay type="FIRST_TEST" earnedAt={Date.now()} />);
    
    expect(screen.getByText('First Test')).toBeInTheDocument();
  });
});
```

### Complex Component Test (Skip to Playwright)

```typescript
// ❌ DON'T DO THIS - Will waste hours
// src/pages/ProfileCompletionPage.test.tsx

// ✅ DO THIS INSTEAD
// e2e/profile-completion.spec.ts
import { test, expect } from '@playwright/test';

test('profile completion flow', async ({ page }) => {
  await page.goto('/profile/complete');
  
  await page.fill('[name="firstName"]', 'John');
  await page.fill('[name="familyName"]', 'Doe');
  // ... rest of form
  
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL('/dashboard');
});
```

---

## 8. Decision Flowchart

```
┌─────────────────────────────────┐
│ What are you testing?           │
└─────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────┐
│ Is it a service/utility/hook?   │
│ (No UI components)              │
└─────────────────────────────────┘
            │
     ┌──────┴──────┐
     │ YES         │ NO
     ▼             ▼
┌─────────┐  ┌─────────────────────────────┐
│ VITEST  │  │ Does it use Mantine heavily? │
│ (easy)  │  │ (Modal, Select, DatePicker)  │
└─────────┘  └─────────────────────────────┘
                       │
                ┌──────┴──────┐
                │ YES         │ NO
                ▼             ▼
         ┌───────────┐  ┌─────────────────────┐
         │ PLAYWRIGHT│  │ Try Vitest first    │
         │ (don't    │  │ (give it 30 min max)│
         │ waste time)│  └─────────────────────┘
         └───────────┘           │
                                 ▼
                          ┌───────────────┐
                          │ Still stuck?  │
                          └───────────────┘
                                 │
                          ┌──────┴──────┐
                          │ YES         │ NO
                          ▼             ▼
                   ┌───────────┐  ┌─────────┐
                   │ PLAYWRIGHT│  │ Done! ✓ │
                   └───────────┘  └─────────┘
```

---

## 9. Updated Task List Testing References

When the task list says:

| Task List Says | What to Use |
|----------------|-------------|
| "Write unit tests for `*Service.ts`" | **Vitest** |
| "Write unit tests for `*Page.tsx`" | **Try Vitest, fallback to Playwright** |
| "Write unit tests for `*Modal.tsx`" | **Playwright** (skip Vitest) |
| "BROWSER TEST (Playwright)" | **Playwright** |
| "RUN: npm test" | `npm run test` or `npx vitest` |

---

## 10. Running Tests

```bash
# Run all Vitest tests
npm run test
# or
npx vitest

# Run specific test file
npx vitest src/services/badgeService.test.ts

# Run in watch mode
npx vitest --watch

# Run Playwright E2E tests
npx playwright test

# Run specific Playwright test
npx playwright test e2e/profile-completion.spec.ts

# Run Playwright with UI (debug mode)
npx playwright test --ui
```

---

## 11. Checklist Before Asking for Help

If tests are failing with Mantine, check:

- [ ] Is `MantineProvider` wrapping the component?
- [ ] Are `ResizeObserver`, `matchMedia`, `IntersectionObserver` mocked?
- [ ] Am I using `findBy` / `waitFor` for async elements?
- [ ] Have I been stuck for more than 30 minutes?
- [ ] Should this be a Playwright test instead?

---

## 12. Example: AdminUserManagementPage

This page has been a pain point. Here's the correct approach:

### ❌ What Was Tried (Failed)
```typescript
// AdminUserManagementPage.test.jsx
// Multiple attempts with Vitest - kept timing out
```

### ✅ What Should Be Done

**1. Extract testable logic into hooks/services:**
```typescript
// src/hooks/useUserManagement.ts
export function useUserManagement() {
  // All the logic here - easily testable
}
```

**2. Test the hook:**
```typescript
// src/hooks/useUserManagement.test.ts
import { renderHook } from '@testing-library/react';
import { useUserManagement } from './useUserManagement';

it('filters users by role', async () => {
  const { result } = renderHook(() => useUserManagement());
  // Test logic, not UI
});
```

**3. E2E test the page:**
```typescript
// e2e/admin-user-management.spec.ts
test('can filter and manage users', async ({ page }) => {
  await page.goto('/admin/users');
  // Test the actual UI in a real browser
});
```

---

## Summary

| If You're... | Do This |
|--------------|---------|
| Testing a service | Vitest ✓ |
| Testing a utility | Vitest ✓ |
| Testing a hook | Vitest ✓ |
| Testing a simple component | Try Vitest, 30 min limit |
| Testing a complex page | Playwright |
| Testing a modal | Playwright |
| Testing form flow | Playwright |
| Stuck for 30+ minutes | STOP → Playwright |

**Remember:** The goal is to verify the implementation works, not to fight testing frameworks.

---

*Created after learning from AdminUserManagementPage testing pain points*
