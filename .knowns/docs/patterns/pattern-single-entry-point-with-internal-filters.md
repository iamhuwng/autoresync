---
title: 'Pattern: Single Entry Point with Internal Filters'
createdAt: '2026-03-19T15:47:17.302Z'
updatedAt: '2026-03-19T15:54:02.672Z'
description: >-
  Don't create multiple buttons for the same modal with different preset
  filters. Use one entry point and let users select within the modal using
  tabs/filters.
tags:
  - pattern
  - ux
  - modal
  - homework
---
# Pattern: Single Entry Point with Internal Filters

## Problem
Multiple buttons that open the same modal with different preset filters create:
- **User confusion** — which button should I click?
- **Maintenance overhead** — each button needs its own handler, prop, and test coverage
- **Inconsistency** — one modal, multiple entry paths to manage

### Real Example
```
❌ Bad:  [Create Homework] [Create THCS Homework]
         Both open HomeworkCreateModal with different `preselectedMaterialFilter`
```

## Solution
Use a single entry point button and let the user choose within the modal using tabs or filter controls.

```
✅ Good: [➕ Create New Homework]
         Modal opens → Step 1 has filter tabs: All | Quizzes | Tests | THCS-THPT
```

### Before (2 buttons, 2 handlers)
```typescript
// TeacherHomeworkListPage.tsx
const handleCreateHomework = () => {
    setCreateModalFilter('all');
    setShowCreateModal(true);
};
const handleCreateThcsHomework = () => {
    setCreateModalFilter('thcs-test');
    setShowCreateModal(true);
};

// CompactStatsBar.tsx — needed 2 props
<Button onClick={onCreateHomework}>Create Homework</Button>
<Button onClick={onCreateThcsHomework}>Create THCS Homework</Button>
```

### After (1 button, 1 handler)
```typescript
// TeacherHomeworkListPage.tsx
const handleCreateHomework = () => {
    setCreateModalFilter('all');
    setShowCreateModal(true);
};

// CompactStatsBar.tsx — 1 prop
<Button onClick={onCreateHomework}>➕ Create New Homework</Button>
```

## When to Apply
- Modal already has internal filter/tab controls for the variants
- The "Create New Test" pattern in Lobby uses this approach
- Multiple buttons differ only in a preset filter value

## Source
- HomeworkCreateModal consolidation — March 2026
- Matches existing "Create New Test" UX pattern in TeacherLobbyPage
