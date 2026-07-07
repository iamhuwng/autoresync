---
title: Teacher Class Management Lifecycle
description: Current class delete boundary, student projection cleanup, and legacy game_sessions shadow behavior after the 2026-07-07 delete warning fix.
createdAt: '2026-07-07T15:12:12.695Z'
updatedAt: '2026-07-07T15:12:12.695Z'
tags:
  - architecture
  - class
  - teacher
  - lifecycle
  - rtdb
---

# Teacher Class Management Lifecycle

Canonical source: `documentation/architecture/teacher-class-management-lifecycle.md`.

## Current Contract

- Class lifecycle authority is `classes/{classId}`.
- `deleteClass(classId)` succeeds when `classes/{classId}` is soft-deleted with
  `status: 'deleted'`.
- `student_classes/{studentId}/{classId}` is a student-shell projection and can
  be cleaned up best-effort after the canonical class update.
- Student readers must hide stale projections whose canonical class row is
  missing or deleted.
- Class-backed `game_sessions/{classId}` rows are legacy compatibility shadows,
  not class lifecycle authority.
- Delete flows must not update class-backed `game_sessions/{classId}` rows.

## 2026-07-07 Incident Lesson

Old delete code updated `game_sessions/{classId}` after the real class
soft-delete. Historical class-backed shadow rows could be ownerless or fail RTDB
owner rules, producing Firebase SDK `permission_denied` warnings even though
`classes/{classId}/status` was already `deleted`.

Interpretation rule:
- verify class delete by reading `classes/{classId}/status`
- do not treat `game_sessions/{classId}` update failures as class delete failure

## Retired Contract

Retired:

```text
Deleting a class must also update game_sessions/{classId}.
```

Do not reintroduce this in code, tests, rules, or docs.

## Verification

Core focused proof:

```powershell
npx vitest run src/__tests__/services/classManager.test.ts --reporter=basic
npx eslint src/services/classManager.ts src/__tests__/services/classManager.test.ts
npm run lint:mantine
git diff --check -- src/services/classManager.ts src/__tests__/services/classManager.test.ts
```
