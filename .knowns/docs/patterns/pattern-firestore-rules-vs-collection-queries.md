---
title: 'Pattern: Firestore Rules vs Collection Queries'
description: Firestore security rules silently reject entire queries when ANY returned document fails the read rule. This causes invisible data loss for teacher-facing features.
createdAt: '2026-03-01T09:46:26.555Z'
updatedAt: '2026-03-28T09:18:16.865Z'
tags:
  - pattern
  - firestore
  - security
  - debugging
---

# Pattern: Firestore Rules vs Collection Queries

## Problem

Firestore security rules evaluate per-document, but collection queries must satisfy rules for every document returned. If even one document in the result set fails the read rule, the entire query is rejected.

This creates a bug class where:
1. Data writes succeed.
2. Individual reads may succeed.
3. Collection queries fail with `Missing or insufficient permissions` or appear to return nothing.

## Root Cause Pattern

```ts
// Per-document ownership check on a collection query
match /submissions/{id} {
  allow read: if request.auth != null
    && (resource.data.studentId == request.auth.uid
        || resource.data.context.teacherId == request.auth.uid);
}

// Teacher queue query
const q = query(
  collection(db, 'submissions'),
  where('status', '==', 'pending')
);
```

If that query can return documents owned by multiple teachers, Firestore evaluates the read rule against the full result set and rejects the query when any returned document is unreadable to the caller.

## Solution Options

### Option A: Broad read + client-side filter

Use this for internal teacher-facing queues when the service layer already filters ownership.

```rules
match /submissions/{id} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null;
  allow delete: if false;
}
```

### Option B: Query must match the rule filter

Use this only when the ownership field is guaranteed on every document and the required indexes exist.

```ts
const q = query(
  collection(db, 'submissions'),
  where('status', '==', 'pending'),
  where('teacherId', '==', currentUser.uid)
);
```

### Option C: Always persist ownership metadata at create time

```ts
// Wrong
context: { type: 'live-session', sessionCode }

// Correct
context: {
  type: 'live-session',
  sessionCode,
  assigningTeacherId: testData.createdBy,
}
```

Do not rely on RTDB lookups or later enrichment to save a Firestore query that has already been rejected.

## Real Bug: Writing Submissions Invisible to Teachers (2026-03-01)

Symptom:
- Students could submit IELTS writing.
- Teachers saw nothing in the grading queue.

Cause:
1. `autoSubmitFromRTDB()` created live-session submissions without `assigningTeacherId`.
2. Firestore rules only allowed reads when the teacher ownership field matched.
3. The queue queried `where('markingStatus', '==', 'pending-review')` and then filtered client-side.

Fix pattern:
1. Persist teacher ownership metadata on live-session submissions.
2. Align the Firestore read rule with the queue design, or align the queue with the rule.

## Operational Follow-Through: Deploy the Rules You Fixed

A local `firestore.rules` change does not affect a hosted app until the active Firebase project receives a rules deploy.

Required follow-through after any Firestore permission fix:
1. Confirm the runtime Firebase project ID from the console log, environment, or Firebase CLI state.
2. Deploy the rules to that exact project with `firebase deploy --only firestore:rules`.
3. Read back the remote rules or otherwise verify the live project now contains the updated rule block.
4. Only then retest the browser flow.

If the browser still throws the exact same permission error after a local rules fix, assume stale deployed rules before assuming the code fix failed.

## Real Bug Follow-Up: Same Queue Failure After Local Fix (2026-03-28)

A follow-up incident confirmed the same teacher queue still failing at `writingSubmissionService.getPendingSubmissions()`, even though the local repo already contained the correct rule change.

What actually happened:
- The runtime project was `temp-a1437`.
- The hosted project still had the old `writing_submissions` read rule deployed.
- Deploying `firestore.rules` to the live project removed the stale rule mismatch.

Additional lesson:
- This bug class has both a design layer and a deployment-state layer.
- Fixing only the source file resolves the design bug but does not repair the live system until rules are deployed.

## Teacher Read Surfaces To Audit Together

When `writing_submissions` permissions regress, inspect all of these together:
- Queue read: `getPendingSubmissions()`
- Detail read: `getSubmission(submissionId)`
- Grading save pre-read: `updateGrading()` before `updateDoc()`

A stale read rule can break all three surfaces at once.

## Current Standard

- Broad-read teacher queue patterns must be paired with deployed rules, not only local file edits.
- Live-session writing submissions should persist teacher ownership metadata even when broad authenticated reads are used for queue compatibility.
- Firestore permission fixes must include a live deployment verification step when the failing app is hosted.

## Checklist When Adding Firestore Collections

- [ ] Does any collection query span documents owned by multiple users?
- [ ] If yes, do the rules allow the caller to read the full possible result set?
- [ ] If using ownership-based rules, does the query explicitly match that ownership field?
- [ ] Are all ownership fields written at document creation time?
- [ ] Have you tested the flow with multiple users?
- [ ] Have you deployed and verified the live rules if the bug occurs in a hosted environment?

## Anti-Pattern: RTDB Fallback After Firestore Rejection

```ts
const q = query(collection(db, 'submissions'), where('status', '==', 'pending'));
const docs = await getDocs(q); // already rejected by Firestore rules
// RTDB ownership lookup here cannot recover the failed query
```

## Related Docs

- @doc/architecture/firebase-infrastructure
- @doc/sop/ielts-writing-grading-permission-runtime-state

## Source

Primary incident family discovered in `writingSubmissionService.ts` -> `getPendingSubmissions()` and re-confirmed on 2026-03-28 against live project `temp-a1437`.
