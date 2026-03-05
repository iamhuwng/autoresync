---
title: 'Pattern: Firestore Rules vs Collection Queries'
createdAt: '2026-03-01T09:46:26.555Z'
updatedAt: '2026-03-01T09:46:57.403Z'
description: >-
  Firestore security rules silently reject entire queries when ANY returned
  document fails the read rule. This causes invisible data loss for
  teacher-facing features.
tags:
  - pattern
  - firestore
  - security
  - debugging
---
# Pattern: Firestore Rules vs Collection Queries

## Problem

Firestore security rules evaluate **per-document**, but collection queries must satisfy rules for **EVERY document** returned. If even ONE document in the result set fails the read rule, the **entire query is rejected** — silently, with no partial results.

This creates a class of bug where:
1. Data writes succeed (create rules are permissive)
2. Individual reads succeed (student can see their own submission)
3. Collection queries fail silently (teacher sees empty list)

The symptom is always the same: "I can see the data exists, but the other user's query returns nothing."

## Root Cause Pattern

```
// ❌ Per-document ownership check on a collection query
match /submissions/{id} {
  allow read: if request.auth != null
    && (resource.data.studentId == request.auth.uid
        || resource.data.context.teacherId == request.auth.uid);
}

// Teacher query — FAILS if ANY doc belongs to another teacher
const q = query(
  collection(db, 'submissions'),
  where('status', '==', 'pending')
);
// Firestore checks the read rule against ALL returned docs
// If doc #3 belongs to Teacher B, Teacher A's entire query is rejected
```

## Solution

### Option A: Broad read + client-side filter (recommended for internal tools)

```
// ✅ Any authenticated user can read — client filters by ownership
match /submissions/{id} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null;
  allow delete: if false;
}
```

Client-side ownership filtering already exists in the service layer.

### Option B: Query must match the security rule filter

```
// ✅ Security rule matches query filter — requires composite index
match /submissions/{id} {
  allow read: if request.auth != null
    && resource.data.teacherId == request.auth.uid;
}

// Query MUST include the same filter
const q = query(
  collection(db, 'submissions'),
  where('status', '==', 'pending'),
  where('teacherId', '==', currentUser.uid)  // matches security rule
);
```

### Option C: Ensure ownership field is always populated

When using per-document rules, the ownership field MUST be written at creation time, not looked up later:

```typescript
// ❌ Missing ownership field — rules will block reads
context: { type: 'live-session', sessionCode }

// ✅ Always populate the ownership field
context: { type: 'live-session', sessionCode, assigningTeacherId: testData.createdBy }
```

## Real Bug: Writing Submissions Invisible to Teachers (2026-03-01)

**Symptom:** Students submit writing tests in live sessions. Students see "pending review" in their records. Teachers see nothing in their grading tab.

**Cause:** Two compounding issues:
1. `autoSubmitFromRTDB()` wrote `context: { type: 'live-session', sessionCode }` — no `assigningTeacherId`
2. Firestore read rule checked `context.assigningTeacherId == auth.uid` — always failed for live-session docs
3. Teacher's query `where('markingStatus', '==', 'pending-review')` returned ALL pending docs, but the read rule rejected the query because other teachers' docs failed the check

**Fix:**
1. Added `assigningTeacherId: testData.createdBy` to submission context
2. Broadened Firestore read rule to `allow read: if request.auth != null`

## Checklist When Adding Firestore Collections

- [ ] Does any query fetch docs that might belong to different users?
- [ ] If yes, does the security rule allow the querying user to read ALL possible results?
- [ ] If using per-document ownership checks, does the query filter match the security rule?
- [ ] Are ALL ownership fields populated at document creation time?
- [ ] Test with multiple users — not just the document creator

## Anti-Pattern: RTDB Fallback for Ownership

```typescript
// ❌ This CANNOT fix a Firestore rule rejection
// The RTDB lookup happens AFTER the Firestore query, but the query already failed
const q = query(collection(db, 'submissions'), where('status', '==', 'pending'));
const docs = await getDocs(q); // ← rejected by Firestore rules
// RTDB lookup to check session ownership never runs
```

## Source

Bug discovered 2026-03-01 in `writingSubmissionService.ts` → `getPendingSubmissions()`
