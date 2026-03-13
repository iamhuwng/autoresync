---
title: 'Pattern: Firestore orderBy Implicit Filter on Optional Fields'
createdAt: '2026-03-12T14:23:42.884Z'
updatedAt: '2026-03-12T14:24:01.750Z'
description: >-
  Bug class where Firestore orderBy() silently excludes documents with
  null/undefined values for the ordered field. Fix: move sorting to client-side
  when the field is optional.
tags:
  - pattern
  - firestore
  - bug-class
  - orderBy
  - safety
---
# Pattern: Firestore orderBy Implicit Filter on Optional Fields

## Problem

Firestore `orderBy()` **silently excludes** documents where the ordered field is `null`, `undefined`, or missing entirely. This is by design but undocumented enough to create a dangerous bug class.

When a TypeScript interface defines a field as optional (`field?: type`), any document missing that field will be **invisible** in query results that use `orderBy` on it.

## Symptoms

- Query returns fewer results than expected
- Documents exist in the console but don't appear in the app
- Bug only manifests for specific document states (e.g., `in_progress` submissions that haven't set `submittedAt` yet)
- No error thrown — complete silence

## The Bug

```typescript
// ❌ BUG: This silently drops documents where submittedAt is undefined
const q = query(
  collection(db, 'homework_submissions'),
  where('homeworkId', '==', homeworkId),
  orderBy('submittedAt', 'desc')  // ← IMPLICIT FILTER
);
```

### Why it happens
- `HomeworkSubmission.submittedAt?: number` — the field is optional
- `in_progress` submissions haven't been submitted yet → `submittedAt` is absent
- Firestore's `orderBy` treats missing/null fields as non-orderable → excludes them

## Solution

Move sorting to client-side when the ordered field is optional:

```typescript
// ✅ FIX: Query without orderBy, sort client-side
const q = query(
  collection(db, 'homework_submissions'),
  where('homeworkId', '==', homeworkId)
  // NO orderBy — fetch ALL documents regardless of submittedAt
);

const snapshot = await getDocs(q);
const submissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

// Client-side sort: documents without submittedAt go last
submissions.sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
```

## Detection Checklist

Before using `orderBy()` in any Firestore query, verify:

1. ☐ Is the field **required** in the TypeScript interface? (i.e., NOT `field?: type`)
2. ☐ Is the field **always written** when the document is created?
3. ☐ Can the field ever be `null`, `undefined`, or deleted?
4. ☐ Are there document lifecycle states where the field hasn't been set yet?

If ANY answer is "no" or "yes (it can be missing)", **do NOT use `orderBy` on that field**.

## Affected File

- `homeworkSubmissionService.ts` → `getHomeworkSubmissions()` — Fixed 2026-03-12

## Anti-Pattern

```typescript
// ❌ NEVER use orderBy on optional fields
orderBy('submittedAt', 'desc')   // submittedAt?: number
orderBy('completedAt', 'desc')   // completedAt?: Date
orderBy('gradedAt', 'asc')       // gradedAt?: number
```

## Related

- @doc/patterns/pattern-firestore-query-safety — Similar silent failure class with `where()` field name mismatches
