---
title: 'Pattern: CSS-Only Mobile Card vs Desktop Table'
createdAt: '2026-03-13T19:19:34.473Z'
updatedAt: '2026-03-13T19:20:32.671Z'
description: >-
  Render both card and table layouts in the DOM, toggle visibility via CSS media
  queries. Zero JS breakpoint detection, no re-rendering on resize. Standard for
  responsive data tables.
tags:
  - pattern
  - css
  - responsive
  - mobile
  - table
---
# Pattern: CSS-Only Mobile Card vs Desktop Table

## Problem

Data tables don't work on mobile. The options are:
1. Horizontal scroll (bad UX)
2. JS breakpoint detection + conditional rendering (re-renders, lag)
3. CSS-only toggle (this pattern ✅)

## Solution

Render both layouts in the DOM. Use CSS `display` toggles with media queries:

```tsx
<div className="hw-desktop-table">
    <table>
        <thead>...</thead>
        <tbody>{data.map(renderRow)}</tbody>
    </table>
</div>

<div className="hw-mobile-cards">
    {data.map(renderCard)}
</div>
```

```css
/* Desktop: show table, hide cards */
.hw-desktop-table { display: block; }
.hw-mobile-cards { display: none; }

@media (max-width: 768px) {
    .hw-desktop-table { display: none; }
    .hw-mobile-cards { display: flex; flex-direction: column; gap: 8px; }
}
```

## Benefits

| Benefit | Why |
|---------|-----|
| No JS breakpoint detection | Zero overhead from `resize` listeners or `matchMedia` |
| No re-rendering on resize | Both layouts are always in DOM — just visibility toggle |
| Instant transition | No flash of content when crossing breakpoint |
| SSR-safe | Works correctly on server-side rendered pages |

## Related Patterns

### Bottom Sheet Action Menu
Action menu dropdown → bottom sheet on mobile:

```css
.action-menu-backdrop { display: none; }  /* Hidden on desktop */

@media (max-width: 768px) {
    .action-menu-backdrop { display: block; position: fixed; inset: 0; }
    .action-menu-dropdown {
        position: fixed !important;
        bottom: 0; left: 0; right: 0;
        animation: slideUpSheet 0.25s ease-out;
    }
}
```

### Full-Screen Modal on Mobile
```css
@media (max-width: 768px) {
    .modal-fullscreen-mobile {
        width: 100vw !important;
        height: 100vh !important;
        max-width: none !important;
        border-radius: 0 !important;
    }
}
```

## Anti-Pattern

```typescript
// ❌ BAD: JS breakpoint detection
const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
}, []);

// Causes re-render on every resize event!
return isMobile ? <MobileCards /> : <DesktopTable />;
```

## Standard

> CSS media queries with `display` toggles for responsive layouts.
> Do NOT use JavaScript breakpoint detection or `window.innerWidth` checks.

## Source

- `HomeworkSubmissionTable.tsx` — desktop table + mobile cards
- PRD-0034 Teacher Homework Management Overhaul
