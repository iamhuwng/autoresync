# Teacher Class Management Lifecycle

## Purpose

This document defines the current class lifecycle contract for teacher-managed
classes.

It was added after the 2026-07-07 class delete investigation, where delete
actions succeeded on `classes/{classId}` but the old delete path still tried to
update class-backed `game_sessions/{classId}` shadow rows. Some historical
shadow rows were ownerless or no longer writable under RTDB rules, so Firebase
logged `permission_denied` warnings even though the class soft-delete had
already succeeded.

## Source Of Truth

The class lifecycle source of truth is:

```text
classes/{classId}
```

Required rules:
- `classes/{classId}.status` owns active, archived, and deleted class state.
- `status: 'deleted'` hides the class from active teacher and student class
  surfaces.
- `student_classes/{studentId}/{classId}` is a student-shell membership
  projection, not lifecycle authority.
- `game_sessions/{classId}` rows created by class management are legacy
  compatibility shadows, not lifecycle authority.

## Delete Contract

`deleteClass(classId)` must treat the canonical class row as the durable
success boundary.

Required flow:
1. Read and normalize the class through `getClass(classId)`.
2. Soft-delete `classes/{classId}` with `status: 'deleted'` and `updatedAt`.
3. Remove `student_classes/{studentId}/{classId}` projection rows best-effort.
4. Return success if the canonical class soft-delete succeeds.

Best-effort cleanup must not roll back the class delete. If projection cleanup
fails because of rules, stale membership projections may remain until explicit
maintenance or a later canonical write path cleans them.

## Legacy Game Session Boundary

Class creation still writes a legacy compatibility row at:

```text
game_sessions/{classId}
```

That row exists for older class/session integration and must include owner
fields when the creator is known:
- `createdByUserId`
- `createdBy`
- `teacherId`

Delete must not update `game_sessions/{classId}`. Old class-backed shadow rows
can be ownerless or fail owner-rule checks. Updating them from class delete
reintroduces Firebase SDK warnings like:

```text
@firebase/database: FIREBASE WARNING: update at /game_sessions/<classId> failed: permission_denied
```

Those warnings are not proof that class deletion failed. Verify deletion by
reading:

```text
classes/{classId}/status == "deleted"
```

## Student Reader Contract

Student shell class readers consume the `student_classes` projection but must
recheck canonical class state before exposing a class.

Required rules:
- hide projection rows whose canonical `classes/{classId}` row is missing
- hide projection rows whose canonical class status is `deleted`
- hide membership states other than `active`
- do not repair, delete, or backfill projections during student page load

This preserves the student shell no-write-on-read rule while allowing class
delete cleanup to remain best-effort.

## Retired / Obsolete Contract

The following contract is obsolete:

```text
Deleting a class must also update game_sessions/{classId}.
```

Do not reintroduce it in service code, security rules, tests, or docs.
`game_sessions/{sessionCode}` remains the live-session authority for real live
sessions, but class-backed `game_sessions/{classId}` shadows are not class
lifecycle authority.

## Verification Anchors

Current service anchors:
- `src/services/classManager.ts`
- `src/__tests__/services/classManager.test.ts`

Required focused proof for this boundary:

```powershell
npx vitest run src/__tests__/services/classManager.test.ts --reporter=basic
npx eslint src/services/classManager.ts src/__tests__/services/classManager.test.ts
npm run lint:mantine
git diff --check -- src/services/classManager.ts src/__tests__/services/classManager.test.ts
```

Important regression expectations:
- new class-backed legacy rows include owner fields
- `deleteClass()` soft-deletes `classes/{classId}`
- `deleteClass()` removes `student_classes` projections when allowed
- `deleteClass()` does not touch `game_sessions/{classId}`
- projection cleanup failure does not block canonical class soft-delete

## Incident Evidence

During the 2026-07-07 browser investigation, 15 PRD-0055 fixture/live-proof
classes reported old `game_sessions` permission warnings in the console. CLI
readback against Firebase project `temp-a1437` verified each affected
`classes/{classId}/status` value was already `deleted`.
