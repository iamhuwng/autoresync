# PRD 0057: Listening Authoring Draft, Publish, And Version Behavior

Status: Draft child PRD - B2 Option B data contract approved; implementation remains blocked pending Task 1.11 parent acceptance, Task 1.12 approval/HARD STOP, Task 3 shared-presentation stability, minimum PRD-0058 foundation, and explicit implementation authorization
Created: 2026-06-20
Task number: 0057
Parent PRD: `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
Execution task: Task 1.7 child-PRD portion only

## 1. Introduction / Overview

Current Listening authoring has one save operation. That operation is effectively publish-like: it rejects missing audio, writes one final test record under the existing `tests/{testId}` path, and sets `isPublished: true`.

This child PRD defines the future Listening authoring behavior split into lenient Save draft, strict Publish, immutable published versions, and revision drafts. It records the approved OQ-2 legacy transition: the first edit of a legacy mutable published R2 test freezes that record as immutable version 1, creates a revision draft, keeps existing assignments, sessions, attempts, and results pinned to version 1, and resolves legacy raw R2 URLs through a Listening-owned read adapter without requiring registry identity during read.

This PRD is planning only. It does not authorize runtime, source, worker, Firebase rule, R2 lifecycle, registry, reconciliation, cleanup, delivery, solo/homework, live-session, Reading V2, parser, scoring, or Google Drive implementation.

## 2. Goals

1. Define explicit Listening Save draft and Publish behavior.
2. Preserve current single-save behavior until this child PRD is approved and implemented in a later packet.
3. Make Save draft lenient enough for teacher work-in-progress.
4. Make Publish strict enough to protect students, assignments, sessions, attempts, and results.
5. Define immutable published versions and revision drafts for Listening tests.
6. Define the approved legacy mutable-published-test transition.
7. Keep legacy raw R2 URL reads compatible without requiring asset registry identity.
8. Keep `ListeningTestBuilder.tsx` a thin orchestrator and `listeningTestStorage.ts` a public persistence facade.
9. Define bounded future modules under `src/features/assessment/listening/**`.
10. Keep storage lifecycle, S0 worker hardening, solo/homework runtime, live-session runtime, Reading V2 internals, and Google Drive behavior out of scope.

## 3. User Stories

1. As a teacher, I want to save a Listening draft even when audio or questions are incomplete so I can return to unfinished work without losing progress.
2. As a teacher, I want clear warnings on incomplete drafts so I know what must be fixed before publishing.
3. As a teacher, I want Publish to block missing audio, empty questions, invalid answers, and inaccessible audio so students never receive a broken test.
4. As a teacher editing an old published Listening test, I want the old version preserved so existing assignments and results remain stable.
5. As a student, I want an assigned Listening test to keep using the exact version my teacher assigned, even if the teacher later edits the test.
6. As a reviewer, I want legacy R2 audio URLs to keep resolving for existing tests and results while the new asset model is introduced safely.
7. As a junior developer, I want exact file boundaries and stop conditions so I do not accidentally edit live runtime, solo runtime, worker, storage lifecycle, or Reading V2 code.

## 4. Functional Requirements

FR-001. The system must expose an explicit Save draft action for Listening authoring after this child PRD is implemented.

FR-002. The system must expose an explicit Publish action for Listening authoring after this child PRD is implemented.

FR-003. Until implementation of this child PRD lands, the existing single Save Test behavior must remain unchanged.

FR-004. Save draft must be lenient: it may persist missing audio, empty questions, incomplete answers, and incomplete metadata with warnings.

FR-005. Save draft must return structured warnings that identify section number, question number, field name, severity, and teacher guidance.

FR-006. Save draft must not create an assignment-ready published test.

FR-007. Save draft must not mark a test as student-visible.

FR-008. Save draft must not persist expiring temp URLs as durable saved content once the minimum storage foundation exists.

FR-009. Before the minimum storage foundation exists, audio-bearing Save draft implementation remains blocked.

FR-010. Publish must be strict: it must block missing audio.

FR-011. Publish must block empty, invalid, or unanswerable questions.

FR-012. Publish must block missing answer keys.

FR-013. Publish must block inaccessible audio.

FR-014. Publish must block non-range-capable audio once the delivery contract exists.

FR-015. Publish must prove visible validation errors and teacher guidance before any data write is treated as successful.

FR-016. Publish must be the only operation that creates a new immutable published version.

FR-017. Published versions must be immutable after creation.

FR-018. Editing a published test must create a revision draft instead of mutating the published version.

FR-019. First edit of a legacy mutable published R2 test must freeze the legacy record as immutable version 1.

FR-020. First edit of a legacy mutable published R2 test must create a revision draft for teacher edits.

FR-021. Existing assignments, live sessions, homework sessions, attempts, and results must stay pinned to legacy version 1.

FR-022. Legacy raw R2 URLs must resolve through a Listening-owned read adapter without requiring registry identity during read.

FR-023. The legacy raw R2 URL read adapter must be read-only for legacy resolution and must not create registry rows by side effect.

FR-024. New draft/publish write behavior must include optimistic conflict rejection.

FR-025. New draft/publish write behavior must include idempotency keys for explicit Save draft and Publish clicks.

FR-026. Duplicate click, retry, and lost-response behavior must not create duplicate published versions.

FR-027. Draft soft delete must hide a draft from normal authoring lists while preserving recovery until approved retention governance allows final removal.

FR-028. Draft recovery must restore the same draft identity and conflict token when allowed.

FR-029. Published archive must preserve immutable versions required by assignments, sessions, attempts, results, and review.

FR-030. Published hard deletion is not part of this child PRD unless a future approved governance packet explicitly authorizes it.

FR-031. Parser skip/manual entry must remain a builder-owned authoring path.

FR-032. Parser output must remain a draft input, not a publish authority.

FR-033. Shared assessment UI primitives must remain presentation-only.

FR-034. `ListeningTestBuilder.tsx` must remain a thin orchestrator.

FR-035. `src/services/listeningTestStorage.ts` must remain a public persistence facade.

FR-036. New behavior must be born in bounded modules under `src/features/assessment/listening/**`.

FR-037. New human-maintained production files must target 400 lines or fewer.

FR-038. Before touching `ListeningTestBuilder.tsx` or `listeningTestStorage.ts`, implementation must create large-file maps and before/after line-count evidence.

FR-039. Google Drive behavior must remain unchanged.

FR-040. S0 upload-worker hardening is a dependency but not part of this child PRD.

FR-041. R2 asset lifecycle, registry, reconciliation, cleanup, and delivery are dependencies owned by the future storage child PRD.

FR-042. Solo/homework runtime and live-session runtime must remain out of scope.

FR-043. Reading V2 internals must remain out of scope.

FR-044. Current source paths are authority where older implementation logs have stale paths.

## 5. Non-Goals / Out of Scope

1. Implementing any runtime or application code in this packet.
2. Modifying `src/services/r2Storage.ts` except future dependency-contract references.
3. Modifying `cloudflare/**`.
4. Modifying Worker source, Worker deployment, Worker bindings, or Worker rollback.
5. Modifying Firebase rules.
6. Creating or changing R2 lifecycle configuration.
7. Creating asset registry, heartbeat, reconciliation, cleanup, or private delivery.
8. Adding signed playback URLs.
9. Changing parser schemas or parser selection logic.
10. Changing scoring.
11. Changing published payload implementation in this planning packet.
12. Changing solo/homework runtime.
13. Changing live-session runtime.
14. Changing `AudioPlayer`.
15. Changing teacher monitor behavior.
16. Changing Reading V2 internals.
17. Changing Google Drive upload, playback, migration, cleanup, or error behavior.
18. Creating the PRD-0055 traceability matrix.
19. Marking PRD-0055 Task 1.7 complete.
20. Starting Task 2, Task 4, or implementation.

## 6. Verified Current Authoring Baseline

Current source evidence:

1. `src/skills/listening/builders/ListeningTestBuilder.tsx:99-120` defines one authoring step state and `isPublic`, not draft/publish lifecycle state.
2. `src/skills/listening/builders/ListeningTestBuilder.tsx:129-142` marks R2 storage ready and keeps Google-sign-in-compatible UI residue.
3. `src/skills/listening/builders/ListeningTestBuilder.tsx:201-222` uploads audio through `r2StorageService.uploadAudioReplacement(...)`.
4. `src/skills/listening/builders/ListeningTestBuilder.tsx:320-357` validates audio URLs and records missing audio as an error.
5. `src/skills/listening/builders/ListeningTestBuilder.tsx:361-373` blocks leaving the Audio step unless audio URL validation passes.
6. `src/skills/listening/builders/ListeningTestBuilder.tsx:434-462` uses `listeningRouter.parseListening(...)` for parser mode.
7. `src/skills/listening/builders/ListeningTestBuilder.tsx:1438-1455` exposes `Skip -> Add Manually` and `Parse with AI`.
8. `src/skills/listening/builders/ListeningTestBuilder.tsx:1984-2052` starts the Step 4 questions branch; `AssessmentAuthoringSection` begins at `src/skills/listening/builders/ListeningTestBuilder.tsx:1985`.
9. `src/skills/listening/builders/ListeningTestBuilder.tsx:2160-2249` shows Review & Save, a public checkbox, and audio-section configured/missing status.
10. `src/skills/listening/builders/ListeningTestBuilder.tsx:2252-2260` shows save errors only in the review step.
11. `src/skills/listening/builders/ListeningTestBuilder.tsx:2282-2294` exposes one final `Save Test` button, not separate Save draft and Publish buttons.
12. `src/skills/listening/builders/ListeningTestBuilder.tsx:491-513` calls one storage operation, `saveListeningTestToFirebase(...)`.
13. `src/skills/listening/builders/ListeningTestBuilder.tsx:515-518` treats successful save as complete and navigates away.
14. `src/skills/listening/builders/ListeningTestBuilder.tsx:517` uses `alert(...)`; future implementation must replace this with the shared announcement system.
15. `src/skills/listening/builders/ListeningTestBuilder.test.tsx:109-135` covers layout and parser-skip display, not draft/publish behavior.
16. `src/services/listeningTestStorage.ts:231-244` exposes one save entry point with no draft ID, version ID, conflict token, or idempotency key arguments.
17. `src/services/listeningTestStorage.ts:246-247` generates a new test ID inside save.
18. `src/services/listeningTestStorage.ts:249-255` returns failure when any audio section has no `audioUrl`.
19. `src/services/listeningTestStorage.ts:262-290` attempts temp-to-permanent moves for `audioUrl` and `streamUrl`.
20. `src/services/listeningTestStorage.ts:277-280` continues with the temp URL if an audio move fails.
21. `src/services/listeningTestStorage.ts:353-364` calculates missing answer count but does not block save.
22. `src/services/listeningTestStorage.ts:367-438` builds one final test snapshot and writes it with `set(ref(database, tests/${testId}), testData)`.
23. `src/services/listeningTestStorage.ts:378` writes `isPublished: true`.
24. `src/services/listeningTestStorage.ts:561-583` updates a Listening test by merging and replacing the existing `tests/${testId}` record with no immutable version model.
25. `src/services/listeningTestStorage.ts:606-620` hard-deletes the current test record by setting it to `null`.
26. `src/services/r2Storage.ts:1-8` documents temp upload followed by permanent movement on save.
27. `src/services/r2Storage.ts:11-12` points to the live R2 Worker and public R2 URL.
28. `src/services/r2Storage.ts:44-105` uploads to a `temp/` folder and returns public URL fields.
29. `src/services/r2Storage.ts:124-200` moves temp keys to permanent keys and falls back to temp URLs on move failure.
30. `src/services/r2Storage.ts:267-276` may overwrite an existing object key through `uploadFileAtKey(...)` when replacing existing audio.
31. `src/pages/TestBuilderRouter.tsx:36-40` routes Listening authoring to `ListeningTestBuilder` and still lists Google Drive feature residue.

Packet 1I correction - 2026-06-20: the `src/services/r2Storage.ts` evidence in this section describes the pre-PRD-0056-S0 state. Re-verify this baseline after PRD-0056 S0 deploys and before any PRD-0057 implementation relies on upload/move behavior. FR-044 applies at implementation time; it does not require changing current source during PRD creation.

Current absent behavior:

1. No durable Listening draft lifecycle exists in the inspected files.
2. No immutable Listening version model exists in the inspected files.
3. No optimistic concurrency token exists in the inspected save/update contracts.
4. No idempotency key exists in the inspected save/update contracts.
5. No separate Save draft and Publish button pair exists in the current builder.
6. No live-session file is part of current Listening authoring save.
7. No solo/homework runtime file is part of current Listening authoring save.
8. `AudioPlayer` is not used by the builder preview path; the preview uses native `<audio>`.
9. No Reading V2 internal is part of the current Listening builder save path.

## 7. Target Authoring Model

Target model:

```text
authoring session -> draft -> publish -> immutable published version
published version -> revision draft -> publish -> new immutable published version
```

Rules:

1. Drafts are mutable by the owning teacher subject to conflict checks.
2. Published versions are immutable.
3. Revision drafts are mutable drafts whose base is a published version.
4. Existing assignments, sessions, attempts, and results resolve a pinned immutable version, never a mutable draft.
5. The current legacy mutable record becomes version 1 only at the first edit boundary.
6. Legacy raw R2 URL reads remain compatible through the read adapter.
7. The authoring model must not assume S0 hardening is deployed until PRD-0056 implementation evidence proves it.
8. The authoring model must not assume the future storage lifecycle is deployed until that child PRD implementation evidence proves it.

## 8. Save Draft Semantics

Save draft behavior:

1. Save draft is explicit.
2. Save draft is teacher-owned and authenticated.
3. Save draft may save missing audio.
4. Save draft may save empty questions.
5. Save draft may save incomplete answers.
6. Save draft may save incomplete metadata when the missing fields are not required for later recovery.
7. Save draft returns warnings, not publish blockers, for incomplete audio/questions/answers.
8. Save draft must not create student-visible content.
9. Save draft must not update assignments, sessions, attempts, or results.
10. Save draft must not create a published version.
11. Save draft must include an idempotency key for each explicit user click.
12. Save draft must include an expected conflict token from the latest loaded draft.
13. Duplicate Save draft clicks with the same idempotency key return the same logical result.
14. Lost response retry with the same idempotency key must not create duplicate drafts.
15. Save draft must never promote audio solely because a file was uploaded.
16. Save draft must not persist expiring temp URLs as durable saved content once the minimum storage foundation exists.
17. Before the minimum storage foundation exists, implementation of audio-bearing Save draft remains blocked.

## 9. Publish Semantics

Publish behavior:

1. Publish is explicit.
2. Publish validates the latest draft state.
3. Publish blocks missing audio.
4. Publish blocks empty questions.
5. Publish blocks missing answers.
6. Publish blocks invalid question structure.
7. Publish blocks question count mismatch when it would break student runtime or scoring.
8. Publish blocks inaccessible audio.
9. Publish blocks non-range-capable audio after the delivery contract exists.
10. Publish blocks unresolved storage commit failures.
11. Publish writes one immutable version.
12. Publish must be idempotent per explicit publish key.
13. Publish retry after a lost response must return the already-created version for the same idempotency key.
14. Publish with stale conflict token must fail and instruct the teacher to reload or merge.
15. Publish must preserve legacy assignments, sessions, attempts, and results pinned to the prior version.
16. Publish must emit a user-facing success or failure announcement through the shared announcement system.
17. Publish must be observable through feature tracking.

## 10. Immutable Version And Revision Model

Required model:

1. Every published Listening test has immutable version identity.
2. Every published version records its base draft or base legacy source.
3. A revision draft records the version it was created from.
4. Publishing a revision draft creates a new immutable version.
5. Assignments, sessions, attempts, and results keep their original version pointer.
6. Current teacher library views may point at the latest published version after implementation, but that must not rewrite old result/session references.
7. Version comparison uses monotonic version numbers or approved immutable IDs from the future data contract.
8. The exact persistence paths for new draft/version records are not selected by this PRD.
9. The future traceability matrix and approved implementation packet must bind exact paths before code changes.

Proposed, pending product-owner plus architecture/security approval - draft/version paths:

1. Option A - reuse existing root paths: keep mutable draft content under existing `drafts/{draftId}` and published compatibility under `tests/{testId}`, adding version subrecords or linked indexes. This minimizes route/library disruption but risks mixing future Listening immutable-version semantics into broad legacy paths.
2. Option B - create Listening-owned namespaced paths: write target authoring data under `listening_authoring/drafts/{draftId}`, `listening_authoring/versions/{versionId}`, `listening_authoring/revision_drafts/{draftId}`, and `listening_authoring/operations/{operationId}`; keep `tests/{testId}` as the legacy published compatibility/read path and version-1 source until cutover.
3. Recommendation: Option B, because it separates new conflict/idempotency/version rules from existing generic `drafts/{draftId}` and mutable `tests/{testId}` behavior.
4. Required approval must state explicitly whether `drafts/{draftId}` is reused, whether `tests/{testId}` remains only legacy compatibility or also target publish output, and which RTDB rules section owns create/read/update/delete validation.
5. `database.rules.json:513-518` already defines a generic root `drafts/{draftId}` rule and `database.rules.json:695-699` defines Reading V2 `reading_v2/drafts/{draftId}`. Neither is an approved Listening draft/version target until this block is approved.

## 11. Legacy Published Test Transition

Approved OQ-2 behavior:

1. On first edit of a legacy mutable published R2 test, freeze the existing record as immutable version 1.
2. Create a revision draft from version 1.
3. Keep existing assignments pinned to version 1.
4. Keep existing sessions pinned to version 1.
5. Keep existing attempts pinned to version 1.
6. Keep existing results pinned to version 1.
7. Do not rewrite result payload audio references during the first-edit transition.
8. Do not require registry identity to read legacy raw R2 URLs.
9. Do not create storage registry rows as a side effect of legacy reads.
10. Stop if a legacy record lacks enough information to freeze a safe version 1; record the blocker and require product-owner plus architecture review.

## 12. Legacy Raw R2 URL Read Adapter Requirement

The Listening-owned legacy read adapter must:

1. Accept a legacy immutable version or retained result with raw R2 URL references.
2. Resolve public R2 URLs that already exist in saved legacy records.
3. Refuse to treat raw URL text as write authority.
4. Refuse cross-owner writes.
5. Avoid registry identity requirements for read compatibility.
6. Avoid registry mutation during read compatibility.
7. Return a normalized playback reference for current consumers.
8. The normalized playback reference is read-only compatibility output and must not write Firebase, R2, media asset registry rows, cleanup queues, or audit records.
9. Preserve current public R2 delivery until the future delivery child PRD proves private signed delivery gates.
10. Be bounded under a Listening adapter module, not inside `AudioPlayer`, live-session code, or Reading V2 code.

Proposed module:

- `src/features/assessment/listening/adapters/legacyListeningAudioReadAdapter.ts` - read-only legacy R2 URL compatibility normalization.

## 13. Validation Rules

Save draft validation:

1. Missing audio: warning.
2. Empty question: warning.
3. Missing answer: warning.
4. Invalid metadata that prevents recovery: blocker.
5. Unsupported audio format before upload: blocker.
6. Oversize file before upload: blocker.
7. Unauthorized teacher: blocker.
8. Stale conflict token: blocker.

Publish validation:

1. Missing audio: blocker.
2. Empty question: blocker.
3. Missing answer: blocker.
4. Invalid question type: blocker.
5. Invalid image-mode answer mapping: blocker.
6. Inaccessible audio: blocker.
7. Non-range-capable audio after the delivery contract exists: blocker.
8. Uncommitted or temp audio after the storage foundation exists: blocker.
9. Storage commit partial failure: blocker.
10. Stale conflict token: blocker.
11. Duplicate publish key for different payload: blocker.

Validation output contract:

1. Each issue has `code`, `severity`, `scope`, `field`, `message`, and optional `targetStep`.
2. `severity` values are `warning` or `blocker`.
3. Save draft may succeed with warnings.
4. Publish may succeed only with zero blockers.

## 14. Parser Skip / Manual Entry Boundaries

Parser and manual entry rules:

1. Existing AI parse path remains builder-owned.
2. Existing `Skip -> Add Manually` path remains allowed.
3. Parser output populates draft authoring fields only.
4. Parser output never bypasses Save draft or Publish validation.
5. Parser errors must preserve teacher-entered text and expose actionable guidance.
6. Silent parser fallback is prohibited.
7. Parser schema changes are out of scope for this child PRD.
8. Parser scoring changes are out of scope for this child PRD.

## 15. Audio Dependency Contract

Authoring depends on audio infrastructure but does not own it:

1. PRD-0056 S0 must harden upload/move authorization before storage lifecycle work can be trusted.
2. The future R2 asset lifecycle child PRD must define minimum storage foundation before audio-bearing Save draft can ship.
3. The storage child PRD must define how uploaded audio becomes a durable saved-draft reference.
4. The storage child PRD must define how Publish reuses committed draft assets.
5. The storage child PRD must define how failed, abandoned, replaced, and never-saved uploads are cleaned up.
6. This authoring PRD must not select new storage lifecycle paths, registry paths, heartbeat paths, or cleanup paths.
7. This authoring PRD must preserve current single-save behavior until the dependency chain is implemented and approved.
8. The 10-audio-files-per-test rule is application-level authoring/storage validation, not S0 Worker ownership.
9. The 50 MB per-file rule may be enforced by S0 and must also be represented in authoring validation guidance.

## 16. Draft Soft Delete And Recovery

Draft soft delete behavior:

1. Draft discard/removal must be explicit.
2. Draft soft delete hides the draft from normal authoring lists.
3. Draft soft delete must not delete audio while a saved draft reference still requires it.
4. Draft soft delete must preserve recovery metadata until approved retention governance allows final removal.
5. Draft recovery restores the same logical draft identity where possible.
6. Draft recovery must use conflict checks.
7. Draft recovery must announce success or failure through the shared announcement system.
8. Draft final removal and object deletion depend on the future storage lifecycle child PRD.

## 17. Published Archive / Deletion Governance

Published archive behavior:

1. Archive is the default teacher-facing removal behavior for published tests.
2. Archive must not delete immutable versions required by assignments, sessions, attempts, results, or review.
3. Archive must not rewrite legacy version 1.
4. Archive must not delete audio while any retained reference exists.
5. Archive must announce the durable outcome accurately.
6. Hard delete/disposition of published Listening tests requires separate governance approval.
7. Current `deleteListeningTestFromFirebase(...)` hard-delete behavior must not become the future published-test removal path without explicit governance and storage-proof approval.
8. Google Drive-backed test disposition remains a separate cleanup/deletion task and is not part of this PRD.

## 18. Conflict, Idempotency, And Retry Model

Conflict model:

1. Every mutable draft read returns a conflict token.
2. Every Save draft, Publish, soft delete, restore, archive, and discard operation submits the expected token.
3. If the expected token is stale, the operation fails closed with a recoverable conflict message.
4. The UI must not silently overwrite another tab's changes.
5. Conflict resolution UI may offer reload or copy-to-clipboard recovery, but merge UI is not required by this child PRD.

Idempotency model:

1. Every explicit Save draft click generates one idempotency key.
2. Every explicit Publish click generates one idempotency key.
3. Every explicit archive/restore/discard click generates one idempotency key.
4. Retrying the same operation with the same key returns the same logical result when inputs match.
5. Reusing the same key with different payload fails closed.
6. Duplicate Publish clicks cannot create duplicate immutable versions.
7. Lost response recovery must not create duplicate drafts or versions.

Retry model:

1. Network failure before server acceptance may retry with the same idempotency key.
2. Network failure after server acceptance must return the existing result when retried with the same idempotency key.
3. Storage commit failure blocks Publish and leaves the prior committed version authoritative.
4. Save draft partial failure must expose a warning/blocker state and must not claim durable audio retention unless the storage commit is proven.

## 19. UI Composition And File-Architecture Boundaries

UI composition rules:

1. `ListeningTestBuilder.tsx` remains a thin orchestrator.
2. The builder may import bounded authoring hooks/services and pass state into presentation components.
3. The builder must not gain draft/version/storage domain logic inline.
4. Shared UI remains presentation-only.
5. Shared UI receives validation state as props and does not calculate Listening-specific validation.
6. Existing shared primitives may be reused only when heading, action, status, and accessibility semantics match.
7. No new Mantine dependency may be added.
8. Existing Mantine `AppShell` residue is not approval to expand Mantine use.

Proposed future module home:

- `src/features/assessment/listening/authoring/listeningAuthoringWorkflow.ts` - orchestrates draft, publish, revision, archive, restore, conflict, and idempotency calls.
- `src/features/assessment/listening/authoring/listeningAuthoringValidation.ts` - calculates Save draft warnings and Publish blockers.
- `src/features/assessment/listening/authoring/useListeningAuthoringState.ts` - React state adapter for builder orchestration.
- `src/features/assessment/listening/authoring/listeningAuthoringAnnouncements.ts` - maps save/publish/archive/restore/discard outcomes to shared announcements.
- `src/features/assessment/listening/storage/listeningAuthoringStorageFacade.ts` - bounded implementation behind `src/services/listeningTestStorage.ts`; exact persistence paths require approved storage/data contract.
- `src/features/assessment/listening/storage/listeningVersioningService.ts` - immutable version/revision behavior and legacy first-edit transition.
- `src/features/assessment/listening/adapters/legacyListeningAudioReadAdapter.ts` - legacy raw R2 URL read compatibility.
- `src/features/assessment/listening/types/listeningAuthoring.types.ts` - draft, version, validation, warning, conflict, and idempotency contracts.

No third scattered Listening ownership root is allowed unless product owner plus architecture reviewer approve it in findings before implementation.

Current line counts that future implementation must record before/after:

1. `src/skills/listening/builders/ListeningTestBuilder.tsx` - 2304 lines at Packet 1D verification.
2. `src/services/listeningTestStorage.ts` - 634 lines at Packet 1D verification.
3. `src/skills/listening/builders/ListeningTestBuilder.test.tsx` - 137 lines at Packet 1D verification.
4. `src/services/r2Storage.ts` - 446 lines at Packet 1D verification.
5. `src/pages/TestBuilderRouter.tsx` - 196 lines at Packet 1D verification.

Large-file maps are required before any future implementation touches `ListeningTestBuilder.tsx` or `listeningTestStorage.ts`.

## 20. Exact Owned And Protected Files

Owned or likely-owned future implementation targets:

1. `src/skills/listening/builders/ListeningTestBuilder.tsx` - thin orchestration and button wiring only.
2. `src/skills/listening/builders/ListeningTestBuilder.test.tsx` - builder authoring behavior tests.
3. `src/services/listeningTestStorage.ts` - public persistence facade only.
4. `src/features/assessment/listening/authoring/listeningAuthoringWorkflow.ts` - future bounded workflow module.
5. `src/features/assessment/listening/authoring/listeningAuthoringWorkflow.test.ts` - workflow tests.
6. `src/features/assessment/listening/authoring/listeningAuthoringValidation.ts` - validation module.
7. `src/features/assessment/listening/authoring/listeningAuthoringValidation.test.ts` - validation tests.
8. `src/features/assessment/listening/authoring/useListeningAuthoringState.ts` - builder state adapter.
9. `src/features/assessment/listening/authoring/listeningAuthoringAnnouncements.ts` - announcement mapping.
10. `src/features/assessment/listening/storage/listeningAuthoringStorageFacade.ts` - facade-backed storage adapter.
11. `src/features/assessment/listening/storage/listeningVersioningService.ts` - version/revision behavior.
12. `src/features/assessment/listening/adapters/legacyListeningAudioReadAdapter.ts` - legacy read adapter.
13. `src/features/assessment/listening/types/listeningAuthoring.types.ts` - authoring domain types.
14. `src/config/featureRegistry.ts` - only if future implementation adds or renames tracked user-facing actions.
15. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - append-only evidence after future implementation subtasks.

Protected/out-of-scope:

1. `src/services/r2Storage.ts` except dependency-contract references.
2. `cloudflare/**`.
3. `database.rules.json`.
4. `firestore.rules`.
5. `firebase.json`.
6. `src/components/practice/ListeningPracticeView.tsx`.
7. `src/skills/listening/components/AudioPlayer.tsx`.
8. `src/skills/listening/components/ListeningTestPage.tsx`.
9. `src/pages/TeacherTestMonitorPage.tsx`.
10. `src/components/test/AudioProgressPanel.tsx`.
11. `src/components/test/TeacherTestControlBar.tsx`.
12. `src/components/test/HeadphoneRequestPanel.tsx`.
13. `src/hooks/audio/useMasterAudioState.ts`.
14. `src/hooks/audio/useAudioSync.ts`.
15. `src/hooks/monitor/useMonitorControls.ts`.
16. `src/pages/TestPageRouter.tsx`.
17. `src/components/results/ReviewTab.tsx` except explicit future compatibility proof owned by another child PRD.
18. Reading V2 internals.
19. `r2-backup-worker/**` except future read-only dependency review.
20. Google Drive services and tests.

## 21. Data And Storage Dependencies

This child PRD defines authoring behavior, not final storage schema.

Dependencies:

1. PRD-0056 S0 must be implemented and proven before trusting upload/move authority.
2. The future R2 asset lifecycle child PRD must define minimum storage foundation before audio-bearing Save draft can ship.
3. The future storage child PRD must define exact asset identity, registry, reference tracking, cleanup, reconciliation, and delivery contracts.
4. The future traceability matrix must bind every authoring requirement to exact child PRDs, tasks, tests, and evidence.
5. Firebase paths for new draft/version storage are not selected in this PRD.
6. Existing `tests/{testId}` behavior is current-state evidence, not approval to mutate published tests in place after implementation.
7. Implementation must stop if it needs a path, schema, lifecycle operation, deletion rule, or delivery rule not approved by this PRD plus the future storage child PRD.

Minimum storage foundation required before audio-bearing draft implementation:

1. Authenticated owner-scoped upload authority.
2. Durable saved-draft audio reference that is not an expiring temp URL.
3. Publish commit path that reuses committed draft audio without byte overwrite.
4. Replacement safety that preserves old committed audio until save/publish success.
5. Cleanup candidate marking for abandoned, failed, cancelled, replaced, and never-saved uploads.
6. Verification that saved drafts and published versions never point at temp URLs.

## 22. Announcements And Observability

Announcement requirements:

1. Save draft success uses shared announcement system with `role="status"`.
2. Save draft warning uses shared announcement system with `role="status"` or `role="alert"` depending on severity.
3. Save draft failure uses shared announcement system with `role="alert"`.
4. Publish success uses shared announcement system with `role="status"`.
5. Publish blocker/failure uses shared announcement system with `role="alert"`.
6. Archive, restore, discard, and recovery outcomes use shared announcement system.
7. Announcement copy must describe the durable outcome, not just optimistic UI state.
8. `alert(...)` must not be used for future save/publish/archive/restore/discard outcomes.

Observability requirements:

1. Future user-facing Save draft action must be tracked.
2. Future Publish action must be tracked.
3. Future archive, restore, discard, and conflict actions must be tracked if exposed.
4. `src/config/featureRegistry.ts` must list any new or renamed action names before implementation is complete.
5. Tracking must not log raw audio URLs, tokens, signed URLs, raw object keys, or secret values.

## 23. Accessibility Requirements

1. Save draft and Publish buttons must have distinct accessible names.
2. Validation summary must expose publish blockers with `role="alert"` when blocking.
3. Draft warnings may use `role="status"` when non-blocking.
4. Focus must move to the first validation blocker after failed Publish.
5. Keyboard users must be able to trigger Save draft, Publish, archive, restore, discard, and recovery actions.
6. Duplicate-click disabled states must remain perceivable.
7. Icon-only controls must have accessible names.
8. Touch targets for primary authoring actions must be at least 44px where applicable.
9. Heading levels must remain logical through mode select, audio, question, review, draft, and publish states.
10. Error text must identify the exact section/question affected.

## 24. Mobile/Desktop Requirements

1. Desktop authoring must keep current teacher-oriented layout stable until the split implementation lands.
2. Mobile/tablet layouts must stack Save draft and Publish actions without hiding either action.
3. Button labels must stay readable at tablet widths.
4. Validation warnings and blockers must remain visible without horizontal scrolling.
5. Audio section status must remain readable on narrow screens.
6. Long validation lists must support keyboard and touch navigation.
7. Future responsive behavior must prefer CSS layout and existing platform hooks over new direct `window.innerWidth` or `window.matchMedia()` usage.
8. No student runtime mobile layout is part of this child PRD.

## 25. Testing Strategy

Service tests:

1. Create draft with missing audio succeeds with warning.
2. Create draft with empty question succeeds with warning.
3. Update draft with valid conflict token succeeds.
4. Update draft with stale conflict token fails.
5. Save draft duplicate click with same idempotency key returns same result.
6. Save draft same idempotency key with changed payload fails.
7. Publish with missing audio fails.
8. Publish with empty question fails.
9. Publish with missing answer fails.
10. Publish with inaccessible audio fails.
11. Publish with valid complete draft creates one immutable version.
12. Publish retry with same idempotency key returns same version.
13. Duplicate Publish click cannot create two versions.
14. First edit of legacy mutable published R2 test freezes version 1.
15. First edit of legacy mutable published R2 test creates revision draft.
16. Existing assignment/result/session references remain pinned to version 1.
17. Legacy raw R2 URL resolver returns a normalized read reference without registry identity.
18. Draft soft delete hides the draft.
19. Draft restore recovers the draft.
20. Published archive preserves retained versions.
21. Published hard delete remains blocked without governance.

Builder tests:

1. Save draft action is visible after implementation.
2. Publish action is visible after implementation.
3. Current single Save Test behavior remains preserved until the split lands.
4. Save draft with missing audio shows warning and does not call Publish.
5. Publish with missing audio shows blocker and prevents publish write.
6. Publish with empty question shows blocker and focuses validation.
7. Duplicate Save draft click disables or coalesces the second click.
8. Duplicate Publish click disables or coalesces the second click.
9. Parser path still populates draft questions.
10. Parser skip/manual mode still works.
11. Review step retains public/private control semantics until a child PRD changes it.
12. Shared UI primitive remains presentation-only.

Announcement tests:

1. Save draft success announcement.
2. Save draft warning announcement.
3. Save draft failure announcement.
4. Publish success announcement.
5. Publish blocker announcement.
6. Archive announcement.
7. Restore announcement.
8. Discard announcement.
9. No `alert(...)` path for future save/publish/archive/restore/discard outcomes.

Accessibility tests:

1. Heading order remains valid.
2. Save draft and Publish have distinct accessible names.
3. Publish blockers use alert semantics.
4. Draft warnings use status semantics where non-blocking.
5. Focus moves to first blocker after failed Publish.
6. Icon controls have names.
7. Applicable touch targets are at least 44px.

Integration and boundary tests:

1. Old current behavior is preserved until the split lands.
2. No solo/homework runtime file changes are required.
3. No live-session runtime file changes are required.
4. No `AudioPlayer` internal changes are required.
5. No Reading V2 internal changes are required.
6. No Cloudflare Worker changes are required.
7. No Firebase rules changes are included unless a later implementation packet explicitly approves them after the exact path contract exists.
8. Boundary grep confirms no Listening authoring module imports Reading V2 internals.
9. Boundary grep confirms shared assessment modules do not import Listening internals.

Application test suites are not authorized by this planning packet.

## 26. Rollout Plan

Future implementation rollout sequence:

1. Reconcile this child PRD against PRD-0055 tasklist and traceability matrix.
2. Confirm PRD-0056 S0 implementation status; do not assume it is deployed.
3. Confirm future R2 asset lifecycle child PRD status; block audio-bearing drafts until minimum storage foundation exists.
4. Create large-file maps for `ListeningTestBuilder.tsx` and `listeningTestStorage.ts`.
5. Add characterization tests for current single Save Test behavior.
6. Add target tests for Save draft warnings, Publish blockers, versions, legacy transition, conflict, and idempotency.
7. Build bounded modules under `src/features/assessment/listening/**`.
8. Wire thin builder orchestration.
9. Wire public facade delegation through `listeningTestStorage.ts`.
10. Verify old current behavior remains preserved until feature cutover.
11. Run focused service, builder, announcement, accessibility, and boundary tests.
12. Run browser proof for teacher Save draft and Publish after implementation approval.
13. Roll out behind an approved behavior gate if required by traceability/dependency review.
14. Stop and rollback on data loss, wrong audio, cross-owner access, stale version mutation, duplicate publish version, missing result compatibility, or runtime boundary change.

## 27. Acceptance Criteria

1. Save draft is explicit and lenient.
2. Publish is explicit and strict.
3. Current single Save Test behavior is preserved until the implementation lands.
4. Missing audio may save only as draft warning after storage foundation exists.
5. Missing audio blocks Publish.
6. Empty/invalid questions may save only as draft warning.
7. Empty/invalid questions block Publish.
8. First edit of legacy mutable published R2 test freezes version 1.
9. First edit of legacy mutable published R2 test creates revision draft.
10. Existing assignments, sessions, attempts, and results remain pinned to version 1.
11. Legacy raw R2 URLs resolve through a Listening-owned read adapter without registry identity.
12. Saved drafts and published versions never persist expiring temp URLs after storage foundation exists.
13. Conflict rejection prevents stale overwrites.
14. Idempotency prevents duplicate drafts or duplicate published versions.
15. Draft soft delete and recovery behavior is defined and tested.
16. Published archive governance preserves retained versions and audio references.
17. New behavior lives in bounded `src/features/assessment/listening/**` modules.
18. `ListeningTestBuilder.tsx` remains a thin orchestrator.
19. `listeningTestStorage.ts` remains a public facade.
20. No runtime/live/solo/AudioPlayer/teacher-monitor/Reading V2/Worker/Firebase-rule/Google-Drive behavior ships in this child PRD implementation.
21. Announcements use the shared announcement system.
22. Feature actions are tracked.
23. Accessibility tests pass.
24. Boundary greps pass.
25. Findings contain before/after line counts, large-file maps, tests, browser proof where required, and rollback notes.

## 28. Regression Checklist

- [ ] Current single Save Test behavior remains preserved until split implementation cutover.
- [ ] Save draft with missing audio succeeds only as non-published draft warning after storage foundation exists.
- [ ] Publish with missing audio blocks.
- [ ] Save draft with empty question succeeds only as warning.
- [ ] Publish with empty question blocks.
- [ ] Publish with missing answer blocks.
- [ ] Parser path still works.
- [ ] Parser skip/manual path still works.
- [ ] Image mode answer-key entry still works.
- [ ] Audio upload still works.
- [ ] Audio preview still works.
- [ ] Public/private checkbox behavior remains compatible unless separately changed by approved implementation scope.
- [ ] First legacy edit freezes version 1.
- [ ] First legacy edit creates revision draft.
- [ ] Assignments remain pinned to prior version.
- [ ] Sessions remain pinned to prior version.
- [ ] Attempts remain pinned to prior version.
- [ ] Results remain pinned to prior version.
- [ ] Legacy raw R2 URL read adapter resolves old public URLs.
- [ ] Legacy read adapter does not require registry identity.
- [ ] Conflict rejection works.
- [ ] Idempotency works for Save draft.
- [ ] Idempotency works for Publish.
- [ ] Duplicate Publish does not create duplicate versions.
- [ ] Draft soft delete hides draft.
- [ ] Draft recovery restores draft.
- [ ] Published archive preserves retained references.
- [ ] Shared announcements replace future save/publish `alert(...)`.
- [ ] Observability actions are registered.
- [ ] Accessibility blocker focus works.
- [ ] Applicable touch targets are at least 44px.
- [ ] `ListeningTestBuilder.tsx` line-count delta is recorded.
- [ ] `listeningTestStorage.ts` line-count delta is recorded.
- [ ] No `src/services/r2Storage.ts` implementation change is included.
- [ ] No `cloudflare/**` change is included.
- [ ] No Firebase rules change is included without later explicit authorization.
- [ ] No solo/homework runtime change is included.
- [ ] No live-session runtime change is included.
- [ ] No `AudioPlayer` internal change is included.
- [ ] No teacher monitor change is included.
- [ ] No Reading V2 internal change is included.
- [ ] No Google Drive behavior change is included.

## 29. Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Save draft ships before storage foundation | Draft may retain expiring temp URL | Block audio-bearing draft implementation until storage child PRD minimum foundation exists |
| Publish mutates legacy published record | Existing assignments/results drift | Freeze legacy record as version 1 and create revision draft |
| Duplicate publish creates two versions | Teacher library/result ambiguity | Idempotency key tests and duplicate-click UI protection |
| Stale tab overwrites newer draft | Teacher data loss | Optimistic conflict token and stale-write rejection |
| Legacy raw URLs require registry identity | Existing tests/results break | Listening-owned read adapter resolves legacy raw URLs without registry identity |
| Builder grows more monolithic | Future authoring risk increases | Bounded modules, large-file maps, line-count evidence |
| Storage lifecycle sneaks into authoring PRD | Scope and security review bypassed | Treat storage lifecycle as dependency and stop on missing path/schema |
| S0 assumed deployed | Browser-authoritative raw key risk persists | Authoring implementation checks PRD-0056 evidence before relying on secured upload/move |
| Announcements stay as `alert(...)` | Accessibility and UX inconsistency | Shared announcement tests for save/publish/archive/restore/discard |
| Runtime files touched by authoring implementation | Solo/live regressions | Protected file list plus boundary diff audit |
| Google Drive behavior changes incidentally | Unsupported migration/regression | No Google Drive edits/tests/migration in this child PRD |

## 30. Open Questions

No parent-level or authoring-product question remains open for Packet 1D.

Implementation blockers that must be resolved before future code changes:

1. Exact draft/version persistence paths and rule requirements must be approved by the future storage/data contract work and traceability matrix.
2. Minimum storage foundation must exist before audio-bearing Save draft ships.
3. PRD-0056 S0 implementation must be checked before relying on secured upload/move authority.
4. Product owner plus architecture/security reviewer must approve this child PRD before implementation.
5. If a future implementation needs runtime, live-session, solo/homework, private delivery, Firebase rule, Worker, R2 lifecycle, parser schema, Reading V2, or Google Drive changes, stop and create or use the correct child PRD instead.

## 31. Definition Of Done

This child PRD is done when:

1. `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md` exists with sections 1 through 31.
2. Current Listening baseline is verified with source evidence.
3. Save draft lenient behavior is defined.
4. Publish strict behavior is defined.
5. Immutable version and revision behavior is defined.
6. Approved OQ-2 legacy transition is binding.
7. Legacy raw R2 URL read adapter requirement is defined.
8. S0 and storage dependencies are recorded without assuming implementation is complete.
9. Owned and protected files are listed exactly.
10. Future bounded module names and responsibilities are listed.
11. Large-file map and line-count requirements are recorded.
12. Testing strategy includes service, builder, announcement, accessibility, integration, and boundary tests.
13. Findings are appended with Packet 1D evidence.
14. Validation scans and `git diff --check` pass or record exact non-owned warnings.
15. Task 1.7 remains incomplete because four other child PRDs still remain.
16. No implementation has started.

## 32. Packet 1I Data-Path Completeness Blocker

Verified current contract:

1. Current Listening persistence writes one mutable published record at `tests/{testId}` through `src/services/listeningTestStorage.ts`.
2. Current `ListeningTestData` is the only implemented Listening authoring record shape; it has no durable draft identity, immutable version collection, revision-draft relation, conflict token, or operation-id record.

Unresolved target contract:

1. No approved document names the exact target paths for Listening drafts, immutable versions, revision drafts, idempotency operations, soft-delete recovery metadata, or authoring conflict tokens.
2. PRD-0058 owns `media_assets/**` and related asset lifecycle paths. It explicitly does not own Listening draft/publish/version content paths and therefore cannot satisfy this gap by implication.
3. Selecting target authoring paths or record schemas here without product-owner plus architecture/security approval would invent a missing decision.
4. Task 1.8 must remain unchecked until an approved amendment to this PRD names the exact paths, full record schemas, rule owner, legacy `tests/{testId}` compatibility mapping, and migration/write-cutover behavior.
5. Task 1.9, Task 1.10, Task 2, and all authoring implementation remain blocked by this gap. A developer must not choose a path or schema.

## 33. Packet 1J Approved B2 Option B Data Contract Amendment - 2026-06-20

Decision reference: `PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20`.

> Superseded by approved B2 Option B on 2026-06-20: section 10 items 8-9 and its proposed Option A/B block, section 21 statements that target authoring paths/schema are unselected, section 30 blocker item 1, and section 32 unresolved-target statements. They remain historical evidence. The binding contract is below.

### Approved Paths And Identity

Canonical Listening authoring paths:

```text
listening_authoring/drafts/{draftId}
listening_authoring/revision_drafts/{draftId}
listening_authoring/versions/{versionId}
listening_authoring/operations/{operationId}
```

Identity rules:

1. `testId` is the stable logical Listening test identity allocated no later than first draft creation.
2. `draftId`, `versionId`, and `operationId` are opaque immutable IDs.
3. `versionNumber` is a positive integer, monotonic and unique within one `testId`.
4. `conflictToken` is a positive integer. Every accepted mutable-draft write increments it exactly once through an atomic transaction.
5. All timestamps are trusted server timestamps in Unix milliseconds.
6. Generic `drafts/{draftId}` is not reused and receives no migration or new Listening write.

### Shared Authoring Document V1

Both draft records and immutable version snapshots use `document: ListeningAuthoringDocumentV1`:

```text
title
type: "IELTS" | "TOEFL" | "Custom"
skill: "Listening"
duration
difficulty: "Beginner" | "Intermediate" | "Advanced"
questionCount
isPublic
isComplete
missingAnswerCount?
displayMode: "text" | "image"
metadata/
  description
  instructions
  tags
  targetBand?
  estimatedScore?
  transcript?
audioSections/
  {sectionIndex}/
    number
    name
    assetId?
    audioUrl
    streamUrl?
    startQuestion
    endQuestion
    playLimit?
    waitTimeBefore?
questionImages/
  {imageIndex}/
    sectionNumber
    imageUrl
    imageCaption?
    questionRange?/
      start
      end
questions/
  {questionIndex}/
    number
    type
    question
    options?
    answer
    sectionNumber
    points
    explanation?
    acceptableAnswers?
    imageUrl?
    context?/
      sectionHeading?
      subsectionLabel?
      contextLines?
      currentLineIndex?
settings/
  allowPause
  showTimer
  shuffleQuestions
  showResults: "immediate" | "after-submission" | "never"
  allowReview
  passingScore
  allowReplay
  maxReplays?
  audioControls?/
    showPlayPause
    showProgressBar
    showSeekControl
    showSpeedControl
    showSkipSection
    showVolumeControl
statistics/
  attempts
  averageScore
  averageTime
  completionRate
```

`answer` retains the current `string | string[] | Record<string, string>` shape. Existing parser and scoring schemas are not changed by this amendment.

After PRD-0058 minimum storage foundation exists, every newly committed audio section requires canonical `assetId`; `audioUrl` and `streamUrl` remain derived public-compatibility fields while public delivery remains active. A frozen legacy version 1 may omit `assetId`.

### Draft Record Schema

```text
schemaVersion: 1
recordType: "draft"
draftId
testId
ownerId
state: "active" | "soft-deleted"
conflictToken
latestPublishedVersionId?
document: ListeningAuthoringDocumentV1
validationIssues?
assetIds/
  {assetId}: true
createdAt
createdBy
updatedAt
updatedBy
lastOperationId
softDelete?/
  deletedAt
  deletedBy
  reasonCode
  priorConflictToken
  retentionDecisionRef?
  restoredAt?
  restoredBy?
  restoreCount
```

An initial draft has no `createdFromVersionId`. Final deletion remains prohibited until separate retention governance supplies `retentionDecisionRef`; soft-deleted records remain recoverable.

### Revision Draft Record Schema

```text
schemaVersion: 1
recordType: "revision-draft"
draftId
testId
ownerId
state: "active" | "soft-deleted"
conflictToken
createdFromVersionId
createdFromVersionNumber
document: ListeningAuthoringDocumentV1
validationIssues?
assetIds/
  {assetId}: true
createdAt
createdBy
updatedAt
updatedBy
lastOperationId
softDelete?/
  deletedAt
  deletedBy
  reasonCode
  priorConflictToken
  retentionDecisionRef?
  restoredAt?
  restoredBy?
  restoreCount
```

`createdFromVersionId` and `createdFromVersionNumber` are required and immutable.

### Immutable Version Record Schema

```text
schemaVersion: 1
recordType: "published-version"
versionId
versionNumber
testId
ownerId
sourceDraftId?
sourceDraftPath: "drafts" | "revision_drafts" | "legacy_tests"
sourceLegacyTestId?
previousVersionId?
document: ListeningAuthoringDocumentV1
assetIds/
  {assetId}: true
publishedAt
publishedBy
publishOperationId
documentHash
archive/
  state: "active" | "archived"
  archivedAt?
  archivedBy?
  reasonCode?
compatibility/
  legacyTestPath?
  frozenLegacyVersion1
```

`sourceDraftId` is required for `"drafts"` and `"revision_drafts"` sources. `sourceLegacyTestId` is required for `"legacy_tests"`. `documentHash` is SHA-256 over the canonical serialized document.

Version records are create-only and immutable. Archive changes must be represented by an approved metadata transaction that cannot alter identity, source, document, asset references, publish metadata, or hash.

### Operation Record Schema

```text
schemaVersion: 1
operationId
ownerId
operationType: "save-draft" | "publish" | "soft-delete" | "restore" | "archive" | "discard"
targetType: "draft" | "revision-draft" | "version" | "legacy-test"
targetId
idempotencyKeyHash
requestHash
expectedConflictToken?
status: "pending" | "succeeded" | "failed"
result/
  draftId?
  versionId?
  versionNumber?
  conflictToken?
errorCode?
createdAt
completedAt?
expiresAt
```

Rules:

1. Raw idempotency keys are never persisted or logged.
2. `idempotencyKeyHash` is HMAC-SHA-256 using a server-held secret.
3. Same owner, operation type, target, and idempotency hash with the same `requestHash` returns the recorded result.
4. Reuse with a different `requestHash` fails closed.
5. Completed operation records expire 30 days after completion; failed/pending cleanup must preserve enough evidence to avoid duplicate versions.

### RTDB Rules And Index Ownership

A dedicated PRD-0057 data-contract/rules implementation packet owns `database.rules.json` only for `listening_authoring/**`.

Required behavior:

1. Teachers read only records with `ownerId === auth.uid`; super-admin access follows explicit existing policy.
2. Browser writes to `listening_authoring/**` are denied. Canonical writes use the trusted PRD-0057 backend owner defined below.
3. Draft and revision-draft creates require full required fields and path/record ID equality in backend schema validation.
4. Draft and revision-draft updates require owner stability plus atomic expected `conflictToken` comparison and increment.
5. Hard delete is denied. Soft delete and restore are backend state transactions.
6. Versions are create-only. The backend may change only the narrowly defined archive metadata; document and identity remain immutable.
7. Operations are owner-readable but backend-writable; browser clients cannot author pending or success results.
8. Emulator tests prove owner reads, cross-owner denial, and client create/update/delete denial. Backend tests prove stale-token denial, immutable-version enforcement, schema validation, idempotency, and forbidden-field denial.

Required indexes:

```text
listening_authoring/drafts: ownerId, testId, state, updatedAt
listening_authoring/revision_drafts: ownerId, testId, createdFromVersionId, state, updatedAt
listening_authoring/versions: ownerId, testId, versionNumber, publishedAt, archive/state
listening_authoring/operations: ownerId, operationType, targetId, idempotencyKeyHash, status, createdAt, expiresAt
```

The earlier protected-file listing for `database.rules.json` remains binding for every UI/workflow packet. It is superseded only for the dedicated, separately reviewed PRD-0057 data-contract/rules packet.

### Trusted Mutation Owner And Dependency Direction

Canonical mutation owner:

```text
functions/src/listening-authoring/**
```

Required HTTPS handlers:

```text
saveListeningDraft
publishListeningDraft
mutateListeningAuthoringLifecycle
```

Rules:

1. Every handler verifies Firebase ID token, derives `ownerId` from token `sub`, validates the full request schema, and rejects browser-provided owner authority.
2. Firebase Admin SDK performs canonical multi-path RTDB transactions.
3. `saveListeningDraft` owns initial draft create and conflict-checked update.
4. `publishListeningDraft` owns immutable version creation, monotonic `versionNumber`, operation idempotency, legacy version-1 freeze, and source-draft conflict transition.
5. `mutateListeningAuthoringLifecycle` owns soft delete, restore, archive, and discard.
6. The backend validates `requestHash`, HMAC idempotency hash, expected conflict token, document hash, allowed state transition, and immutable fields before write.
7. `src/features/assessment/listening/storage/listeningAuthoringStorageFacade.ts` is the browser-facing facade and contains no authority, schema bypass, version allocation, or direct canonical RTDB write.

`LISTENING_AUTHORING_IDEMPOTENCY_SECRET` is a Firebase Functions secret used only for HMAC-SHA-256 idempotency hashes. The value is never checked in, returned to clients, logged, or copied into findings.

Dependency direction:

```text
ListeningTestBuilder.tsx
  -> src/features/assessment/listening/authoring/**
  -> listeningAuthoringStorageFacade.ts
  -> authenticated PRD-0057 HTTPS handlers
  -> functions/src/listening-authoring/**
  -> listening_authoring/** + PRD-0058 asset commit contract
```

Additional owned files for the dedicated backend/data-contract packet:

1. `functions/src/listening-authoring/**`.
2. `functions/src/index.ts` - thin exports for the three handlers only.
3. `functions/src/listening-authoring/listeningAuthoringBackend.test.ts`.
4. `database.rules.json` - only `listening_authoring/**`.
5. `src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts`.
6. `scripts/set-listening-authoring-rollout.mjs` - audited super-admin write control for `system_flags/listening_authoring_writes_enabled`.
7. `r2-backup-worker/**` only in a separate PRD-0057 DR integration packet for `listening_authoring/**` backup/restore coverage.

Allowed changes:

1. Add the bounded client workflow, facade, backend handlers, exact RTDB paths/rules, tests, rollout control, and observability required by this PRD.
2. Add thin imports, delegation, props, and action wiring to `ListeningTestBuilder.tsx` and `listeningTestStorage.ts`.
3. Add compatibility reads for frozen legacy `tests/{testId}` rows and the approved legacy raw-R2 adapter.

Prohibited changes:

1. PRD-0058 asset lifecycle internals, Worker implementation, R2 cleanup, or delivery implementation.
2. Solo/homework, live-session, teacher-monitor, `AudioPlayer`, Reading V2, parser schema, scoring, or Google Drive behavior.
3. Direct browser canonical writes to `listening_authoring/**`.
4. Mutation of frozen legacy `tests/{testId}` after first-edit version-1 transition.

Protected backend contracts:

1. `functions/src/readingV2SubmitCore.ts` and its tests.
2. Existing non-Listening exports in `functions/src/index.ts`.
3. `r2-backup-worker/**`, including Reading V2 trusted submit and homework routes.

The protected `r2-backup-worker/**` rule is superseded only for the named DR integration packet. Any such packet must preserve Reading V2 submit, homework assignment, existing backup/restore, retention, cron, auth, and routing behavior and run their regression suites.

Size and evidence:

1. Packet 1J baseline for `functions/src/index.ts` is 268 lines.
2. `functions/src/index.ts` remains an export/router surface; target at most 310 lines and ceiling 350 lines after PRD-0057 exports.
3. New backend production modules target 400 lines or fewer and may not exceed 500 lines without architecture/security approval.
4. Findings record before/after lines, responsibility deltas, and created/preserved seams for every touched facade or backend router.
5. Existing `functions/src/readingV2SubmitCore.test.ts` must remain green after index export changes.

### Browser Proof And Rollback

Write kill switch:

```text
system_flags/listening_authoring_writes_enabled: boolean
```

Rules:

1. The flag defaults absent/false.
2. Every PRD-0057 mutation handler checks the flag before any canonical write.
3. Only super admin may change the flag.
4. The checked admin script records actor, requested value, reason, and timestamp without secrets.
5. Disabling the flag blocks Save draft, Publish, soft delete, restore, archive, and discard writes; read-only recovery/export remains available.

Required teacher browser proof:

1. Use teacher quick login at `http://localhost:5173` and the natural Listening authoring route.
2. Save an incomplete draft and prove warning UI, `saveListeningDraft` network success, one `listening_authoring/drafts/{draftId}` record, and no version/test write.
3. Publish a complete draft and prove one immutable version, one succeeded operation record, and the expected conflict-token increment.
4. Retry the same publish idempotency key and prove the same `versionId` returns.
5. Submit a stale conflict token and prove no draft/version mutation.
6. First-edit one legacy R2 test and prove its content fields remain unchanged, only approved freeze metadata is added, and version 1 plus one revision draft are created.
7. Prove cross-owner draft/version reads and all browser canonical writes are denied.
8. Preserve network/evidence artifacts without raw tokens, HMAC keys, signed URLs, raw object keys, or audio bytes.

Rollback:

1. Run `node scripts/set-listening-authoring-rollout.mjs --enabled=false --reason="<incident>"` first.
2. Stop all new PRD-0057 writes and redeploy the captured pre-cutover frontend artifact so the current single Save Test path is restored for non-migrated tests.
3. Do not delete `listening_authoring/**` records or mutate frozen legacy `tests/{testId}` rows during rollback.
4. Keep published immutable versions and operation evidence for investigation/recovery.
5. Disable assignment/runtime activation for post-cutover versions until the incident is resolved.
6. Re-enable only after targeted service/rules/browser regression proof and approval are recorded.

### Legacy Compatibility And Write Cutover

1. Existing `tests/{testId}` rows remain legacy compatibility records and first-edit version-1 sources. They are not the canonical target for new draft or version writes.
2. On first edit of a legacy mutable R2 test, one idempotent operation snapshots the unchanged content into `listening_authoring/versions/{versionId}` as `versionNumber: 1`, records `sourceDraftPath: "legacy_tests"`, creates a revision draft, and adds only the compatibility freeze metadata below.
3. The legacy `tests/{testId}` row is frozen after that transition. Later revision publishes do not mutate content or freeze metadata.
4. Existing assignments, sessions, attempts, results, and legacy readers continue resolving the frozen legacy row/version 1.
5. New drafts, revision drafts, and published versions write only to `listening_authoring/**`.
6. New assignment/runtime activation for post-cutover versions remains blocked until the applicable runtime child PRD stores and resolves explicit `versionId`.
7. No backfill of generic `drafts/**` occurs.
8. No on-read migration occurs.
9. Cutover is gated: current single-save behavior remains authoritative until rules, transactions, compatibility reads, authoring UI, and dependent runtime/version-pointer work pass their approved packets.

Compatibility freeze metadata:

```text
tests/{testId}/authoringVersioning/
  frozen: true
  versionId
  versionNumber: 1
  frozenAt
  frozenBy
  decisionRef: "PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20"
```

Legacy writer guard:

1. The dedicated PRD-0057 rules packet changes `tests/{testId}` rules so a row with `authoringVersioning/frozen === true` cannot be updated or deleted by browser clients.
2. `saveListeningTestToFirebase(...)`, `updateListeningTestInFirebase(...)`, and `deleteListeningTestFromFirebase(...)` must route migrated/frozen identities through the approved backend or fail closed.
3. Before implementation, run a grep-backed producer audit for all three exports and every direct `tests/` write. Record every caller and disposition in findings.
4. Stale frontend clients attempting direct update/delete after freeze must receive permission denial and cannot change content or freeze metadata.
5. Tests cover hidden callers, direct SDK writes, stale clients, super-admin policy, duplicate first-edit transition, and rollback with frozen legacy rows.

### Backup, Restore, Retention, And DR Ownership

DR owner:

```text
r2-backup-worker/
```

Required contract:

1. The first `listening_authoring/**` implementation packet must add all four canonical subpaths to RTDB backup inventory before enabling writes.
2. Backup/restore covers drafts, revision drafts, immutable versions, and unexpired operation records.
3. Restore preserves IDs, owners, conflict tokens, version numbers, document hashes, source links, archive metadata, and freeze compatibility links.
4. Mutation handlers check `system_flags/restore_in_progress` and fail closed during restore.
5. An isolated end-to-end restore drill proves owner reads, client write denial, immutable version hashes, draft conflict tokens, operation idempotency evidence, and legacy freeze links.
6. Draft final deletion remains prohibited until separate retention governance is approved.
7. Immutable versions required by retained assignment/session/attempt/result references are never pruned.
8. Completed operation records follow the approved 30-day expiry; backup history may retain them only under the existing DR retention policy and never treats them as product authority after expiry.
9. Any DR packet touching `r2-backup-worker/src/index.ts`, shared auth/routing/config/build/deploy, or cron must run media backup, Reading V2 trusted submit, and homework assignment route regressions.

### Amendment Result

B2 is resolved at planning-contract level. This amendment does not authorize implementation. Task 1.8 may pass only after the complete child-PRD re-audit; Task 1.9 remains the next permitted packet only after that pass.

## 34. Task 1.10 Canonical Dependency Synchronization - 2026-06-20

Canonical edge set, identical across the PRD-0055 dependency registry and every child PRD:

```text
DAG-00->{DAG-03,DAG-20,DAG-80}
DAG-03->{DAG-50,DAG-90,DAG-99}
DAG-20->DAG-21->DAG-40
DAG-40->{DAG-50,DAG-60}
DAG-50->{DAG-51,DAG-70,DAG-81}
DAG-51->DAG-60
DAG-60->{DAG-71,DAG-81}
DAG-70->DAG-71
DAG-80->DAG-81
{DAG-71,DAG-81,DAG-90}->DAG-99
```

| Local node | Upstream | Output | Downstream |
| --- | --- | --- | --- |
| `DAG-50` PRD-0057 / Task 5 authoring write model | `DAG-03` shared-presentation stability and `DAG-40` minimum storage; approved B2 is authority | Save draft/Publish/version/revision stability with every audio-bearing save on tracked storage | `DAG-51`, `DAG-70`, `DAG-81` |
| `DAG-51` Task 5.21 selected-teacher traffic | `DAG-50` phase-local acceptance | Production-shaped authoring/reconciliation sample | `DAG-60`; Task 6 reconciliation conclusions cannot precede it |

Minimum `DAG-40` includes commit, references, immediate discard cleanup, fallback cleanup, backup/restore coverage, and orphan metrics. Audio-bearing Save draft cannot ship before it. Rollback preserves immutable/version/reference data and compatibility readers. Historical Packet 1I/1J status wording above remains historical; no implementation completion or Task 1.12 approval is claimed.
