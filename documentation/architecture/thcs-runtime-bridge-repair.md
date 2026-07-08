# THCS Runtime Bridge Repair

## Purpose

This document records the THCS-THPT historical data split found during the
2026-07-08 Teacher Materials investigation.

Teacher Materials now lists published tests from MaterialSummary v1. For THCS,
an active published test must have:

- RTDB runtime row at `tests/{testId}` with `testType: 'THCS-THPT'`
- MaterialSummary rows under `material_catalog/material_summary_indexes/v1`
- Firestore draft/library rows only as authoring metadata, not listing
  authority

## Finding

Some old THCS rows existed only in Firestore `thcs_library`. Those rows can
have title, grade, exam type, `questionCount`, and `sectionSummary`, while
missing full `sections/questions` and missing RTDB `tests/{testId}`.

Those rows are not active runnable tests. My Content must not add a Firestore
`thcs_library` fallback to make them appear as normal tests, because that would
reintroduce a feature-specific listing source and produce launch/edit failures.

The safe repair source is a published `thcs_drafts/{draftId}` document with:

- `status: 'published'`
- `publishedTestId`
- owner `userId`
- complete `metadata`
- non-empty `sections` containing questions
- usable timestamps

## Repair Tool

Command:

```bash
npm run repair:thcs-runtime-bridges -- --dry-run --project <project-id> --report <file>
npm run repair:thcs-runtime-bridges -- --write --project <project-id> --approved <id> --from-report <dry-run-report.json> --report <file>
```

The tool:

1. reads Firestore `thcs_drafts` and `thcs_library` through Google auth,
2. reads RTDB `/tests` and MaterialSummary v1 through Firebase CLI,
3. plans only deterministic repairs from complete published drafts,
4. writes `tests/{testId}` and MaterialSummary rows in one RTDB root update,
5. refuses write mode without `--approved` plus matching `--from-report`, and
6. respects newer MaterialSummary `removed` tombstones so old published drafts
   do not resurrect intentionally deleted tests, and
7. verifies post-write by rerunning the plan and requiring zero operations.

Firestore `thcs_library` rows with no full draft sections are reported as
`unbackfillableLibraryRows`. They remain historical records until a complete
source body is found.

## 2026-07-08 Live Repair Evidence

Project: `temp-a1437`

Dry-run report:

```text
output/thcs-runtime-bridge-repair/dry-run-2026-07-08.json
operations=18
runtimeWrites=3
summaryWrites=15
summaryRemoves=0
unbackfillableLibraryRows=17
readFailures=0
```

Approved write:

```text
approval=user-approved-live-thcs-repair-2026-07-08
output/thcs-runtime-bridge-repair/write-2026-07-08.json
mutation=committed
postWriteOperations=0
```

Final hardening and corrective write:

```text
output/thcs-runtime-bridge-repair/write-2-2026-07-08.json
operations=6
runtimeWrites=1
summaryWrites=5
mutation=committed
postWriteOperations=0
```

Real Chrome teacher-account corrective write after a partial delete failure:

```text
approval=user-reported-thcs-only-two-2026-07-08
output/thcs-runtime-bridge-repair/write-retake-2026-07-08.json
operations=6
runtimeWrites=1
summaryWrites=5
mutation=committed
postWriteOperations=0
```

Post-write dry-run:

```text
output/thcs-runtime-bridge-repair/post-fix-dry-run-2026-07-08.json
operations=0
readFailures=0
```

Backfilled runtime tests:

| Test ID | Owner | Title | Questions | Visibility |
| --- | --- | --- | ---: | --- |
| `thcs-test-1773261493833-2az9ndh` | `AkwZW3CT4AUvkMpJfgg9FwUh3ug2` | `Retake` | 9 | private |
| `thcs-test-1773673525524-nfe8kkb` | `AkwZW3CT4AUvkMpJfgg9FwUh3ug2` | `PRACTICE TEST 9` | 40 | public |
| `thcs-test-1776114089206-echoejx` | `AkwZW3CT4AUvkMpJfgg9FwUh3ug2` | `DE THI HOC KI II MON TIENG ANH - LOP 7` | 40 | private |

Real Google Chrome verification for teacher `AkwZW3CT4AUvkMpJfgg9FwUh3ug2`
after the first corrective write showed My Content at 14 materials with 3 THCS
rows. The user then clarified that `Retake` had been intentionally deleted, so
that row was removed again and its MaterialSummary was marked `removed`.

The dev teacher bucket `glMHCrzMnyS6AqFcb9I0nlOqQ6X2` had THCS
`thcs_library` metadata-only rows (`sectionSummary` but no full `sections`).
Those stayed out of My Content because they are not launchable tests.

A later comparison with `tmp/tests-export.json` found 17 additional complete
historical THCS runtime rows that still had Firestore `thcs_library` metadata
but no live `/tests` runtime row or MaterialSummary v1 rows. The approved
restore wrote those 17 `/tests` rows plus MaterialSummary fan-out, excluding
the intentionally deleted `Retake`. Post-write dry-run selected zero remaining
rows.

For teacher `hungnguyenzim@gmail.com`
(`AkwZW3CT4AUvkMpJfgg9FwUh3ug2`), the live owner summary inventory then showed
13 owned active THCS tests. Three `users/{uid}/thcs_linked_tests` references to
dev-owned public tests were verified as runtime-ready, but product direction now
defines My Content as owned-only. Those linked/use-as-is tests must not be
merged into My Content; a future Saved/Linked view should own that surface.

Google Chrome proof after the owned-only fix showed My Content for
`hungnguyenzim@gmail.com` at 24 total materials with 13 THCS rows. All 13 owned
THCS titles were visible, `Retake` was absent, dev-owned linked titles
`G10 - CK2 - Test 1/2/3 - Set 1` were absent, no `Linked` badge appeared, and
the browser console warning/error read returned `[]`.

The partial delete root cause was a multi-store cleanup order: Teacher Lobby
removed RTDB `/tests` and MaterialSummary first, then tried Firestore sidecar
deletes. A missing or denied Firestore sidecar delete could throw after the
listing/runtime removal already happened. Teacher Lobby now treats Firestore
sidecar cleanup as best-effort after the authoritative RTDB removal, and the
repair tool's tombstone guard prevents later accidental resurrection from stale
published draft sidecars.

## Retired Pattern

Retired: treating Firestore `thcs_library` as a Teacher Materials source.

Current rule: `thcs_library` is library/metadata support only. Active Teacher
Materials discovery comes from MaterialSummary v1, and THCS runtime launch data
comes from `/tests`.
