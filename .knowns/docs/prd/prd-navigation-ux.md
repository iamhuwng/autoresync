---
title: PRD Navigation UX
createdAt: '2026-02-27T15:27:54.548Z'
updatedAt: '2026-02-27T15:27:56.032Z'
description: Product requirements for navigation UX improvements
tags:
  - prd
  - navigation
  - ux
---
# PRD: Navigation UX Improvement for Teacher & Super Admin Interfaces

**Document ID**: 0017-prd-navigation-ux-improvement  
**Created**: 2026-02-02  
**Status**: Draft  
**Priority**: High  
**Estimated Effort**: Medium (3-5 days)

---

## 1. Introduction / Overview

The current navigation system in the Teacher and Super Admin interfaces is inconsistent and unintuitive. Different pages use different header patterns, navigation items are not logically grouped, and there's no clear visual hierarchy. This creates a fragmented user experience that makes it difficult for users to navigate efficiently.

### Problem Statement

| Issue | Impact |
|-------|--------|
| **Inconsistent headers** across pages | Users must re-learn navigation on each page |
| **No logical grouping** of navigation items | Hard to find related features |
| **Mixed navigation patterns** (inline buttons, back buttons only, no nav at all) | Confusing mental model |
| **No breadcrumbs** | Users lose context of where they are |
| **Super admin uses teacher layouts** | Blurred role boundaries |

### Current State

| Page | Current Navigation | Problem |
|------|-------------------|---------|
| TeacherLobbyPage | Inline: Students, Classes, Courses, Sessions, Notifications, Logout | No grouping, icons everywhere |
| TeacherClassesPage | Back to Lobby + Title only | No quick access to other sections |
| TeacherCoursesPage | Back + Logout (AdminHeader) | Inconsistent with Lobby |
| TeacherStudentsPage | AdminPageLayout (Back + Logout) | Reuses admin layout confusingly |
| AdminUserManagementPage | AdminHeader (Back + Logout) | No admin dashboard, no sidebar |

---

## 2. Goals

### Primary Goals

1. **Consistent Navigation** - All teacher pages share the same header structure
2. **Logical Grouping** - Navigation items are visually separated by purpose
3. **Role-Based Navigation** - Super admin gets a dedicated sidebar; teachers get improved inline navigation
4. **Breadcrumb Navigation** - Users always know where they are and how to go back
5. **Mobile Responsive** - Hamburger menu on mobile with same flat structure

### Success Criteria

- [ ] All teacher pages use unified `TeacherHeader` component
- [ ] All super admin pages use unified `AdminSidebar` component
- [ ] Breadcrumbs visible on all pages except root
- [ ] Back button navigates to breadcrumb parent (not browser history)
- [ ] Mobile hamburger menu works on all pages
- [ ] No icons in navigation buttons (text-only)
- [ ] Zero regression in existing functionality

---

## 3. User Stories

### Teacher Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| T1 | As a **teacher**, I want to see all my navigation options in one consistent header, so I don't get confused when switching pages. | Header looks the same on all teacher pages |
| T2 | As a **teacher**, I want navigation items grouped by purpose, so I can find what I need quickly. | Visual dividers separate: Materials, Management, Activity, User actions |
| T3 | As a **teacher**, I want breadcrumbs showing my location, so I always know where I am. | Breadcrumbs show: `Materials > Classes > Class Detail` |
| T4 | As a **teacher**, I want the back button to go to the parent page, so navigation is predictable. | Back on Class Detail → Classes list |
| T5 | As a **teacher** on mobile, I want a hamburger menu, so I can access all navigation on small screens. | Menu icon reveals flat list of all nav items |

### Super Admin Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| A1 | As a **super admin**, I want a dedicated sidebar, so I can access admin-specific features easily. | Left sidebar with admin navigation |
| A2 | As a **super admin**, I want to stay in admin mode even when viewing teacher-like content, so my context is consistent. | Sidebar persists on all pages |
| A3 | As a **super admin**, I want my own routes for user management, so there's clean separation from teacher routes. | `/admin/users`, `/admin/courses`, etc. |

---

## 4. Functional Requirements

### 4.1 Teacher Navigation (Improved Inline Header)

**FR-T01**: Create a unified `TeacherHeader` component with:
- Left section: **Back button** (only when not on Materials page) + **Page Title**
- Center/Main section: Navigation buttons with visual grouping
- Right section: **Notifications** + **Logout**

**FR-T02**: Navigation button structure (no icons, text only):

```
[Materials] | [Students] [Classes] [Courses] | [Sessions] | [🔔] [Logout]
    ↑              ↑                               ↑           ↑
 Primary      Management Group              Activity      User Actions
```

