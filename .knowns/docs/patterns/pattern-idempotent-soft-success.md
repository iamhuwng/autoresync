---
title: 'Pattern: Idempotent Soft Success'
createdAt: '2026-03-04T16:31:42.097Z'
updatedAt: '2026-03-04T16:32:08.145Z'
description: >-
  When a service function's desired end-state is already achieved, return
  success with a distinguishing flag instead of an error. Prevents confusing UX
  when the same outcome can be reached through multiple paths (e.g., teacher-add
  + student self-join).
tags:
  - pattern
  - idempotent
  - ux
  - error-handling
---
# Pattern: Idempotent Soft Success

## Problem

A service function checks whether an action has already been performed and returns `{ success: false, error: '...' }` when it detects the end-state already exists. The UI treats this as a failure, showing a scary error message — even though the user's goal is already achieved.

This is especially problematic when the same outcome can be reached through **multiple paths** (e.g., a teacher adds a student to a class by email, then the student also tries to join via class code).

### Real-World Symptom

```
Student enters class code → "Already enrolled in this class" (red error) → confused
5 seconds later → refreshes page → class is there → more confused
```

## Solution

Return `{ success: true }` with a distinguishing flag (e.g., `alreadyEnrolled: true`) instead of an error. The UI can then show a friendly, context-appropriate message.

### Service Layer

```typescript
// ❌ Wrong: Treats achieved state as error
if (existingStudent) {
  return { success: false, error: 'Already enrolled in this class' };
}

// ✅ Correct: Soft success with distinguishing flag
if (existingStudent) {
  return { success: true, classId: classCode, alreadyEnrolled: true };
}
```

### UI Layer

```typescript
// Handle both fresh success and already-achieved success
if (result.success) {
  const msg = result.alreadyEnrolled
    ? `✅ You're already in ${code}!`
    : `✅ Successfully joined ${code}!`;
  setSuccessMessage(msg);
  
  // IMPORTANT: Still refresh the data list — the user may not
  // have seen the item yet (one-shot fetch on mount)
  const items = await refreshList(userId);
  setItems(items);
}
```

## When to Apply

| Condition | Apply? |
|-----------|--------|
| Multiple paths can achieve the same end-state | ✅ Yes |
| Operation is inherently idempotent (set, not increment) | ✅ Yes |
| User sees an error for something that's already done | ✅ Yes |
| Operation has destructive side effects if re-run | ❌ No — use error |
| Duplicate would cause data corruption | ❌ No — use error |

## Checklist

1. **Return type**: Add the optional flag to the return type (e.g., `alreadyEnrolled?: boolean`)
2. **Service function**: Return `success: true` + flag instead of `success: false`
3. **UI consumer**: Check for the flag and show appropriate message
4. **Refresh data**: Still refresh the list/state — the user may not see the item yet
5. **Skip side effects**: Don't re-run notifications, stats updates, or writes for already-achieved states

## Source

- @doc/architecture/architecture-student-teacher-assignment-class-enrollment (Common Pitfall #5)
- Fix applied: `classManager.ts` `enrollStudent()` + `StudentDashboardPage.jsx` `handleJoinClass()` (2026-03-04)
