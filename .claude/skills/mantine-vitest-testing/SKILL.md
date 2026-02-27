---
name: mantine-vitest-testing
description: Use this skill when writing Vitest tests for React components that use Mantine UI library (v7+). Covers MantineProvider setup, hook mocking, service mocking patterns, and common pitfalls. Triggers on tasks involving testing Mantine components, fixing MantineProvider errors, or debugging test failures in Mantine-based apps.
---

# Mantine + Vitest Testing Patterns

## Overview

Testing React components built with Mantine UI requires special handling due to:
- MantineProvider context dependency
- Internal cross-package dependencies (`@mantine/core` ↔ `@mantine/hooks`)
- Portal-based components (Modals, Popovers)
- Subscription-based hooks in child components

## Critical Rule: Never Fully Mock @mantine/hooks

`@mantine/core`'s `MantineProvider` internally imports from `@mantine/hooks`:
- `useIsomorphicEffect` → used by `use-respect-reduce-motion`
- `useColorScheme` → used by `use-computed-color-scheme`, `use-mantine-color-scheme`
- `useMediaQuery` → used by `use-matches`

### ❌ WRONG — Breaks MantineProvider
```js
vi.mock('@mantine/hooks', () => ({
    useMediaQuery: vi.fn(() => false)
}));
```
This replaces ALL exports, removing hooks that MantineProvider depends on internally.

### ✅ CORRECT — Partial Mock
```js
vi.mock('@mantine/hooks', async () => {
    const actual = await vi.importActual('@mantine/hooks');
    return {
        ...actual,
        useMediaQuery: vi.fn(() => false)
    };
});
```
This preserves all real hooks and only overrides the one you need.

## Standard Test Setup Pattern

### renderWithProviders Helper
```jsx
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';

const renderWithProviders = (ui) => render(
    <MantineProvider>
        <BrowserRouter>
            {ui}
        </BrowserRouter>
    </MantineProvider>
);
```

Every test must use this helper. Raw `render(<Component />)` will crash with `MantineProvider was not found in component tree`.

### Service Mock Patterns

#### Firebase Subscription Services
Services that return unsubscribe functions MUST be mocked to return functions:

```js
// ❌ Auto-mock returns undefined — crashes on cleanup
vi.mock('../services/notificationService');

// ✅ Factory mock with proper return types
vi.mock('../services/notificationService', () => ({
    subscribeToNotifications: vi.fn((_userId, cb) => {
        cb([]); // fire callback with empty data
        return () => {}; // return unsubscribe function
    }),
    getPaginatedUserNotifications: vi.fn().mockResolvedValue({
        notifications: [],
        hasMore: false,
        lastKey: undefined
    }),
    markNotificationAsRead: vi.fn().mockResolvedValue({ success: true }),
    markAllNotificationsAsRead: vi.fn().mockResolvedValue({ success: true }),
}));
```

#### vi.clearAllMocks() vs Factory Mocks
`vi.clearAllMocks()` clears mock history AND implementations set via `vi.spyOn`.
Factory mock implementations (defined in `vi.mock(() => ...)`) are also cleared.

**Solution:** Re-set factory mock defaults in `beforeEach` after `clearAllMocks`:
```js
beforeEach(() => {
    vi.clearAllMocks();

    // Re-set defaults after clearAllMocks
    notificationService.getPaginatedUserNotifications.mockResolvedValue({
        notifications: [], hasMore: false, lastKey: undefined
    });
    notificationService.subscribeToNotifications.mockImplementation((_userId, cb) => {
        cb([]);
        return () => {};
    });
});
```

## Mock Complex Child Components

When a component renders deep component trees with many Mantine dependencies (like a header with notification bell, popover, modal), mock the entire child:

```js
vi.mock('../components/navigation', () => ({
    StudentHeader: ({ pageTitle }) => <div data-testid="student-header">{pageTitle}</div>
}));
```

This eliminates cascading failures from deep Mantine trees while keeping your tests focused.

## Text Matching Pitfalls

### Duplicate Text in UI
Navigation items, filter tabs, and content areas often share labels ("Courses", "Homework", etc.).

```js
// ❌ Fails when text appears in sidebar AND filter tabs
expect(screen.getByText('Courses')).toBeInTheDocument();

// ✅ Handles multiple occurrences
expect(screen.getAllByText('Courses').length).toBeGreaterThanOrEqual(1);

// ✅ Better: use more specific queries
expect(screen.getByRole('tab', { name: 'Courses' })).toBeInTheDocument();
```

## Cleanup Between Tests

Always add explicit cleanup to prevent React state leaking:
```js
import { cleanup } from '@testing-library/react';

afterEach(() => {
    cleanup();
});
```

## Debugging Checklist

When tests fail with `MantineProvider was not found`:
1. ✅ Is the component wrapped in `<MantineProvider>`?
2. ✅ Is `@mantine/hooks` using a **partial** mock (not full replacement)?
3. ✅ Are ALL `render()` calls using `renderWithProviders()`? (Check for stragglers)
4. ✅ Are subscription services returning functions, not `undefined`?
5. ✅ Are factory mock defaults re-set after `vi.clearAllMocks()`?
6. ✅ Are complex Mantine child components mocked as simple divs?
