---
title: THCS Runtime Bridge Repair
description: Historical THCS Firestore library rows, RTDB /tests bridge repair, MaterialSummary synchronization, and 2026-07-08 live repair evidence.
createdAt: '2026-07-08T00:00:00.000Z'
updatedAt: '2026-07-08T00:00:00.000Z'
tags:
  - architecture
  - teacher-materials
  - thcs
  - material-summary
  - firebase
---

# THCS Runtime Bridge Repair

Repo source: `documentation/architecture/thcs-runtime-bridge-repair.md`.

Current THCS Teacher Materials contract:

- active published tests need `tests/{testId}` with `testType: 'THCS-THPT'`
- active listing needs MaterialSummary v1 rows
- Firestore `thcs_library` is metadata support, not My Content authority
- Firestore `thcs_library` rows with only `sectionSummary` are historical
  records, not runnable tests
- repair respects newer MaterialSummary `removed` tombstones; old published
  drafts must not resurrect intentionally deleted tests

Repair command:

```bash
npm run repair:thcs-runtime-bridges -- --dry-run --project <project-id> --report <file>
npm run repair:thcs-runtime-bridges -- --write --project <project-id> --approved <id> --from-report <file>
```

The repair source is a complete published `thcs_drafts` row with
`publishedTestId`, owner, metadata, timestamps, and non-empty sections with
questions. The repair writes `/tests` and MaterialSummary v1 together, then
requires post-write zero-op verification.

2026-07-08 live repair on `temp-a1437`:

- dry-run: 18 operations, 3 runtime writes, 15 summary writes, 0 read failures
- approved write: `user-approved-live-thcs-repair-2026-07-08`
- final-hardening corrective write: 6 operations, 1 runtime write, 5 summary
  writes, committed
- the user clarified `Retake` was intentionally deleted; it was removed again
  and its MaterialSummary was marked `removed`
- later `tmp/tests-export.json` comparison restored 17 complete historical THCS
  `/tests` rows plus MaterialSummary fan-out, excluding `Retake`
- post-write dry-run after the export restore selected 0 remaining rows

For `hungnguyenzim@gmail.com`
(`AkwZW3CT4AUvkMpJfgg9FwUh3ug2`), live owner summaries now show 13 owned active
THCS tests.

Three `users/{uid}/thcs_linked_tests` references to dev-owned public THCS tests
were runtime-ready, but product direction now defines My Content as owned-only.
Do not merge linked/use-as-is THCS refs into My Content; put them in a future
Saved/Linked view if needed.

Chrome proof after the owned-only fix showed
`hungnguyenzim@gmail.com` My Content at 24 total materials with 13 THCS rows.
All 13 owned THCS titles were visible; `Retake` and dev-owned linked
`G10 - CK2 - Test 1/2/3 - Set 1` titles were absent; no `Linked` badge
appeared; console warning/error read returned `[]`.

Partial-delete root cause: Teacher Lobby removed RTDB `/tests` and
MaterialSummary first, then Firestore sidecar cleanup could fail on a missing or
denied sidecar. The authoritative removal should still succeed; sidecar cleanup
is now best-effort, and tombstone-aware repair avoids stale draft resurrection.
