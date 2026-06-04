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

Default mode is dry-run. Mutation mode writes one root multi-location RTDB update payload built from the service write plan and requires `--write`, `--approved <approval-id>`, and `--from-report <dry-run-report.json>`. Write mode aborts if Firebase reads fail, if the reviewed report is not dry-run/not-run, if the reviewed report's project/row count/stable digest differs from current planning, or if extracted passage documents fail the Reading V2 publish gate.

Supported filters:

- `--owner <teacherId>`
- `--material-id <materialId>`
- `--created-from <iso>`
- `--created-to <iso>`
- `--limit <n>`
- `--report <path>`
- `--from-report <path>` in write mode only
- `--project <projectId>`

## Proposed Write Families

For each `split-ready` source, the write plan proposes:

- Reading Passage canonical material.
- Reading Passage material version with source document slice.
- Reading Passage canonical published snapshot at `reading_v2/published_snapshots/{passageMaterialId}/{snapshotVersionId}`.
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
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npm run backfill:reading-v2-passages -- --write --approved lead-1"
```

Live-approved mutation command, only after dry-run report review and explicit approval:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npm run backfill:reading-v2-passages -- --write --approved <approval-id> --from-report <reviewed-dry-run-report.json> --owner <teacherId> --report output/prd0052-reading-v2-backfill-write.json"
```

Historical smoke caveat:

- 2026-06-02 dry-run smoke did not mutate data and produced `total=0`, `skipped=3`, `mutation=not-run` because Firebase CLI reads for `reading_v2/material_metadata`, `reading_v2/published_snapshots`, and `reading_v2/full_test_compositions` returned permission failures in this environment.
- 2026-06-04 fix: the runner now normalizes Firebase CLI RTDB paths with a leading `/`, includes `readFailures` in the report/stdout, and aborts write mode before mutation if any source reads fail.
- 2026-06-04 reviewed-gate update: write mode now requires `--from-report <dry-run-report.json>`. `cmd /c npm run backfill:reading-v2-passages -- --write --approved lead-1` failed before Firebase reads with `Mutation mode requires --from-report <dry-run-report.json>.`
- 2026-06-04 superseded dry-run: `output/reading-v2-backfill/prd0052-reading-v2-backfill-dry-run-20260604-reviewed-gate.json` returned `splitReady=1` before extracted passage documents were validated by the publish gate.
- 2026-06-04 fresh publish-gate dry-run: `cmd /c npm run backfill:reading-v2-passages -- --dry-run --project temp-a1437 --report output/reading-v2-backfill/prd0052-reading-v2-backfill-dry-run-20260604-after-publish-gate.json` returned `total=4`, `splitReady=0`, `manualReview=1`, `alreadyBackfilled=3`, `readFailures=0`, `mutation=not-run`. The only remaining legacy source is `studio-material-mojlf55h` / `snapshot-studio-material-mojlf55h-mojlfaqa` (`PRD0048 Live Pipeline 2026-04-29T05-06-58-043Z - Practice Cam 16 Reading Test 03`) with 3 extracted passages and 22 `publish-gate-blocked` issues.
- 2026-06-04 approved no-op write: `cmd /c npm run backfill:reading-v2-passages -- --write --approved user-approved-all-remaining-20260604 --from-report output/reading-v2-backfill/prd0052-reading-v2-backfill-dry-run-20260604-after-publish-gate.json --project temp-a1437 --report output/reading-v2-backfill/prd0052-reading-v2-backfill-write-20260604-no-eligible-sources.json` returned `mutation=committed`, `plannedWriteCount=0`, `readFailures=0`, `splitReady=0`, and `manualReview=1`. This is a reviewed no-op because no source was split-ready; `studio-material-mojlf55h` is owner-deferred source-data manual review because safe repair requires editorial reconstruction, not an automated backfill transform.

2026-06-03 update:

- The backfill write plan now mirrors the live publish contract by writing canonical per-passage `published_snapshots` before student launch/submit can depend on generated Reading Passage rows.
- Live browser QA proved the root risk: Material Catalog summary rows and student-safe projections are not enough; the trusted Reading V2 submit path also expects `reading_v2/published_snapshots/{passageMaterialId}/{snapshotVersionId}`.
- Any approved mutation review must confirm each planned generated passage has all three of these rows: Material Catalog summary, canonical published snapshot, and student-safe projection.