**FR-T03**: Visual grouping via subtle dividers:
- Use `1px solid rgba(203, 213, 225, 0.5)` vertical dividers
- 16px horizontal spacing between groups
- 8px spacing within groups

**FR-T04**: Active state indication:
- Current page button has `variant="primary"` styling
- Other buttons use `variant="glass"` styling

**FR-T05**: Breadcrumb component:
- Show below header: `Materials > Classes > Math 101`
- Clickable links except for current page
- Only shows on pages deeper than root (Materials)

**FR-T06**: Back button behavior:
- Navigates to parent in page hierarchy (not browser history)
- Hidden on Materials page (root for teachers)
- Label: "Back" (no destination in label)

### 4.2 Super Admin Navigation (Dedicated Sidebar)

**FR-A01**: Create `AdminSidebar` component with:
- Fixed left sidebar (240px width on desktop)
- Collapsible to icon-only (64px) mode
- Logo/branding at top

**FR-A02**: Sidebar navigation structure:

```
📊 Dashboard (future)
─────────────────────
👥 Users
📚 Courses
🏫 Classes  
👨‍🎓 Students
─────────────────────
📊 Sessions
📈 Analytics (future)
─────────────────────
⚙️ Settings (future)
🚪 Logout
```

**FR-A03**: Sidebar behavior:
- Always visible (persists across all admin pages)
- Highlights current page
- Breadcrumbs still appear in main content area

**FR-A04**: Admin routes (clean separation from teacher routes):

| Admin Route | Purpose | Teacher Equivalent |
|-------------|---------|-------------------|
| `/admin/dashboard` | Admin home (future) | N/A |
| `/admin/users` | User management | `/teacher/students` |
| `/admin/courses` | All courses | `/teacher/courses` |
| `/admin/classes` | All classes | `/teacher/classes` |
| `/admin/sessions` | All sessions | `/sessions` |

**FR-A05**: Admin-only top bar:
- Contains: Search bar + Notifications + User profile dropdown
- No navigation buttons (sidebar handles navigation)

### 4.3 Mobile Responsiveness

**FR-M01**: Breakpoint: `≤768px` triggers mobile mode

**FR-M02**: Mobile hamburger menu:
- Icon button replaces all navigation
- Opens full-screen overlay or slide-in drawer
- Contains flat list of all navigation items (same as desktop)

**FR-M03**: Mobile back button:
- Always visible (not hidden in menu)
- Positioned left of hamburger icon

**FR-M04**: Mobile breadcrumbs:
- Condensed format: `... > Parent > Current`
- Only show last 2 levels on small screens

### 4.4 Breadcrumb System

**FR-B01**: Create `Breadcrumbs` component with:
- Path based on page hierarchy (not navigation history)
- Separator: ` > ` (chevron alternative: `›`)

**FR-B02**: Page hierarchy definition:

```
Teacher Hierarchy:
Materials (root)
├── Students
├── Classes
│   └── Class Detail (classId)
├── Courses
│   └── Course Detail (courseId)
└── Sessions
    ├── Test Monitor (sessionCode)
    └── Test Results (sessionCode)

Admin Hierarchy:
Dashboard (root)
├── Users
├── Courses
│   └── Course Detail (courseId)
├── Classes
│   └── Class Detail (classId)
└── Sessions
```

**FR-B03**: Dynamic breadcrumb data:
- Fetch entity names for IDs (e.g., "Math 101" instead of just `classId`)
- Cache fetched names to prevent redundant requests

### 4.5 Notification Bell

**FR-N01**: Keep existing `NotificationBell` component
**FR-N02**: Position: Always in right section of header
**FR-N03**: Only show bell icon (no text label)

---

## 5. Non-Goals (Out of Scope)

| Excluded | Reason |
|----------|--------|
| Student navigation changes | Focus is on teacher/admin interfaces |
| Dashboard page creation | Marked as "future" - Materials serves as hub |
| Settings page | Marked as "future" |
| Analytics page | Marked as "future" |
| Sidebar collapse animation | Nice-to-have, not critical |
| Search functionality in admin | Can be added later |
| Keyboard navigation | Accessibility improvement, separate initiative |

---

## 6. Design Considerations

### 6.1 Visual Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Minimalist** | No icons in nav buttons (text only) |
| **Consistent** | Same header component on all teacher pages |
| **Grouped** | Subtle dividers between navigation groups |
| **Responsive** | Hamburger menu on mobile |
| **Contextual** | Active page highlighted, breadcrumbs show location |

