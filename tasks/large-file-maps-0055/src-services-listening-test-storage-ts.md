# listeningTestStorage.ts Large-File Map

## Full Read

- Path: `src/services/listeningTestStorage.ts`
- Current: 684 lines; `HEAD`: 558 lines; delta: +126.
- Evidence: full `Get-Content`, full `git show HEAD:...`, zero-context diff, and repository caller scan.
- Read complete: 684 / 684 lines at `2026-06-29T12:23:12.6197371+07:00`.

## Top-Level Surface

- Authoring barrel exports: workflow/store/deletion-governance/legacy-resolver functions and authoring contracts at 19-48.
- Local types/exports: `ListeningTestMetadata` 51; `AudioSection` 63; `ListeningAssetCommitter` 81; `ListeningDisplayMode` 101; `QuestionImage` 106; `AudioControlsConfig` 117; `AUDIO_CONTROLS_PRESETS` 129; `ListeningTestData` 161.
- Helpers: `hasCanonicalCommitMetadata` 85-94; `getSectionNumber` 265.
- Public functions: `generateListeningTestId` 256; `saveListeningTestToFirebase` 284; `getListeningTestFromFirebase` 545; `getAllListeningTestsFromFirebase` 589; `updateListeningTestInFirebase` 631; `deleteListeningTestFromFirebase` 676.
- React state/effects: none.

## Side Effects And Branches

- Firebase: `ref`, `set`, and `get` in save/read/list/update.
- R2 check: `r2StorageService.isTempFile` in save.
- Injected commit: `assetCommitter` receives canonical metadata and `R2_PUBLIC_URL`; no direct `moveToPermanent` remains.
- Save branches: missing audio 303-309; canonical/temp preflight 312-326; canonical commit 333-356; residual temp rejection 359-365; optional field formatting 381-485.
- Read branches: missing/non-Listening record 552-571; empty/list filter 598-614.
- Update: existing-record guard 637-643.
- Delete: always blocked, no write 679-682.

Consumers:

- `listeningTestStorage.test.ts` directly exercises save and blocked delete.
- `ListeningPracticeView.tsx`, `ListeningTestPage.tsx`, and `ListeningTestBuilder.tsx` consume shared types/presets.
- Current repository search found no direct local consumer of the authoring barrel reexports.

## Diff Touch Regions

- Import/barrel exports 13-48.
- Canonical commit metadata/types 68-95.
- Save signature/preflight/commit/format 296-391.
- Diagnostic string cleanup 433, 510, 518, 574, 616, 655, 661.
- Blocked physical delete 679-682.

Protected neighboring regions:

- Stable metadata/question/audio-control shapes outside added canonical fields.
- Existing answer completeness and optional-field formatting 392-485.
- Read/list/update behavior 545-675.

## Parity And Responsibility Delta

- Authority match: public compatibility facade remains responsible for legacy Listening record serialization and Firebase CRUD while Task 4/5 domain behavior lives in bounded feature modules.
- Before: the facade directly promoted temp R2 objects and physically deleted test records.
- After: it validates canonical metadata, delegates commit through `ListeningAssetCommitter`, persists returned public compatibility fields, rejects untracked temp URLs, and blocks physical delete.
- Accepted interpretation: +126 lines adds validation, adapter wiring, types, and barrel exposure while removing direct storage mutation authority. No new lifecycle domain responsibility is implemented here.

Characterization:

- `listeningTestStorage.test.ts` covers single-write legacy save, missing audio, canonical commit, temp rejection, public-reader compatibility, no legacy permanent move, and blocked deletion.
- Focused GREEN before Batch E: 59/59 storage/public-reader tests.

## Decomposition Seams

- Created: injected committer and canonical metadata predicate.
- Preserve: stable public types and compatibility CRUD.
- Future approved refactor seams: dedicated authoring barrel; split save validate/commit/format/persist helpers; separate read/list/update repository; deletion remains governed outside this facade.
