# Student View Design Standard v1.0
## Unified Design Language for All Student-Facing Pages

**Established:** 2026-02-22
**Status:** ACTIVE — Mandatory for all student views
**Supersedes:** All previous glassmorphism, purple gradient, and AppShell patterns
**CSS Enforcement:** `src/styles/student-view-override.css` (imported globally in `index.css`)
**Root Class:** All student page wrappers MUST use `className="student-view-root"`

---

## 1. Design Philosophy

The student interface follows a **Social Feed** paradigm inspired by Twitter/X. It prioritizes:

- **Clarity** — No visual noise, no decorative gradients, no glassmorphism
- **Focus** — Content-first design where the feed/main content dominates
- **Familiarity** — Social media patterns that students already understand
- **Speed** — Minimal DOM, no backdrop-filter on scrolling content

---

## 2. Color Palette

### Backgrounds
| Token            | Value     | Usage                        |
|------------------|-----------|------------------------------|
| `bg-page`        | `#f3f4f6` | Page/body background         |
| `bg-surface`     | `#ffffff` | Cards, feed items, sidebars  |
| `bg-surface-alt` | `#f9fafb` | Nested cards, widget bg      |
| `bg-hover`       | `#e5e7eb` | Hover state on nav items     |
| `bg-input`       | `#e5e7eb` | Search bar, input backgrounds|

### Text
| Token          | Value     | Usage                     |
|----------------|-----------|---------------------------|
| `text-primary` | `#111827` | Headings, active nav, bold |
| `text-body`    | `#374151` | Body text, descriptions    |
| `text-muted`   | `#6b7280` | Subtitles, metadata        |
| `text-dim`     | `#9ca3af` | Timestamps, placeholders   |

### Accents
| Token            | Value     | Usage                        |
|------------------|-----------|------------------------------|
| `accent-primary` | `#4f46e5` | Primary buttons, active tab  |
| `accent-hover`   | `#4338ca` | Button hover state           |
| `accent-light`   | `#a5b4fc` | Disabled button bg           |
| `accent-badge`   | `#6366f1` | Notification badges          |

### Semantic Colors
| Token            | Value     | Usage                       |
|------------------|-----------|-----------------------------|
| `success-bg`     | `#d1fae5` | Success avatar bg           |
| `success-text`   | `#059669` | Success text, scores        |
| `success-border` | `#a7f3d0` | Success card border         |
| `info-bg`        | `#dbeafe` | Info avatar bg              |
| `info-text`      | `#2563eb` | Info text                   |
| `warning-bg`     | `#fef3c7` | Warning/homework avatar bg  |
| `warning-text`   | `#d97706` | Warning text                |
| `error-text`     | `#dc2626` | Error messages              |
| `overdue-text`   | `#e11d48` | Overdue date text           |

### ❌ BANNED Colors
- **NO** `#667eea` (legacy blue)
- **NO** `#764ba2` (legacy purple)
- **NO** Any `linear-gradient` on backgrounds
- **NO** Purple, violet, lavender as primary colors
- **NO** `var(--gradient-light-bg)` or any CSS variable gradient on student pages

---

## 3. Typography

### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```
Load via Google Fonts: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap`

### Scale
| Role           | Size       | Weight | Letter-spacing |
|----------------|------------|--------|----------------|
| Logo/Brand     | `1.5rem`   | 800    | `-0.02em`      |
| Page Header    | `1.25rem`  | 700    | —              |
| Nav Item       | `1.125rem` | 500/700| —              |
| Widget Title   | `1.125rem` | 700    | —              |
| Feed Title     | `0.95rem`  | 700    | —              |
| Body Text      | `0.938rem` | 400    | —              |
| Widget Item    | `0.875rem` | 700    | —              |
| Timestamp      | `0.875rem` | 400    | —              |
| Label/Badge    | `0.75rem`  | 600/700| `0.05em`       |

---

## 4. Layout Structure

### Desktop (≥1025px): 3-Column
```
┌─────────────────────────────────────────────────────────┐
│          max-width: 1280px, centered, flex              │
├──────────┬──────────────────────────┬───────────────────┤
│  LEFT    │      CENTER FEED         │   RIGHT PANEL     │
│  256px   │      max-width: 600px    │   320px           │
│  sticky  │      border-left/right   │   sticky          │
│  100vh   │      content scrolls     │   top: 24px       │
└──────────┴──────────────────────────┴───────────────────┘
```
**CRITICAL: Structural Parity.** Do not omit the Right Panel element on pages with less content. To maintain the grid illusion and prevent the center feed from floating off-center, an empty or minimalist Right Panel (`<aside style={{ width: 320, flexShrink: 0 }}>`) must still exist to lock the architecture in place. Do not use `justifyContent: 'center'` as a shortcut.

### Tablet (769px–1024px): Feed Only
- Both sidebars hidden (`display: none`)
- Center feed spans full width

### Mobile (≤768px): Feed + Off-canvas
- Center feed full width with `margin-top: 56px`
- Fixed mobile header: hamburger | brand | calendar icon
- Left sidebar: off-canvas from left, `z-index: 1000`
- Right panel: off-canvas from right, `z-index: 1000`
- Backdrop: `rgba(0,0,0,0.3)`, `z-index: 999`
- **Mutual exclusion**: opening one sidebar closes the other
- Slide animations use `transform: translateX()` (GPU-composited)

---

## 5. Component Patterns

### 5.1 Left Sidebar Navigation
- Logo at top: bold brand text
- Nav items: `display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-radius: 999px;`
- Hover: `background: #e5e7eb`
- Active: `font-weight: 700; color: #111827`
- Icons: SVG, 24×24, `currentColor`
- "Join Class" CTA: full-width pill button at bottom
- User profile summary: avatar + name + email at very bottom

