---
title: 'Pattern: Firestore Query Safety'
createdAt: '2026-02-28T03:44:07.332Z'
updatedAt: '2026-02-28T03:44:55.585Z'
description: >-
  Common bug class where Firestore where() queries use field names or values
  that don't match the TypeScript interface — silent failures returning empty
  results.
tags:
  - pattern
  - firestore
  - bug-class
  - safety
---
# Pattern: Firestore Query Safety

> **Source:** PRD-0030 PendingReviewsWidget bug (2026-02-28)
> **Severity:** High — silent data loss (queries return empty, no runtime error)

## Problem

Firestore `where()` queries silently return zero results when:
1. The **field name** doesn't match the document schema (e.g., `status` vs `markingStatus`)
2. The **field value** doesn't match the stored value (e.g., `'pending'` vs `'pending-review'`)

Unlike SQL, Firestore **does not throw errors** for non-existent fields. It simply returns an empty result set. This makes these bugs invisible during development and hard to catch without explicit verification.

## Solution

### Pre-Flight Check

Before writing any Firestore `where()` clause:

1. **Open the TypeScript interface** that defines the document shape
2. **Copy the exact field name** from the interface into the `where()` call
3. **Copy the exact union value** from the type definition
4. **Verify with a comment** linking back to the type

### Pattern

```typescript
// ✅ CORRECT — field name and value verified against WritingSubmission type
// See: WritingSubmission.markingStatus in ielts-writing.types.ts line 181
where('markingStatus', '==', 'pending-review'),

// ❌ WRONG — field name and value don't match type definition
where('status', '==', 'pending'),
```

### Type-Safe Query Helper (Advanced)

For critical queries, create a typed helper:

```typescript
function typedWhere<T>(
    field: keyof T & string,
    op: WhereFilterOp,
    value: T[keyof T]
) {
    return where(field, op, value);
}

// Usage: type-checked at compile time
typedWhere<WritingSubmission>('markingStatus', '==', 'pending-review');
// typedWhere<WritingSubmission>('status', '==', 'pending'); // TS error!
```

## Real-World Example

```typescript
// PendingReviewsWidget.tsx — Dashboard widget showing pending reviews
// BUG: Used wrong field and value for 6+ weeks, widget was ALWAYS empty

// Before (broken — 0 results always):
const q = query(
    collection(db, 'writing_submissions'),
    where('studentId', '==', user.uid),
    where('status', '==', 'pending'),        // ❌ Field doesn't exist
);

// After (fixed):
const q = query(
    collection(db, 'writing_submissions'),
    where('studentId', '==', user.uid),
    where('markingStatus', '==', 'pending-review'),  // ✅ Matches type
);
```

## Self-Check

When writing or reviewing Firestore queries:
- [ ] Every `where()` field name exists as a key in the target document's TypeScript interface
- [ ] Every `where()` value is a valid member of that field's union type
- [ ] Compound queries don't combine fields that require a composite index (check Firestore console)
- [ ] `orderBy()` fields are consistent with `where()` fields (Firestore requires this)

## Related

- @doc/integration-safety-rules — Rule 12 (Backup Coverage Check) covers related data integrity patterns
- @doc/patterns/pattern-prd-integration-audit-checklist — Section 3 (Type Alignment)