### 6.2 Teacher Header Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [← Back]  Page Title     │ Materials │ Students Classes Courses │ Sessions │ 🔔 Logout │
└─────────────────────────────────────────────────────────────────────────────┘
│ Materials > Classes > Math 101                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Admin Sidebar Layout

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│              │  [🔍 Search...]                              🔔  👤 Admin ▼  │
│  🎓 EduApp   ├──────────────────────────────────────────────────────────────┤
│              │  Dashboard > Users                                            │
│ ─────────────│──────────────────────────────────────────────────────────────┤
│  Dashboard   │                                                               │
│ ─────────────│                     MAIN CONTENT AREA                         │
│  Users    ◀  │                                                               │
│  Courses     │                                                               │
│  Classes     │                                                               │
│  Students    │                                                               │
│ ─────────────│                                                               │
│  Sessions    │                                                               │
│  Analytics   │                                                               │
│ ─────────────│                                                               │
│  Settings    │                                                               │
│  Logout      │                                                               │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

### 6.4 Mobile Header Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [← Back]  Page Title                                           [☰]  🔔     │
└─────────────────────────────────────────────────────────────────────────────┘
│ ... > Classes > Math 101                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.5 Color Tokens

| Element | Token |
|---------|-------|
| Active nav button | `variant="primary"` (existing) |
| Inactive nav button | `variant="glass"` (existing) |
| Divider | `rgba(203, 213, 225, 0.5)` |
| Breadcrumb link | `#6366f1` (indigo) |
| Breadcrumb current | `#64748b` (slate) |
| Sidebar background | `#ffffff` or `rgba(255, 255, 255, 0.95)` |
| Sidebar active item | `rgba(99, 102, 241, 0.1)` with `#6366f1` text |

---

## 7. Technical Considerations

### 7.1 New Components to Create

| Component | Location | Purpose |
|-----------|----------|---------|
| `TeacherHeader.tsx` | `src/components/navigation/` | Unified teacher header |
| `TeacherNavigation.tsx` | `src/components/navigation/` | Navigation button group |
| `Breadcrumbs.tsx` | `src/components/navigation/` | Breadcrumb trail |
| `AdminSidebar.tsx` | `src/components/admin/` | Admin sidebar |
| `AdminLayout.tsx` | `src/components/admin/` | Admin page wrapper with sidebar |
| `MobileMenu.tsx` | `src/components/navigation/` | Mobile hamburger menu |

### 7.2 Components to Modify

| Component | Changes |
|-----------|---------|
| `TeacherLobbyPage.jsx` | Replace inline header with `TeacherHeader` |
| `TeacherClassesPage.tsx` | Replace `AppShell.Header` with `TeacherHeader` |
| `TeacherCoursesPage.tsx` | Replace `AdminHeader` with `TeacherHeader` |
| `TeacherStudentsPage.tsx` | Replace `AdminPageLayout` with new teacher layout |
| `AdminUserManagementPage.jsx` | Wrap with `AdminLayout` + `AdminSidebar` |
| `AdminHeader.tsx` | Deprecate or repurpose for admin top bar |
| `AdminPageLayout.tsx` | Deprecate (replaced by `AdminLayout`) |

### 7.3 New Routes to Add

```typescript
// Admin-specific routes in routes.ts
ADMIN_DASHBOARD: '/admin/dashboard',
ADMIN_COURSES: '/admin/courses',
ADMIN_CLASSES: '/admin/classes',
```

### 7.4 Breadcrumb Configuration

```typescript
// src/config/breadcrumbConfig.ts
export const BREADCRUMB_HIERARCHY = {
  // Teacher routes
  'TEACHER_CLASSES': { parent: 'LOBBY', label: 'Classes' },
  'TEACHER_CLASS_DETAIL': { parent: 'TEACHER_CLASSES', label: ':classId' },
  'TEACHER_COURSES': { parent: 'LOBBY', label: 'Courses' },
  'TEACHER_COURSE_DETAIL': { parent: 'TEACHER_COURSES', label: ':courseId' },
  'TEACHER_STUDENTS': { parent: 'LOBBY', label: 'Students' },
  'SESSIONS': { parent: 'LOBBY', label: 'Sessions' },
  'TEACHER_TEST_MONITOR': { parent: 'SESSIONS', label: 'Monitor' },
  'TEACHER_TEST_RESULTS': { parent: 'SESSIONS', label: 'Results' },
  
  // Admin routes
  'ADMIN_USERS': { parent: 'ADMIN_DASHBOARD', label: 'Users' },
  'ADMIN_COURSES': { parent: 'ADMIN_DASHBOARD', label: 'Courses' },
  'ADMIN_CLASSES': { parent: 'ADMIN_DASHBOARD', label: 'Classes' },
};
```

