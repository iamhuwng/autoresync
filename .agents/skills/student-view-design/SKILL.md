---
name: student-view-design
description: Enforces the Student View Design Standard for all student-facing pages. Triggers on any task involving student UI, student pages, student dashboard, student layout, feed design, or activity stream. MUST be read before creating or modifying any student-facing component.
---

# Student View Design Standard (Codex Skill)

> Read `documentation/design/student-view-design-standard.md` for the full specification.
> Reference implementation: `src/pages/StudentDashboardPage.jsx`

## Quick Enforcement Checklist

Before writing ANY code for a student page:

### 1. Layout
- [ ] Uses 3-column flexbox layout (NOT Mantine AppShell)
- [ ] Left sidebar: 256px, sticky, full-height
- [ ] Center: max-width 600px, bordered left/right
- [ ] Right panel: 320px, sticky
- [ ] Mobile (≤768px): off-canvas sidebars with transform animations

### 2. Colors
- [ ] Page background: `#f3f4f6`
- [ ] Card/surface: `#ffffff`
- [ ] Text: `#111827` (heading), `#374151` (body), `#6b7280` (muted)
- [ ] Accent: `#4f46e5` (primary), `#4338ca` (hover)
- [ ] **NO purple** (`#667eea`, `#764ba2`), **NO gradients**, **NO glassmorphism**

### 3. Typography
- [ ] Font: Inter (Google Fonts import)
- [ ] Logo: 1.5rem/800weight, Page header: 1.25rem/700w
- [ ] Body: 0.938rem/400w, Labels: 0.75rem/600w

### 4. Components
- [ ] Navigation: SVG icons (24×24), pill-shaped items, bold active state
- [ ] Buttons: pill-shaped (border-radius: 999px)
- [ ] Feed items: 48px circular avatars, nested action cards
- [ ] Sticky header: white-92% opacity + backdrop-filter blur
- [ ] Widgets: rounded cards with #f9fafb background

### 5. Banned Patterns
- [ ] ❌ No `AppShell`
- [ ] ❌ No `.glass` / `.glass-card`
- [ ] ❌ No `linear-gradient` backgrounds
- [ ] ❌ No emoji navigation icons
- [ ] ❌ No `ThemeIcon`
- [ ] ❌ No Mantine `Tabs` (use custom filter tabs)
- [ ] ❌ No float/shimmer/gradientShift animations

## SVG Icon Template
```jsx
const IconExample = () => (
  <svg style={{ width: 24, height: 24 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="..." />
  </svg>
);
```

## Feed Article Template
```jsx
<article style={{
  padding: 16,
  borderBottom: '1px solid #e5e7eb',
  background: 'white',
  cursor: 'pointer',
  transition: 'background 0.15s'
}}>
  <div style={{ display: 'flex', gap: 12 }}>
    <div style={{
      width: 48, height: 48, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#d1fae5', color: '#059669', fontWeight: 700
    }}>
      {/* Icon or letter */}
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h3 style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>Title</h3>
        <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>· 2h</span>
      </div>
      <p style={{ fontSize: '0.938rem', color: '#374151', lineHeight: 1.5 }}>Body text</p>
    </div>
  </div>
</article>
```

## Widget Card Template
```jsx
<div style={{
  background: '#f9fafb',
  borderRadius: 16,
  padding: 16,
  border: '1px solid #e5e7eb'
}}>
  <h3 style={{ fontWeight: 700, fontSize: '1.125rem', margin: '0 0 12px' }}>Widget Title</h3>
  {/* Content */}
</div>
```

## CSS Enforcement (Code-Level Protection)

> Legacy patterns cannot be visually expressed inside `.student-view-root`

### MANDATORY Root Wrapper
```jsx
// EVERY student page component must have this:
return (
  <div className="student-view-root" style={{ background: '#f3f4f6', minHeight: '100vh' }}>
    {/* Page content */}
  </div>
);
```

### What Happens Automatically
- `src/styles/student-view-override.css` is imported globally in `index.css`
- Inside `.student-view-root`, ALL `.glass*`, `.gradient-bg`, `.card-*`, `.shadow-glass*` classes → flat white
- `body` background → `#f3f4f6`
- Card hover lift → disabled
- Float/shimmer animations → disabled

### ⚠️ Legacy Files Have Banners
13 student files have deprecation banners. When you see:
```
⚠️ STUDENT VIEW DESIGN STANDARD v1.0 — ACTIVE
🚫 DO NOT copy styles from this file.
```
**STOP.** Use `StudentDashboardPage.jsx` as reference instead.