### 5.2 Sticky Feed Header
```css
position: sticky;
top: 0;
z-index: 10;
background: rgba(255,255,255,0.92);
backdrop-filter: blur(12px);
border-bottom: 1px solid #e5e7eb;
padding: 16px;
```

### 5.3 Filter Tabs
- Horizontal row of buttons, equal flex
- Active tab: `font-weight: 700; color: #111827; border-bottom: 2px solid #4f46e5`
- Inactive: `font-weight: 500; color: #6b7280; border-bottom: 2px solid transparent`

### 5.4 Feed Article
```
┌──────────────────────────────────────────┐
│ [Avatar 48px]  Title · timestamp         │
│                Body message text          │
│                ┌─────────────────────┐    │
│                │ Nested action card  │    │
│                └─────────────────────┘    │
└──────────────────────────────────────────┘
```
- Avatar: 48×48, round, colored background per notification type
- Hover: `background: #f9fafb`
- Border-bottom: `1px solid #e5e7eb`
- Nested cards: for scores (`#ecfdf5` bg, green) or actions (`#f9fafb` bg)

### 5.5 Right Panel Widgets
- Search bar: `background: #e5e7eb; border-radius: 999px; padding: 12px 16px`
- Widget card: `background: #f9fafb; border-radius: 16px; border: 1px solid #e5e7eb; padding: 16px`
- "Show more" link: `color: #4f46e5; font-size: 0.875rem`

### 5.5.1 No Double-Framed Widgets
- Self-framed widgets must not be nested inside another bordered card or section shell.
- If a child component already includes its own card, border, radius, title row, or progress shell, the parent should provide spacing only, not another framed wrapper.
- Use either a parent section shell with unframed child content, or a self-framed child widget directly. Never both.
- Before shipping a student page, scan for any section where the same title or frame appears twice. If a component is visually complete on its own, do not wrap it in another card.
### 5.6 Modal Dialog
- Backdrop: `rgba(0,0,0,0.3)`
- Card: `background: white; border-radius: 16px; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.15)`
- Centered with `position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%)`
- Buttons: pill-shaped (`border-radius: 999px`)

### 5.7 Empty States
- Center-aligned, generous padding (60px top)
- Large emoji (3.5rem)
- Bold heading, muted subtitle
- Primary CTA button

### 5.8 Buttons
| Variant   | Background  | Color   | Border               | Radius |
|-----------|-------------|---------|----------------------|--------|
| Primary   | `#4f46e5`   | white   | none                 | 999px  |
| Secondary | `#111827`   | white   | none                 | 999px  |
| Outline   | white       | `#374151`| `1px solid #d1d5db` | 999px  |
| Ghost     | transparent | `#4f46e5`| none                 | 999px  |

---

## 6. Animation Standards

| Animation     | Duration | Easing          | Usage               |
|---------------|----------|-----------------|----------------------|
| Page fade-in  | 200ms    | ease-out        | View transitions     |
| Hover bg      | 150ms    | —               | Nav items, cards     |
| Sidebar slide | 300ms    | ease-in-out     | Mobile off-canvas    |
| Button hover  | 200ms    | —               | Color transitions    |

### ❌ BANNED Animations
- **NO** `float` animation (bobbing up and down)
- **NO** `shimmer` animation
- **NO** `gradientShift` animation
- **NO** `translateY(-4px)` card hover lift (too decorative)

---

## 7. What NOT To Use on Student Pages

### ❌ Banned Components & Patterns
- `AppShell` from Mantine (use custom HTML layout)
- `ThemeIcon` from Mantine (use plain SVG or colored `<div>`)
- Glassmorphism classes: `.glass`, `.glass-card`, `.glass-strong`, `.glass-subtle`
- Gradient backgrounds: `linear-gradient`, `radial-gradient`, `var(--gradient-*)`
- `background-attachment: fixed` mesh gradients
- Colored scrollbar thumbs
- `box-shadow` with colored tints (lavender/rose/sky shadows)
- Mantine `Tabs` component (use custom filter tabs)
- Emoji-based navigation icons (use SVGs)

