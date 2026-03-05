---
title: 'Pattern: Collapsible Section with SVG Chevron'
createdAt: '2026-03-05T08:31:29.920Z'
updatedAt: '2026-03-05T08:31:55.728Z'
description: >-
  Reusable pattern for a collapsible/accordion section with a recognizable SVG
  chevron indicator — no Mantine, pure inline styles
tags:
  - pattern
  - ui
  - collapsible
  - accordion
  - no-mantine
---
# Pattern: Collapsible Section with SVG Chevron

> A collapsible accordion section with a prominent, recognizable circular SVG chevron indicator. No Mantine — pure inline styles.

## Problem

A section header needs to communicate it is clickable/collapsible. Small Unicode characters (▾) are not visually significant enough — users don't notice them. Using `@mantine/core` `<Collapse>` or `<Accordion>` is banned per Rule 15.

## Solution

A **circular icon button** containing an inline SVG chevron arrow, placed flush-right on the header row. The circle changes background color and the SVG rotates 180° on open/close.

## Implementation

```tsx
// State
const [sectionOpen, setSectionOpen] = useState(false);

// Header row (clickable)
<div
  onClick={() => setSectionOpen(!sectionOpen)}
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    cursor: 'pointer',
    userSelect: 'none',
    marginBottom: sectionOpen ? '1rem' : 0,
  }}
>
  {/* Left icon */}
  <div style={{ width: 32, height: 32, borderRadius: '8px', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>📋</div>

  {/* Title */}
  <span style={{ flex: 1, fontSize: '1.125rem', fontWeight: 800, color: '#1e293b' }}>
    Section Title
  </span>

  {/* Chevron indicator — the recognizable part */}
  <div style={{
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: sectionOpen ? '#ede9fe' : '#f1f5f9',   // purple tint when open
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.2s ease, background 0.2s ease',
    transform: sectionOpen ? 'rotate(180deg)' : 'rotate(0)',
    flexShrink: 0,
  }}>
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={sectionOpen ? '#7c3aed' : '#64748b'}   // purple when open
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </div>
</div>

{/* Collapsible body */}
{sectionOpen && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
    {/* ... content */}
  </div>
)}
```

## Behavior

| State | Circle bg | Chevron color | Chevron rotation | marginBottom on header |
|-------|-----------|---------------|------------------|------------------------|
| Closed | `#f1f5f9` (grey) | `#64748b` (grey) | `0deg` (pointing down) | `0` |
| Open | `#ede9fe` (light purple) | `#7c3aed` (purple) | `180deg` (pointing up) | `1rem` |

## Design Decisions

- **Circle not just arrow** — the 28px circle creates a significantly larger hit target and visual affordance vs. a bare Unicode character
- **Color shift on open** — purple tint on the circle reinforces "this is active/selected" state
- **`flexShrink: 0`** — prevents the circle from being squeezed on narrow viewports
- **`marginBottom` on header, not wrapper** — lets the header control its own spacing via the open/closed gap rather than animating height (no Mantine `<Collapse>`)
- **Default closed** — secondary sections (like "Kết quả theo phần") start collapsed to reduce information density

## Pitfalls

- **Don't use text chevrons (▾, ▸)** — they're not visually distinct enough as interactive indicators
- **Don't `rotate` the entire header row** — only rotate the chevron container
- **Don't wrap in `<button>`** if the header has nested interactive elements — use `div` + `onClick` + `cursor: pointer`

## Source

Integrated March 2026 — `src/components/results/ResultDetailModal.tsx` (Kết quả theo phần section)