### 7.5 Context for Active Page

```typescript
// src/hooks/useNavigationContext.ts
export const useNavigationContext = () => {
  const location = useLocation();
  const [activePage, setActivePage] = useState<string>('');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  
  // Determine active page from current route
  // Build breadcrumb trail from hierarchy config
  
  return { activePage, breadcrumbs, navigateTo };
};
```

### 7.6 Dependencies

| Dependency | Purpose | Already Installed? |
|------------|---------|-------------------|
| `@mantine/core` | UI components | ✅ Yes |
| `react-router-dom` | Routing | ✅ Yes |
| No new dependencies required | - | - |

---

## 8. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Navigation Consistency** | 100% of teacher pages use `TeacherHeader` | Code review |
| **Super Admin Separation** | 100% of admin pages use `AdminLayout` | Code review |
| **Breadcrumb Coverage** | All pages except root have breadcrumbs | Manual testing |
| **Mobile Responsiveness** | Hamburger menu works on all pages | Testing at 375px |
| **User Satisfaction** | No confusion reports in first week | User feedback |
| **Page Load Impact** | <50ms added latency | Performance testing |

---

## 9. Open Questions

| Question | Status | Decision |
|----------|--------|----------|
| Should admin search bar be implemented now? | Deferred | Out of scope for v1 |
| What branding/logo for admin sidebar? | Open | Need design input |
| Should sidebar collapse state persist? | Open | Recommend: LocalStorage |
| Should breadcrumb entity names be localized? | Open | Recommend: Yes, use i18n |

---

## 10. Implementation Phases

### Phase 1: Foundation (Day 1)
- [ ] Create `TeacherHeader.tsx` component
- [ ] Create `TeacherNavigation.tsx` component  
- [ ] Create `Breadcrumbs.tsx` component
- [ ] Add breadcrumb config

### Phase 2: Teacher Pages (Day 2)
- [ ] Update `TeacherLobbyPage.jsx` with new header
- [ ] Update `TeacherClassesPage.tsx`
- [ ] Update `TeacherCoursesPage.tsx`
- [ ] Update `TeacherStudentsPage.tsx`

### Phase 3: Admin Foundation (Day 3)
- [ ] Create `AdminSidebar.tsx` component
- [ ] Create `AdminLayout.tsx` wrapper
- [ ] Add new admin routes
- [ ] Create admin top bar

### Phase 4: Admin Pages (Day 4)
- [ ] Update `AdminUserManagementPage.jsx`
- [ ] Create admin-specific course/class pages if needed
- [ ] Migrate existing admin functionality

### Phase 5: Mobile & Polish (Day 5)
- [ ] Create `MobileMenu.tsx` component
- [ ] Add responsive breakpoints
- [ ] Test all pages at mobile sizes
- [ ] Fix edge cases and polish

---

## 11. Appendix

### A. Current vs. Proposed Navigation Structure

#### Teacher Navigation

| Current | Proposed |
|---------|----------|
| `[Students] [Classes] [Courses] [Sessions] [🔔] [Logout]` | `[Materials] │ [Students] [Classes] [Courses] │ [Sessions] │ [🔔] [Logout]` |

#### Admin Navigation

| Current | Proposed |
|---------|----------|
| `[← Back to Lobby] Admin Console [Logout]` | Dedicated sidebar with all admin sections |

### B. Files Affected

```
src/
├── components/
│   ├── navigation/           # NEW FOLDER
│   │   ├── TeacherHeader.tsx
│   │   ├── TeacherNavigation.tsx
│   │   ├── Breadcrumbs.tsx
│   │   ├── MobileMenu.tsx
│   │   └── index.ts
│   └── admin/
│       ├── AdminSidebar.tsx      # NEW
│       ├── AdminLayout.tsx       # NEW
│       ├── AdminTopBar.tsx       # NEW
│       ├── AdminHeader.tsx       # MODIFY → Deprecate
│       └── AdminPageLayout.tsx   # MODIFY → Deprecate
├── pages/
│   ├── TeacherLobbyPage.jsx      # MODIFY
│   ├── TeacherClassesPage.tsx    # MODIFY
│   ├── TeacherCoursesPage.tsx    # MODIFY
│   ├── TeacherStudentsPage.tsx   # MODIFY
│   └── AdminUserManagementPage.jsx # MODIFY
├── config/
│   └── breadcrumbConfig.ts       # NEW
├── hooks/
│   └── useNavigationContext.ts   # NEW
└── constants/
    └── routes.ts                 # MODIFY (add admin routes)
```

---

**Document End**