### ✅ Allowed Components & Patterns
- `Loader` — for loading states
- `Badge` — for notifications/status (Mantine)
- `useMediaQuery` — **CRITICAL**: When using this hook, do not initialize with a hardcoded `false`. To prevent SSR layout flashes (where mobile UI renders before desktop), initialize it lazily: `useState(() => typeof window !== 'undefined' ? window.matchMedia(query).matches : false)`.
- Any Mantine utility hooks (`useDebouncedValue`, `useDisclosure`, etc.)

---

## 8. Reference Implementation

The canonical implementation is:
```
src/pages/StudentDashboardPage.jsx
```

All new student pages MUST reference this file for:
- Color values and tokens
- SVG icon definitions
- Component patterns and hover states
- Layout structure and mobile responsiveness
- Feed article rendering pattern

---

## 9. Page-Specific Adaptations

When building other student pages (Library, Homework, Courses, Academic Record):

1. **Keep the same left sidebar** — Extract it to a shared component
2. **Keep the same color palette** — No page-specific colors
3. **Keep the same typography** — Inter font, same scale
4. **Adapt the center column** — Page-specific content replaces the feed
5. **Right panel is optional** — Can be omitted on pages that don't need it
6. **Mobile patterns stay the same** — Same breakpoints, same off-canvas behavior

---

## 10. Migration Checklist for Existing Student Pages

When migrating an existing student page to this standard:

- [ ] Replace `AppShell` with custom 3-column layout
- [ ] Remove all `#667eea` / `#764ba2` color references
- [ ] Remove all `linear-gradient` backgrounds
- [ ] Remove glassmorphism classes and backdrop-filter on cards
- [ ] Replace emoji icons with SVGs
- [ ] Override `body` background: `body { background: #f3f4f6 !important; }`
- [ ] Add Inter font import
- [ ] Use pill-shaped buttons (`border-radius: 999px`)
- [ ] Implement mobile responsive breakpoints
- [ ] Test on mobile (off-canvas sidebars work)
- [ ] Root `<div>` has `className="student-view-root"`
- [ ] CSS override file imported in `index.css` (`student-view-override.css`)

---

## 11. CSS Override Layer (Code-Level Enforcement)

### Why This Exists
Documentation alone cannot prevent AI agents from copying old patterns. The CSS override layer is a **code-level guarantee** that ALL legacy patterns are neutralized on any element inside `.student-view-root`.

### How It Works
1. `src/styles/student-view-override.css` is imported globally in `index.css`
2. It uses `body:has(.student-view-root)` to override the body gradient
3. It uses `.student-view-root .glass`, `.student-view-root .gradient-bg`, etc. to neutralize ALL legacy classes
4. It defines CSS custom properties (`--sv-*`) for the new design tokens

### Required: Root Class
**Every student page MUST wrap its content in:**
```jsx
<div className="student-view-root" style={S.root}>
  {/* Page content */}
</div>
```

This single class activates ALL CSS overrides automatically — even if the page still uses legacy Mantine components, the visual output will be flat/neutral.

### CSS Custom Properties Available
```css
--sv-bg-page: #f3f4f6;
--sv-bg-surface: #ffffff;
--sv-bg-surface-alt: #f9fafb;
--sv-bg-hover: #e5e7eb;
--sv-text-primary: #111827;
--sv-text-body: #374151;
--sv-text-muted: #6b7280;
--sv-accent: #4f46e5;
--sv-accent-hover: #4338ca;
--sv-border: #e5e7eb;
--sv-radius-pill: 999px;
--sv-radius-card: 16px;
```

### What Gets Neutralized Automatically
- `.glass`, `.glass-card`, `.glass-strong` → flat white with subtle border
- `.gradient-bg` → flat background
- `.card-lavender`, `.card-rose` → flat white
- `.shadow-glass` → subtle shadow
- `.text-gradient` → solid dark text
- Card hover lift → disabled
- Float/shimmer animations → disabled
- Gradient scrollbar → neutral gray

---

## 12. Legacy File Deprecation Banners

All 13 existing legacy student files have a banner comment at the top:
```
/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  ⚠️  STUDENT VIEW DESIGN STANDARD v1.0 — ACTIVE       ║
 * ║  This file uses LEGACY styling that is DEPRECATED.     ║
 * ║  🚫 DO NOT copy styles from this file.                 ║
 * ║  ✅ Reference: src/pages/StudentDashboardPage.jsx       ║
 * ╚══════════════════════════════════════════════════════════╝
 */
```

This ensures any AI reading these files sees the deprecation warning **before** the legacy code.
