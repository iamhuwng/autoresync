---
title: 'Pattern: Firestore Undefined Sanitization'
createdAt: '2026-03-13T19:19:36.277Z'
updatedAt: '2026-03-13T19:20:49.599Z'
description: >-
  Firestore rejects undefined values in writes. Every write function must
  sanitize using conditional spreading: ...(val !== undefined && { key: val }).
  Prevents silent write failures.
tags:
  - pattern
  - firestore
  - safety
  - bug-prevention
---
# Pattern: Firestore Undefined Sanitization

## Problem

Firestore **silently rejects** writes containing `undefined` values. This causes:
- "Assign Homework" button silently failing
- No error in console (Firestore throws but the error message is cryptic)
- Works in development (where the field happens to be set), breaks in production

## The Bug

```typescript
// ❌ This silently fails if timerMinutes or maxAttempts is undefined
await addDoc(collection(db, 'homework_assignments'), {
    title: "Chapter 5 Review",
    timerMinutes: payload.timerMinutes,   // undefined → Firestore rejects ENTIRE write
    maxAttempts: payload.maxAttempts,     // undefined → same
    dueDate: payload.dueDate,
});
```

## Solution: Conditional Spread

```typescript
// ✅ Only include field if it has a value
const config = {
    title: "Chapter 5 Review",
    dueDate: payload.dueDate,
    ...(payload.timerMinutes !== undefined && { timerMinutes: payload.timerMinutes }),
    ...(payload.maxAttempts !== undefined && { maxAttempts: payload.maxAttempts }),
};

await addDoc(collection(db, 'homework_assignments'), config);
```

## Alternative: `removeUndefined` Utility

```typescript
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined)
    ) as Partial<T>;
}

// Usage
await setDoc(docRef, removeUndefined(payload));
```

## Detection Checklist

Before any Firestore write, check:
1. ☐ Does the payload object have optional TypeScript fields?
2. ☐ Are any values derived from user input that could be missing?
3. ☐ Is the object spread from a partial interface?

If ANY answer is yes → sanitize with conditional spread or `removeUndefined`.

## Related

- @doc/patterns/pattern-firestore-query-safety — Firestore silent failure with wrong field names
- @doc/patterns/pattern-firestore-orderby-implicit-filter-on-optional-fields — Firestore silent filter with orderBy

## Source

- `THCSHomeworkAssignDialog.tsx` — homework assignment creation
- PRD-0034 Teacher Homework Management Overhaul
