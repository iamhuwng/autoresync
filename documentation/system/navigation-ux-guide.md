# Navigation UX System - Implementation Guide

**Status**: ✅ Production Ready  
**Last Updated**: 2026-02-02  
**Migration**: PRD-0017 Navigation UX Improvement

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Components](#components)
4. [Usage Examples](#usage-examples)
5. [Mobile Responsiveness](#mobile-responsiveness)
6. [Security](#security)
7. [Migration Guide](#migration-guide)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The Navigation UX System provides a unified, role-based navigation experience across the application. It's designed to be consistent, accessible, and mobile-responsive.

### Key Features

- **Role-Based Navigation**: Different interfaces for students, teachers, and super admins
- **Consistent Breadcrumbs**: Automatic route hierarchy tracking
- **Mobile Responsiveness**: Adaptive layouts for desktop, tablet, and mobile (≤768px breakpoint)
- **Smart Navigation Context**: Single source of truth for navigation state
- **Security Integration**: RBAC-compliant data scoping

### Supported Roles

| Role | Navigation Style | Components Used |
|------|-----------------|-----------------|
| **Teacher** | Horizontal header with inline buttons | `TeacherHeader` + `TeacherNavigation` |
| **Super Admin** | Fixed sidebar with sections | `AdminLayout` + `AdminSidebar` |
| **Student** | Simple header with back button | `Breadcrumbs` + basic layout |

---

## Architecture

### Component Hierarchy

```
Navigation System
├── Core Components
│   ├── TeacherHeader (Teachers)
│   │   ├── TeacherNavigation (Desktop)
│   │   ├── MobileMenu (Mobile)
│   │   └── Breadcrumbs
│   └── AdminLayout (Super Admins)
│       ├── AdminSidebar (Desktop)
│       ├── AdminTopBar
│       ├── MobileMenu (Mobile via Drawer)
│       └── Breadcrumbs
├── Shared Components
│   ├── Breadcrumbs (Route hierarchy)
│   ├── MobileMenu (Slide-in drawer)
│   └── HamburgerButton (Menu trigger)
└── Context & Config
    ├── useNavigationContext (State management)
    ├── breadcrumbConfig.ts (Route hierarchy)
    └── routes.ts (Route definitions)
```

### Data Flow

```
User Action → Navigation Component → useNavigationContext
                                    ↓
                        navigateTo(route, params, metadata)
                                    ↓
                        React Router Navigate + Breadcrumb Update
```

---

## Components

### 1. TeacherHeader

**Purpose**: Unified header for teacher pages  
**File**: `src/components/navigation/TeacherHeader.tsx`

**Features**:
- Back button (when not on root)
- Page title
- Inline navigation (desktop) / Hamburger menu (mobile)
- Automatic breadcrumbs
- Logout functionality

**Usage**:
```tsx
import { TeacherHeader } from '@/components/navigation';

<TeacherHeader
  pageTitle="Classes"
  userId={currentUser.uid}
  userRole="teacher"
  onLogout={handleLogout}
  hideBackButton={false}
  hideNavigation={false}
  hideBreadcrumbs={false}
/>
```

**Props**:
- `pageTitle` (string, required): Title to display
- `userId` (string, optional): For notifications
- `userRole` ('teacher' | 'super_admin', default: 'teacher'): User role
- `onLogout` (function, required): Logout handler
- `hideBackButton` (boolean, optional): Force hide back button
- `hideNavigation` (boolean, optional): Hide navigation buttons
- `hideBreadcrumbs` (boolean, optional): Hide breadcrumbs

**Responsive Behavior**:
- **Wide desktop (>=1280px)**: Full navigation bar with text buttons
- **Narrow desktop/tablet (769px-1279px)**: Compact teacher-navigation hamburger dropdown, with notification/profile controls still visible
- **Mobile (≤768px)**: Hamburger menu with slide-in drawer

**Density Rule**: `TeacherHeader` may be compacted through smaller padding, gaps, title/back/profile sizing, and small sharper nav buttons, but the shared white/glass header style, navigation order, and profile/notification placement stay unchanged unless a header redesign is explicitly requested.

---

### 2. AdminLayout

**Purpose**: Complete admin page wrapper with sidebar  
**File**: `src/components/navigation/AdminLayout.tsx`

**Features**:
- Fixed sidebar navigation (desktop)
- Drawer overlay (mobile)
- Collapsible sidebar (desktop)
- Automatic breadcrumbs
- Sticky top bar

**Usage**:
```tsx
import { AdminLayout } from '@/components/navigation';

<AdminLayout
  pageTitle="User Management"
  currentPage="users"
  onNavigate={handleSidebarNavigate}
  onLogout={handleLogout}
  userRole={profile?.role}
>
  <YourPageContent />
</AdminLayout>
```

**Props**:
- `pageTitle` (string, required): Page title for top bar
- `currentPage` (string, required): Active sidebar item ID
- `onNavigate` (function, required): Navigation handler `(page: string) => void`
- `onLogout` (function, required): Logout handler
- `userRole` (string, optional): User role for display
- `children` (ReactNode, required): Page content

**Responsive Behavior**:
- **Desktop (>768px)**: Fixed sidebar (240px width, 64px collapsed)
- **Mobile (≤768px)**: Hidden sidebar accessible via hamburger drawer

---

### 3. Breadcrumbs

**Purpose**: Display page hierarchy trail  
**File**: `src/components/navigation/Breadcrumbs.tsx`

**Features**:
- Clickable parent links
- Current page (non-clickable)
- Condensed mobile view (... > Parent > Current)

**Usage**:
```tsx
import { Breadcrumbs } from '@/components/navigation';

<Breadcrumbs
  items={breadcrumbItems}
  separator=">"
  condensed={isMobile}
/>
```

**Props**:
- `items` (BreadcrumbItem[], required): Breadcrumb items
- `separator` (string, optional, default: '>'): Separator character
- `condensed` (boolean, optional): Show only last 2 levels

---

### 4. MobileMenu

**Purpose**: Slide-in drawer menu for mobile devices  
**File**: `src/components/navigation/MobileMenu.tsx`

**Features**:
- Slide-in from left
- Flat navigation list
- Active state highlighting
- Auto-close on navigation

**Usage**:
```tsx
import { MobileMenu, HamburgerButton } from '@/components/navigation';

// Trigger button
<HamburgerButton
  onClick={() => setMenuOpen(!menuOpen)}
  isOpen={menuOpen}
/>

// Menu drawer
<MobileMenu
  isOpen={menuOpen}
  onClose={() => setMenuOpen(false)}
  items={menuItems}
  onLogout={handleLogout}
  userRole="teacher"
/>
```

---

## Usage Examples

### Example 1: Migrating a Teacher Page

**Before** (Old pattern):
```tsx
const TeacherClassesPage = () => {
  return (
    <div>
      <div className="header">
        <button onClick={() => navigate(-1)}>← Back</button>
        <h1>Classes</h1>
        <button onClick={handleLogout}>Logout</button>
      </div>
      <div className="content">
        {/* Page content */}
      </div>
    </div>
  );
};
```

**After** (New pattern):
```tsx
import { TeacherHeader } from '@/components/navigation';

const TeacherClassesPage = () => {
  const handleLogout = async () => { /* ... */ };

  return (
    <>
      <TeacherHeader
        pageTitle="Classes"
        userId={user?.uid}
        onLogout={handleLogout}
      />
      <div className="content" style={{ padding: '2rem' }}>
        {/* Page content */}
      </div>
    </>
  );
};
```

---

### Example 2: Migrating an Admin Page

**Before** (Old pattern):
```tsx
import { AdminPageLayout } from '@/components/admin';

const AdminUserPage = () => {
  return (
    <AdminPageLayout
      title="User Management"
      onBack={() => navigate('/lobby')}
      onLogout={handleLogout}
    >
      {/* Page content */}
    </AdminPageLayout>
  );
};
```

**After** (New pattern):
```tsx
import { AdminLayout } from '@/components/navigation';

const AdminUserPage = () => {
  const handleSidebarNavigate = (page: string) => {
    const routes = {
      users: 'ADMIN_USERS',
      courses: 'ADMIN_COURSES',
      classes: 'ADMIN_CLASSES',
    };
    navigateTo(routes[page]);
  };

  return (
    <AdminLayout
      pageTitle="User Management"
      currentPage="users"
      onNavigate={handleSidebarNavigate}
      onLogout={handleLogout}
      userRole={profile?.role}
    >
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Page content */}
      </div>
    </AdminLayout>
  );
};
```

---

## Mobile Responsiveness

### Breakpoint

- **Wide desktop**: >= 1280px
- **Narrow desktop/tablet**: 769px-1279px
- **Mobile**: ≤ 768px

### Behavior Summary

| Component | Desktop | Mobile |
|-----------|---------|--------|
| **TeacherHeader** | Inline navigation at >=1280px; compact hamburger dropdown from 769px-1279px | Mobile drawer hamburger |
| **AdminLayout** | Fixed sidebar (240px/64px) | Drawer overlay |
| **Breadcrumbs** | Full hierarchy | Condensed (last 2 levels) |
| **Content Padding** | 2rem | 1rem |

Teacher Lobby authoring and compact-header polish are documented in `documentation/architecture/teacher-lobby-authoring-and-navigation.md`.

### Testing Mobile

1. Open Chrome DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select "Responsive" or specific device
4. Test at widths: 375px, 768px, 1024px

---

## Security

### RBAC Integration

The navigation system integrates with the RBAC security middleware:

**Teacher Data Scoping**:
```typescript
// useUserManagement.ts
if (userRole === 'teacher') {
  // Teachers only see assigned students
  allUsers = await getTeacherStudents(authContext);
} else if (userRole === 'super_admin') {
  // Admins see all users
  allUsers = await getAllUsersSecure(authContext);
}
```

**Security Fix Applied**:
- ✅ Fixed `TeacherStudentsPage` permission escalation
- ✅ Teachers now use `getTeacherStudents()` instead of `getAllUsersSecure()`
- ✅ Proper data scoping by assignment

---

## Migration Guide

### Step 1: Update Imports

**Old**:
```typescript
import { AdminPageLayout, AdminHeader } from '@/components/admin';
```

**New**:
```typescript
import { TeacherHeader, AdminLayout } from '@/components/navigation';
```

### Step 2: Replace Layout Components

See [Usage Examples](#usage-examples) above.

### Step 3: Remove Old Navigation Logic

- Remove manual back button handlers
- Remove inline navigation JSX
- Let `TeacherHeader` / `AdminLayout` handle it

### Step 4: Update Logout Handler

Ensure your logout handler clears session and navigates:
```typescript
const handleLogout = async () => {
  await signOut(auth);
  navigate('/');
};
```

---

## Troubleshooting

### Issue: Breadcrumbs not showing

**Cause**: Route not configured in `breadcrumbConfig.ts`

**Fix**: Add route to `BREADCRUMB_HIERARCHY`:
```typescript
// src/config/breadcrumbConfig.ts
export const BREADCRUMB_HIERARCHY = {
  YOUR_ROUTE: {
    parent: 'PARENT_ROUTE',
    label: 'Your Page',
  },
};
```

---

### Issue: Mobile menu not appearing

**Cause**: Window resize listener not triggering

**Fix**: Hard refresh (Ctrl+Shift+R) to reload component state

---

### Issue: Sidebar navigation not working

**Cause**: Missing route mapping in `handleSidebarNavigate`

**Fix**: Add route mapping:
```typescript
const handleSidebarNavigate = (page: string) => {
  const pageRoutes = {
    users: 'ADMIN_USERS',
    courses: 'ADMIN_COURSES',
    // Add your route here
  };
  navigateTo(pageRoutes[page]);
};
```

---

## Performance

- **Bundle Size**: +8KB for navigation components
- **Load Time**: No impact (components lazy-loaded per route)
- **Render Performance**: Optimized with `useMemo` for filtering

---

## Future Enhancements

- [ ] Notification bell integration
- [ ] User profile dropdown
- [ ] Keyboard navigation support
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Animated route transitions

---

**For PRD Details**: See `documentation/tasks/0017-prd-navigation-ux-improvement.md`  
**For Implementation Tasks**: See `documentation/tasks/tasks-0017-prd-navigation-ux-improvement.md`
