# PRD-0052 Reading V2 Passage Backfill Dry-Run Plan

Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

Status: operational dry-run runner added. Production mutation remains gated behind explicit approval and a reviewed dry-run report.

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
- Operational runner: `scripts/reading-v2-full-test-passage-backfill.ts`.
- NPM script: `npm run backfill:reading-v2-passages -- [options]`.
- CLI helper tests: `src/services/reading-v2/readingV2BackfillCli.test.ts`.

## Operational Runner

The runner reads these RTDB production families through the Firebase CLI:

- `reading_v2/material_metadata`
- `reading_v2/published_snapshots`
- `reading_v2/full_test_compositions`

Default mode is dry-run. Mutation mode writes one root multi-location RTDB update payload built from the service write plan and requires both `--write` and `--approved <approval-id>`.

Supported filters:

- `--owner <teacherId>`
- `--material-id <materialId>`
- `--created-from <iso>`
- `--created-to <iso>`
- `--limit <n>`
- `--report <path>`
- `--project <projectId>`

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

Runner-specific verification:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2BackfillCli.test.ts src/services/reading-v2/readingV2Backfill.service.test.ts --reporter=basic"
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npm run backfill:reading-v2-passages -- --help"
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npm run backfill:reading-v2-passages -- --dry-run --limit 1 --report output/prd0052-reading-v2-backfill-dry-run-smoke.json"
```

Live-approved mutation command, only after dry-run report review and explicit approval:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npm run backfill:reading-v2-passages -- --write --approved <approval-id> --owner <teacherId> --report output/prd0052-reading-v2-backfill-write.json"
```

Current smoke caveat:

- 2026-06-02 dry-run smoke did not mutate data and produced `total=0`, `skipped=3`, `mutation=not-run` because Firebase CLI reads for `reading_v2/material_metadata`, `reading_v2/published_snapshots`, and `reading_v2/full_test_compositions` returned permission failures in this environment.
