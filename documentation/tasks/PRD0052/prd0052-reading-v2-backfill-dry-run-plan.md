# PRD-0052 Reading V2 Passage Backfill Dry-Run Plan

Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

Status: planned and implemented as a pure service. Production mutation remains gated.

## Goal

Backfill old Reading V2 full tests that lack reusable Reading Passage entities.

The dry run must classify each source full test before any write:

- `split-ready`: passage boundaries and answer keys are usable; writes can be proposed.
- `manual-review`: extraction has blocking issues such as ambiguous passage boundaries.
- `already-backfilled`: a native full-test composition already exists with passage refs.

## Safety Rules

- Default mode is dry-run only.
- No production data mutation is allowed without explicit lead approval.
- Backfill writes are deterministic and source-scoped by `materialId:sourceSnapshotVersionId`.
- Rerunning the same source snapshot produces the same Reading Passage ids, composition id, and storage paths.
- Public source material is not automatically published to public Reading Passage library unless the source is explicitly `publicShareable`.
- Non-shareable public sources are downgraded to private Reading Passage backfill rows.

## Implementation Entry Points

- Pure planner: `planReadingV2FullTestPassageBackfill`.
- Write-plan builder: `createReadingV2FullTestPassageBackfillWritePlan`.
- Approval-gated runner: `runReadingV2FullTestPassageBackfill`.
- Service file: `src/services/reading-v2/readingV2Backfill.service.ts`.
- Tests: `src/services/reading-v2/readingV2Backfill.service.test.ts`.

## Proposed Write Families

For each `split-ready` source, the write plan proposes:

- Reading Passage canonical material.
- Reading Passage material version with source document slice.
- Student-safe projection.
- Review projection.
- Reading V2 material metadata.
- Material Catalog listing indexes.
- Full-test composition record.
- Full-test composition version.

## Compatibility Before Backfill

Existing full tests must keep appearing and launching through the existing full-test/material rows and projections before backfill completes.

Compatibility coverage is split across:

- `resolveReadingV2FullTestComposition` for native composition vs legacy-document extraction.
- `useTeacherTests` registry-row behavior for existing material cards.
- `StudentPracticePage` legacy/V2 launch behavior.

## Verification

Run:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2Backfill.service.test.ts src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/hooks/__tests__/useTeacherTests.test.ts src/pages/StudentPracticePage.test.tsx --reporter=basic --pool=forks"
```
