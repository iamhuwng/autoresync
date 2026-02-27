---
title: UI Design Standards
createdAt: '2026-02-27T17:10:36.392Z'
updatedAt: '2026-02-27T17:11:05.498Z'
description: >-
  Teacher view (glassmorphism), student view (social feed), color palettes,
  layout systems, avatar/profile, CSS enforcement.
tags:
  - architecture
  - design
  - ui
  - teacher
  - student
  - avatar
  - profile
---
# UI Design Standards Architecture

## Overview

Two distinct design systems coexist in the application: the **Teacher View** (glassmorphism, dark mode, vibrant gradients) and the **Student View** (social feed, flat/clean, earthy tones). This doc covers both and their enforcement mechanisms.

## Teacher View Design

### Design Language
- **Theme:** Glassmorphism with dark mode support
- **Colors:** Purple/blue gradients, vibrant accent colors
- **Effects:** Backdrop blur, semi-transparent borders, soft shadows
- **Typography:** Default system fonts, larger headers

### Color Palette
| Element | Color |
|---------|-------|
| Primary gradient | `#8b5cf6` → `#3b82f6` (purple→blue) |
| Card background | `rgba(255,255,255,0.95)` with color tint |
| Borders | `rgba(139,92,246,0.2)` (semi-transparent) |
| Text | `#1e293b` (dark slate) |
| Shadows | `rgba(139,92,246,0.15)` |

### Key Components
- `Card` component with `variant="glass"` for glassmorphism
- `TeacherHeader` with horizontal inline nav buttons
- `AdminLayout` with fixed sidebar for super_admin
- Two-modal quiz editor (purple left + blue right)

### Teacher Pages
| Page | Layout |
|------|--------|
| TeacherLobbyPage | Full-width with header buttons |
| TeacherClassesPage | TeacherHeader + grid cards |
| SessionManagementPage | TeacherHeader + session list |
| AdminUserManagementPage | AdminLayout + sidebar |

## Student View Design

### Design Language
- **Theme:** Social feed paradigm (Instagram/TikTok-inspired)
- **Colors:** Earthy/forest tones, NO gradients, NO glassmorphism
- **Layout:** 3-column desktop, feed-only tablet, off-canvas mobile
- **Typography:** Inter/system font, compact sizing

### Color Palette (Student View Design Standard)
| Token | Color | Usage |
|-------|-------|-------|
| `--sv-bg` | `#F5F0EB` | Page background |
| `--sv-surface` | `#FFFFFF` | Card surfaces |
| `--sv-primary` | `#2D5A27` | Primary actions (forest green) |
| `--sv-text` | `#1A1A1A` | Body text |
| `--sv-text-muted` | `#6B6B6B` | Secondary text |
| `--sv-border` | `#E0D8CF` | Card borders |
| `--sv-accent-warm` | `#8B4513` | Warm accent |
| `--sv-accent-cool` | `#1B4332` | Cool accent |

### Layout Structure
```
Desktop (>1024px):
┌──────┬────────────────────┬──────┐
│ Left │    Feed/Content     │Right │
│ Nav  │    (scrollable)     │Stats │
│ 240px│      flexible       │280px │
└──────┴────────────────────┴──────┘

Tablet (768-1024px):
┌────────────────────────────────────┐
│         Feed only                  │
│         (full width)               │
└────────────────────────────────────┘

Mobile (<768px):
┌────────────────────────────────────┐
│  Off-canvas nav    Feed            │
│  (hamburger)       (full width)    │
└────────────────────────────────────┘
```

### CSS Enforcement
All student pages must have root class `student-view-root`:
```html
<div className="student-view-root">
  <!-- Student page content -->
</div>
```

CSS overrides in `student-view-override.css` enforce the standard:
```css
.student-view-root {
  --sv-bg: #F5F0EB !important;
  /* ... all CSS variables */
}
.student-view-root .mantine-* {
  /* Override any Mantine leakage */
}
```

### Banned Elements in Student View
❌ Gradients, glassmorphism, neon colors, dark backgrounds, heavy shadows, Mantine components (see @doc/conventions)

## Avatar & Profile System

### Avatar Upload Flow
```
ProfileCompletionForm → AvatarUploader component
  → r2StorageService.uploadAvatar(file)    // Direct permanent
  → Saves to R2: avatars/{userId}/{timestamp}-{filename}
  → URL stored in /users/{uid}/photoURL
```

### Components
| Component | Purpose |
|-----------|---------|
| `AvatarUploader.tsx` | Upload UI with preview, crop |
| `ProfileCompletionForm.tsx` | Full profile form |
| `ProfileDropdown.tsx` | Navbar profile menu |

### Known Bug (FIXED)
Avatars were disappearing after 24h because `uploadImage()` (temp path) was used instead of `uploadAvatar()` (permanent path). See @doc/sop/file-upload-patterns-r2-storage

## Related Docs
- @doc/design/student-view-design-standard — Full student design standard
- @doc/architecture/student-experience-architecture — Student pages architecture
- @doc/sop/student-view-adaptive-layout — Adaptive layout SOP
- @doc/sop/student-ux-improvements — UX improvements SOP
- @doc/sop/two-modal-quiz-editor — Teacher quiz editor design
- @doc/architecture/media-storage-architecture — R2 upload (avatars)
- @doc/conventions — No Mantine rule, Integration Safety
