---
name: student-view-design
description: Enforces the Student View Design Standard for all student-facing pages. Triggers on any task involving student UI, student pages, student dashboard, student layout, feed design, or activity stream. MUST be read before creating or modifying any student-facing component.
---

# Student View Design Standard (Codex Skill)

> Read `documentation/design/student-view-design-standard.md` for the full specification.
> Primary style anchor: approved Academic Record direction.

## Quick Enforcement Checklist

Before writing ANY code for a student page:

### 1. Shell
- [ ] Preserve the 3-part student shell
- [ ] Left rail, center work area, and right contextual rail still exist structurally
- [ ] Shell reads as one composed workspace, not three hard boxed columns
- [ ] Mobile still uses off-canvas left/right drawers with mutual exclusion

### 2. Tokens
- [ ] Page background: `#f8f9fa`
- [ ] Tonal shell surface: `#f1f4f6`
- [ ] Focus surface: `#ffffff`
- [ ] Text: `#2b3437` / `#586064`
- [ ] Accent: `#4d44e3`
- [ ] Soft outline: `#abb3b7`

### 3. Typography
- [ ] Inter only
- [ ] Strong page titles and compact editorial hierarchy
- [ ] Uppercase micro-labels for tabs, metrics, and metadata

### 4. Components
- [ ] Tabs are slim and editorial
- [ ] Buttons are restrained and compact
- [ ] Lists and tables use soft separators and whitespace
- [ ] Summary metrics use large numerals with quiet labels
- [ ] Right-rail widgets are quieter than center content

### 5. Banned Patterns
- [ ] No `AppShell`
- [ ] No `.glass*`
- [ ] No gradient backgrounds
- [ ] No emoji navigation icons
- [ ] No new `@mantine/*` imports
- [ ] No Mantine `Tabs`
- [ ] No decorative hover-lift or float/shimmer motions
- [ ] No default rigid bordered center column as the shell language

### 6. Layout Integrity (Rules 17–19)
- [ ] **Rule 17 (Flat Row Standard):** All list-based result views must use `AcademicRecordFlatRow`. No new grid-based row components may be introduced for student table surfaces.
- [ ] **Rule 18 (No Fixed Grid Columns):** No `grid-template-columns` with fixed `repeat(N, 1fr)` or hardcoded pixel widths in student-facing table or card surfaces. Use `repeat(auto-fit, minmax(…, 1fr))` or flex layouts instead.
- [ ] **Rule 19 (Hover Consistency):** All interactive rows must implement the `onMouseEnter`/`onMouseLeave` background-transition pattern from `AcademicRecordFlatRow`. No mixing of CSS `:hover` pseudo-classes with inline hover state management.

## Working Rules
- The old v1 social-feed model is no longer the primary design metaphor.
- Academic Record is the visual anchor for tonal layering, metrics, section hierarchy, and shell softness.
- Homework is the model for preserving the 3-part structure without making the layout feel like three hard columns.
- Keep the real page information architecture and interaction structure from the app.
- Right rail remains part of the shell for shell pages even when page-specific content is minimal.

## Root Wrapper
```jsx
return (
  <div className="student-view-root" style={{ background: '#f8f9fa', minHeight: '100vh' }}>
    {/* page content */}
  </div>
);
```

## CSS Override Intent
- `src/styles/student-view-override.css` still neutralizes legacy glass/gradient patterns.
- It must now enforce the v2 editorial tokens, not the old feed-era tokens.
- Shared shell files should align with the v2 standard first, then page-level surfaces should follow.
