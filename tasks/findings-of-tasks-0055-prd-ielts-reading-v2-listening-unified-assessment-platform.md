# Findings: PRD-0055 IELTS Reading V2 And Listening Unified Assessment Platform

Append-only record. Corrections must be appended; prior entries must not be edited, removed, reordered, or combined.

## Packet 1A Baseline - 2026-06-19 23:26:45 +07:00

### Scope

- Executed Task 1.1 through current Task 1.5 approval presentation only.
- No runtime, application, worker, Firebase rule, storage, Reading V2, or Listening implementation changed.
- No child PRD, approval-status update, staging, cleanup, revert, or unrelated-work absorption performed.
- Task 1.5 cannot complete until product-owner answers are recorded.
- Task 1.6 and later remain blocked.

## Working-Tree Baseline

- Branch: `main`
- Upstream: `origin/main`
- HEAD: `f5348034147ca037e519a733f0b9a6801219c57a`
- PRD-0055 state: untracked.
- PRD-0055 tasklist state: untracked.
- Findings file state before this packet: absent.

`git status --short` before findings-file creation:

```text
 M .claude/settings.local.json
 M AGENTS.md
 M DESIGN.md
 M README.md
 M conductor/tech-stack.md
 M documentation/LISTENING_BUILDER_IMPROVEMENTS.md
 M documentation/README.md
 M documentation/SOP/0023-november-11-2025-comprehensive-session.md
 M documentation/architecture/mobile-ielts-listening-audio-navigation.md
 M documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md
 M documentation/architecture/reading-v2-runtime-integrations.md
 M documentation/architecture/reading-v2-studio-review-issues-contract.md
 M documentation/architecture/teacher-test-creation-parsing-and-review.md
 M documentation/conversation_2025-01-21_log.md
 M documentation/conversation_2025-11-22_log.md
 M documentation/conversation_2025-11-24_log.md
 M documentation/conversation_2025-11-25_log.md
 M documentation/conversation_2025-11-27_log.md
 M documentation/conversation_2026-01-18_log.md
 M documentation/conversation_2026-01-21_log.md
 M documentation/conversation_2026-02-04_log.md
 M documentation/conversation_2026-02-24_log.md
 M documentation/ielts-reading-v2-listening-unification-audit.md
 M documentation/ielts-reading-v2-listening-unification-implementation-log.md
 M documentation/ielts-reading-v2-listening-unification-research.md
 M documentation/ielts-reading-v2-listening-unification-strategy.md
 M documentation/tasks/0018-prd-unified-audio-architecture.md
 M documentation/tasks/PRD0048/conversation-transcript-prd-0048-thread-2026-04-22-to-2026-04-24.md
 M documentation/tasks/tasks-0018-prd-unified-audio-architecture.md
 M src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx
 M src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx
 M src/components/reading-v2/studio/ReadingV2StudioShell.css
 M src/skills/listening/builders/ListeningTestBuilder.test.tsx
 M src/skills/listening/builders/ListeningTestBuilder.tsx
?? documentation/architecture/ielts-reading-v2-listening-unification.md
?? documentation/architecture/upload-storage-authority.md
?? src/features/assessment/shared/components/AssessmentAuthoringSection.css
?? src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx
?? src/features/assessment/shared/components/AssessmentAuthoringSection.tsx
?? tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md
?? tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md
```

All listed pre-existing changes are user-owned and untouched by Packet 1A.

## Task 1.1 - Authoritative Reading

Status: complete for Packet 1A.

Read completely:

- `AGENTS.md`
- `documentation/tasks/process-task-list.md`
- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `documentation/ielts-reading-v2-listening-unification-strategy.md`
- `documentation/ielts-reading-v2-listening-unification-research.md`
- `documentation/ielts-reading-v2-listening-unification-audit.md`
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/architecture/upload-storage-authority.md`

No implementation began, so no implementation-triggered rule file was needed beyond the authoritative packet.

## Task 1.2 - Findings File

Status: complete.

This append-only file was created with working-tree baseline, verified architecture, evidence, contradictions, decisions, blockers, untouched changes, verification, and next permitted task.

## Task 1.3 - Repository State And Ownership

Status: complete.

- PRD and tasklist are untracked; neither has an index entry from `git ls-files --stage`.
- Shared `AssessmentAuthoringSection` files and canonical architecture files are also untracked.
- Existing shared-adoption source/test files are modified.
- No pre-existing path was staged, reverted, cleaned, or rewritten.

## Task 1.4 - Verified Current Architecture

Status: complete as a read-only current-state inspection.

### Listening Save And Publish

1. Missing section audio hard-blocks current save:
   - `src/services/listeningTestStorage.ts:249-256` filters sections without `audioUrl` and returns `success: false` with `Missing audio for section(s)`.
2. Current save is published:
   - `src/services/listeningTestStorage.ts:366-378` builds a new test record and writes `isPublished: true`.
3. Current create path always generates a new ID and writes one record:
   - `src/services/listeningTestStorage.ts:231-247` exposes one `saveListeningTestToFirebase` operation and calls `generateListeningTestId()`.
   - `src/services/listeningTestStorage.ts:436-445` writes directly to `tests/{testId}` and returns the ID.
4. No durable Listening draft lifecycle exists:
   - Current service has no draft ID, draft collection/path, first-save draft transition, draft status, revision draft, optimistic version token, or idempotency key.
   - `src/services/listeningTestStorage.ts:561-583` provides only a generic whole-record update at `tests/{testId}`.
   - PRD source agrees this is net-new behavior: `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md:231`.

### Current R2 Service And Persistence Owner

- Shared browser R2 service: `src/services/r2Storage.ts`.
- Exported persistence client: `r2StorageService` at `src/services/r2Storage.ts:442-444`.
- Listening persistence owner: `src/services/listeningTestStorage.ts`.
- Listening storage imports the R2 service at `src/services/listeningTestStorage.ts:13`.
- PRD preserves this ownership at `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md:151`.

### Public URL And Temp-To-Permanent Behavior

- `src/services/r2Storage.ts:11-12` hardcodes deployed worker URL and public `r2.dev` bucket URL.
- `src/services/r2Storage.ts:44-46` uploads first under `temp/{folder}/...`.
- `src/services/r2Storage.ts:95-104` returns public URL as `url`, `streamUrl`, and `directUrl`.
- `src/services/r2Storage.ts:124-191` derives a non-temp key, calls worker `/move`, then returns a permanent public URL.
- `src/services/listeningTestStorage.ts:259-300` promotes temp `audioUrl` and `streamUrl` during save.
- Failure is not fail-closed:
  - `src/services/r2Storage.ts:168-177` keeps a temp URL when `/move` is unavailable.
  - `src/services/r2Storage.ts:193-200` returns the temp URL on move failure.
  - `src/services/listeningTestStorage.ts:277-294` logs movement failure and continues.
- Therefore current save can persist a temp URL that may later expire. This conflicts with target storage requirements but is current code truth.

### Checked-In Worker Versus Deployed/Documented Worker Drift

- Checked-in `cloudflare/worker.js:1-26` uses `aws4fetch`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, S3-compatible bucket URL, and wildcard CORS.
- Checked-in `cloudflare/worker.js:31-75` copies then deletes raw client-provided `sourceKey`/`destKey`.
- Checked-in `cloudflare/worker.js:90-112` signs S3 PUT and returns `pub-${env.BUCKET_ID}.r2.dev`.
- `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md:5-18` identifies deployed/manual worker `r2-upload-signer`.
- SOP code uses native `env.R2_BUCKET` at `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md:98-113`.
- SOP deployment remains dashboard-based at `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md:131-137`.
- SOP lifecycle is dashboard-only `temp/` expiration at `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md:139-158`.
- Canonical worker selection is unresolved. Packet 1A records evidence only and makes no selection.

### Live Listening Dual Authority

- Teacher writes both paths in one update:
  - pause: `src/hooks/monitor/useMonitorControls.ts:853-883`
  - resume: `src/hooks/monitor/useMonitorControls.ts:896-926`
  - skip: `src/hooks/monitor/useMonitorControls.ts:943-983`
- Durable paths are:
  - `game_sessions/{sessionCode}/audioCommand`
  - `game_sessions/{sessionCode}/masterAudioState`
- Student live runtime consumes both:
  - destructuring at `src/skills/listening/components/ListeningTestPage.tsx:236-241`
  - command handling at `src/skills/listening/components/ListeningTestPage.tsx:439-499`
  - master state passed to `AudioPlayer` at `src/skills/listening/components/ListeningTestPage.tsx:1667-1671`
- Canonical master hook path is `src/hooks/audio/useMasterAudioState.ts`; student sync hook path is `src/hooks/audio/useAudioSync.ts`.

### Exact Shared Assessment Primitives And Adoptions

1. `AssessmentAuthoringSection`
   - Definition/API: `src/features/assessment/shared/components/AssessmentAuthoringSection.tsx:7-56`
   - Reading V2 adoption: `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx:73-80`, `Accessibility And Runtime Advisories`
   - Listening adoption: `src/skills/listening/builders/ListeningTestBuilder.tsx:1985-2152`, Step 4 Questions/Answer Key wrapper
2. `AssessmentStatusState`
   - Definition/API: `src/features/assessment/shared/components/AssessmentStatusState.tsx:16-101`
   - Reading V2 adoptions: `src/pages/ReadingV2StudioPage.tsx:297`, `:308`, `:324`
   - Listening adoption: `src/skills/listening/builders/ListeningTestBuilder.tsx:2046`
3. `AssessmentValidationSummary`
   - Definition/API: `src/features/assessment/shared/components/AssessmentValidationSummary.tsx:9-60`
   - Reading V2 adoption: `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx:81-82`, `Publish Readiness`
   - No Listening adoption found.

### Actual Protected Hook And Service Paths

- `src/services/listeningTestStorage.ts`
- `src/services/r2Storage.ts`
- `src/components/test/AudioProgressPanel.tsx`
- `src/skills/listening/components/ListeningTestPage.tsx`
- `src/components/practice/ListeningPracticeView.tsx`
- `src/skills/listening/components/AudioPlayer.tsx`
- `src/pages/TeacherTestMonitorPage.tsx`
- `src/hooks/audio/useMasterAudioState.ts`
- `src/hooks/audio/useAudioSync.ts`
- `src/hooks/monitor/useMonitorControls.ts`

## Documentation Contradictions And Drift

1. Canonical architecture self-contradiction:
   - `documentation/architecture/ielts-reading-v2-listening-unification.md:77-82` correctly lists a Reading V2 `AssessmentAuthoringSection` adoption.
   - `documentation/architecture/ielts-reading-v2-listening-unification.md:84-87` then says `no Reading V2 authoring adoption`.
   - Current source proves the Reading V2 adoption exists.
2. Implementation-log stale hook paths:
   - `documentation/ielts-reading-v2-listening-unification-implementation-log.md:412-413` uses stale `src/hooks/useMasterAudioState.ts` and `src/hooks/useAudioSync.ts`.
   - Current source paths are under `src/hooks/audio/`.
3. Implementation-log duplicate headings:
   - `Patch 2` appears at lines 69 and 284.
   - `Patch 3` appears at lines 143 and 361.
4. Worker source/deployment drift:
   - checked-in worker is `aws4fetch`/S3-credential based;
   - documented deployed worker is native `env.R2_BUCKET`;
   - no canonical-worker decision is made in Packet 1A.
5. Historical research is intentionally non-authoritative and proposes broad shared runtime/session concepts superseded by canonical architecture.
6. Canonical upload docs say R2-only and Google Drive obsolete, while current source still contains Google Drive branches. These branches are residue, not supported direction.
7. Target storage docs require fail-closed durable commit; current code can continue and persist a temp URL after move failure.
8. PRD/tasklist accurately classify Save draft, immutable versions, private delivery, registry, and canonical worker selection as future/gated behavior, not current behavior.

## Task 1.5 - OQ-1 Through OQ-4 Approval Packet

Status: awaiting product-owner answers. Recommendations remain provisional.

| OQ | Exact PRD section 29 text | Current proposed recommendation | Evidence | Prior docs settled? | Exact approval statement required | Downstream child PRDs blocked |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-1 | **OQ-1 - Google Drive scope.** Recommended resolution: this PRD adds no Google Drive behavior, removes no current Google Drive playback, introduces no new Google Drive-specific error or migration UX, and performs no Google Drive migration. A separate cleanup/deletion task removes Google Drive upload code and decides deletion/disposition of Google Drive-backed tests while respecting test/result deletion governance. | Approve exactly as written. | Canonical R2-only/obsolete status: `documentation/architecture/upload-storage-authority.md:11-17`, `:199-204`; PRD repeats no migration and separate cleanup at `:155`, `:223-225`; tasklist says recommendation already settled in conversation at `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md:99`. | Direction already treated as settled by canonical docs and prior conversation; formal PRD sign-off still missing. | `I approve OQ-1 exactly as recommended in PRD-0055 section 29: no new Google Drive behavior, no migration, no current playback removal, and a separate cleanup/deletion task for upload-code removal and Google Drive-backed test disposition.` | Listening authoring behavior and R2 storage/lifecycle child PRDs remain formally blocked by the section-29 gate. Separate Google Drive cleanup/deletion task cannot be created under Packet 1A. |
| OQ-2 | **OQ-2 - Legacy published transition.** Recommended resolution: first edit freezes the legacy mutable published R2 record as immutable version 1, creates a revision draft, pins existing assignments/results to version 1, and resolves legacy raw R2 URLs through the read adapter without requiring registry identity. | Approve exactly as written. | Current code has mutable records and raw URLs, with no version/draft lifecycle: `src/services/listeningTestStorage.ts:366-438`, `:561-583`. PRD marks Save draft as net-new at `:231` and repeats legacy transition requirements at `:227-229`. | Provisional PRD recommendation only; not formally settled. | `I approve OQ-2 exactly as recommended in PRD-0055 section 29: freeze the first-edited legacy R2 record as immutable version 1, create a revision draft, pin existing assignments/results to version 1, and resolve legacy raw R2 URLs without requiring registry identity on read.` | Listening authoring draft/publish/version child PRD; R2 lifecycle/read-adapter child PRD; downstream solo/homework, live-session, and result-review compatibility work that consumes legacy resolution. |
| OQ-3 | **OQ-3 - Worker security severability.** Recommended resolution: ship upload-worker authentication, ownership, prefix, raw-key, CORS, and rate-limit hardening as urgent Security Gate S0, independently of registry/heartbeat/private-delivery work, after failing negative tests establish the insecure baseline. | Approve exactly as written, but canonical worker/deploy mechanism remains a child-PRD decision after parity evidence. | Checked-in worker has wildcard CORS and client-provided raw keys at `cloudflare/worker.js:4-8`, `:31-44`; upload authority calls this a security gate at `documentation/architecture/upload-storage-authority.md:30-51`; worker mechanism drift is proven above. | Technical/security direction is already documented as urgent; product-owner severability approval remains missing. | `I approve OQ-3 exactly as recommended in PRD-0055 section 29: ship narrow upload-worker authentication, ownership, prefix/raw-key, CORS, and rate-limit hardening as urgent severable Security Gate S0 after insecure-baseline negative tests, without bundling registry, heartbeat, cleanup, or private delivery.` | Urgent S0 worker-security child PRD; all storage lifecycle work dependent on hardened worker authority; audio-bearing Listening draft/publish work indirectly remains blocked by storage foundation. |
| OQ-4 | **OQ-4 - Public versus private R2 transition.** Recommended resolution: keep current public R2 delivery temporarily; enable private signed delivery only after byte-range, refresh, iOS Safari, mobile, and long live-session gates pass. | Approve exactly as written. | Current source returns public `r2.dev` URLs at `src/services/r2Storage.ts:11-12`, `:95-104`, `:184-191`. PRD defines gated private delivery; canonical upload authority records private/authorized delivery as future storage work. | Technical target is documented; formal product-owner transition approval remains missing. | `I approve OQ-4 exactly as recommended in PRD-0055 section 29: keep current public R2 delivery temporarily and enable private signed delivery only after byte-range, refresh, iOS Safari, mobile, and long live-session proof gates pass.` | R2 delivery/reconciliation child PRD; result-review delivery; solo/homework runtime delivery; live-session delivery/runtime child PRDs; authoring Publish accessibility checks that depend on final delivery contract. |

## Current Decision Status

- OQ-1: recommended and previously directionally settled; formal approval pending.
- OQ-2: recommended; approval pending.
- OQ-3: recommended and technically urgent; approval pending.
- OQ-4: recommended; approval pending.
- PRD status remains `Draft - pending product-owner review`.
- No approval text was changed.

## Blockers

- Product-owner response required for each OQ.
- Canonical upload-worker source/deploy/rollback/test mechanism remains unresolved by design; Packet 1A must not choose it.
- Child PRDs, traceability, dependency graph completion, PRD approval, and implementation are outside Packet 1A.

## Verification

Documentation/planning-only packet:

- RED/GREEN/mutation proof: not applicable - non-behavioral.
- Source and path scans: performed with `rg -n`.
- Full authoritative-file reads: completed.
- Working-tree baseline: captured with Git commands.
- Application tests/builds: not run by instruction.
- Final UTF-8 and `git diff --check` results must be appended after file creation.

## Untouched Unrelated Changes

Every pre-existing modified/untracked path in the baseline remains untouched. Packet 1A owns only this findings file.

## Next Permitted Task

Product owner answers OQ-1 through OQ-4. Then append decisions to this file.

Task 1.6+, child PRDs, PRD approval, traceability work, worker selection, and all implementation remain blocked.

## Independent Read-Only Review Addendum - 2026-06-19

Three independent evidence scouts reviewed disjoint areas: Listening save/live authority, R2 worker/storage authority, and shared primitives/document consistency. Main-agent source inspection confirmed their findings.

Additional verified anchors:

- `src/hooks/test/useTestSession.ts:237-260` and `:371-376` subscribe to both `audioCommand` and `masterAudioState`; current live client plumbing remains dual-path.
- `src/hooks/audio/useMasterAudioState.ts:110-113` resolves canonical state path `game_sessions/${sessionCode}/masterAudioState`.
- `src/components/practice/ListeningPracticeView.tsx` remains the separate solo/homework host; no evidence supports merging its saved playback authority into live Listening.
- `src/services/listeningTestStorage.ts` export inventory contains save/get/list/update/delete operations but no draft-lifecycle operation.

Additional contradiction:

- PRD section 29 applies a blanket OQ gate to authoring/storage child PRDs at `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md:1714-1719`.
- Tasklist notes at `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md:99-100` add a narrow Task 3 presentation-only exception and OQ-3-first sequencing.
- Packet 1A follows the stricter user instruction: no Task 1.6+, no Task 3, no child PRDs, no implementation.

## Authority Correction - 2026-06-19

Direct product-owner instruction establishes:

1. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` is the most authoritative PRD-0055 execution document.
2. Its instructions, requirements, gates, evidence standards, file-architecture rules, child-PRD boundaries, and stop conditions must not be skipped.
3. Where the tasklist conflicts with PRD-0055 or supporting documents, the tasklist controls this work unless a later direct product-owner instruction changes it.
4. Packet 1A read the tasklist completely: 667 of 667 lines.
5. Packet 1A intentionally stops during Task 1.5 because explicit product-owner approval/revision for OQ-1 through OQ-4 has not yet been recorded.

## Packet 1B Product-Owner Decision Record - 2026-06-19

Decision reference: `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`

The product owner confirms Task 1.1 through Task 1.5 are complete and approves OQ-1 through OQ-4 exactly as recommended in PRD-0055 section 29.

Earlier findings statements that describe OQ approval as pending are preserved as historical Packet 1A state and are superseded by this dated decision record.

### Approved OQ-1 - Google Drive Scope

No new Google Drive behavior, no Google Drive migration, no current playback removal, and no new Google Drive-specific error state. Upload-code removal and deletion/disposition of Google Drive-backed tests belong to a separate cleanup/deletion task.

### Approved OQ-2 - Legacy Published Transition

First edit freezes a legacy mutable published R2 test as immutable version 1, creates a revision draft, keeps existing assignments, results, and sessions pinned to version 1, and resolves legacy raw R2 URLs through the read adapter without requiring registry identity.

### Approved OQ-3 - Worker Security Severability

Upload-worker authentication, ownership, prefix/raw-key, CORS, and rate-limit hardening is an urgent severable Security Gate S0. It must not be bundled with registry, heartbeat, cleanup, or private-delivery implementation.

Canonical upload-worker implementation, deployment, rollback, and mechanism-matched test harness remain unresolved. Selection belongs to the S0 child PRD required by Task 1.7; Packet 1B does not choose between checked-in `aws4fetch`/S3 credentials and documented deployed native `env.R2_BUCKET`.

### Approved OQ-4 - Public Versus Private R2 Transition

Existing public R2 delivery remains temporarily. Private signed delivery may activate only after byte-range, refresh, iOS Safari, mobile, and long live-session proof gates pass.

### Task 1.5 Evidence

Subtask: `1.5`

Claims proven:

- OQ-1 through OQ-4 were presented exactly from PRD section 29 in Packet 1A.
- Product owner approved all four recommendations exactly.
- Earlier pending entries remain preserved and are explicitly superseded.
- No parent-level OQ remains open.
- Child-PRD implementation questions remain blocked until their own planning and approval.

Files and declared touch regions:

- Append-only decision entry in this findings file.
- PRD section 29 and affected OQ-tagged statements are authorized for Task 1.6.
- Tasklist checkboxes 1.1 through 1.6 are authorized only after evidence and verification.

Lines before -> after and responsibility delta:

- Findings file gains approval history only; no prior entry changes.
- No runtime, application, worker, Firebase, storage, Reading V2, or Listening responsibility changes.

Created/preserved decomposition seams:

- S0 security remains severable from registry, heartbeat, cleanup, and private delivery.
- Canonical-worker selection remains a required S0 child-PRD decision.

Traceability row IDs:

- Not applicable in Packet 1B; Task 1.9 traceability matrix remains unstarted.

Characterization/baseline:

- Packet 1A findings verify Tasks 1.1 through 1.4 and record exact current architecture evidence.

RED command and result:

- Not applicable - non-behavioral documentation approval.

GREEN command and result:

- Not applicable - non-behavioral documentation approval.

Mutation proof and restoration evidence:

- Not applicable - non-behavioral documentation approval.

Static/boundary/diff checks:

- To be recorded after Task 1.6 documentation edits.

Browser/deploy artifacts:

- Not applicable; no browser or deployment action authorized.

Residual risks or deferred items:

- Canonical upload-worker mechanism unresolved.
- Child PRDs, task-number allocation, traceability matrix, and all implementation remain unstarted.

Verifier and verification outcome:

- Product-owner approval supplied directly in Packet 1B prompt.

No implementation is authorized by these approvals or by parent PRD approval.

## Packet 1B Task 1.6 Completion Evidence - 2026-06-19

Subtask: `1.6`

Claims proven:

- PRD status changed from Draft to `Approved parent PRD - implementation remains gated by approved child PRDs`.
- All 17 active `Proposed under OQ-*` statements were preserved as dated obsolete Markdown blockquote history.
- Every preserved provisional statement has adjacent approved binding wording.
- Section 29 retains all four original recommended resolutions as obsolete recommendation history.
- Section 29 contains an `Approved Decisions` subsection with binding OQ-1 through OQ-4 wording.
- No parent-level product question remains open.
- Child-PRD implementation questions remain blocked.
- Security Gate S0 is approved for child-PRD planning only.
- Canonical upload-worker mechanism remains unresolved for the S0 child PRD.
- No child PRD, traceability matrix, task number, canonical-worker selection, or implementation was created.

Files and declared touch regions:

- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
  - status;
  - clarification state;
  - OQ-tagged functional requirements;
  - edge cases;
  - data/storage constraints;
  - rollout plan;
  - Security Gate S0 status;
  - acceptance criteria;
  - section 29 history and approved decisions;
  - decision register;
  - definition of done.
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
  - status and relevant-file summary;
  - OQ notes;
  - Task 1.1 through Task 1.6 checkboxes.
- This findings file:
  - append-only Packet 1B approvals and completion evidence.

Lines before -> after and responsibility delta:

- PRD gained non-destructive approval history and binding decision text only.
- Tasklist gained progress-state updates only.
- Findings gained append-only evidence only.
- No application, runtime, worker, Firebase, storage, Reading V2, or Listening responsibility changed.

Created/preserved decomposition seams:

- S0 remains severable from registry, heartbeat, cleanup, and private delivery.
- Existing public R2 remains active during transition.
- Private signed delivery remains proof-gated.
- Google Drive cleanup remains a separate task.
- Legacy version transition remains authoring/read-adapter child-PRD work.
- Canonical-worker selection remains an S0 child-PRD decision.

Traceability row IDs:

- Not applicable in Packet 1B; Task 1.9 remains unstarted.

Characterization/baseline:

- Packet 1A findings provide verified Tasks 1.1 through 1.4 evidence.
- Product-owner Packet 1B statement formally completes Task 1.5.

RED command and result:

- Not applicable - non-behavioral documentation update.

GREEN command and result:

- Not applicable - non-behavioral documentation update.

Mutation proof and restoration evidence:

- Not applicable - non-behavioral documentation update.

Static/boundary/diff checks:

- Active provisional/awaiting-approval scan: passed; no active OQ provisional or awaiting-approval text.
- False-claim scan: passed; no statement claims Google Drive migration, deployed private R2, completed draft/storage/live implementation, or selected canonical worker.
- Provisional-history count: passed; 17 of 17 `Proposed under OQ-*` statements remain only in obsolete blockquotes.
- Task numbering: passed; Task 1.1 through Task 1.12 contiguous.
- Task state: passed; Task 1.7 and parent Task 1.0 remain unchecked.
- UTF-8: `npm run check:utf8 -- <three allowed task files>` passed for 3 files.
- Global `git diff --check`: passed; only existing CRLF warning for unrelated strategy document.
- Scoped untracked-file whitespace checks: passed for all 3 allowed files.
- Hunk audit: passed; modifications limited to allowed documentation paths and declared regions.

Browser/deploy artifacts:

- Not applicable; no browser, deploy, or external mutation authorized.

Residual risks or deferred items:

- Canonical upload-worker implementation/deployment/rollback/test mechanism unresolved.
- Task 1.7 child PRDs unstarted.
- Task 1.9 traceability matrix unstarted.
- Task 1.0 parent remains incomplete.
- All implementation remains blocked.

Verifier and verification outcome:

- Two independent read-only audits confirmed Tasks 1.1 through 1.5 evidence and identified all approval-state/provisional sites.
- Main-agent final scans and hunk review passed.

## Next Permitted Work

Task 1.7 is next permitted work in a separately authorized packet.

Packet 1B stops here. Task 1.7, child PRD creation, task-number allocation, traceability matrix creation, canonical-worker selection, and all implementation remain unstarted.

## Packet 1C S0 Child PRD Evidence - 2026-06-20

Subtask: S0 child-PRD portion of `1.7`

Scope executed:

- Created only the urgent upload-worker Security Gate S0 child PRD.
- Used task number `0056` because it remained the next available PRD number.
- Appended evidence to this findings file.
- No runtime, application, worker, Firebase rule, R2 lifecycle, registry, heartbeat, cleanup, private-delivery, Listening, Reading V2, deployment, staging, cleanup, revert, or unrelated work was changed.
- Task 1.7 remains unchecked because five other child PRDs remain.

### Sources Read

Read completely before editing:

- `AGENTS.md`
- `C:\Users\The Lord\.codex\RTK.md`
- `documentation/tasks/create-prd.md`
- `documentation/tasks/process-task-list.md`
- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `documentation/architecture/upload-storage-authority.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/rules/infrastructure.md`
- `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md`
- `cloudflare/worker.js`
- `cloudflare/package-lock.json`
- `r2-backup-worker/src/auth/firebase-auth.ts`
- `r2-backup-worker/wrangler.toml`
- `r2-backup-worker/package.json`

Read supporting current-source evidence:

- `src/services/r2Storage.ts`
- current R2 service caller scans under `src/**`
- Wrangler `deployments`, `versions`, `rollback`, `secret list`, and `versions deploy` help output
- Wrangler config schema `ratelimits` section from `r2-backup-worker/node_modules/wrangler/config-schema.json`

### Working-Tree And Task Number Evidence

- Branch at Packet 1C start: `main`.
- Upstream at Packet 1C start: `origin/main`.
- HEAD at Packet 1C start: `f5348034147ca037e519a733f0b9a6801219c57a`.
- Pre-existing dirty tree remains broad and user-owned, as recorded in Packet 1A/1B.
- `rg --files tasks | ...0056...` returned no `0056` path.
- Independent read-only subagent search found no tracked, untracked, or content collision for `0056` / `PRD-0056`.
- Allocated child PRD file: `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`.

### Checked-In Versus SOP Versus Deployed Comparison

Checked-in source:

- `cloudflare/worker.js` uses `aws4fetch` / `AwsClient`.
- It expects S3-style credential/bucket env names: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BUCKET_NAME`, `ACCOUNT_ID`, and `BUCKET_ID`.
- It allows wildcard CORS.
- It accepts browser-provided `sourceKey` and `destKey` for `/move`.
- It signs PUT upload URLs from browser-provided `filename`.
- `cloudflare/package-lock.json` exists and contains `aws4fetch`.
- `cloudflare/package.json`, `cloudflare/wrangler.toml`, and `cloudflare/wrangler.jsonc` are absent.

SOP source:

- `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md` names deployed worker `r2-upload-signer`.
- SOP code uses native `env.R2_BUCKET` and `env.PUBLIC_URL`.
- SOP deployment process is Cloudflare Dashboard / Edit code / Save and deploy.
- SOP documents dashboard `temp/` lifecycle rule setup.
- SOP does not document a checked-in deploy command, checked-in rollback command, or checked-in upload-worker config.

Actual deployed metadata/source:

- Worker name: `r2-upload-signer`.
- Route/domain: `https://r2-upload-signer.iamhuwng.workers.dev`.
- Custom domains: none found for this Worker.
- Worker subdomain: enabled.
- Preview subdomain: disabled.
- Current deployed version number: `6`.
- Current deployed version ID: `20dd8429-5be1-4105-baed-f6dc5af68098`.
- Current deployment source: Quick Editor / dashboard upload.
- Current deployment traffic: 100 percent to version 6.
- Deployed binding names found: `R2_BUCKET`, `PUBLIC_URL`.
- Deployed Worker secret names found by Wrangler: none.
- Deployed source fetched by Cloudflare API `content/v2` was 121 lines and normalized SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`.
- Deployed source exactly matched the SOP JavaScript block after normalization.
- Deployed source markers:
  - `env.R2_BUCKET`: true.
  - `aws4fetch` / `AwsClient`: false.
  - wildcard CORS: true.
  - `/move`: true.
  - `PUT` upload path: true.
  - Firebase auth / JWT verification: false.

Read-only deployed behavior probes:

- `GET https://r2-upload-signer.iamhuwng.workers.dev` returned `405 Method not allowed`.
- `OPTIONS` from an unapproved origin returned `200` with wildcard CORS and `GET, POST, PUT, OPTIONS`.
- `POST ?filename=temp/listening/probe.txt` from an unapproved origin returned upload authorization without authentication; output was summarized without printing signed URL.

### Canonical-Worker Decision

Canonical S0 runtime mechanism selected in PRD-0056:

- native Cloudflare R2 binding through `env.R2_BUCKET`.

Canonical S0 source/deploy mechanism selected in PRD-0056:

- checked-in Wrangler-managed upload-worker package under `cloudflare/`, deployed to existing Worker name `r2-upload-signer`.

Rejected future canonical mechanism:

- checked-in `aws4fetch` / S3 credential source.

Decision evidence:

1. Least-privilege: native `R2_BUCKET` avoids S3 access key secrets inside the upload Worker.
2. Deployed truth: current production source already uses native `env.R2_BUCKET` and matches the SOP.
3. Reproducibility: current deployed Worker is dashboard/Quick Editor source; PRD-0056 requires checked-in Wrangler source/config for future deploys.
4. Rollback reliability: Wrangler exposes `deployments status`, `versions list`, `versions view`, `rollback`, and `versions deploy <version>@100%` for `r2-upload-signer`.
5. Mechanism-matched local testing: native R2 binding fits Worker/R2 test harness better than S3-signing mocks.
6. Existing browser contract: native Worker can preserve `POST authorize -> PUT upload -> POST /move` shape while removing browser-authoritative raw keys.
7. Scope: S0 remains auth/ownership/prefix/raw-key/CORS/rate/size/replay/expiry only, with no registry, heartbeat, cleanup, or delivery expansion.

### Child PRD Created

Created:

- `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`

The child PRD includes the required sections:

1. Introduction / Overview
2. Goals
3. User Stories
4. Functional Requirements
5. Non-Goals / Out of Scope
6. Verified Current Architecture
7. Canonical Worker Decision
8. Worker API Compatibility Contract
9. Authentication And Identity Verification
10. Owner, Prefix, Path, And Raw-Key Authority Rules
11. CORS, Rate, Method, Replay, Expiry, And 50 MB Controls
12. Exact Owned And Protected Files
13. Test Harness And RED/GREEN Negative Tests
14. Deployment Configuration And Required Bindings
15. Deployment Procedure
16. Rollback And Version-Pin Procedure
17. Logging And Observability
18. Edge Cases And Failure Handling
19. Rollout Plan
20. Acceptance Criteria
21. Regression Checklist
22. Risk Register
23. Open Questions
24. Definition Of Done

### Unresolved Questions

No Packet 1C blocking question remains after deployed source and metadata inspection.

PRD-0056 records implementation stop conditions instead of developer-choice questions:

- stop if deployed source or bindings differ from Packet 1C evidence;
- stop if required production origin differs from the approved CORS allowlist;
- stop if native R2 binding cannot be tested locally;
- stop if rate-limit binding cannot be configured or tested;
- stop if existing authorized Listening upload/move cannot be preserved through the secured adapter;
- stop if implementation needs registry, heartbeat, cleanup, private delivery, Firebase rules, R2 lifecycle, runtime changes, or Google Drive work.

### Files Changed

- Created `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`.
- Appended this Packet 1C evidence entry to `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.

No tasklist checkbox was changed. Task 1.7 remains unchecked.

### Verification Evidence

Commands and read-only checks run before this entry:

- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse --abbrev-ref --symbolic-full-name @{u}`
- `git status --short`
- `rg --files tasks` task-number scans
- `rg --files cloudflare`
- `Test-Path cloudflare/package.json`
- `Test-Path cloudflare/wrangler.toml`
- `Test-Path cloudflare/wrangler.jsonc`
- `wrangler deployments list --name r2-upload-signer --json`
- `wrangler deployments status --name r2-upload-signer --json`
- `wrangler versions list --name r2-upload-signer --json`
- `wrangler versions view 20dd8429-5be1-4105-baed-f6dc5af68098 --name r2-upload-signer --json`
- `wrangler secret list --name r2-upload-signer --format pretty`
- Cloudflare API read-only source fetch: `accounts/.../workers/scripts/r2-upload-signer/content/v2?version=20dd8429-5be1-4105-baed-f6dc5af68098`
- `wrangler rollback --help`
- `wrangler versions deploy --help`
- `rg` scans of `src/services/r2Storage.ts` callers
- Wrangler config-schema `ratelimits` read

Verification still required after this append:

- PRD-0056 structure scan.
- contradiction scans.
- UTF-8 check if repository command remains available.
- `git diff --check`.

### Task 1.7 Status

Task 1.7 remains incomplete and unchecked.

Only the S0 child PRD exists. The following five Task 1.7 child PRDs remain uncreated:

1. Listening authoring draft/publish/version behavior.
2. R2 asset lifecycle, registry, reconciliation, cleanup, and delivery.
3. Listening solo/homework runtime alignment.
4. Listening live-session authority/runtime and load-test plan.
5. Reading V2 runtime visual alignment, deferred until shared authoring stability and dedicated Reading V2 runtime tests exist.

### Next Permitted Child PRD

Next permitted child PRD, if product owner authorizes continuing Task 1.7:

- Listening authoring draft/publish/version behavior child PRD.

Packet 1C stops after PRD-0056 creation, findings append, and documentation-only verification. No Task 1.8, Task 1.9, Task 2, canonical implementation, deploy, traceability matrix, or runtime/application work is authorized by this entry.

## Packet 1C Verification Addendum - 2026-06-20

Subtask: S0 child-PRD portion of `1.7`

Verification outcome:

- PRD-0056 structure scan passed: 24 required sections found.
- Placeholder scan passed: no `TBD`, `TODO`, `developer decides`, `fill in`, or `to be decided` wording found.
- Contradiction scan passed:
  - Task 1.7 remains unchecked.
  - Task 1.8 remains unchecked.
  - Task 1.9 remains unchecked.
  - Task 2.0 remains unchecked.
  - No traceability matrix exists.
  - No active claim says private R2 is deployed or active.
  - No active claim makes registry, heartbeat, or cleanup part of S0 implementation.
  - Canonical mechanism is selected as native `env.R2_BUCKET`.
  - Checked-in `aws4fetch` is explicitly rejected as future canonical mechanism.
- Child-PRD scan passed: only PRD-0056 was created; no 0057+ child PRDs were created.
- UTF-8 passed: `npm run check:utf8 -- tasks/0056-prd-listening-upload-worker-security-gate-s0.md tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
- Global `git diff --check` passed with the pre-existing CRLF warning for unrelated `documentation/ielts-reading-v2-listening-unification-strategy.md`.
- Scoped untracked-file whitespace checks passed for:
  - `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`;
  - `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
- Hunk/content inspection passed:
  - PRD-0056 headings and key decision sections inspected.
  - Packet 1C findings append inspected.
  - No tasklist checkbox changed.
- Final `git status --short` confirms only Packet 1C-owned new/modified files were added to the existing untracked task-file set; broad unrelated pre-existing changes remain untouched.

One initial structure-scan command had a PowerShell quoting error and made no file changes. The corrected structure scan passed.

Application tests, worker tests, browser tests, Cloudflare deploy, Firebase deploy, R2 lifecycle changes, and runtime suites were not run by instruction.

Task 1.7 remains incomplete. Task 1.8+, Task 2, the traceability matrix, five remaining child PRDs, and all implementation remain unstarted.

## Packet 1D Listening Authoring Child PRD Evidence - 2026-06-20

Subtask: Listening authoring draft/publish/version behavior child-PRD portion of `1.7`

Packet scope honored:

- Created only the Listening authoring draft/publish/version behavior child PRD.
- Used task number `0057` because no `0057` PRD file or content collision existed before creation.
- Created `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`.
- No runtime, application, worker, Firebase rule, R2 lifecycle, registry, reconciliation, cleanup, delivery, solo/homework, live-session, Reading V2, parser, scoring, Google Drive, deployment, staging, cleanup, revert, or unrelated work was changed.
- Task 1.7 remains unchecked because four other child PRDs remain after this packet.

Sources read completely:

- `AGENTS.md`
- `C:\Users\The Lord\.codex\RTK.md`
- `documentation/tasks/create-prd.md`
- `documentation/tasks/process-task-list.md`
- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/architecture/upload-storage-authority.md`
- `documentation/rules/codebase-hygiene.md`
- `documentation/rules/infrastructure.md`
- `documentation/rules/announcements.md`
- `documentation/rules/observability.md`
- `documentation/rules/react-patterns.md`
- `documentation/rules/mobile-portability.md`
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
- `src/skills/listening/builders/ListeningTestBuilder.test.tsx`
- `src/services/listeningTestStorage.ts`
- `src/services/r2Storage.ts`
- `src/pages/TestBuilderRouter.tsx`

Independent read-only scouts:

- Source-baseline scout inspected the Listening builder, builder test, Listening storage service, R2 service, and router. Main agent reviewed and corroborated the cited source evidence.
- Doc/task scout inspected PRD/task/finding/S0/storage docs. Main agent reviewed and corroborated the cited task and dependency evidence.

Working tree and task-number evidence:

- Branch: `main`
- Upstream: `origin/main`
- HEAD: `f5348034147ca037e519a733f0b9a6801219c57a`
- `rg --files tasks | rg "tasks[/\\]005[6-9]-prd|tasks[/\\]006[0-9]-prd|0057-prd|PRD 0057|Task number: 0057"` returned only `tasks\0056-prd-listening-upload-worker-security-gate-s0.md` before PRD-0057 creation.
- `Get-ChildItem -LiteralPath tasks -File | Where-Object { $_.Name -match '0057|0058|0059|0060|0061' }` returned no file before PRD-0057 creation.
- `rg -n "PRD 0057|Task number: 0057|0057-prd" tasks documentation src` returned no content before PRD-0057 creation.

Untouched unrelated working-tree changes:

- Existing unrelated tracked changes remained untouched, including `.claude/settings.local.json`, `AGENTS.md`, `DESIGN.md`, `README.md`, `documentation/**`, Reading V2 files, and Listening builder files already dirty before Packet 1D.
- Existing untracked Packet 1A/1B/1C planning files remained untouched except this append-only findings update.

Verified current authoring baseline:

- Single save path: `src/skills/listening/builders/ListeningTestBuilder.tsx:491-513` calls only `saveListeningTestToFirebase(...)`; `src/services/listeningTestStorage.ts:231-244` exposes one save entry point.
- Missing audio blocks current save: `src/services/listeningTestStorage.ts:249-255` returns failure for audio sections without `audioUrl`.
- Missing audio also blocks authoring progression from the Audio step: `src/skills/listening/builders/ListeningTestBuilder.tsx:320-357` validates audio URLs and `:361-373` only advances after valid audio.
- Current save writes `isPublished: true`: `src/services/listeningTestStorage.ts:367-378`.
- No durable draft lifecycle: `src/services/listeningTestStorage.ts:231-244` has no draft ID/status argument; `:367-438` writes one final snapshot under `tests/${testId}`.
- No immutable version model: `src/services/listeningTestStorage.ts:561-583` merges updates into the existing record and rewrites it with `set(...)`.
- No optimistic concurrency: save/update contracts at `src/services/listeningTestStorage.ts:231-244` and `:561-564` take no expected revision token.
- No idempotency key: save/update contracts at `src/services/listeningTestStorage.ts:231-244` and `:561-564` take no idempotency key.
- Existing R2 temp-to-permanent behavior: `src/services/r2Storage.ts:1-8`, `:44-105`, `:124-200`; `src/services/listeningTestStorage.ts:262-290` calls `r2StorageService.moveToPermanent(...)`.
- Existing save may retain a temp URL if movement fails: `src/services/listeningTestStorage.ts:277-280`.
- Existing replacement behavior may overwrite an existing object key: `src/services/r2Storage.ts:267-276`.
- Existing parser/manual mode: `src/skills/listening/builders/ListeningTestBuilder.tsx:434-462` uses `listeningRouter.parseListening(...)`; `:1438-1455` exposes `Skip -> Add Manually` and `Parse with AI`.
- Existing builder Save/Publish UI shape: `src/skills/listening/builders/ListeningTestBuilder.tsx:2155-2160` labels the review step `Review & Save`; `:2282-2294` exposes a single `Save Test` button.
- Existing shared primitive usage: `src/skills/listening/builders/ListeningTestBuilder.tsx:1985-2052` uses `AssessmentAuthoringSection` and `AssessmentStatusState`.
- Protected-boundary confirmation: source-baseline scout found no `AudioPlayer`, teacher monitor, Reading V2, runtime, live, or solo references in the authoring files it inspected; main-agent inspection of the protected-file list in PRD/task/docs kept those files out of scope.

Packet 1C S0 dependency status reconfirmed:

- S0 child PRD exists at `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`.
- S0 is planning only; PRD-0056 status is draft and implementation is blocked pending approval.
- PRD-0056 excludes draft/publish, immutable versions, registry, cleanup, private delivery, solo/homework, and live-session work.
- PRD-0057 records S0 as a dependency and does not assume S0 implementation is deployed.

Child PRD summary:

- `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md` defines all required sections 1 through 31.
- Save draft is lenient: missing audio, empty questions, and incomplete answers may save as warnings.
- Publish is strict: missing audio, empty/invalid questions, missing answers, inaccessible audio, and future non-range-capable audio block publish.
- Current single-save behavior is preserved until the child PRD is implemented.
- First edit of legacy mutable published R2 tests freezes immutable version 1 and creates a revision draft.
- Existing assignments, sessions, attempts, and results remain pinned to version 1.
- Legacy raw R2 URLs resolve through a Listening-owned read adapter without requiring registry identity during read.
- Google Drive remains unchanged and out of scope.
- Audio upload/storage lifecycle implementation belongs to the future R2 asset lifecycle child PRD.
- S0 worker hardening is a dependency but not part of PRD-0057.
- Solo/homework and live-session runtimes are protected/out of scope.
- Shared UI remains presentation-only.

Storage and S0 dependencies:

- Audio-bearing Save draft remains blocked until the minimum storage foundation exists.
- PRD-0057 does not select new Firebase paths for draft/version storage.
- PRD-0057 does not select R2 asset lifecycle paths, registry paths, heartbeat paths, cleanup paths, or delivery paths.
- PRD-0057 records current `tests/${testId}` as current-state evidence only, not as approval to keep mutable published writes.
- PRD-0057 states implementation must stop if it needs a path, schema, lifecycle operation, deletion rule, delivery rule, runtime change, or worker change not approved by the applicable child PRD.

Unresolved questions:

- No parent-level or authoring-product question remains open for Packet 1D.
- Future implementation blockers remain:
  - exact draft/version persistence paths and rule requirements require future storage/data contract plus traceability;
  - minimum storage foundation must exist before audio-bearing Save draft ships;
  - PRD-0056 S0 implementation evidence must be checked before relying on secured upload/move authority;
  - product owner plus architecture/security reviewer must approve PRD-0057 before implementation.

Files changed by Packet 1D:

- Created `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`.
- Appended this Packet 1D entry to `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.

Verification evidence before final validation addendum:

- PRD-0057 structure scan passed: 31 required sections found.
- Placeholder scan passed for the created PRD: no banned placeholder wording found.

Task status and next permitted child PRD:

- Task 1.7 remains incomplete.
- Four child PRDs remain after Packet 1D:
  1. R2 asset lifecycle, registry, reconciliation, cleanup, and delivery;
  2. Listening solo/homework runtime alignment;
  3. Listening live-session authority/runtime and load-test plan;
  4. Reading V2 runtime visual alignment, deferred until shared authoring stability and dedicated Reading V2 runtime tests exist.
- Next permitted child PRD packet: R2 asset lifecycle, registry, reconciliation, cleanup, and delivery.

## Packet 1D Verification Addendum - 2026-06-20

Subtask: Listening authoring draft/publish/version behavior child-PRD portion of `1.7`

Verification outcome:

- PRD-0057 structure scan passed: 31 required sections found, numbered 1 through 31.
- PRD-0057 placeholder scan passed: no banned placeholder wording found in the created PRD.
- Next-number uniqueness scan passed: only PRD-0056 and PRD-0057 exist in the `0056` through `0069` child-PRD range.
- Task-state scan passed:
  - Task 1.7 remains unchecked.
  - Task 1.8 remains unchecked.
  - Task 1.9 remains unchecked.
  - Task 2.0 remains unchecked.
- Dependency/contradiction scan passed:
  - PRD-0057 records S0 as a dependency and does not claim S0 implementation is complete or deployed.
  - PRD-0057 records future storage lifecycle as a dependency and does not select new draft/version Firebase paths.
  - PRD-0057 records that new R2 asset lifecycle paths, registry paths, heartbeat paths, cleanup paths, and delivery paths are not selected by this authoring PRD.
  - PRD-0057 keeps solo/homework runtime, live-session runtime, `AudioPlayer`, teacher monitor, Reading V2 internals, worker, Firebase rule, R2 lifecycle, and Google Drive behavior out of scope.
  - PRD-0057 records that current single-save behavior remains preserved until implementation cutover.
- UTF-8 passed: `npm run check:utf8 -- tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
- Global `git diff --check` passed with the pre-existing CRLF warning for unrelated `documentation/ielts-reading-v2-listening-unification-strategy.md`.
- Scoped untracked-file whitespace checks passed for:
  - `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`;
  - `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
- Hunk/content inspection passed:
  - PRD-0057 headings, functional requirements, source evidence, dependency sections, owned/protected files, testing strategy, open questions, and Definition of Done inspected.
  - Packet 1D findings append inspected.
  - No tasklist checkbox changed.
- Final file-status check confirms Packet 1D changed only:
  - `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`;
  - `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.

Application tests, worker tests, browser tests, Cloudflare deploy, Firebase deploy, R2 lifecycle changes, source-code changes, runtime suites, and traceability-matrix generation were not run by instruction.

Task 1.7 remains incomplete. Task 1.8+, Task 2, the traceability matrix, four remaining child PRDs, and all implementation remain unstarted.

## Packet 1E R2 Asset Lifecycle Child PRD - 2026-06-20

Subtask: R2 asset lifecycle, registry, reconciliation, cleanup, and delivery child-PRD portion of `1.7`

### Sources Read

Read completely or rechecked with line evidence for Packet 1E:

- `AGENTS.md`
- `C:\Users\The Lord\.codex\RTK.md`
- `documentation/tasks/create-prd.md`
- `documentation/tasks/process-task-list.md`
- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`
- `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`
- `documentation/architecture/upload-storage-authority.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/rules/infrastructure.md`
- `documentation/rules/codebase-hygiene.md`
- `documentation/rules/observability.md`
- `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md`
- `src/services/r2Storage.ts`
- `src/services/r2Storage.test.ts`
- `src/services/listeningTestStorage.ts`
- `cloudflare/worker.js`
- `cloudflare/package-lock.json`
- `r2-backup-worker/src/index.ts`
- `r2-backup-worker/src/backup/media-delta.ts`
- `r2-backup-worker/src/backup/retention.ts`
- `r2-backup-worker/src/restore/gdpr-filter.ts`
- `r2-backup-worker/src/auth/firebase-auth.ts`
- `r2-backup-worker/wrangler.toml`
- `r2-backup-worker/package.json`
- `database.rules.json`
- `firebase.json`
- `src/__tests__/security/prd0040-security.emulator.test.ts`
- `src/__tests__/security/firebaseRules.test.ts`

Subagent read-only verification was used for storage/listening, backup/security/metrics, and PRD/task-number slices. Main-agent checks reviewed outputs and rechecked the key source/rule/PRD evidence before writing.

### Verified Storage Baseline

- Next available task number is `0058`; no `tasks/0058-prd-*` file existed before Packet 1E creation.
- Current `src/services/r2Storage.ts` uploads first under `temp/{folder}/...`, asks the Worker for an upload URL with `?filename=...`, returns public `r2.dev`-derived `url`, `streamUrl`, and `directUrl`, and marks the result `isTemp: true`.
- Current `src/services/r2Storage.ts` posts `/move` with `sourceKey` and `destKey` for temp-to-permanent movement.
- Current move failure path can return the temp URL/key and let callers continue.
- Current `src/services/r2Storage.ts` has no registry, no heartbeat, no reference tracking, and no private-delivery issuance model.
- Current `cloudflare/worker.js` uses `aws4fetch`, wildcard CORS, browser-provided upload key, browser-provided `/move` keys, and public `r2.dev` URL output.
- Current `cloudflare/package-lock.json` only records the `aws4fetch` dependency for the checked-in upload Worker.
- Current `src/services/listeningTestStorage.ts` promotes temp `audioUrl` and `streamUrl` during save by calling `r2StorageService.moveToPermanent(...)`.
- Current `src/services/listeningTestStorage.ts` can continue after move failure and can persist the original temp URL.
- Current `src/services/listeningTestStorage.ts` writes a single record under `tests/{testId}` with `isPublished: true`, updates in place, and has no durable draft reference model.
- No dedicated storage lifecycle metrics/alerting sink exists. The only sink-like route found is diagnostic upload/fetch/purge under `r2-backup-worker/src/index.ts`, which is not a lifecycle metrics sink.

### PRD-0056 And PRD-0057 Dependency Summary

- PRD-0056 selected native `env.R2_BUCKET` plus checked-in Wrangler-managed source under `cloudflare/` as the canonical S0 target.
- PRD-0056 implementation is not complete; storage lifecycle must not assume S0 is deployed or proven.
- PRD-0056 remains S0-only and excludes registry, heartbeat, cleanup, private delivery, draft/publish, Firebase rules, R2 lifecycle, and runtime behavior.
- PRD-0057 needs the minimum storage foundation before audio-bearing Save draft can ship.
- PRD-0057 does not choose R2 asset lifecycle paths, registry schema, heartbeat paths, cleanup paths, delivery paths, or exact draft/version persistence paths.
- PRD-0057 preserves current single-save behavior until the approved dependency chain is implemented.

### Backup/Restore And Security Anchors

- `r2-backup-worker/` remains the current backup/restore owner.
- Current media backup scans `audio/`, `images/`, and `avatars/`, writes media manifests, and updates backup state.
- Current retention prunes stale backup history entries after backup ZIP expiry, with failed entries retained for less than 30 days.
- Current GDPR restore filtering excludes `deleted_users` entries with `status === 'completed'`.
- Registry-node backup coverage is missing today because no registry node exists.
- `src/__tests__/security/prd0040-security.emulator.test.ts` is the real emulator-backed rule-test pattern using `initializeTestEnvironment`, `assertSucceeds`, and `assertFails`.
- `src/__tests__/security/firebaseRules.test.ts` is not sufficient emulator proof because it explicitly does not spin up the emulator and asserts contract constants.

### Allocated Task Number And Child PRD Filename

- Allocated task number: `0058`.
- Created child PRD: `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`.

### Child PRD Summary

PRD-0058 defines:

- upload is not retention intent;
- temp uploads are short-lived edit-turn assets;
- only successful Save draft or Publish creates retained audio references;
- object states `temp -> committing -> committed -> pending-delete -> deleted`;
- backend-issued immutable `assetId` and owner-scoped upload sessions;
- 10-minute signed upload authorization;
- strict commit validation for extension, MIME, magic bytes, decodability, size, duration metadata, and checksum;
- no first-version deduplication;
- idempotent commit and replacement behavior;
- old playback preservation on failed replacement;
- reference tracking for draft, test, version, result, assignment, and session references;
- public-delivery compatibility with canonical `assetId` plus derived `audioUrl` / `streamUrl`;
- future authorized delivery by `assetId`, 60-minute URL, refresh under 10 minutes, byte-range proof, iOS Safari proof, and no live pause solely from refresh failure;
- immediate best-effort cleanup plus scheduled fallback;
- hourly temp reconciliation and daily durable `pending-delete` reconciliation;
- seven-day zero-reference grace, immediate pre-delete reference recheck, and 90-day metadata-only tombstone;
- historical orphan dry-run before deletion approval;
- `r2-backup-worker/` backup/restore ownership and restore drill requirement;
- secured metrics and audit event sink targets;
- bounded module homes under `src/features/assessment/listening/**`;
- exact owned/protected files;
- testing strategy and rollout stop actions;
- explicit no Google Drive behavior and no runtime/source implementation.

### Unresolved Questions / Stop Conditions

- Product-owner plus architecture/security reviewer must approve PRD-0058 before implementation.
- PRD-0056 S0 deployed proof must be checked before storage lifecycle relies on secured upload/move authority.
- If the proposed `media_asset_metrics/{metricEventId}` or `media_asset_events/{eventId}` paths are rejected during rule/security review, implementation must stop until a concrete secured sink/schema is approved.
- If `r2-backup-worker/` cannot cover registry backup/restore within platform budgets, implementation must stop and create an approved DR-owner adjustment.
- If exact draft/version paths from PRD-0057 remain unresolved, storage can implement registry/session foundation but must not ship audio-bearing Save draft.
- If private delivery requires `AudioPlayer` internal edits, that work remains Task 8 and must not be implemented here.

### Files Changed By Packet 1E

- Created `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`.
- Appended this Packet 1E entry to `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
- Updated `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` only to register PRD-0058 and status text.

### Verification Evidence Before Final Validation Addendum

- Next-number uniqueness confirmed: no `0058-prd-*` existed before creation.
- Scope audit before edits: allowed modified files only are the created PRD, this findings file, and the PRD-0055 tasklist registration/status text.
- Source/runtime/rule/worker/test implementation files were read or scanned only; none were modified.
- PRD-0058 includes required sections 1 through 36.
- PRD-0058 records that PRD-0056 S0 is not assumed complete.
- PRD-0058 records that PRD-0057 authoring implementation is not assumed complete.
- PRD-0058 keeps solo/homework runtime, live-session runtime, Reading V2 runtime, and Google Drive behavior out of scope.

### Task Status And Next Permitted Child PRD

- Task 1.7 remains incomplete.
- Three child PRDs remain after Packet 1E:
  1. Listening solo/homework runtime alignment;
  2. Listening live-session authority/runtime and load-test plan;
  3. Reading V2 runtime visual alignment, explicitly deferred until shared authoring stability and dedicated Reading V2 runtime tests exist.
- Next permitted child PRD packet: Listening solo/homework runtime alignment.

### Final Validation Addendum

- Next-number uniqueness check returned only `0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md` for the Packet 1E number.
- Required-section scan found all 36 PRD-0058 headings, sections 1 through 36.
- Task-state scan confirmed Task 1.7 remains `[ ]` unchecked.
- Scope and contradiction scans confirmed PRD-0058 does not assume S0 implementation is complete, does not assume PRD-0057 authoring implementation is complete, does not enter solo/homework runtime cutover, live-session runtime cutover, Reading V2 runtime work, Google Drive behavior, or implementation.
- One rollout wording issue that mentioned reconciling against a traceability matrix was removed from PRD-0058. Packet 1E did not create a traceability matrix.
- Secret/token/signed-URL scan recorded no raw secret, token, or signed URL value. The only hit outside PRD prohibition language was the prior findings statement that Wrangler found no Worker secret names.
- Placeholder scan found no `TBD`, `TODO`, `PLACEHOLDER`, `developer decides`, `decide later`, or `FIXME` in PRD-0058.
- Changed-hunk inspection covered the created PRD, the tasklist registration/status text, and this Packet 1E findings entry.
- Existing documentation check found in `package.json`: `check:utf8`.
- UTF-8 passed for the three modified files.
- Trailing-whitespace scan found no hits in the three modified files.
- `git diff --check` passed.
- Application tests, worker tests, browser tests, Cloudflare deploy, Firebase deploy, R2 lifecycle changes, source-code changes, runtime suites, and traceability-matrix generation were not run by instruction.
- Task 1.7 remains incomplete; the next permitted child PRD packet remains Listening solo/homework runtime alignment.

## Packet 1F Listening Solo/Homework Runtime Alignment Child PRD - 2026-06-20

Subtask: Listening solo/homework runtime alignment child-PRD portion of `1.7`

### Sources Read

Read completely or inspected with line evidence for Packet 1F:

- `AGENTS.md`
- `C:\Users\The Lord\.codex\RTK.md`
- `DESIGN.md`
- `documentation/tasks/create-prd.md`
- `documentation/tasks/process-task-list.md`
- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`
- `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`
- `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/architecture/mobile-ielts-listening-audio-navigation.md`
- `documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md`
- `documentation/architecture/ui-design-standards.md`
- `documentation/rules/mobile-portability.md`
- `documentation/rules/student-mobile-design.md`
- `documentation/rules/student-data-loading.md`
- `documentation/rules/observability.md`
- `documentation/rules/announcements.md`
- `src/components/practice/ListeningPracticeView.tsx`
- `src/components/practice/ListeningPracticeView.test.tsx`
- `src/components/test/mobile/MobileListeningExamScaffold.tsx`
- `src/components/test/mobile/MobileListeningExamScaffold.test.tsx`
- `src/components/test/mobile/mobileListeningState.ts`
- `src/components/test/mobile/mobileListeningState.test.ts`
- `src/skills/listening/components/AudioPlayer.tsx`
- `src/skills/listening/components/AudioPlayer.test.tsx`
- `src/pages/TestPageRouter.tsx`
- `src/pages/TestPageRouter.test.tsx`
- `src/hooks/solo/useSoloTimer.ts`
- `src/hooks/solo/useSoloAutoSave.ts`
- `src/hooks/solo/useSoloResume.ts`
- `src/hooks/solo/useSoloSubmission.ts`
- `src/services/soloProgress.service.ts`
- `src/services/testResults.service.ts`
- `src/types/practice.types.ts`

Two read-only subagents inspected disjoint source/test and PRD/architecture slices. Neither edited files. Main-agent inspection reviewed their output and rechecked the key line evidence before writing.

### Next Task Number

- Existing child PRD files ended at `0058`.
- `tasks/0059-prd-listening-solo-homework-runtime-alignment.md` did not exist before Packet 1F.
- Allocated task number: `0059`.

### Verified Current Solo/Homework Baseline

- `ListeningPracticeView` is the solo/homework host and composes `useSoloTestData`, `useSoloTimer`, `useSoloAutoSave`, `useSoloResume`, and `useSoloSubmission`.
- The host owns answers, current question, viewed part, current audio index, local play state, position, volume, speed, completed audio indices, timer wiring, autosave wiring, submit overlays, and result display.
- Homework auto-resumes the matching saved progress; solo/self-study may show a resume modal.
- Mobile serialization includes compatibility metadata, viewed part, current question, display state, and local playback state.
- Mobile hydration validates compatibility, clamps state, restores solo playback only when requested, and clears transient overlays.
- `MobileListeningExamScaffold` is presentation-only; part, timer, answer, submit, audio row, and overlays are host-owned props.
- `AudioPlayer` distinguishes solo local playback from live online teacher-controlled playback.
- `TestPageRouter` routes live Listening to `ListeningTestPage` and does not own solo/homework state.
- Current `useSoloSubmission` has a local React-state guard, but `saveTestResult` creates a new pushed result ID for every call. Durable lost-response/double-submit idempotency is not proven.
- Current autosave prevents overlapping local writes internally and performs periodic/background/unmount save attempts, but it does not expose an awaitable submit-time flush.
- Current tests cover submit confirmation, time-up overlay precedence, homework/solo resume behavior, mobile autosave/hydration, scaffold props, mobile state helpers, and protected `AudioPlayer` behavior.
- Current tests do not prove rapid double submit, lost-response recovery, time-up during autosave, manual/time-up collision, completed-attempt stale resume rejection, or host-only private delivery.

### Main Boundary Decision

Solo/homework Listening remains a local, resume-driven runtime owned by `ListeningPracticeView` and solo hooks. Live Listening remains a separate teacher-authoritative runtime. Presentation may align through neutral props/components, but state authority does not merge.

### Playback And Private Delivery Boundary

- `ListeningPracticeView` may wrap/configure `AudioPlayer` and resolve a playable URL before passing props.
- `AudioPlayer.tsx` internals remain protected.
- `useAudioSync`, `audioCommand`, and `masterAudioState` remain untouched.
- Solo private delivery depends on PRD-0058 issuance/range/result-review proof.
- If private solo cutover needs `AudioPlayer` refresh/source-handoff internals, that cutover remains blocked until approved Task 8 shared-player proof.

### PRD-0057 And PRD-0058 Dependencies

- Solo runtime implementation waits for PRD-0057/Task 5 authoring stability acceptance and immutable version behavior.
- Existing public R2 playback remains baseline until PRD-0058 delivery prerequisites pass.
- Result-review delivery remains PRD-0058/Task 6-owned; PRD-0059 consumes the resolver and does not create a second result-review delivery path.
- Live traffic remains public and protected.

### Child PRD Summary

Created:

- `tasks/0059-prd-listening-solo-homework-runtime-alignment.md`

PRD-0059 defines:

- verified current baseline;
- host and state ownership;
- answer/viewed/current section behavior;
- timer/autosave/resume state machine;
- stable attempt identity;
- one idempotent result per attempt;
- time-up during accepted autosave;
- stale/completed/wrong-attempt resume rejection;
- mobile state and viewport preservation;
- desktop/mobile layout and accessibility;
- result-review compatibility;
- host-bounded private delivery;
- exact owned/protected files;
- bounded Listening-only module homes;
- tests, browser proof, rollout, rollback, acceptance, regression, risks, and stop conditions.

### Files Changed By Packet 1F

- Created `tasks/0059-prd-listening-solo-homework-runtime-alignment.md`.
- Appended this Packet 1F evidence to `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
- Updated `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` only for child-PRD registration and status text.

### Scope Confirmation

- No source file changed.
- No runtime file changed.
- No test file changed.
- No live Listening file changed.
- No teacher-monitor file changed.
- No Reading V2 runtime file changed.
- No traceability matrix was created or changed.
- Task 1.7 remains unchecked.
- Task 1.8, Task 2, and implementation remain unstarted.

### Remaining Child PRDs And Next Permitted Packet

Two child PRDs remain after Packet 1F:

1. Listening live-session authority/runtime and load-test plan.
2. Reading V2 runtime visual alignment.

Next permitted packet: Listening live-session authority/runtime and load-test plan child PRD only.

### Verification Evidence Before Final Validation Addendum

- Task-number availability confirmed before creation.
- Required source/test baseline inspected.
- Protected boundary and dependency wording rechecked against PRD-0055, PRD-0057, PRD-0058, and canonical architecture.
- Documentation/planning-only packet: RED/GREEN/mutation proof is not applicable.

### Packet 1F Final Validation Addendum

- Required-section check passed: all 24 requested PRD-0059 sections exist in order.
- Next-number uniqueness passed: `tasks/0059-prd-listening-solo-homework-runtime-alignment.md` is the only `0059-prd` file.
- Banned placeholder-term check passed: no `TBD`, `TODO`, `PLACEHOLDER`, `developer decides`, `decide later`, or `FIXME` in PRD-0059.
- Tasklist registration passed:
  - PRD-0056, PRD-0057, PRD-0058, and PRD-0059 are registered.
  - status says two child PRDs remain.
  - Task 1.7 remains `[ ]`.
  - Task 1.8 and Task 2 remain `[ ]`.
- Scope check passed for all named source/test/runtime anchors:
  - no Packet 1F status change for `ListeningPracticeView`, mobile scaffold/state, `AudioPlayer`, `ListeningTestPage`, `TestPageRouter`, teacher monitor, live audio hooks, monitor hooks, or Reading V2 runtime paths;
  - no traceability file was created or changed.
- Protected-boundary wording check passed for `AudioPlayer`, `useAudioSync`, `audioCommand`, `masterAudioState`, live Listening, teacher monitor, Reading V2 runtime, and no shared runtime abstraction.
- Dependency check passed for PRD-0057 authoring stability and PRD-0058 storage/result/private-delivery prerequisites.
- Trailing-whitespace check passed for all three Packet 1F files.
- UTF-8 passed:
  - `npm run check:utf8 -- tasks/0059-prd-listening-solo-homework-runtime-alignment.md tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- Global `git diff --check` passed.
- Fresh read-only independent review passed after applying the exact user-provided banned-term list; no valid findings remained.
- Application tests, runtime tests, browser tests, deploys, and implementation were not run because Packet 1F is documentation planning only.
- Task 1.7 remains incomplete.
- Remaining child PRDs:
  1. Listening live-session authority/runtime and load-test plan.
  2. Reading V2 runtime visual alignment.
- Next permitted packet remains the Listening live-session authority/runtime and load-test plan child PRD only.

## Packet 1G Listening Live-Session Authority, Runtime, And Load-Test Child PRD - 2026-06-20

Subtask: Listening live-session authority/runtime and load-test-plan child-PRD portion of `1.7`

### Claims Proven

- Task number `0060` was the next available task number before creation.
- `tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md` now exists.
- `masterAudioState` is specified as canonical continuous live authority.
- `audioCommand` is compatibility traffic only and cannot override a newer valid canonical revision.
- Pause, resume, skip, seek, speed, and section changes share one atomic teacher transaction contract.
- Current monitor default-call hazard is explicitly blocked.
- Late join, student reload, teacher reload, stale commands, buffering, long pause, section lag, disconnect, network partition, drift correction, headphone states, submit/session-end races, private delivery, and source handoff are specified.
- Load methodology covers 100 students per session, 20 concurrent sessions, 2,000 virtual students, browser/media fidelity, and deliberate two-teacher-tab contention.
- New live behavior is required to use bounded Listening-owned modules; existing runtime monoliths become facades/orchestrators with extraction targets and line budgets.
- Task 1.7 remains incomplete and unchecked.
- Reading V2 runtime visual alignment is the only remaining Task 1.7 child PRD.

### Sources Read

Required governance and planning documents were read completely by the main pass and delegated read-only passes:

- `AGENTS.md`
- `documentation/tasks/create-prd.md`
- `documentation/tasks/process-task-list.md`
- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- this append-only findings file
- `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`
- `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`
- `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`
- `tasks/0059-prd-listening-solo-homework-runtime-alignment.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/tasks/0018-prd-unified-audio-architecture.md`
- `documentation/tasks/tasks-0018-prd-unified-audio-architecture.md`
- `documentation/architecture/mobile-ielts-listening-audio-navigation.md`
- `documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md`
- `documentation/architecture/ui-design-standards.md`
- `documentation/rules/infrastructure.md`
- `documentation/rules/react-patterns.md`
- `documentation/rules/mobile-portability.md`
- `documentation/rules/student-mobile-design.md`
- `documentation/rules/observability.md`
- `documentation/rules/announcements.md`

Required live source and tests were inspected:

- `src/skills/listening/components/ListeningTestPage.tsx`
- `src/__tests__/integration/ListeningTestPage.test.tsx`
- `src/skills/listening/components/AudioPlayer.tsx`
- `src/skills/listening/components/AudioPlayer.test.tsx`
- `src/hooks/audio/useAudioSync.ts`
- `src/hooks/audio/useMasterAudioState.ts`
- `src/hooks/audio/useHeadphonePermission.ts`
- `src/hooks/monitor/useMonitorControls.ts`
- `src/hooks/monitor/useMonitorControls.test.ts`
- `src/pages/TeacherTestMonitorPage.tsx`
- `src/pages/TeacherTestMonitorPage.test.tsx`
- `src/components/test/AudioProgressPanel.tsx`
- `src/components/test/TeacherTestControlBar.tsx`
- `src/components/test/HeadphoneRequestPanel.tsx`
- `src/hooks/test/useTestSession.ts`
- `src/types/audio.types.ts`

Submit/session-end review also inspected the current submit/result owner:

- `src/hooks/test/useTestSubmission.ts`
- `src/services/testResults.service.ts`

### Verified Current Baseline

- `TestPageRouter.tsx` imports `ListeningTestPage.tsx`; no current import makes `ListeningTestPage_clean.tsx` canonical.
- Current `MasterAudioState` has no monotonic revision or strict schema version.
- `useMasterAudioState` uses server time for `timestamp`, but current action timestamp construction still uses browser time.
- `useTestSession` reads legacy `audioCommand`.
- `useMonitorControls` writes `audioCommand` plus `masterAudioState` without compare-and-set revision.
- `TeacherTestMonitorPage` calls page-level audio actions without passing `AudioProgressPanel`'s richer current section/position/speed state.
- Current audio action defaults can write section `1`, position `0`, and speed `1.0`.
- Current headphone status is `pending | approved | denied`; revoke is represented as denied.
- Current `saveTestResult(...)` allocates a fresh pushed result ID.
- Current live submit persists result and player completion in separate operations, so deterministic retry identity and a session-end acceptance barrier are missing.
- Current named live tests mostly mock authority internals and do not close live authority behavior.

### Main Authority Decision

`masterAudioState` is canonical continuous authority at:

```text
game_sessions/{sessionCode}/masterAudioState
```

Target authority adds:

- schema version;
- monotonic revision;
- trusted server timestamps;
- action ID;
- action revision;
- writer UID;
- writer-client diagnostic ID;
- command-versus-heartbeat update kind;
- strict validation and highest-valid-revision handling.

`audioCommand` remains at:

```text
game_sessions/{sessionCode}/audioCommand
```

It is emitted as an atomic compatibility projection of the accepted canonical command. It cannot advance or override new-client authority.

### Teacher Transaction And Monitor Decision

- One Listening-owned authority writer owns pause, resume, seek, skip, speed, and section transactions.
- `TeacherTestControlBar` and `AudioProgressPanel` emit action intent to one controller.
- Teacher controls remain disabled until canonical state is hydrated.
- No authority function may use default section, position, speed, or play-state arguments.
- Five of the 20 protocol-load sessions include a second authenticated teacher monitor tab to prove real compare-and-set contention behavior.

### Submit And Session-End Decision

Target live identity:

```text
attemptId = {sessionCode}:{playerId}:{attemptRevision}
resultId = live-{sessionCode}-{playerId}-{attemptRevision}
```

Target paths:

```text
game_sessions/{sessionCode}/submissionBarrier
game_sessions/{sessionCode}/players/{playerId}/liveSubmission
test_results/{resultId}
```

Accepted submit uses one atomic root multi-location update across result, indexes, player completion, and live submission state. Teacher end moves the barrier from `open` to `closing`; server ordering decides whether the submit committed before closing. Lost-response retry resolves the deterministic result. No second result model is created.

### File Architecture And Counter-Monolith Decision

New production behavior belongs under:

```text
src/features/assessment/listening/live-session/
```

Separate modules own authority validation/writes, compatibility traffic, conflicts, student sync/recovery, teacher controller, headphones, delivery handoff, submit/end races, and metrics.

Budgets:

- new production files target 400 lines or fewer;
- new production files above 500 lines are prohibited;
- no new domain algorithm may be appended to an existing file above 800 lines;
- existing large files require maps, surgical extraction, before/after line counts, and responsibility deltas.

Implementation extraction targets are recorded for `ListeningTestPage.tsx`, `AudioPlayer.tsx`, `TeacherTestMonitorPage.tsx`, `useMonitorControls.ts`, and `AudioProgressPanel.tsx`.

### Files And Declared Touch Regions

Packet 1G changed documentation only:

- created `tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md`;
- appended this Packet 1G findings section;
- updated only status and Relevant Files registration text in `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.

No source, test, rule, Worker, deployment, schema, traceability, or Task 1.8+ file was changed.

### Lines Before -> After And Responsibility Delta

- PRD-0060: `0 -> 1512` lines; new planning authority only.
- Tasklist: `672 -> 672` lines before final Packet 1G append; status and one registration row changed only.
- Findings: append-only; prior Packet 1A through Packet 1F content preserved.
- Production responsibility delta: none; planning only.

### Created / Preserved Decomposition Seams

- Created planned seams for authority, compatibility, conflict resolution, student sync/recovery, teacher control, headphones, delivery, submission race, observability, and load harness.
- Preserved `ListeningTestPage`, `AudioPlayer`, teacher monitor components, and hooks as current runtime owners until approved implementation.
- Preserved solo/homework and Reading V2 boundaries.

### Traceability Row IDs

Not applicable - Packet 1G explicitly does not create or modify the traceability matrix. Task 1.9 remains unstarted.

### Characterization / Baseline

Source/test characterization was read-only. Current authority, monitor hazard, headphone model, submit identity gap, route ownership, test gaps, and line counts are recorded in PRD-0060 section 6.

### RED Command And Result

Not applicable - documentation/planning-only packet.

### GREEN Command And Result

Not applicable - documentation/planning-only packet. Application tests were not run.

### Mutation Proof And Restoration Evidence

Not applicable - documentation/planning-only packet.

### Browser / Deploy Artifacts

None produced. Browser, iOS Safari, deployed/live, Worker, and load execution are future human-assisted implementation gates.

PRD-0060 requires future Playwright commands to use:

```powershell
npx playwright test tests/e2e/listening-live-session.spec.ts --reporter=json > report.json
```

Required URLs remain:

- teacher: `http://localhost:5173`
- student: `http://localhost:5174`

### Independent Review

A fresh read-only review found:

1. findings had not yet been appended, so tasklist status temporarily led the evidence chain;
2. current live result writes lacked deterministic identity and a durable session-end barrier;
3. load methodology lacked real two-teacher-tab contention.

Packet 1G resolved all three before final validation:

- this findings section now aligns the evidence chain;
- PRD-0060 now defines deterministic attempt/result identity, exact barrier/player schemas, atomic accepted-submit fan-out, and open/closing/closed ordering;
- protocol load now includes five two-teacher-tab contention sessions and explicit pass criteria.

### Residual Risks Or Deferred Items

- Final soft/hard correction thresholds require measured approval; 500 ms and 2 seconds remain test baselines only.
- Final disconnect grace requires measured approval; 10 seconds remains a test baseline.
- Exact non-production project/endpoints and human owners for Safari/iOS/deployed proof remain implementation-gate questions.
- `audioCommand` retirement remains a later separately approved packet.
- Reading V2 runtime visual alignment remains uncreated.

### Task Status And Next Permitted Packet

- Task 1.7 remains incomplete and unchecked.
- PRD-0056 through PRD-0060 now exist.
- Reading V2 runtime visual alignment is the only remaining child PRD.
- Task 1.8, Task 1.9, Task 1.10+, Task 2+, implementation, traceability, rules, Workers, and deployment remain unstarted.
- Next permitted packet: Reading V2 runtime visual-alignment child PRD only.

### Packet 1G Final Validation Addendum

- Required-section scan passed: PRD-0060 contains overview, goals, user stories, numbered requirements, non-goals, verified baseline, target authority architecture, state schemas, teacher transactions, student sync, reload/join/disconnect, headphone model, monitor model, private delivery, submit/session-end races, load methodology, accessibility, file architecture, owned/protected files, tests, browser proof, observability, rollout, rollback, acceptance, regression checklist, risks, open questions, and Definition of Done.
- Task-number scan passed: `tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md` is the only `0060-prd` file.
- Placeholder scan passed for PRD-0060 and the Packet 1G appended findings section: no `TBD`, `TODO`, `FIXME`, unresolved spec-path token, `developer decides`, `decide later`, `implement later`, `fill in details`, or `similar to task` wording.
- Protected-scope scan passed: no named live source, live test, solo/homework, Worker, Firebase rule/config, or Reading V2 runtime path was changed by Packet 1G.
- Tasklist registration passed:
  - PRD-0056 through PRD-0060 are registered;
  - status records Reading V2 runtime visual alignment as the only remaining child PRD;
  - Task 1.7 remains `[ ]`;
  - Task 1.8 remains `[ ]`.
- Trailing-whitespace scan passed for the three Packet 1G task documents.
- UTF-8 passed:
  - `npm run check:utf8 -- tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- Global tracked `git diff --check` passed.
- Per-file no-index `git diff --no-index --check` passed for all three untracked Packet 1G task documents.
- Fresh independent read-only re-review passed with no blocking findings after deterministic submit identity/barrier and two-teacher-tab load coverage were added.
- Application tests, browser tests, load tests, Firebase rules, Workers, deployments, and schema changes were not run or implemented because Packet 1G is planning only.
- Task 1.7 remains incomplete.
- Reading V2 runtime visual alignment remains the only child PRD not created.
- Next permitted packet remains the Reading V2 runtime visual-alignment child PRD only.

## Packet 1H Reading V2 Runtime Visual-Alignment Child PRD - 2026-06-20

Subtask: Reading V2 runtime visual-alignment child-PRD portion of `1.7`

### Claims Proven

- Task number `0061` was the next available task number before creation.
- `tasks/0061-prd-reading-v2-runtime-visual-alignment.md` now exists.
- PRD-0061 preserves `ReadingV2RuntimeShell` as the projection-bound runtime and answer collector.
- Non-live projection path remains `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`.
- Live projection path remains `reading_v2/projections/session_test_payloads/{sessionCode}:{snapshotVersionId}`.
- Canonical drafts, packaged materials, invalid or non-runtime projections, unsupported schema versions, and legacy flat-question payloads remain rejected.
- Passage rendering, task-type rendering, answer state, submit/review, scoring, result, release-policy, regrade, and AI-feedback compatibility remain protected.
- `StudentPracticePage` remains non-live host owner.
- `TestPageRouter` remains live host owner.
- Timer, launch context, anti-cheat, integrity telemetry, trusted submit, result transition, return navigation, and feedback remain host/platform-owned.
- Desktop/tablet two-column and phone passage-first contracts remain required.
- Mobile/desktop state continuity, keyboard behavior, screen-reader semantics, focus restoration, safe areas, and 44px mobile targets are specified.
- Neutral shared assessment presentation remains blocked until authoring stability and a real two-consumer semantic/accessibility contract are proven.
- Shared presentation is prohibited from owning passages, projection data, answers, timer, submit, scoring, anti-cheat, trusted submit, or navigation.
- Exact owned/protected files, module homes, facade limits, size budgets, large-file maps, decomposition seams, characterization tests, mutation proof, browser proof, rollout, rollback, acceptance criteria, regression checklist, risks, open questions, and stop conditions are specified.
- Task 1.7 is complete because PRD-0056 through PRD-0061 exist and structural validation found no missing child or placeholder.
- Task 1.8 remains unstarted.

### Sources Read

Required governance, planning, architecture, rule, source, and test files were read completely by the main pass and delegated read-only passes:

- `AGENTS.md`
- `C:\Users\The Lord\.codex\RTK.md`
- `DESIGN.md`
- `documentation/tasks/create-prd.md`
- `documentation/tasks/process-task-list.md`
- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- this append-only findings file
- `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`
- `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`
- `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`
- `tasks/0059-prd-listening-solo-homework-runtime-alignment.md`
- `tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/architecture/reading-v2-runtime-integrations.md`
- `documentation/architecture/ui-design-standards.md`
- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-runtime-v1-parity-verification-notes.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-ui-port-audit.md`
- `documentation/tasks/PRD0048/reading-v2-trusted-submit-backend-decision.md`
- `documentation/tasks/PRD0048/reading-v2-review-and-assessment.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`
- `documentation/rules/student-mobile-design.md`
- `documentation/rules/student-data-loading.md`
- `documentation/rules/mobile-portability.md`
- `documentation/rules/observability.md`
- `documentation/rules/announcements.md`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.mobile-css.test.ts`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.css`
- `src/components/reading-v2/runtime/ReadingV2MobileUtilities.tsx`
- `src/components/reading-v2/runtime/ReadingV2MobileUtilities.test.tsx`
- `src/components/reading-v2/runtime/task-type-components/ReadingV2TaskTypeComponents.tsx`
- `src/services/reading-v2/readingV2RuntimeBoundary.service.ts`
- `src/services/reading-v2/readingV2RuntimeBoundary.service.test.ts`
- `src/services/reading-v2/readingV2RuntimeSubmission.service.ts`
- `src/services/reading-v2/readingV2RuntimeSubmission.service.test.ts`
- `src/services/reading-v2/readingV2Projection.service.ts`
- `src/services/reading-v2/readingV2Projection.service.test.ts`
- `src/services/reading-v2/readingV2ResultAdapter.service.ts`
- `src/services/reading-v2/readingV2ResultAdapter.service.test.ts`
- `src/services/reading-v2/readingV2Result.service.ts`
- `src/services/reading-v2/readingV2Result.service.test.ts`
- `src/services/reading-v2/readingV2Scoring.service.ts`
- `src/services/reading-v2/readingV2Scoring.service.test.ts`
- `src/services/reading-v2/readingV2TrustedSubmissionProcessor.service.ts`
- `src/services/reading-v2/readingV2TrustedSubmissionProcessor.service.test.ts`
- `src/pages/StudentPracticePage.tsx`
- `src/pages/StudentPracticePage.test.tsx`
- `src/pages/TestPageRouter.tsx`
- `src/pages/TestPageRouter.test.tsx`
- `src/__tests__/readingV2BoundaryImports.test.ts`

Three initial read-only subagents inspected child-PRD/tasklist consistency, runtime source/test ownership, and PRD-0048 plus UI/mobile/accessibility contracts. A separate focused read-only reviewer found no blocking PRD-0061 omission or contradiction.

### Verified Runtime Baseline

- `ReadingV2RuntimeShell.tsx` is 3,408 lines and owns rendering, answer state, responsive presentation, review, focus/scroll behavior, and lifecycle presentation.
- `ReadingV2RuntimeShell.css` is 2,022 lines and owns base, task/input, desktop/tablet, phone, and safe-area presentation.
- `ReadingV2RuntimeShell.test.tsx` is 1,385 lines and contains broad DOM characterization.
- `ReadingV2MobileUtilities.tsx` is a 136-line bounded mobile dialog utility.
- `ReadingV2TaskTypeComponents.tsx` is a 145-line bounded task-presentation primitive set.
- `StudentPracticePage.tsx` owns the non-live shell handoff.
- `TestPageRouter.tsx` owns the live shell handoff.
- Projection, trusted submit, result, review, scoring, audit, feedback, and anti-cheat owners remain outside visual presentation.
- Current assigned tests are unit/static/mock-heavy; no mutation harness, natural-route Playwright proof, durable DB proof, or deployed proof exists in the inspected slice.

### Main Runtime Boundary

```text
StudentPracticePage or TestPageRouter
  -> namespaced runtime-safe projection
  -> ReadingV2RuntimeShell
  -> Reading V2-owned responsive presentation
  -> projection-bound answer rows
  -> host-owned trusted submit
  -> existing result/review/feedback consumers
```

The runtime shell may render host-provided lifecycle state and invoke callbacks. It may not load routes, infer destinations, own anti-cheat, call scoring, persist results, or import Listening behavior.

### Protected Contracts

- projection paths, kinds, IDs, source-snapshot binding, sanitization, and rejection;
- task taxonomy, stable interaction IDs, task-group IDs, display numbers, option-set identity, and answer shapes;
- host timer, lifecycle, launch, anti-cheat, integrity, submit, result, and navigation ownership;
- browser client-safe submit payload and trusted backend scoring;
- existing result indexes, grouped review payload, release-policy sanitation, append-only regrade, and AI-feedback payload;
- `reading_v2/audit_events/{eventId}`;
- V1/V2 route separation;
- all Listening authoring, solo/homework, live, audio, headphone, and teacher-monitor boundaries.

### File Architecture

- Allowed Reading V2-owned homes are `src/components/reading-v2/runtime/`, `runtime/presentation/`, and `runtime/task-type-components/`.
- Neutral shared presentation remains under `src/features/assessment/shared/components/` only after the two-consumer gate.
- New presentation files target 200 lines and cannot exceed 300 without approval.
- New CSS files target 300 lines and cannot exceed 450 without approval.
- New neutral primitives target 150 lines and cannot exceed 220 without approval.
- Existing `ReadingV2RuntimeShell.tsx` and CSS must not grow in net lines without approved evidence.
- Large-file maps are required before edits.
- Extraction is conditional on characterization, coherent responsibility, single state ownership, line reduction, and recorded responsibility delta.

### Browser Proof Contract

- Student launches start at `http://localhost:5174`.
- Teacher launch, when required, starts at `http://localhost:5173`.
- Teacher and student use separate browser contexts.
- Proof covers non-live, homework, course where available, live, invalid projection, passage/question navigation, answers, submit/review, reload, viewport/orientation switch, mobile keyboard, accessibility, anti-cheat, trusted submit, durable result/index evidence, teacher/student review recovery, and return navigation.
- Direct deep links are reserved for denial/invalid-projection scenarios.
- Every Playwright run uses `npx playwright test --reporter=json > report.json`.

### Files And Declared Touch Regions

Packet 1H changed documentation only:

- created `tasks/0061-prd-reading-v2-runtime-visual-alignment.md`;
- appended this Packet 1H findings section;
- updated tasklist status, PRD-0061 registration, and Task 1.7 checkbox.

No source, test, runtime, projection, Firebase, route, Worker, deployment, traceability, or Task 1.8 implementation file was changed.

### Lines Before -> After And Responsibility Delta

- PRD-0061: `0 -> 1199` lines before final Packet 1H validation addendum; new planning authority only.
- Tasklist: `672 -> 673` lines; status, one Relevant Files row, and Task 1.7 checkbox changed.
- Findings: append-only; Packet 1A through Packet 1G content preserved.
- Production responsibility delta: none.

### Traceability Row IDs

Not applicable - Packet 1H explicitly does not create or modify the traceability matrix. Task 1.9 remains unstarted.

### Characterization / Baseline

Source/test characterization was read-only. Current runtime/host ownership, projection and submit/result chains, task contracts, test gaps, line counts, and large-file seams are recorded in PRD-0061.

### RED Command And Result

Not applicable - documentation/planning-only packet.

### GREEN Command And Result

Not applicable - documentation/planning-only packet. Application tests were not run.

### Mutation Proof And Restoration Evidence

Not applicable - documentation/planning-only packet.

### Browser / Deploy Artifacts

None produced. Browser, network, durable DB, teacher/student recovery, deployment, and mutation evidence are future implementation gates.

### Residual Risks Or Deferred Items

- Current runtime shell, CSS, and primary test remain large and require maps before implementation.
- Exact existing natural-route fixture inventory remains an implementation precondition.
- Any proposed neutral runtime primitive still needs a named second consumer.
- Durable scroll-position state remains out of scope; current component-state behavior is preserved.
- Task 1.8 must audit all six child PRDs before any implementation planning proceeds.

### Task Status And Next Permitted Packet

- Task 1.7 is complete.
- All child PRDs are present:
  1. PRD-0056 Listening upload-worker Security Gate S0.
  2. PRD-0057 Listening authoring draft/publish/version behavior.
  3. PRD-0058 R2 asset lifecycle, registry, reconciliation, cleanup, and delivery.
  4. PRD-0059 Listening solo/homework runtime alignment.
  5. PRD-0060 Listening live-session authority/runtime and load-test plan.
  6. PRD-0061 Reading V2 runtime visual alignment.
- Task 1.8 remains unchecked and unstarted.
- Task 1.9 traceability, Task 1.10+, Task 2+, implementation, source, tests, runtime, projection, Firebase, routes, Workers, and deployment remain unstarted.
- Next permitted packet: Task 1.8 child-PRD completeness audit only.

### Packet 1H Final Validation Addendum

- Required-section scan passed: PRD-0061 contains source references, clarification handling, overview, goals, user stories, numbered requirements, non-goals, verified baseline, target runtime contract, visual principles, file architecture, facade limits, size budgets, large-file maps, decomposition seams, exact owned files, exact protected files/contracts, testing, RED/GREEN/mutation proof, browser proof, observability/announcements, rollout, rollback, acceptance, regression checklist, risks, open questions, stop conditions, and Definition of Done.
- Task-number uniqueness passed: `tasks/0061-prd-reading-v2-runtime-visual-alignment.md` is the only `0061-prd` file.
- Six-child presence passed: PRD-0056 through PRD-0061 each exist exactly once.
- Six-child placeholder scan passed: no unresolved placeholder language in any child PRD.
- PRD-0061 and new Packet 1H evidence contain no `TBD`, `TODO`, `FIXME`, unresolved spec-path token, `developer decides`, `decide later`, `implement later`, `fill in details`, or `similar to task` wording.
- Historical tasklist/findings references that quote banned placeholder terms as policy or prior successful scan evidence were excluded from false-positive interpretation.
- Tasklist registration passed:
  - PRD-0061 is registered;
  - status records Task 1.7 complete and Task 1.8 as next;
  - Task 1.7 is `[x]`;
  - Task 1.8 remains `[ ]`.
- Protected-scope scan passed: Packet 1H changed only PRD-0061, this append-only findings file, and tasklist status/registration/Task 1.7 state.
- No source, test, runtime, projection, Firebase, route, Worker, deployment, traceability, or Task 1.8 implementation file was changed by Packet 1H.
- Trailing-whitespace scan passed for all three Packet 1H task documents.
- UTF-8 passed:
  - `npm run check:utf8 -- tasks/0061-prd-reading-v2-runtime-visual-alignment.md tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- Global tracked `git diff --check` passed.
- Per-file no-index `git diff --no-index --check` produced no whitespace errors for each untracked Packet 1H task document; exit status `1` represented expected content differences from `NUL`.
- Focused independent read-only review returned no blocking findings.
- Application tests, browser tests, network proof, durable DB proof, mutation tests, Firebase rules, Workers, deployments, and source changes were not run or implemented because Packet 1H is planning only.
- Task 1.7 is complete.
- Next permitted packet is Task 1.8 child-PRD completeness audit only.

## Packet 1I Task 1.8 Child-PRD Completeness Audit - 2026-06-20

Subtask: `1.8`

### Scope And Outcome

- Audited PRD-0056 through PRD-0061 only.
- Created no numbered PRD and no traceability matrix.
- Changed no source, tests, Firebase rules, Workers, runtime behavior, deployment, or implemented schema.
- Outcome: **FAIL / BLOCKED**. PRD-0057 does not name approved target draft/version paths or full record schemas. Task 1.8 remains unchecked and Task 1.9 is not permitted.
- RED/GREEN/mutation: not applicable - non-behavioral planning audit.

### PRD-0056 Binary Completeness Table

| Required row | Result | Evidence |
| --- | --- | --- |
| exact owned files | PASS | Section 12 names Worker package, bounded Worker modules, browser facade, tests, and findings. |
| exact protected files | PASS | Section 12 lists protected application, rules, backup, runtime, and architecture paths. |
| exact data paths | PASS | Sections 8 and 10 fix upload/move request paths and owner-derived object prefixes. |
| exact schema/contracts | PASS | Sections 8-11 define request/response, grant, identity, CORS, replay, rate, and size contracts. |
| allowed changes | PASS | S0 scope plus sections 7-12 constrain Worker hardening and browser adapter compatibility. |
| prohibited changes | PASS | Sections 5, 12, 20, and 23 prohibit lifecycle/runtime/rules/delivery expansion. |
| tests | PASS | Section 13 names harness, RED baseline, negative tests, and compatibility tests. |
| browser/deployed proof | PASS | Sections 15, 19, 20, and 24 require deployed denials plus authorized upload/move proof. |
| rollback | PASS | Section 16 fixes version capture, rollback, version-pin, and verification commands. |
| observability | PASS | Section 17 fixes allowed/forbidden log fields and counters. |
| stop conditions | PASS | Sections 19 and 23 name rollout and implementation stops. |
| dependencies and entry gates | PASS | Sections 7, 15, 19, 23, and 24 require approval, deployed truth, and mechanism-matched proof. |
| no placeholders or junior-developer discretion | PASS | Canonical native-R2/checked-in-Wrangler decision and exact contracts are binding. |
| implementation remains blocked pending required approval | PASS | Status plus sections 15 and 24 block implementation/deploy. |

Listening architecture: PASS. Packet 1I section 25 fixes `cloudflare/src/upload-worker/**`, `worker.js`/`r2Storage.ts` facade limits, dependency direction, no Reading V2 import, 400-line target/500-line ceiling, current baselines, mandatory before/after evidence, named seams, and no new facade responsibility.

### PRD-0057 Binary Completeness Table

| Required row | Result | Evidence |
| --- | --- | --- |
| exact owned files | PASS | Section 20 names builder/facade and bounded authoring/storage/adapter/type files. |
| exact protected files | PASS | Section 20 lists runtime, Worker, rules, storage lifecycle, Reading V2, and Google Drive paths. |
| exact data paths | **GAP** | Section 21 and Packet 1I section 32 confirm target draft/version/revision/idempotency/recovery paths are unapproved. |
| exact schema/contracts | **GAP** | Authoring behavior is exact, but no approved full draft/version/revision/operation record schemas exist. |
| allowed changes | PASS | Sections 5, 19, 20, and 26 constrain authoring-only implementation. |
| prohibited changes | PASS | Sections 5, 15, 20, 21, and 30 protect storage lifecycle/runtime/Reading V2. |
| tests | PASS | Section 25 names service, builder, announcement, accessibility, integration, and boundary cases. |
| browser/deployed proof | PASS | Section 26 requires teacher Save draft/Publish browser proof; no Worker deploy is owned here. |
| rollback | PASS | Sections 26-29 define stop/rollback triggers and compatibility preservation. |
| observability | PASS | Section 22 fixes actions, registry synchronization, announcements, and forbidden telemetry. |
| stop conditions | PASS | Sections 21, 30, and 32 block missing path/schema/dependency work. |
| dependencies and entry gates | PASS | Sections 15, 21, 26, and 30 require S0, storage foundation, and approvals. |
| no placeholders or junior-developer discretion | **GAP** | Section 32 prevents silent choice, but missing target paths/schemas remain unresolved architecture decisions. |
| implementation remains blocked pending required approval | PASS | Status and Packet 1I section 32 block all implementation. |

Listening architecture: PASS. Sections 19-20 define coherent bounded homes, facades, no Reading V2 imports, current line counts, required before/after evidence, seams, and no new responsibility in `ListeningTestBuilder.tsx` or `listeningTestStorage.ts`.

### PRD-0058 Binary Completeness Table

| Required row | Result | Evidence |
| --- | --- | --- |
| exact owned files | PASS | Sections 26-27 plus Packet 1I section 37 name bounded modules, facades, backup worker, and result-review surfaces. |
| exact protected files | PASS | Section 27 protects solo/live/AudioPlayer/monitor/Reading V2/Google Drive. |
| exact data paths | PASS | Section 28 fixes registry/session/event/metric/sweep paths and indexes. |
| exact schema/contracts | PASS | Sections 9-25 define registry, states, sessions, references, delivery, metrics, and audit contracts. |
| allowed changes | PASS | Sections 26-31 and 37 constrain storage, delivery issuance, and result-review integration. |
| prohibited changes | PASS | Sections 5, 20, 27, 30-31, and 37 exclude solo/live cutover and duplicated ownership. |
| tests | PASS | Section 29 and Packet 1I additions cover rules, lifecycle, denial, range, backup, and result review. |
| browser/deployed proof | PASS | Sections 20, 29-31 require private media/browser/deployed proof before cutover. |
| rollback | PASS | Sections 23, 30-31 fix stop-writes/cleanup, old/new readers, restore, and public fallback. |
| observability | PASS | Sections 24-25 fix sinks, fields, owners, cadence, thresholds, audit, and forbidden values. |
| stop conditions | PASS | Sections 24, 30-31, 35, and 37 name exact stops. |
| dependencies and entry gates | PASS | Sections 7, 30-31, and 35 require S0, authoring status, rules, restore, and proof. |
| no placeholders or junior-developer discretion | PASS | Exact paths/contracts exist; rejected sink/path requires a new approved amendment, not developer choice. |
| implementation remains blocked pending required approval | PASS | Status and sections 30, 35, and 37 block implementation/cutover. |

Listening architecture: PASS. Sections 26-27 and 37 fix coherent homes, facades, dependency direction, no Reading V2 dependency, file budgets, baselines, before/after evidence, decomposition seams, and no new facade/monolith responsibility.

PRD-0058 delivery authorization:

| Required proof | Result | Evidence |
| --- | --- | --- |
| retained owner/assignment/result/version authorization | PASS | Sections 16 and 19 authorize owner or active retained immutable-version viewer only. |
| known assetId/URL/key does not authorize read | PASS | FR-038 and section 19 deny possession-only access. |
| cross-user/cross-owner issuance denial specified and tested | PASS | FR-039, sections 19 and 29, and regression rows require local/deployed denial proof. |
| result-review/solo/live ownership not duplicated | PASS | FR-072 and section 37 assign issuance/result review to PRD-0058, solo consumption to PRD-0059, and live player handoff to PRD-0060. |

### PRD-0059 Binary Completeness Table

| Required row | Result | Evidence |
| --- | --- | --- |
| exact owned files | PASS | Section 16 names host, hooks, progress/result adapters, mobile files, tests, and bounded modules. |
| exact protected files | PASS | Section 16 lists live, monitor, AudioPlayer, Reading V2, Worker/rules, and lifecycle internals. |
| exact data paths | PASS | FR-057, state table, and Packet 1I section 25 fix progress key families and canonical result path ownership. |
| exact schema/contracts | PASS | Sections 9-12 and Packet 1I section 25 fix state, resume, submit, result, mobile, and compatible progress fields. |
| allowed changes | PASS | Sections 7-16 and rollout phases constrain solo host/adapter work. |
| prohibited changes | PASS | Sections 5, 10, 16, 20-23 prohibit live/AudioPlayer/Reading V2/result-review ownership. |
| tests | PASS | Section 17 names characterization, attempt, timer, autosave, submit, playback, a11y, delivery, and boundary tests. |
| browser/deployed proof | PASS | Section 18 fixes localhost role port, natural routes, viewports, browsers, scenarios, network/DB evidence, and JSON report. |
| rollback | PASS | Section 19 fixes independent behavior/presentation/delivery rollback and data preservation. |
| observability | PASS | FR-071-078, tests, and risk controls require action registry and shared announcements. |
| stop conditions | PASS | Section 23 names dependency, scope, route, and delivery stops. |
| dependencies and entry gates | PASS | Sections 8, 18-19, and 23 require PRD-0057/0058 proof and approval. |
| no placeholders or junior-developer discretion | PASS | Exact owner/state/submit/compatibility contracts and stop rules exist. |
| implementation remains blocked pending required approval | PASS | Status and sections 19, 23, and 24 block implementation. |

Listening architecture: PASS. Sections 15-16 and Packet 1I section 25 fix solo bounded home, existing facades, dependency direction, no Reading V2/live import, budgets, line evidence, seams, and no new `ListeningPracticeView.tsx` responsibility.

### PRD-0060 Binary Completeness Table

| Required row | Result | Evidence |
| --- | --- | --- |
| exact owned files | PASS | Sections 20 and 22 name live package, facades, tests, and load package. |
| exact protected files | PASS | Section 20 protects solo, Reading V2, authoring/storage, Workers, rules, payload/result schemas, and clean page. |
| exact data paths | PASS | FR-002/013/056/076/077 and section 16 fix authority, command, headphone, barrier, player, result, and index paths. |
| exact schema/contracts | PASS | Sections 8-16 define canonical/compatibility/headphone/submission schemas and transactions. |
| allowed changes | PASS | Sections 7-22 and rollout phases constrain live-authority implementation. |
| prohibited changes | PASS | Sections 5, 20-21, 27, and 30 protect solo, Reading V2, storage, result shape, and active-session rollback. |
| tests | PASS | Sections 17, 23, and 29 name contract, load, mutation, and regression proof. |
| browser/deployed proof | PASS | Sections 17, 24, and 26 require separate contexts, exact localhost ports, deployed 75-minute proof, network/RTDB/result artifacts. |
| rollback | PASS | Section 27 fixes session-pinned cohort rollback and state/result preservation. |
| observability | PASS | Sections 18 and 25 fix metrics, thresholds, actions, diagnostics, dimensions, and forbidden fields. |
| stop conditions | PASS | Sections 18 and 31 name immediate and phase-specific stops. |
| dependencies and entry gates | PASS | FR-088, sections 24, 26, 31-32 require approvals, PRD-0058 delivery, maps, tests, and proof. |
| no placeholders or junior-developer discretion | PASS | Measured values use fixed initial baselines plus explicit evidence/approval gates; developers cannot choose silently. |
| implementation remains blocked pending required approval | PASS | Status, FR-106, and sections 26/32 block implementation. |

Listening architecture: PASS. Sections 20-22 fix live bounded home, facades, dependency direction, no Reading V2/solo dependency, file budgets, baseline/target counts, evidence, seams, and no new inline monolith algorithms.

### PRD-0061 Binary Completeness Table

| Required row | Result | Evidence |
| --- | --- | --- |
| exact owned files | PASS | Sections 9 and 13 name Reading V2 runtime presentation files and allowed homes. |
| exact protected files | PASS | Section 14 names host, projection, submission, result/scoring, boundary, and external contracts. |
| exact data paths | PASS | FR-003/004 and protected contracts fix non-live/live projection and audit paths; no new path is allowed. |
| exact schema/contracts | PASS | Sections 4, 7, 9, and 14 fix projection, answer, host, submit, result/review, and neutral shared contracts. |
| allowed changes | PASS | Sections 8-13 and rollout phases limit work to presentation and bounded extraction. |
| prohibited changes | PASS | Sections 5, 9, 14, 20, 23-25 prohibit Listening, projection, submit, result, route, and authority changes. |
| tests | PASS | Sections 15-16 and 22 name characterization, focused suites, mutation, and regressions. |
| browser/deployed proof | PASS | Sections 17 and 19 require natural-route browser/network/result evidence before cohort/full rollout; no Worker deploy is owned. |
| rollback | PASS | Section 20 fixes code-only, data-neutral rollback and triggers. |
| observability | PASS | Section 18 preserves host-owned actions and forbids sensitive payload logging. |
| stop conditions | PASS | Sections 24-25 name exact visual, contract, fixture, dirty-tree, and proof stops. |
| dependencies and entry gates | PASS | Sections 19 and 26 require Task 1.8, maps, baseline, approvals, tests, and proof. |
| no placeholders or junior-developer discretion | PASS | Open questions have binding defaults and explicit stops; no unnamed schema/path is delegated. |
| implementation remains blocked pending required approval | PASS | Status and sections 19/26 block implementation. |

### Cross-Child Contradiction Audit

| Check | Result | Evidence |
| --- | --- | --- |
| PRD-0056 canonical Worker/deploy contract matches PRD-0058 dependency | PASS | Both bind native `env.R2_BUCKET`, checked-in Wrangler deployment, and no assumed S0 completion. |
| PRD-0057 draft/version/audio references match PRD-0058 lifecycle ownership | PASS with blocker | Asset lifecycle ownership matches; authoring content paths/schemas remain explicitly unresolved in PRD-0057. |
| PRD-0058 result-review resolver ownership matches PRD-0059 | PASS after correction | PRD-0058/Task 6 owns resolver/result integration; PRD-0059 consumes only. |
| PRD-0058 and PRD-0060 private-delivery/AudioPlayer ownership does not overlap | PASS | PRD-0058 owns issuance/result review; PRD-0060 owns live player refresh/handoff/cutover. |
| PRD-0059 solo authority never enters PRD-0060 live authority | PASS | Solo protects live paths/hooks and live package rejects solo imports/state. |
| PRD-0060 result/session contracts do not replace existing result ownership | PASS | Existing result owner/shape remains; live adds deterministic identity and atomic session barrier contract only. |
| PRD-0061 imports no Listening behavior and changes no projection/submission/result authority | PASS | Listening and all behavior authorities are protected/non-goals. |
| shared assessment layer remains neutral | PASS | Every child keeps shared code presentation-only and forbids module authority imports. |
| no child claims another child implementation is complete | PASS | Dependencies require status/evidence checks and explicitly prohibit assumed completion. |

### Gaps And Corrections

1. PRD-0056 lacked complete File-Architecture Principles coverage. Corrected with exact bounded home, facades, dependency direction, size/evidence rules, seams, and monolith prohibition.
2. PRD-0057 lacked exact target authoring data paths and schemas. Could not correct without inventing an architecture decision. Added explicit current-state evidence and blocking decision requirements.
3. PRD-0058 contradicted PRD-0059/tasklist by treating result review as an unspecified later dependency. Corrected to PRD-0058/Task-6 ownership with exact result surfaces and exclusive consumer boundaries.
4. PRD-0058 lacked explicit current baselines and mandatory before/after responsibility evidence. Corrected in section 37.
5. PRD-0059 did not spell out current solo progress keys. Corrected with exact platform-storage key families, compatibility rules, target field constraints, and line evidence.

### Independent Review And Main-Agent Adjudication

- Three read-only passes reviewed PRD pairs 0056/0058, 0057/0059, and 0060/0061.
- Main agent rejected parent-PRD-only findings because Task 1.8 applies to child PRDs, and rejected demands for post-implementation line counts because this packet requires the child PRDs to mandate future before/after evidence, not fabricate post-edit counts.
- Main agent accepted the PRD-0057 path gap, PRD-0058 result-review contradiction, and PRD-0058 line-evidence omission; direct source review additionally found PRD-0056 architecture and PRD-0059 exact-key omissions.

### Task State

- Task 1.8 remains `[ ]`.
- Task 1.9 traceability matrix was not created and is not permitted while the PRD-0057 blocker remains.
- No Task 1.10, Task 2, or later implementation started.
- Next permitted work is a product-owner plus architecture/security-approved PRD-0057 path/schema amendment, followed by a Task 1.8 re-audit. Task 1.9 becomes the only next packet only after Task 1.8 passes.

### Packet 1I Final Validation Addendum

- Fresh post-correction independent review: `CLEAN EXCEPT PRD-0057 target draft/version data paths/full schemas unresolved`; reviewer confirmed no files changed.
- Source/document reference existence: 33 unique paths from all six child-PRD Source References sections checked; zero missing.
- Proposed future implementation files were not treated as missing current source. They remain intentionally absent because implementation is blocked.
- Placeholder/vague-term scan found no actionable `approved later`, `developer chooses`, `developer decides`, `as needed`, `TBD`, `TODO`, unnamed future path, or unnamed future schema language. Two `similar` hits in PRD-0061 are explicit anti-generalization rules, not placeholders.
- Task-state scan confirmed Task 1.8 and Task 1.9 remain `[ ]` and the traceability-matrix file is absent.
- UTF-8 passed for PRD-0056 through PRD-0061, tasklist, and findings: `npm run check:utf8 -- <8 Packet 1I files>` reported `UTF-8 check passed for 8 text file(s)`.
- Trailing-whitespace scan passed for all eight Packet 1I files.
- Global tracked `git diff --check` passed.
- Per-file `git diff --no-index --check NUL <file>` passed for each of the eight untracked Packet 1I files; exit status `1` was the expected content-difference result and emitted no whitespace errors.
- An initial review agent created unauthorized untracked `tasks/review-pre-task-1.8-independent-readiness-audit-0055.md` despite read-only instructions. Main agent removed that agent-created artifact with no effect on pre-existing user changes; final scoped status confirms it is absent.
- Final verdict remains Task 1.8 **FAIL / BLOCKED**. No completion checkbox changed.

## Packet 1I — Correction - 2026-06-20

Scope note: `tasks/review-pre-task-1.8-independent-readiness-audit-0055.md` is still absent at the requested path. Corrections below were re-verified against the addendum, child PRDs, canonical docs, and current source before editing. This correction packet is planning-only. It does not resolve or approve Bucket B decisions.

Packet status: PASS WITH REQUIRED CORRECTIONS. The true blockers for Task 1.9 remain B1 and B2 pending product-owner plus architecture/security sign-off.

### (A) Applied Now (Bucket A)

1. H5 - `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md` section 6 now states that `src/services/r2Storage.ts` references describe the pre-PRD-0056-S0 state and must be re-verified after S0 deploy; FR-044 applies at implementation time.
2. M4 - `tasks/0056-prd-listening-upload-worker-security-gate-s0.md` section 12 now gives line-count budgets and decomposition triggers for `cloudflare/worker.js` and `cloudflare/test/upload-worker-security.test.ts`.
3. M5 - `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md` section 6 now fixes the Listening builder Step 4 branch start to `src/skills/listening/builders/ListeningTestBuilder.tsx:1984`. The audit's `src/services/r2Storage.ts` 447-line claim was rejected because current source is 446 lines and the existing PRD baseline was already correct.
4. M6 - `tasks/0056-prd-listening-upload-worker-security-gate-s0.md` FR-017 now clarifies that `newUrl` / `newKey` preservation is the browser adapter `MoveResult` contract derived from server destination state, not necessarily the Worker HTTP body shape.
5. M7 - `tasks/0056-prd-listening-upload-worker-security-gate-s0.md` sections 6 and 13, plus the checklist, now record that checked-in `cloudflare/worker.js:7` advertises `GET` and `DELETE`; negative tests must prove both are denied.
6. L1 - `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md` section 12 now states the legacy raw-URL read adapter returns normalized playback references and must not write Firebase, R2, registry rows, cleanup queues, or audit records.
7. H4/N5 - `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md` sections 6, 8, and 29 now document the full `r2-backup-worker` route surface: media backup plus Reading V2 trusted submit plus homework assignments. Any packet touching `r2-backup-worker/` must run Reading V2 submit and homework-route regressions and cross-reference `documentation/architecture/reading-v2-runtime-integrations.md`.

### (B) Escalated, Pending Sign-Off (Bucket B)

1. B1 BLOCKER - `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md` section 8 now proposes Option A, widen PRD-0058 to own upload-session backend issuance, or Option B, add `PRD-0056A Listening Upload Session Bridge`. Recommendation: Option B, because it preserves PRD-0056 S0 as a severable security gate and gives the `temp/listening-audio/` to `temp/listening/` transition a named owner. Approvers: product owner plus architecture/security.
2. B2 BLOCKER - `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md` section 10 now proposes Option A, reuse `drafts/{draftId}` / `tests/{testId}`, or Option B, create `listening_authoring/*` target paths. Recommendation: Option B, because it separates new Listening version/idempotency rules from broad legacy paths. Approvers: product owner plus architecture/security.
3. H1 - `tasks/0056-prd-listening-upload-worker-security-gate-s0.md` sections 9 and 13 now forbid copying raw-UID logging from `r2-backup-worker/src/auth/firebase-auth.ts:55,102,113,117` and require a negative test proving logs contain no raw UID. Approver: architecture/security.
4. H2 - `tasks/0056-prd-listening-upload-worker-security-gate-s0.md` FR-022 now records provenance for `https://kahut1.web.app` from `documentation/SOP/0023-november-11-2025-comprehensive-session.md:132`, `:629`, and `:807`. The audit's no-provenance claim was not upheld; product-owner approval is still required for any origin change.
5. H3 - `tasks/0056-prd-listening-upload-worker-security-gate-s0.md` section 11 now proposes an atomic replay nonce store with TTL at least 15 minutes, atomic pre-`R2_BUCKET.put` reservation, move replay semantics, and cryptographic review. Recommendation: Cloudflare Durable Object nonce ledger unless architecture/security approves another atomic store. Approver: architecture/security.
6. M1 - `tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md` FR-003 now frames schemaVersion 2, revision/action fields, writer metadata, and compare-and-set as the target live-session contract pending browser/live proof and architecture/security sign-off, not proven current source truth. Approver: architecture/security.
7. M2 - `tasks/0056-prd-listening-upload-worker-security-gate-s0.md` section 19 now proposes Worker/browser deploy-order choices. Recommendation: shadow/canary S0 endpoint before production switch. Approvers: product owner plus architecture/security.
8. M3 - `tasks/0056-prd-listening-upload-worker-security-gate-s0.md` section 14 now requires a pre-deploy subtask to create or confirm rate-limit namespace `prd0056-upload-worker-s0` and record Wrangler/API/dashboard verification. Approver: architecture/security / Cloudflare owner.
9. M8 - `tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md` section 18 now marks load-test thresholds, including p95/p99 latency values, as proposed planning thresholds requiring approval after dry-run evidence. Approvers: product owner plus architecture/security.

### (C) Recorded For Implementation (Bucket C: N1-N4)

1. N1 - Target: `playwright.config.js:5` versus PRD-0060 section 24 command `tests/e2e/listening-live-session.spec.ts`. Required alignment: either change config to `./tests/e2e` or rewrite the PRD command to `e2e/...`; preserve `--reporter=json > report.json`. Owner: test-infra. Approval: architecture alignment; record the chosen path.
2. N2 - Target: `playwright.config.js:21-24` starts only teacher `http://localhost:5173`, while PRD-0060 requires teacher 5173 plus student `http://localhost:5174` in separate contexts. Required shared harness correction: add a 5174 webServer or record the exact out-of-band 5174 launch command once, not per PRD. Owner: test-infra packet or S0/storage harness. Approval: architecture/test-infra ownership.
3. N3 - Target: `src/hooks/monitor/useMonitorControls.ts:288,325,497,797,826,840,843,886,929,949,986,1035,1061,1131`. PRD-0060 owns the audio subset at `:886`, `:929`, `:949`, `:986`, and `:1035`; those must move to shared announcements and in-app confirmation UI. The non-audio sites need a scope decision: PRD-0060 file-wide migration or a named teacher-monitor packet. Owner: PRD-0060 for audio subset; non-audio owner pending. Approval: product-owner scope decision.
4. N4 - Target: `src/types/audio.types.ts:75`, where `HeadphoneRequestStatus` lacks `revoked`. PRD-0060 section 13 now records a Phase 3 precondition to add `revoked` or migrate cleanly to `HeadphoneRequestV2` before FR-057/FR-062 behavior. Owner: PRD-0060 Phase 3. Approval: none beyond FR-057 authority.

### (D) Impl-Log Spot-Check Table

| Claim checked | Source evidence | Result |
| --- | --- | --- |
| Implementation log says next step is first low-risk `AssessmentAuthoringSection` adoption in Reading V2. | Current `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx:73-80` already uses the shared section. | STALE |
| Reading V2 settings uses shared authoring section for accessibility/runtime advisories. | `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx:73-80`. | CONFIRMED |
| `AssessmentAuthoringSection` supports neutral `ariaLabel`. | `src/features/assessment/shared/components/AssessmentAuthoringSection.tsx:15-16,31-34`. | CONFIRMED |
| `AssessmentAuthoringSection` stays neutral and does not import Reading V2, Listening, audio, or live-session authority. | `src/features/assessment/shared/components/AssessmentAuthoringSection.tsx:1-3,15-16,33-52`. | CONFIRMED |
| Listening builder Step 4 uses shared authoring/status primitives. | `src/skills/listening/builders/ListeningTestBuilder.tsx:18-19,1983-2052`. | CONFIRMED |
| `AssessmentValidationSummary` is neutral shared UI. | `src/features/assessment/shared/components/AssessmentValidationSummary.tsx:1-4,9-19,22-57`. | CONFIRMED |

### Closing

Task 1.8 was NOT marked complete. Task 1.9 was NOT started and no traceability matrix was created. No implementation, source, Worker, Firebase-rule, runtime, or config file was changed; Bucket C items were recorded only. Stop here for product-owner plus architecture/security review of Bucket B, especially B1 and B2, before Task 1.9 or any implementation.

## Packet 1J B1/B2 Approval, Contract Amendments, And Task 1.8 Re-Audit - 2026-06-20

### Approval Record

Decision reference: `PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20`.

The user answered `Confirm` to the explicit approval question: approve B1 Option B and B2 Option B, representing both product-owner and architecture/security approval.

Approved decisions:

1. B1 Option B - create `PRD-0056A Listening Upload Session Bridge`.
2. B2 Option B - use Listening-owned `listening_authoring/**` draft/version/revision/operation paths.
3. PRD-0056A owns backend-issued `uploadSessionId`, backend-issued `assetId`, upload-session bootstrap, and the `temp/listening-audio/` to `temp/listening/` transition.
4. Generic `drafts/{draftId}` is not reused. `tests/{testId}` remains frozen legacy/version-1 compatibility only after migration.

### Planning Amendments

1. Created `tasks/0056a-prd-listening-upload-session-bridge.md` with exact API, bootstrap schema, trusted backend owner, Worker grant boundary, rules owner, owned/protected files, allowed/prohibited changes, tests, browser proof, observability, size budgets, rollout, rollback, and stop conditions.
2. Appended PRD-0057 section 33 with exact `listening_authoring/drafts`, `revision_drafts`, `versions`, and `operations` paths; full record schemas; backend/rules ownership; indexes; conflict/idempotency contract; legacy freeze marker; stale-writer guard; browser proof; rollback; and DR/restore ownership.
3. Appended PRD-0058 section 38 with approved bridge ownership and temp-prefix transition. Packet 1J corrections also unify the PRD-0056A/PRD-0058 session schema, mark `references/tests/{testId}` legacy-only, and define path-specific ACLs.
4. Updated `documentation/architecture/upload-storage-authority.md` with bridge ownership, temp-prefix transition, and canonical draft/version asset-reference paths.
5. Registered PRD-0056A in the tasklist and Task 1.7/1.8 scope.
6. No source, Worker, Firebase rule, runtime, config, deployment, or traceability-matrix implementation was performed.

### Independent Review And Adjudication

1. Initial independent review found a PRD-0058 session-ownership/schema contradiction. Corrected with explicit create-time PRD-0056A ownership and additive PRD-0058 lifecycle ownership.
2. Focused architecture/security review found stale legacy writers, ambiguous legacy test asset references, missing per-node ACLs, and missing PRD-0057 DR ownership. All were corrected.
3. A reviewer proposed promoting PRD-0060 Playwright N1/N2 to Task 1.8 blockers. Main-agent adjudication rejected that promotion because the authoritative completion addendum and Packet 1I findings classify N1/N2 as Bucket C shared test-infra implementation corrections and explicitly confirm PRD-0060 complete on Task 1.8 axes.
4. Final independent current-byte re-review returned `CLEAN/PASS`.

### Task 1.8 Re-Audit

| Child PRD | Result | Evidence summary |
| --- | --- | --- |
| PRD-0056 | PASS | Exact S0 owner, files, API/security contracts, tests, deploy/rollback, observability, module seams, and line budgets remain complete. |
| PRD-0056A | PASS | Exact bridge owner, schema, trusted mutation boundary, temp transition, tests, browser proof, rollback, observability, and stop conditions are present. |
| PRD-0057 | PASS | B2 exact paths/full schemas/rules/backend/cutover/legacy writer guard/DR contract are present. |
| PRD-0058 | PASS | B1 split ownership is consistent; storage schemas, ACLs, delivery authorization, cross-user denial, tests, rollback, and protected routes are present. |
| PRD-0059 | PASS | Prior Packet 1I runtime/data-path/file-boundary completeness remains valid. |
| PRD-0060 | PASS | Prior Packet 1I live authority/load/browser-proof planning completeness remains valid; N1/N2 stay Bucket C. |
| PRD-0061 | PASS | Prior Packet 1I Reading V2 runtime visual/boundary/proof completeness remains valid. |

Task 1.8 verdict: **PASS**.

### Verification

1. Source-reference existence check for PRD-0056A returned eight `True` results.
2. `npm run check:utf8 -- <10 Packet 1J/audit files>` reported `UTF-8 check passed for 10 text file(s)`.
3. Actionable placeholder scan for `TBD`, `TODO`, `developer decides`, `developer chooses`, `as needed`, `approved later`, and `unnamed future` returned no matches.
4. Trailing-whitespace scan returned no matches.
5. Global tracked `git diff --check` passed.
6. Per-file `git diff --no-index --check NUL <file>` emitted no whitespace errors; exit status `1` was the expected content-difference result for untracked files.
7. Task-state scan shows Task 1.8 `[x]`, Task 1.9 `[ ]`, and status names Task 1.9 as the next permitted packet.

### Closing

Task 1.9 was not started and no traceability matrix was created. Implementation remains unstarted. Next permitted packet is Task 1.9 traceability matrix creation only.

## Packet 1K Task 1.9 Traceability Matrix - 2026-06-20

### Scope And Authority

Created `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` for Task 1.9 only. Current child PRDs, the parent tasklist, Packet 1I/1J findings, and referenced canonical architecture/supporting documents were planning authority. The removed-primary-audit addendum remained advisory and was not used as authority. No Task 1.10 dependency-graph work or implementation work was performed.

### Coverage Evidence

| Category | Expected | Actual |
| --- | ---: | ---: |
| Functional requirements, including `FR-020A` through `FR-020U` and `FR-035A` through `FR-035E` | 95 | 95 |
| Section 17 edge cases | 49 | 49 |
| Section 19 data/storage/lifecycle/security constraints | 104 | 104 |
| Section 20 accessibility requirements | 10 | 10 |
| Section 21 mobile/desktop requirements | 8 | 8 |
| Section 25 success metrics | 22 | 22 |
| Section 26 acceptance criteria | 22 | 22 |
| Section 27 regression-checklist items | 85 | 85 |
| Section 29 approved questions and binding decision-register items | 108 | 108 |
| **Total** | **503** | **503** |

Missing IDs: 0. Duplicate IDs: 0. Orphan IDs: 0. Blocked rows: 0. Rows with named deferral annotations: 40, of which 35 use `approved deferral` status and five are conditional/partial sub-scope deferrals.

Section 19 line 1174 was split into `DATA-64` reconciliation and `DATA-65` idempotent retry because they are independently testable. Obsolete section 29 proposal-history blockquotes were excluded. `FR-020U` was included after the final parser audit confirmed the current parent suffix range extends beyond the specifically named `FR-020A` through `FR-020T` range.

### Ownership And Status Evidence

Ownership totals: Task 3 neutral shared presentation 65; PRD-0056 11; PRD-0056A/B1 6; PRD-0057/B2 `listening_authoring/**` 79; PRD-0058 registry/reference/result-review 163; PRD-0059 solo/homework 22; PRD-0060 live authority/runtime 75; PRD-0061 Reading V2 runtime 25; Task 1.11 parent acceptance 33; Task 9 final compatibility/rollout 15; approved Google Drive cleanup/deletion task 8; approved future legacy R2 migration PRD 1.

Status totals: existing verified baseline 56; partially implemented baseline 62; planning contract complete but implementation not started 332; implementation not started 18; approved deferral 35; blocked 0. Planning contracts were not treated as completed implementation.

Google Drive cleanup/deletion remains a separate approved task. Bucket C N1-N4 remain unimplemented planning corrections; N3 non-audio residue is not promoted into a parent-row completion claim.

### Review And Verification

1. Automated required-ID comparison returned 503 expected and 503 actual, with zero missing, duplicate, or orphan rows.
2. Eleven-column, blank-cell, forbidden-owner, vague-deferral, status-vocabulary, technique-vocabulary, and evidence-label scans returned zero failures.
3. Referenced-file, child-section-marker, parent-task/subtask, source-line, and registry-code scans returned zero failures.
4. Initial independent review caught a parser/header omission of existing `FR-020U`; the matrix row already existed. The parser and header were corrected from 94/502 to 95/503.
5. Fresh post-correction independent read-only review returned `PASS`: 503 rows, zero missing/duplicate/orphan/blocked rows, 40 deferral annotations, no findings, and recommendation to check Task 1.9.
6. UTF-8, trailing-whitespace, `git diff --check`, and per-file no-index checks are recorded in the final Task 1.9 handoff.

### Closing

Task 1.9 verdict: **PASS**. Task 1.9 is checked. Implementation remains unstarted. Next permitted packet is Task 1.10 dependency order only; Task 1.10 was not begun.

## Packet 1L Task 1.10 Dependency Order - 2026-06-20

### Scope And Authority

Task 1.10 only. No source, tests, Firebase, Workers, runtime behavior, deployment, infrastructure, schema, product-decision, ownership, Task 1.11 parent acceptance, or Task 1.12 approval/HARD STOP work was performed.

Authority files read in this run:

1. `AGENTS.md`.
2. `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
3. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
4. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
5. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
6. Child PRDs `0056`, `0056A`, `0057`, `0058`, `0059`, `0060`, and `0061`.

`tasks/review-pre-task-1.8-completion-addendum-0055.md` was not used as authority.

### Canonical Dependency Order

Canonical graph root is `DAG-00` Task 1.12 approval/HARD STOP. Every implementation node descends from it; no approval is claimed.

Canonical edge set:

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

Node summary:

| Node | Owner | Core order |
| --- | --- | --- |
| `DAG-00` | Tasks 1.11-1.12 | Parent acceptance then approval/HARD STOP before implementation |
| `DAG-03` | Task 3 | Neutral shared presentation may proceed separately after `DAG-00` under display-only scope |
| `DAG-20` | PRD-0056 / Task 2 | S0 secured upload/move proof precedes bridge reliance |
| `DAG-21` | PRD-0056A | Mandatory upload-session bridge before PRD-0058 lifecycle |
| `DAG-40` | PRD-0058 / Task 4 | Minimum foundation: commit, references, immediate discard cleanup, fallback cleanup, backup/restore, orphan metrics |
| `DAG-50` | PRD-0057 / Task 5 | Authoring write model waits for B2, Task 3 stability, and minimum storage |
| `DAG-51` | Task 5.21 | Selected-teacher traffic before Task 6 reconciliation conclusions |
| `DAG-60` | PRD-0058 / Task 6 | Advanced reconciliation, result-review private delivery, issuance/range proof |
| `DAG-70` | PRD-0059 / Task 7 | Solo runtime waits for authoring stability and keeps `AudioPlayer` internals untouched |
| `DAG-71` | PRD-0059 / Task 7 cutover | Solo private cutover waits for Task 6 proof; stops for Task 8 if internals are needed |
| `DAG-80` | PRD-0060 / Task 8 | Authority contract tests and harness |
| `DAG-81` | PRD-0060 / Task 8 | Shared `AudioPlayer` internal refresh/source-handoff and live cutover |
| `DAG-90` | PRD-0061 | Reading V2 runtime waits for shared-authoring stability and dedicated runtime tests |
| `DAG-99` | Task 9 | Full rollout waits for all applicable phase-local acceptance gates |

The obsolete direct PRD-0056 -> PRD-0058 implementation edge is explicitly forbidden. Required path is PRD-0056 -> PRD-0056A -> PRD-0058.

### Files Changed By Task 1.10

1. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - top status, Relevant Files current-status text, Task 1.10 checkbox, and dependency bullets.
2. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - status, evidence/dependency registries, canonical DAG node table, graph invariants, and Task 1.10 verification report.
3. `tasks/0056-prd-listening-upload-worker-security-gate-s0.md` - current status plus local Task 1.10 dependency synchronization.
4. `tasks/0056a-prd-listening-upload-session-bridge.md` - current status, current implementation-block text, and local Task 1.10 dependency synchronization.
5. `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md` - current status plus local Task 1.10 dependency synchronization.
6. `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md` - current status plus local Task 1.10 dependency synchronization.
7. `tasks/0059-prd-listening-solo-homework-runtime-alignment.md` - current status plus local Task 1.10 dependency synchronization.
8. `tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md` - current status plus local Task 1.10 dependency synchronization.
9. `tasks/0061-prd-reading-v2-runtime-visual-alignment.md` - current status plus local Task 1.10 dependency synchronization.
10. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - this append-only Task 1.10 evidence entry.

### Current-State Status Drift Corrected

1. Removed current `pending Task 1.9` status from PRD-0056A, PRD-0057, and PRD-0058.
2. Removed current `pending Task 1.8` status from PRD-0061.
3. Updated matching tasklist Relevant Files descriptions.
4. Preserved explicitly historical Packet 1I/1J wording.
5. Current status now blocks implementation on Task 1.11, Task 1.12, and applicable approval/dependency gates without claiming approval.

### Verification Evidence

Graph and registry check:

```text
nodes: 14
edges: 21
cycles: 0
orphans: 0
missingPrereqs: 0
contradictions: 0
childMismatches: 0
registryCodes: 13
referencedCodes: 13
unresolvedCodes: 0
```

Checks run:

1. Cycle detection: PASS.
2. Orphan-node detection: PASS.
3. Missing prerequisite scan: PASS.
4. Contradictory-edge scan, including no direct `DAG-20 -> DAG-40`: PASS.
5. Every traceability dependency code resolves: PASS.
6. Cross-child edge comparison: PASS.
7. Stale Task 1.8/1.9 current-status scan: PASS.
8. Placeholder scan: only historical/policy scan references were found; no actionable placeholder was introduced.
9. UTF-8: `npm run check:utf8 -- <10 touched docs>` PASS.
10. Trailing whitespace script over 10 touched docs: PASS.
11. `git diff --check`: PASS with one unrelated CRLF warning in `documentation/ielts-reading-v2-listening-unification-strategy.md`.
12. `git diff --no-index --check` over 10 untracked/touched docs: PASS.

### Task State

Task 1.10 verdict: **PASS**. Task 1.10 is checked. Implementation remains unstarted. Remaining blockers are Task 1.11 parent acceptance and Task 1.12 approval/HARD STOP. Next permitted packet is Task 1.11 parent acceptance only.

### Final Read-Only Verification Addendum

Fresh local read-only review after the Task 1.10 append returned PASS:

1. 10 touched allowed docs are present in the dirty task-file set.
2. One related untracked parent PRD file, `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`, remains pre-existing from the starting dirty tree and was not part of the Task 1.10 patch.
3. No unexpected Task 1.10 task-file path was detected.
4. Traceability table contains all 14 required DAG nodes and no incomplete node rows.
5. Task 1.10 is checked; Task 1.11 and Task 1.12 remain unchecked.
6. No positive Task 1.12 approval or implementation-start claim was found.

### Post-Review Correction - 2026-06-20 10:14:06 +07:00

Fixed one stale current-status sentence found during review after Packet 1L:

- `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md` now blocks implementation on Task 1.11 parent acceptance, Task 1.12 approval/HARD STOP, deployed/current PRD-0056A proof, dependencies, and explicit implementation authorization.
- The stale `implementation remains blocked by Task 1.9` wording was removed from the current PRD-0058 gate sentence.
- No source, runtime, Worker, schema, Firebase, deployment, Task 1.11 acceptance, or Task 1.12 approval work was performed.

## Packet 1M Task 1.11 Parent Acceptance Audit - 2026-06-20

### Scope

Task 1.11 only. This was a documentation acceptance audit and status update. No runtime/source files, tests, Firebase rules, Workers, deployment, schema, Task 1.12 approval, Task 2, Task 3, or implementation work was performed.

### Required Reads

Read and used as Task 1.11 authority:

1. `AGENTS.md`.
2. `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
3. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
4. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
5. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
6. Child PRDs `0056`, `0056A`, `0057`, `0058`, `0059`, `0060`, and `0061`.

### Acceptance Audit Results

- Task-state precheck passed: Task 1.1 through Task 1.10 were checked, Task 1.11 and Task 1.12 were unchecked before this audit, parent Task 1.0 was unchecked, and no Task 2 or later checkbox was checked.
- PRD/status consistency passed after the parent PRD status was clarified to name Task 1.11 completion plus the remaining Task 1.12 approval/HARD STOP gate.
- Child-PRD existence passed: PRD-0056, PRD-0056A, PRD-0057, PRD-0058, PRD-0059, PRD-0060, and PRD-0061 exist as task documents. No active placeholder ownership remains in current planning surfaces.
- PRD-0058 stale-current-status review passed: the known stale Task 1.9 blocker wording was not historical-only and was already replaced with the current gate wording before Task 1.11 completion: Task 1.11 parent acceptance, Task 1.12 approval/HARD STOP, deployed/current PRD-0056A proof, dependencies, and explicit implementation authorization.
- Dependency-DAG audit passed: the canonical graph is recorded consistently across the tasklist, traceability matrix, findings, and child PRDs as 14 nodes and 21 edges with zero cycles, zero orphans, zero missing prerequisites, zero contradictory edges, and no unresolved dependency codes.
- Traceability audit passed: 503 expected rows and 503 actual rows; missing IDs 0; duplicate IDs 0; orphan IDs 0; blank required cells 0; forbidden owner values 0; unresolved dependency rows 0; vague deferrals 0; blocked rows 0.
- Interim-owner resolution passed: every interim draft owner is resolved to a finalized child PRD or a named product-owner-approved deferral.
- Deferral audit passed: each deferral names a future owner/task, an entry gate, and approval authority.
- Junior-handoff ambiguity audit passed: no implementation ambiguity is delegated to a junior developer; implementation remains gated and each implementation packet must reconcile against the approved child PRD before work.
- Approval/start audit passed: no text claims Task 1.12 approval or implementation start. Task 1.12 remains unchecked and is the next permitted packet.
- Current-status stale-gate audit passed: current-status references to Task 1.8, Task 1.9, or Task 1.10 are gone except explicitly historical findings/check records.

### Required Checks

- Stale gate scan for Task 1.8/1.9/1.10 current-status claims: passed; only historical Packet 1I/1J/1K/1L evidence or non-current check descriptions remain.
- Placeholder scan for `TBD`, `TODO`, `FIXME`, `developer decides`, `developer chooses`, `approved later`, `unnamed future`, and `vague later`: passed; remaining hits are quoted historical/check-term descriptions or explicit anti-placeholder requirements, not active placeholders.
- Dependency-code scan: passed; all referenced `DEP-*` codes resolve in the traceability dependency registry.
- DAG scan: passed; 14 nodes, 21 edges, zero cycles, zero orphans, zero missing prerequisites, zero contradictions.
- Traceability row scan: passed; 503 rows, zero missing/duplicate/orphan/blank-owner rows.
- UTF-8 check passed for touched task docs.
- Whitespace checks passed: `git diff --check -- tasks` and per-file no-index whitespace checks for touched task docs.
- Final read-only verification passed after edits.

### Task 1.11 Verdict

Task 1.11 verdict: **PASS**. Task 1.11 is checked. Parent Task 1.0 remains unchecked. Task 1.12 remains unchecked and is the next permitted HARD STOP approval packet. Implementation remains unstarted and unapproved.

### Packet 1M Follow-Up Gate-Wording Correction - 2026-06-20

A review found that the post-acceptance child-PRD gate wording removed the explicit Task 1.11 gate reference too aggressively. Corrected current gate wording now states that Task 1.11 parent acceptance is complete while preserving the remaining blockers: Task 1.12 approval/HARD STOP, child-specific dependencies, deployed/current PRD-0056A proof where applicable, and explicit implementation authorization. No Task 1.12 approval or implementation start is claimed.

## Packet 1N Task 1.12 Explicit Approval Record - 2026-06-20

### Product-Owner Approval

- Date: 2026-06-20.
- Role: Product Owner.
- Decision reference: `PRD-0055-TASK-1.12-PRODUCT-OWNER-APPROVAL-2026-06-20`.
- Exact approval:

> “I approve the PRD-0055 Task 1 planning package, including OQ-1 through OQ-4, child-PRD ownership, traceability, dependency order, protected boundaries, and named deferrals. This approval completes planning only and does not authorize implementation without each child packet’s remaining gates.”

### Architecture/Security Reviewer Approval

- Date: 2026-06-20.
- Role: Architecture/Security Reviewer.
- Decision reference: `PRD-0055-TASK-1.12-ARCHITECTURE-SECURITY-APPROVAL-2026-06-20`.
- Exact approval:

> “I approve the PRD-0055 architecture and security boundaries, including neutral shared-layer dependency direction, S0 -> PRD-0056A -> PRD-0058 sequencing, audio-retention controls, delivery authorization gates, live-session authority protection, rollback requirements, and separate child-PRD implementation reviews. This approval does not waive any child-specific security, deployment, browser, load, or recovery gate.”

### Decision Effect

1. Both required Task 1.12 approvals are explicit and separately recorded.
2. Task 1 planning is complete.
3. Task 1.12 and parent Task 1.0 are checked.
4. No Task 2, Task 3, or later implementation task is authorized, checked, or started.
5. Every child-specific approval, test, browser, deployment, rollback, recovery, observability, load, and independent-review gate remains binding.
6. This run ends at the mandatory HARD STOP.

### Task 1.12 Verification Evidence

1. Exact Task 1 checkbox scan: Task 1.0 and Task 1.1 through Task 1.12 are checked.
2. Later-task checkbox scan: zero checked Task 2 through Task 9 parent or child rows.
3. Exact approval-text scan: one Product Owner approval and one Architecture/Security Reviewer approval, each byte-for-byte identical to the supplied text.
4. Traceability validation: 503 rows; category totals remain 95 functional requirements, 49 edge cases, 104 data/storage/security constraints, 10 accessibility requirements, 8 responsive requirements, 22 success metrics, 22 acceptance criteria, 85 regression checks, and 108 approved OQ/decision rows.
5. Traceability integrity: zero duplicate IDs, malformed rows, blank owners, blank required cells, unresolved dependency codes, or vague deferrals.
6. DAG validation: 14 nodes, 21 edges, zero cycles, zero orphans, zero missing prerequisites, zero reverse contradictions, no forbidden direct `DAG-20 -> DAG-40` edge, and zero child-PRD edge mismatches.
7. Stale current-status scan: zero current claims that Task 1.12 remains pending or unapproved.
8. False implementation-claim scan: no later implementation checkbox is checked; current status lines state implementation remains unstarted or blocked.
9. UTF-8: `npm run check:utf8 -- <11 touched task documents>` passed for all 11 files.
10. Whitespace: `git diff --check` passed.
11. Files changed: parent PRD, parent tasklist, findings, traceability, and child PRDs 0056, 0056A, 0057, 0058, 0059, 0060, and 0061.
12. No runtime/source/test/Worker/Firebase/deployment file changed. No implementation task started.
13. No commit or push performed.

## Packet 2A Task 2.1-2.2 S0 Approval And Upload-Worker Truth - 2026-06-20

### Scope

PRD-0055 Task 2A only: Task 2.1 and Task 2.2. This packet records explicit S0 planning/investigation approvals, reconciles the Task 2 scaffold against PRD-0056, and resolves canonical upload-worker/deploy/rollback truth from current local and Cloudflare evidence.

No Worker hardening, registry, heartbeat, cleanup, private delivery, deployment, runtime app code, Firebase rules, R2 storage service, Listening, Reading V2, live-session code, Task 2.3, or later task work was performed.

### Required Reads

Read for this packet:

1. `AGENTS.md`.
2. `documentation/rules/infrastructure.md`.
3. `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
4. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
5. `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`.
6. `tasks/0056a-prd-listening-upload-session-bridge.md`.
7. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
8. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
9. `documentation/architecture/upload-storage-authority.md`.
10. `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md`.
11. `cloudflare/worker.js`.
12. `cloudflare/package-lock.json`.

### Task 2.1 Explicit Approval Record

Product-owner approval:

> I approve PRD-0055 Task 2A for S0 planning and canonical upload-worker truth only: reconcile PRD-0056 against the approved parent plan, record Task 2.1 approval, and resolve current upload-worker deploy/rollback/harness truth. This does not authorize Worker hardening, registry, heartbeat, cleanup, private delivery, or deployment.

Architecture/security reviewer approval:

> I approve PRD-0055 Task 2A investigation scope only: confirm canonical upload worker, current deploy path, rollback mechanism, auth/CORS/raw-key threat boundaries, and test-harness decision before code changes. This does not waive required negative tests, deployed proof, rollback drill, or independent review for implementation.

Decision references:

1. `PRD-0055-TASK-2.1-PRODUCT-OWNER-APPROVAL-2026-06-20`.
2. `PRD-0055-TASK-2.1-ARCHITECTURE-SECURITY-APPROVAL-2026-06-20`.

Task 2.1 verdict: PASS. Both approvals are explicit, separately scoped, and do not authorize implementation or deployment.

### Task 2 Scaffold Reconciliation

PRD-0056 and the parent tasklist agree on S0 boundaries:

1. S0 is urgent, severable upload-worker security hardening.
2. S0 stays separate from registry, heartbeat, cleanup, private delivery, draft/publish, runtime, Firebase rules, and Google Drive work.
3. Canonical mechanism is native Cloudflare R2 binding `env.R2_BUCKET`.
4. Checked-in `aws4fetch`/S3 credential source is rejected as future canonical mechanism.
5. Local/deployed negative tests, deployed proof, rollback/version-pin proof, and independent review remain required before implementation completion.

One planning drift was corrected in the Task 2.2 scaffold: checking in `cloudflare/wrangler.toml` belongs to the later approved harness/implementation subphase before deploy, not this Task 2A truth-only packet. The tasklist now records the requirement without creating config in this packet.

### Current Checked-In Worker Truth

Checked-in source:

1. `cloudflare/worker.js` imports `AwsClient` from `aws4fetch`.
2. It uses S3-style names: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BUCKET_NAME`, `ACCOUNT_ID`, and `BUCKET_ID`.
3. It allows wildcard CORS.
4. It advertises `PUT, POST, GET, OPTIONS, DELETE` while rejecting non-`POST` requests after preflight.
5. It accepts browser-provided `sourceKey` and `destKey` for `/move`.
6. It signs S3 PUT URLs from browser-provided `filename`.
7. `cloudflare/package-lock.json` declares `aws4fetch@1.0.20`.
8. No checked-in `cloudflare/package.json`, `cloudflare/wrangler.toml`, or `cloudflare/wrangler.jsonc` exists in this packet.

### Current Deployed Worker Truth

Current Cloudflare account/tool access was available through Wrangler 4.97.0 with account `e41db829dabe9993f03674afdfd56510`.

Worker:

1. Name: `r2-upload-signer`.
2. Workers.dev URL: `https://r2-upload-signer.iamhuwng.workers.dev`.
3. Account workers.dev subdomain: `iamhuwng`.
4. Script subdomain: enabled.
5. Preview URLs: disabled.
6. Script routes API result: empty list.
7. Workers custom-domain records API result: empty list.

Current deployment:

1. Deployment ID: `92e01212-afd4-4aae-9d72-a548f063008b`.
2. Deployment source: `quick_editor`.
3. Strategy: `percentage`.
4. Version receiving traffic: version 6, ID `20dd8429-5be1-4105-baed-f6dc5af68098`, 100 percent.
5. Created on: `2026-01-26T17:27:56.516701Z`.
6. Version source: `dash`.
7. Last deployed from: `quick_editor`.
8. Compatibility date: `2026-01-20`.
9. Usage model: `standard`.

Bindings and secrets:

1. Native R2 binding: `R2_BUCKET`, bucket `kahoot-media`.
2. Plain variable: `PUBLIC_URL`, value present in Cloudflare metadata but not repeated here beyond name and non-secret role.
3. Wrangler `secret list --name r2-upload-signer --format json` returned `[]`.
4. No deployed Worker secret names are currently present.

Deployed source:

1. Source fetched from Cloudflare API `content/v2` for version `20dd8429-5be1-4105-baed-f6dc5af68098`.
2. Deployed `worker.js` JavaScript byte length: 4051.
3. Deployed `worker.js` SHA-256: `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`.
4. The SOP JavaScript block in `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md` has the same byte length and SHA-256.
5. Deployed source uses `env.R2_BUCKET`.
6. Deployed source does not contain `aws4fetch` or `R2_ACCESS_KEY_ID`.
7. Deployed source still has wildcard CORS.
8. Deployed source still accepts `sourceKey` and `destKey`.
9. Deployed source still has `/move`, `POST`, and `PUT` behavior.
10. Deployed source has no Firebase authentication.

Deployment history:

1. Version 1: `1ac87f9b-6d5c-45e7-9954-de0ec8eff43d`, created `2026-01-20T02:52:04.933742Z`, source `dash_template`, deployed at 100 percent.
2. Version 2: `7be2dd63-7221-4d81-ab09-247e4eb2fac8`, created `2026-01-21T05:21:09.348555Z`, source `quick_editor`, deployed at 100 percent.
3. Version 3: `28a7a6df-0c06-4ba2-bc62-73bfba99fb24`, created `2026-01-21T06:31:43.917503Z`, source `dash`, message `Add variable: PUBLIC_URL`, deployed at 100 percent.
4. Version 4: `7e283b8a-95f5-4e38-8eac-e8c21b4c98fe`, created `2026-01-21T06:32:52.522084Z`, source `dash`, message `Added R2 bucket binding R2_BUCKET`, deployed at 100 percent.
5. Version 5: `d4666e76-b162-4b04-a4ef-52211c3b2b1c`, created `2026-01-25T13:14:48.793285Z`, source `quick_editor`, deployed at 100 percent.
6. Version 6: `20dd8429-5be1-4105-baed-f6dc5af68098`, created `2026-01-26T17:27:56.516701Z`, source `quick_editor`, currently deployed at 100 percent.

### Canonical Decision

Canonical S0 implementation mechanism remains PRD-0056 native `env.R2_BUCKET` deployed to the existing Worker name `r2-upload-signer` from a checked-in Wrangler-managed package.

Rejected canonical mechanism remains checked-in `aws4fetch`/S3 credentials.

Current dashboard/Quick Editor source is accepted only as historical/current deployed truth and pre-S0 rollback target. It must not remain the canonical deployment source after the approved S0 implementation package creates checked-in Wrangler config.

### Deploy, Version-Pin, Rollback, And Harness Truth

Current deploy mechanism:

1. Current production deployment came from Quick Editor/dashboard upload.
2. Future canonical deploy mechanism, per PRD-0056, is checked-in Wrangler-managed package under `cloudflare/` targeting `r2-upload-signer`.
3. No deployment was performed in this packet.

Current rollback/version-pin mechanism:

1. Current rollback target before S0 implementation is version `20dd8429-5be1-4105-baed-f6dc5af68098` until a later packet captures a fresher `PRE_S0_VERSION_ID`.
2. Wrangler 4.97.0 exposes `wrangler rollback [version-id]`.
3. PRD-0056 rollback command shape: `wrangler rollback <PRE_S0_VERSION_ID> --name r2-upload-signer --message "Rollback PRD-0056 S0 upload-worker hardening" --yes`.
4. PRD-0056 version-pin command shape: `wrangler versions deploy <PRE_S0_VERSION_ID>@100% --name r2-upload-signer --message "Pin PRD-0056 rollback to pre-S0 version" --yes`.
5. Rollback/version-pin was not executed in this packet.
6. Rollback must change only Worker version traffic and must not delete, move, or rewrite R2 objects.

Harness choice:

1. Native `env.R2_BUCKET` mechanism requires a native-R2-compatible local Worker harness.
2. PRD-0056 selects Vitest with a mechanism-matched R2 test binding named `R2_BUCKET`, a rate-limit test double named `UPLOAD_RATE_LIMITER`, an HMAC secret test binding named `UPLOAD_GRANT_SECRET`, and injectable/mocked Firebase verification.
3. The exact `cloudflare/package.json`, `cloudflare/wrangler.toml` or `wrangler.jsonc`, dev dependencies, and command wiring remain Task 2.3+ implementation scope.

### Task 2.2 Verdict

Task 2.2 verdict: PASS for Task 2A truth resolution. Deployed source/configuration was obtained and reconciled. Canonical mechanism, worker name, route/domain, binding names, secret-name state, deployment history, source-of-truth, deploy direction, version-pin/rollback command shapes, and harness choice are recorded.

Residual requirements remain binding for Task 2.3 and later: create checked-in Wrangler package/config, add harness, write RED negative tests, harden Worker/browser adapter, run local and deployed proof, drill rollback, and obtain independent review. These are not started or authorized by this packet.

### Verification Evidence

Commands run:

1. `git status --short --branch` before branch creation: clean `main...origin/main`.
2. `git switch -c codex/prd-0055-task-2a-s0-worker-truth`.
3. `wrangler --version` through repo-local Wrangler with bundled Windows Node: `4.97.0`.
4. `wrangler whoami`: authenticated as `iamhuwng@gmail.com`, account ID `e41db829dabe9993f03674afdfd56510`.
5. `wrangler deployments status --name r2-upload-signer --json`.
6. `wrangler deployments list --name r2-upload-signer --json`.
7. `wrangler versions list --name r2-upload-signer --json`.
8. `wrangler versions view 20dd8429-5be1-4105-baed-f6dc5af68098 --name r2-upload-signer --json`.
9. `wrangler secret list --name r2-upload-signer --format json`.
10. Cloudflare API `GET /accounts/<account>/workers/scripts/r2-upload-signer/content/v2?version=20dd8429-5be1-4105-baed-f6dc5af68098`, output reduced to hashes/booleans only.
11. Cloudflare API `GET /accounts/<account>/workers/subdomain`.
12. Cloudflare API `GET /accounts/<account>/workers/scripts/r2-upload-signer/subdomain`.
13. Cloudflare API `GET /accounts/<account>/workers/scripts/r2-upload-signer/settings`.
14. Cloudflare API `GET /accounts/<account>/workers/scripts/r2-upload-signer/routes`.
15. Cloudflare API `GET /accounts/<account>/workers/domains/records` and filtered variants.

Documentation/planning-only evidence:

1. RED/GREEN/mutation proof: not applicable - non-behavioral planning/truth packet.
2. Browser/deploy proof: not applicable - no browser behavior or deployment changed.
3. Static/boundary/diff checks must be appended after UTF-8 and whitespace verification.

### Task State

Task 2.1 is checked. Task 2.2 is checked. Parent Task 2.0 remains unchecked. Task 2.3 and later remain unchecked and unstarted.

### Post-Patch Verification

Touched files:

1. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
2. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
3. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.

Checks:

1. `npm run check:utf8 -- tasks\tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks\findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks\traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` passed.
2. `git diff --check` passed.
3. Task-state scan passed: Task 2.1 and 2.2 are checked; parent Task 2.0 and Task 2.3 through 2.15 remain unchecked.
4. Dirty branch state after edits is limited to the three touched docs above.

## Packet 2B Task 2.3 Native-R2 Harness Bootstrap - 2026-06-20

### Scope And Verdict

Task 2.3 verdict: PASS. A checked-in Wrangler-managed package now targets the existing `r2-upload-signer` Worker and runs focused Vitest smoke/characterization tests against the native `env.R2_BUCKET` entrypoint.

This packet did not start Task 2.4 negative security tests. It did not harden Firebase authentication, ownership, CORS, raw-key handling, rate controls, or any lifecycle behavior. It did not deploy, version-pin, roll back, or change production Cloudflare state.

### Harness And Baseline

1. `cloudflare/package.json` defines local, test, check, deploy, deployed-status, version-list, version-pin, and rollback commands.
2. `cloudflare/wrangler.jsonc` targets `r2-upload-signer`, binds native R2 as `R2_BUCKET`, and names later-gate bindings `UPLOAD_RATE_LIMITER` and `UPLOAD_GRANT_SECRET` without storing a secret value.
3. `cloudflare/vitest.config.mjs` uses `@cloudflare/vitest-pool-workers` with the checked-in Wrangler config.
4. `cloudflare/__tests__/upload-worker-harness.test.js` exercises upload and move through the Worker `SELF` entrypoint and verifies effects through the emulated `R2_BUCKET` binding. Test bodies are zero-byte fixtures.
5. `cloudflare/src/upload-worker/firebase-verification.js` supplies only an injectable verification seam for later tests; it does not authenticate requests.
6. `cloudflare/worker.js` now matches the current native-R2 SOP/deployed behavior surface: `env.R2_BUCKET`, wildcard CORS, browser-supplied keys, unauthenticated upload, and unauthenticated move remain the intentionally insecure baseline for Task 2.4.
7. `cloudflare/package-lock.json` was regenerated by npm; it was not hand-edited.

Canonical local test command from repository root:

`npm --prefix cloudflare test`

This Windows host required the bundled x64 Node runtime because the default arm64 Node cannot execute local `workerd`. The executed equivalent was:

`$x64Bin = 'C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'; $env:Path = "$x64Bin;$env:Path"; & "$x64Bin\node.exe" 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' --prefix cloudflare test`

### RED And GREEN Evidence

1. Harness RED against the prior checked-in `aws4fetch` Worker: two native-R2 entrypoint tests failed during legacy S3-client construction before any R2 operation. This proved the harness detected the mechanism mismatch resolved by Task 2.2.
2. Firebase seam RED: the focused test failed while the seam module was absent.
3. GREEN after native-R2 baseline alignment and seam creation: one test file passed, three tests passed.
4. No Task 2.4 missing/invalid identity, cross-owner, raw-key, prefix, CORS, method, limit, replay, or expiry negative suite was added.

### Files Changed

1. `cloudflare/package.json`.
2. `cloudflare/package-lock.json`.
3. `cloudflare/wrangler.jsonc`.
4. `cloudflare/vitest.config.mjs`.
5. `cloudflare/worker.js`.
6. `cloudflare/src/upload-worker/firebase-verification.js`.
7. `cloudflare/__tests__/upload-worker-harness.test.js`.
8. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
9. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
10. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.

### Commands And Checks

1. `npm install --save-dev @cloudflare/vitest-pool-workers vitest wrangler @cloudflare/workers-types` generated package metadata and lockfile changes.
2. `npm install --no-save --force @rolldown/binding-win32-x64-msvc@1.0.3` repaired only the ignored local dependency tree for this x64 test runner.
3. Exact bundled-x64 npm test command above passed: one test file, three tests.
4. `npm run check:utf8 -- tasks\tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks\findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks\traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` passed.
5. `git diff --check` passed.
6. Task-state scan passed: only Task 2.3 changed from unchecked to checked after the Task 2A checkpoint; parent Task 2.0 and Task 2.4 through 2.15 remain unchecked.

### Residual Risks

1. Baseline Worker remains intentionally insecure until Task 2.4 writes the required negative RED suite and later tasks harden behavior.
2. Local tests emulate native R2; no deployed behavior or production binding was exercised.
3. Default Windows arm64 Node remains incompatible with local `workerd`; use a supported x64 Node runtime for the documented harness command.
4. `UPLOAD_RATE_LIMITER`, `UPLOAD_GRANT_SECRET`, and Firebase verification are harness/config names or seams only. No real enforcement exists yet.

### Task State

Task 2.3 is checked. Parent Task 2.0 remains unchecked. Task 2.4 through 2.15 remain unchecked and unstarted.

## Packet 2B-R Task 2.3 Harness/Config Correction - 2026-06-20

### Scope And Review Findings

Task 2.3 corrective verdict: PASS. This correction stayed inside Packet 2B harness/config scope. `cloudflare/worker.js` was not modified during Packet 2B-R, and its intentionally insecure native-R2 behavior remains the Task 2.4 RED baseline. No deployment, version pin, rollback, Cloudflare mutation, Firebase rule, R2 lifecycle, Listening, Reading V2, browser adapter, or runtime change occurred.

Original review findings:

1. `cloudflare/wrangler.jsonc` contained deployable placeholders `https://example.invalid/r2-upload-signer-test` and `test-project` instead of verified production values.
2. Vitest/Miniflare did not inject `UPLOAD_GRANT_SECRET`; normal test output warned that the required secret was missing.
3. Harness tests did not prove `env.UPLOAD_GRANT_SECRET` or callable local `env.UPLOAD_RATE_LIMITER.limit` bindings.
4. Repository ignore rules covered only root `.env`; Worker-local `.dev.vars*` and environment-file variants were not protected.
5. Prior GREEN used a repaired existing `node_modules` tree and lacked clean-copy `npm ci` proof.

### Exact Corrections

1. Replaced `PUBLIC_URL` with `https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev`. Read-only `wrangler versions view 20dd8429-5be1-4105-baed-f6dc5af68098 --name r2-upload-signer --json` proved this exact plain-text value on current production version 6.
2. Replaced `FIREBASE_PROJECT_ID` with `temp-a1437`. `gcloud config get-value project` and checked-in `.firebaserc` independently identify the active/current app project as `temp-a1437`.
3. Added Vitest/Miniflare binding `UPLOAD_GRANT_SECRET: TEST_ONLY_NOT_A_SECRET`. This is an explicit test sentinel, not a production secret.
4. Removed the nonstandard `secrets.required` declaration from deploy config. Production secret provisioning remains a later human-assisted Wrangler secret operation; no value is checked in and no fallback such as `keep_vars` was added.
5. Added characterization tests for the exact secret sentinel and for a callable local rate-limit binding. The rate test calls `env.UPLOAD_RATE_LIMITER.limit({ key: 'task-2.3-harness' })` and expects `{ success: true }`.
6. Extended `.gitignore` with `.env.*`, `.dev.vars`, `.dev.vars.*`, and explicit `cloudflare/.env*` / `cloudflare/.dev.vars*` exclusions while preserving the existing `.env` rule and allowing `.env.example` templates.
7. Kept Worker name, compatibility date, R2 bucket, rate-limit namespace/config, route settings, and production state unchanged.

### RED, GREEN, And Mutation Evidence

1. Secret RED before config fix: `npm --prefix cloudflare test` failed `injects the test-only upload grant secret`; expected `TEST_ONLY_NOT_A_SECRET`, received `undefined`. Output also contained the missing-secret warning.
2. Secret GREEN after Vitest binding plus removal of `secrets.required`: five tests passed and normal output contained no missing `UPLOAD_GRANT_SECRET` warning.
3. Rate-limit mutation RED: temporarily renamed the Wrangler binding to `UPLOAD_RATE_LIMITER_MUTATION`; `provides a usable local rate-limit binding` failed because `env.UPLOAD_RATE_LIMITER` was `undefined`. The exact binding name was then restored.
4. Restored GREEN: `npm --prefix cloudflare test` passed one file and five tests. `npm --prefix cloudflare run check` passed and reported native `R2_BUCKET`, `UPLOAD_RATE_LIMITER` at 30 requests/60 seconds, verified `PUBLIC_URL`, and `FIREBASE_PROJECT_ID=temp-a1437`.
5. Final required GREEN/check commands and clean-install proof ran with bundled Windows x64 Node `v24.14.0`, normal npm service behavior, and no priority/fast mode.

### Clean-Install Proof

1. Created a new OS-temporary copy containing `cloudflare/` files but no `node_modules`.
2. Ran bundled x64 Node explicitly against npm CLI with x64-first `PATH`, then `npm ci`: 81 packages added, 82 audited, zero vulnerabilities.
3. In that untouched clean install, `npm test` passed one file and five tests with no missing-secret warning.
4. In the same clean install, `npm run check` passed and printed the expected R2, rate-limit, and verified plain-variable bindings.
5. Temporary copy was removed after proof. No repaired dependency tree was reused.

### File And Boundary Evidence

1. Task 2.3 baseline line counts remain `cloudflare/worker.js` 117 before Packet 2B to 107 after native-R2 alignment; Packet 2B-R is 107 to 107. Router responsibility and insecure RED-baseline behavior are unchanged by this correction.
2. `src/services/r2Storage.ts` remains 446 lines and untouched. Firebase verifier remains injectable only; authentication was not implemented.
3. `rg -n "example\.invalid|test-project" cloudflare` has no deployable hit after correction.
4. No `.env`, `.env.*`, `.dev.vars`, or `.dev.vars.*` file is tracked.

### Remaining Risks And Task State

1. Worker remains intentionally insecure: unauthenticated requests, wildcard CORS, browser-authoritative raw keys, and absent auth/ownership/prefix/replay/expiry/byte/rate enforcement remain for Task 2.4 RED tests and later hardening tasks.
2. `UPLOAD_GRANT_SECRET` exists only as a local test sentinel. No real production secret was created, read, changed, or deployed.
3. Rate-limit binding is locally callable and deploy config dry-runs, but production namespace creation/verification remains a later pre-deploy gate.
4. Task 2.3 remains checked only because corrected config, harness, mutation, clean-install, static, UTF-8, and task-state checks pass. Parent Task 2.0 and Tasks 2.4 through 2.15 remain unchecked.

### Final Corrective Verification

1. Bundled-x64 `npm --prefix cloudflare test`: PASS, one file and five tests; no missing `UPLOAD_GRANT_SECRET` warning.
2. Bundled-x64 `npm --prefix cloudflare run check`: PASS, Wrangler 4.103.0 dry-run only; no deployment or Cloudflare mutation.
3. Clean temporary copy: bundled-x64 `npm ci`, `npm test`, and `npm run check` all PASS.
4. UTF-8: repo checker passed all nine supported-extension touched files; strict fatal UTF-8 decoding separately passed `.gitignore` and `cloudflare/wrangler.jsonc`.
5. `git diff --check`: PASS.
6. Placeholder scan: `rg -n "example\.invalid|test-project" cloudflare` returned no hits.
7. Secret-file scan: no `.env*` or `.dev.vars*` file is tracked; ignore-rule probes matched root and Worker-local variants.
8. Task scan: Task 2.3 checked; parent 2.0 and Tasks 2.4 through 2.15 unchecked.

## Packet 2C Task 2.4 Insecure-Baseline Negative Contract - 2026-06-21

### Scope And Verdict

Task 2.4 verdict: PASS. This packet adds only test infrastructure, the immutable insecure-current fixture, negative contract tests, explicit RED accounting, and evidence/docs updates. It does not harden `cloudflare/worker.js`, deploy, roll back, version-pin, call Cloudflare APIs, mutate Cloudflare state, change Firebase rules, change R2 lifecycle, or touch Listening, Reading V2, `src/services/r2Storage.ts`, or application runtime code.

Task 2.3 was committed first as `779e8045` (`test(cloudflare): add native R2 harness`). Task 2.4 began from a clean worktree.

### Claims Proven

1. `cloudflare/test/fixtures/insecure-current-worker.js` is the exact JavaScript source block from `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md`, which Packet 2A proved matches deployed version `20dd8429-5be1-4105-baed-f6dc5af68098`.
2. Normalization converts CRLF to LF and removes at most one terminal LF. The fixture's normalized byte length is 4051 and SHA-256 is `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`.
3. `cloudflare/test/upload-worker-security.test.js` contains all 22 PRD-0056 section 13 negative contracts.
4. `cloudflare/test/insecure-baseline-manifest.js` explicitly distinguishes expected insecure RED failures from behavior already safe in the deployed/SOP baseline.
5. `cloudflare/scripts/run-insecure-baseline.mjs` verifies fixture hash, executes the suite, compares every test outcome to the manifest, rejects missing/unregistered tests, and exits zero only when the expected baseline is reproduced.
6. Default `npm --prefix cloudflare test` remains GREEN and excludes the intentional RED suite.

The suite uses `.js` rather than the child PRD's proposed `.ts` extension because the current Worker package has a JavaScript harness/config, no `tsconfig.json`, and no TypeScript test setup. Adding TypeScript configuration is unnecessary Task 2.4 scope; the child-PRD path is otherwise preserved as `cloudflare/test/upload-worker-security.test.js`.

### Per-Test Insecure-Baseline Manifest

Expected RED failures, 18:

1. missing auth denied;
2. invalid auth denied;
3. expired Firebase token denied;
4. wrong Firebase audience denied;
5. cross-owner upload denied;
6. cross-owner move denied;
7. raw `sourceKey`/`destKey` cannot move arbitrary object;
8. forbidden prefix upload denied;
9. forbidden prefix move denied;
10. path traversal denied;
11. encoded traversal denied;
12. wildcard/unapproved CORS origin denied;
13. approved CORS origin accepted without wildcard;
14. upload over 50 MB denied;
15. missing `Content-Length` denied;
16. replayed upload grant denied;
17. expired upload grant denied;
18. replayed move grant cannot move a different object.

Expected already-safe passes, 4:

1. unsupported method denied;
2. `GET` denied even if baseline advertises `GET`;
3. `DELETE` denied even if baseline advertises `DELETE`;
4. logs exclude token, grant, URL, secret, key, UID, and audio body.

Assertions were not weakened to manufacture failures. The baseline already returns `405` for unsupported methods, `GET`, and `DELETE`, and successful tested requests emit no logs, so those contracts remain expected passes.

### Deploy-Secret Name Guard

`cloudflare/wrangler.jsonc` was not modified. Wrangler 4.103.0's JSONC schema has no supported field that declares a required secret name without storing a value. Packet 2B-R removed the nonstandard `secrets.required` field because Wrangler warned and did not enforce it. Restoring that invalid field would create false deploy confidence. Task 2.4 also forbids remote Cloudflare mutation, so it cannot provision or validate account secret state.

`UPLOAD_GRANT_SECRET` remains an explicit test-only binding named in `cloudflare/vitest.config.mjs` and `cloudflare/vitest.security.config.mjs`, with sentinel `TEST_ONLY_NOT_A_SECRET`. No real secret is checked in. Before any hardening/deploy path, the later approved pre-deploy gate must verify `UPLOAD_GRANT_SECRET` by exact name through Wrangler secret state; deployment remains blocked until that evidence exists.

### Files And Responsibility Delta

1. `cloudflare/package.json`: add separate `test:security:red` command.
2. `cloudflare/test/fixtures/insecure-current-worker.js`: absent -> 121 lines; immutable deployed/SOP fixture only.
3. `cloudflare/test/upload-worker-security.test.js`: absent -> 346 lines; 22 negative contracts, below 400-line target and 500-line ceiling.
4. `cloudflare/test/insecure-baseline-manifest.js`: absent -> 24 lines; expected RED/already-safe outcomes.
5. `cloudflare/scripts/run-insecure-baseline.mjs`: absent -> 87 lines; fixture-hash and expected-outcome accounting.
6. `cloudflare/vitest.security.config.mjs`: absent -> 18 lines; intentional RED suite isolation with local sentinel.
7. `cloudflare/worker.js`: 107 -> 107 lines; untouched, no responsibility change.
8. Parent tasklist: Task 2.4 only checked.
9. Traceability: `EV-0056` only updated.
10. Findings: append-only Packet 2C evidence.

Created seams are fixture, contract suite, manifest, and runner. Existing native-R2 harness and production Worker boundary are preserved.

### RED, GREEN, Mutation, And Clean-Copy Evidence

Local commands used bundled Windows x64 Node because local `workerd` cannot run under the host's default arm64 Node.

1. Default GREEN: `npm --prefix cloudflare test` passed one file and five tests.
2. Intentional RED accounting: `npm --prefix cloudflare run test:security:red` passed its meta-contract and reported fixture SHA-256 plus `18 expected RED failures, 4 already-safe passes`.
3. Runner mutation proof: temporarily changed `unsupported method denied` from expected `pass` to expected `fail`. Runner exited 1 with `unsupported method denied: expected fail, received pass`. Manifest was restored, then the RED command returned to GREEN.
4. Clean temporary copy: copied `cloudflare/` without `node_modules`, ran `npm ci` (81 packages, 0 vulnerabilities), `npm test` (one file, five tests), and `npm run test:security:red` (18 expected RED, four already-safe); all passed. Verified temp path was removed.

### Static, Boundary, And Deferred Evidence

1. Required final `git diff --check`, UTF-8 check, restored RED runner, default GREEN, and Task-state scan are recorded in final Packet 2C verification below.
2. Protected-path audit: no Firebase rule, R2 lifecycle, Listening, Reading V2, app runtime, `src/services/r2Storage.ts`, or `cloudflare/worker.js` change.
3. Browser/deploy artifacts: not applicable; explicitly prohibited for Task 2.4.
4. Hardening remains Task 2.5+ scope. Parent Task 2.0 and Tasks 2.5 through 2.15 remain unchecked.

### Final Packet 2C Verification

1. Bundled-x64 `npm --prefix cloudflare test`: PASS, one file and five tests.
2. Bundled-x64 `npm --prefix cloudflare run test:security:red`: PASS, fixture hash matched; 18 expected RED failures and four already-safe passes matched manifest.
3. Clean temporary copy: `npm ci`, `npm test`, and `npm run test:security:red`: PASS; 81 packages installed, zero vulnerabilities, one file/five default tests passed, and 18-RED/four-safe manifest matched.
4. Runner-accounting mutation: PASS; one temporarily inverted expected outcome caused exit 1 with exact mismatch, then manifest restoration returned the RED command to PASS.
5. `git diff --check`: PASS.
6. `npm run check:utf8 -- <all nine touched text files>`: PASS.
7. Task-state scan: PASS; diff changes only Task 2.4 from unchecked to checked. Parent Task 2.0 and Tasks 2.5 through 2.15 remain unchecked.
8. Protected-path scan: PASS; no `src/**`, Firebase rule/config, `r2-backup-worker/**`, SOP, or `cloudflare/worker.js` change.
9. No hardening, deployment, rollback, version pin, Cloudflare remote-state mutation, app runtime change, Firebase-rule change, Listening change, Reading V2 change, or R2-lifecycle change occurred.

## Packet 2D Task 2.5 Firebase Verification Compatibility Extraction - 2026-06-21

### Scope And Verdict

Subtask: Task 2.5 only.

Task 2.5 verdict: PASS. The upload-worker now has a bounded Firebase ID-token verifier module extracted from the compatible parts of `r2-backup-worker/src/auth/firebase-auth.ts`: Firebase securetoken JWKS, `jose` JWT verification, issuer `https://securetoken.google.com/<FIREBASE_PROJECT_ID>`, audience `<FIREBASE_PROJECT_ID>`, and verified token `sub` as `uid`.

Task 2.4 was committed first as `908852b3` (`test(cloudflare): record insecure upload baseline`). Task 2.5 began from a clean worktree.

This packet does not enforce authentication on any Worker route. Route enforcement and server-side owner derivation remain Task 2.6. This packet does not harden CORS, prefixes, grants, replay, size limits, move authority, upload routes, browser adapter behavior, Firebase rules, R2 lifecycle, Listening, Reading V2, app runtime, or `src/services/r2Storage.ts`. It does not deploy, roll back, version-pin, call Cloudflare APIs, or mutate Cloudflare remote state.

### Claims Proven

1. `r2-backup-worker/src/auth/firebase-auth.ts` is compatible only for the JWT verification pattern: `createRemoteJWKSet`, Firebase securetoken JWKS, `jwtVerify`, issuer, audience, and `payload.sub`.
2. Backup-worker admin behavior is rejected: no `ADMIN_UID`, no `verifyAdminToken`, no `super_admin` branch, no `name`/`email` result surface, no service-account secret, no backup-route behavior, and no raw UID/token logging was copied.
3. `cloudflare/src/upload-worker/firebase-verification.js` exposes `createFirebaseVerifier`, `FIREBASE_JWKS_URL`, `verifyToken`, and `verifyAuthorizationHeader`.
4. Unit tests inject `jwtVerify`, `jwks`, or a complete `verifyToken` mock, so default-GREEN tests do not call Google network.
5. The verifier returns only `{ valid: true, uid }` or bounded failure reasons. It does not log token, raw UID, token payload, email, signed grant, signed URL, raw key, secret, or audio content.
6. `jose` was added only to `cloudflare/package.json` and `cloudflare/package-lock.json`; unrelated dependency files were not touched.
7. The Task 2.4 insecure RED suite outcome is unchanged: 18 expected RED failures and four already-safe passes.

### Files And Declared Touch Regions

1. `cloudflare/src/upload-worker/firebase-verification.js`: Task 2.5 verifier module only.
2. `cloudflare/__tests__/firebase-verification.test.js`: focused default-GREEN verifier unit tests only.
3. `cloudflare/package.json`: add `jose` runtime dependency only.
4. `cloudflare/package-lock.json`: lock `jose` only.
5. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: check Task 2.5 only.
6. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: update `EV-0056` only.
7. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: append Packet 2D evidence only.

Protected paths not touched: `cloudflare/worker.js`, `cloudflare/test/upload-worker-security.test.js`, `cloudflare/scripts/run-insecure-baseline.mjs`, `cloudflare/test/fixtures/insecure-current-worker.js`, `src/services/r2Storage.ts`, `src/**`, Firebase rules/config, R2 lifecycle, Listening, Reading V2, and `r2-backup-worker/**`.

### Lines Before -> After And Responsibility Delta

1. `cloudflare/src/upload-worker/firebase-verification.js`: 5 -> 70 lines. Responsibility changes from injectable placeholder to bounded upload-worker Firebase verifier. It still does not enforce routes.
2. `cloudflare/__tests__/firebase-verification.test.js`: absent -> 77 lines. Responsibility is verifier unit coverage only.
3. `cloudflare/worker.js`: 107 -> 107 lines. No responsibility change.
4. `cloudflare/test/upload-worker-security.test.js`: 346 -> 346 lines. No RED-baseline test-title/status change.

Created seam: route code can later inject the verifier through `createFirebaseVerifier` without coupling route tests to Google JWKS network. Preserved seam: Task 2.4 insecure fixture/manifest/runner remain isolated under `cloudflare/test` and `cloudflare/scripts`.

Traceability row IDs: `EV-0056`, `DECISION-048`, `DATA-83`, and Task 2.5.

### Characterization And RED

Compatibility characterization:

1. Backup-worker reusable lines are the Firebase JWKS + `jwtVerify` pattern and issuer/audience settings.
2. Backup-worker rejected lines are admin UID checks and raw identity logging.

RED command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run __tests__/firebase-verification.test.js
```

RED result: failed one file, five tests. Expected failure reason: current seam had no `verifyAuthorizationHeader` and no exported `FIREBASE_JWKS_URL`.

### GREEN And Mutation Proof

Focused GREEN command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run __tests__/firebase-verification.test.js
```

Focused GREEN result: one file passed, five tests passed.

Mutation proof: temporarily changed verifier audience from `projectId` to `wrong-project`. Focused test `verifies Firebase tokens with JWKS, issuer, audience, and maps sub to uid` failed with expected mismatch showing received `audience: "wrong-project"` instead of `temp-a1437`. Restored `audience: projectId`, reran focused suite, and it passed one file/five tests.

Default GREEN command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run
```

Default GREEN result: two files passed, 10 tests passed.

### Static, Boundary, And RED-Baseline Checks

Task 2.4 RED-baseline command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'scripts/run-insecure-baseline.mjs'
```

Task 2.4 RED-baseline result: fixture SHA-256 matched `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; insecure baseline matched manifest with 18 expected RED failures and four already-safe passes.

Static/boundary scan: `rg -n "console\.|ADMIN_UID|email|name|service_account|service-account|raw UID|raw token" cloudflare/src/upload-worker/firebase-verification.js cloudflare/__tests__/firebase-verification.test.js` returned only the Firebase public JWKS URL and the test name mentioning service-account secrets; no admin check, console logging, raw identity logging, or service-secret use exists in the verifier.

Browser/deploy artifacts: not applicable. Task 2.5 explicitly forbids route enforcement and Cloudflare mutation.

Residual risks and deferred items: authentication is still not enforced on upload/move routes; owner scope, raw-key rejection, CORS, prefix, grant, replay, size, rate, browser adapter, deploy, rollback, and browser proof remain later tasks.

Verifier and verification outcome: Task 2.5 is checked because focused RED/GREEN, mutation proof, default GREEN, unchanged RED baseline, append-only findings, and `EV-0056` update are complete. Next task is Task 2.6.

## Packet 2E Task 2.6 Authenticated Owner Scope - 2026-06-21

### Scope And Verdict

Subtask: Task 2.6 only.

Task 2.6 verdict: PASS for authenticated owner-scope enforcement. The upload-worker route now imports the Task 2.5 Firebase verifier, requires `Authorization: Bearer <Firebase ID token>` on every non-`OPTIONS` request, treats verified `sub`/`uid` as the S0 owner identity, rejects missing/invalid/expired/wrong-audience auth before R2 writes, and rejects cross-owner root `POST ?filename`, `PUT ?key`, and `POST /move` attempts. Browser-supplied `ownerId`, `uid`, `email`, and `role` are ignored.

Task 2.5 was committed first as `9b14cac` (`feat(cloudflare): add firebase token verifier`). Task 2.6 began from a clean worktree.

This packet does not implement Task 2.7 prefix/traversal hardening, Task 2.8 CORS replacement, Task 2.9 rate/size/grant/replay controls, deployment, rollback, version-pin, Cloudflare remote-state mutation, app runtime changes, Firebase rules, R2 lifecycle, Listening, Reading V2, or `src/services/r2Storage.ts`.

### Claims Proven

1. `cloudflare/worker.js` imports `createFirebaseVerifier` and exposes `createUploadWorker({ firebaseVerifier })` so route tests inject verifier outcomes without Google network.
2. `OPTIONS` remains preflight-compatible and unauthenticated; every other route authenticates before route handling.
3. Missing Authorization returns `401` and does not write or move R2 objects.
4. Invalid, expired, and wrong-audience token outcomes return `401` and do not write R2 objects.
5. Verified token `uid` is the only S0 owner identity used by route owner checks.
6. Root legacy `POST ?filename=...` derives missing temp-owner segments from verified uid and rejects an explicit cross-owner filename.
7. `PUT ?key=...` rejects keys whose owner segment does not match verified uid before R2 write.
8. `POST /move` rejects source/destination owner mismatches before R2 read/write/delete, even when browser JSON includes valid-looking `ownerId`, `uid`, `email`, or `role` fields.
9. Authorized same-owner upload preserves the existing response shape `{ key, uploadUrl }`, and authorized same-owner move preserves `{ success: true, message }`.
10. The Task 2.4 insecure-baseline manifest remains unchanged and still distinguishes expected RED failures from already-safe passes.

### Files And Declared Touch Regions

1. `cloudflare/worker.js`: route auth/owner-scope enforcement and injectable route factory only.
2. `cloudflare/__tests__/upload-worker-harness.test.js`: focused route tests for Task 2.6 auth, owner scope, and same-owner compatibility only.
3. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: check Task 2.6 only.
4. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: update `EV-0056` only.
5. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: append Packet 2E evidence only.

Protected paths not touched: `src/services/r2Storage.ts`, `src/**`, Firebase rules/config, R2 lifecycle, Listening, Reading V2, `r2-backup-worker/**`, `cloudflare/test/fixtures/insecure-current-worker.js`, `cloudflare/test/insecure-baseline-manifest.js`, and `cloudflare/scripts/run-insecure-baseline.mjs`.

### Lines Before -> After And Responsibility Delta

1. `cloudflare/worker.js`: 107 -> 174 lines. Responsibility changes from unauthenticated native-R2 route to authenticated owner-scoped native-R2 route. It remains below the 200-line target and 250-line ceiling.
2. `cloudflare/__tests__/upload-worker-harness.test.js`: 77 -> 204 lines. Responsibility expands from harness smoke tests to focused Task 2.6 route auth/owner-scope tests.
3. `cloudflare/test/upload-worker-security.test.js`: 346 -> 346 lines. No test-title or baseline-contract change.
4. `cloudflare/test/insecure-baseline-manifest.js`: 24 -> 24 lines. No expected RED case was hidden.

Created seam: `createUploadWorker({ firebaseVerifier })` keeps route auth tests injected and avoids live JWKS calls. Preserved seam: Task 2.4 insecure fixture/manifest/runner remain isolated and unchanged.

Traceability row IDs: `EV-0056`, `FR-020I`, `DATA-83`, `DATA-85`, `DATA-95`, `DECISION-OQ-3`, `DECISION-048`, and Task 2.6.

### Characterization And RED

Characterization before route implementation: existing `SELF` harness allowed unauthenticated upload/move and had no injectable route verifier.

RED command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run __tests__/upload-worker-harness.test.js
```

RED result: failed one file, four tests failed and three passed. Expected failure reason: `createUploadWorker` did not exist yet, proving the new route-injection/auth tests could not pass against the unauthenticated Worker.

### GREEN And Mutation Proof

Focused GREEN command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run __tests__/upload-worker-harness.test.js
```

Focused GREEN result: one file passed, 10 tests passed.

Mutation proof: temporarily changed `validateOwnerScope` to return `{ valid: true }` after deriving an owner index. Focused test `rejects cross-owner upload and move requests without mutating R2` failed as expected: `expected 200 to be 403` on the cross-owner upload assertion. The owner check was restored, then the focused harness reran GREEN with one file and 10 tests passed.

Default GREEN command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run
```

Default GREEN result: two files passed, 15 tests passed.

### Static, Boundary, And RED-Baseline Checks

Task 2.4 RED-baseline command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'scripts/run-insecure-baseline.mjs'
```

Task 2.4 RED-baseline result: fixture SHA-256 matched `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; insecure baseline matched manifest with 18 expected RED failures and four already-safe passes.

Remaining expected RED cases outside Task 2.6: raw arbitrary same-owner key non-authority/grants, forbidden prefixes, path traversal, encoded traversal, wildcard/unapproved CORS, approved CORS without wildcard, upload over 50 MB, missing `Content-Length`, replayed upload grant, expired upload grant, replayed move grant, and deploy/browser/rollback proof. Unsupported method, `GET`, `DELETE`, and log-exclusion cases remain already-safe in the insecure baseline.

Static/boundary checks to run in final verification: `git diff --check`, UTF-8 check for all touched text files, task-state scan proving only Task 2.6 changed in this packet, protected-path scan, and optional clean temporary-copy `npm ci` proof.

Browser/deploy artifacts: not applicable. Task 2.6 explicitly forbids app-runtime changes, browser adapter changes, deployment, rollback, version-pin, and Cloudflare remote mutation.

Residual risks and deferred items: true raw-key non-authority for arbitrary same-owner object selection still requires Task 2.7 prefix/path rules plus Task 2.9 grant/replay controls. Task 2.6 closes cross-owner authority only and intentionally leaves Task 2.7, Task 2.8, Task 2.9, parent Task 2.0, and Tasks 2.10 through 2.15 unchecked.

Verifier and verification outcome: Task 2.6 is checked because focused RED/GREEN, owner-check mutation proof, default GREEN, unchanged RED-baseline accounting, append-only findings, and `EV-0056` update are complete. Next task is Task 2.7.

### Final Packet 2E Verification

1. Bundled-x64 `& $node 'node_modules/vitest/vitest.mjs' run`: PASS, two files and 15 tests.
2. Bundled-x64 `& $node 'scripts/run-insecure-baseline.mjs'`: PASS, fixture hash matched and manifest remained 18 expected RED failures plus four already-safe passes.
3. Clean temporary copy: copied `cloudflare/` without `node_modules`, prepended bundled Node directory to `PATH`, ran bundled-node npm CLI `ci`, bundled-x64 Vitest, and bundled-x64 insecure-baseline runner. PASS: 82 packages installed, zero vulnerabilities, two files/15 tests passed, fixture hash matched, and the 18-RED/four-safe manifest matched. Temporary copy was removed after path verification.
4. Clean-copy note: an earlier temp-copy attempt failed because npm install scripts resolved system `node` (`win32 arm64`) despite npm CLI being launched by bundled Node. The temp path was removed; the passing rerun used bundled-node `PATH` precedence and no copied `node_modules`.
5. `git diff --check`: PASS.
6. `npm run check:utf8 -- <all five touched text files>`: PASS.
7. Task-state scan: PASS; diff changes only Task 2.6 from unchecked to checked. Parent Task 2.0 and Tasks 2.7 through 2.15 remain unchecked.
8. Protected-path scan: PASS; no `src/**`, Firebase rule/config, `r2-backup-worker/**`, SOP, upload-storage authority doc, R2 lifecycle, Listening, Reading V2, deployment, rollback, version-pin, or Cloudflare remote-state file/path was touched.

## Packet 2E Corrective Evidence - Task 2.6 - 2026-06-21

Task 2.6 correction verdict: BLOCKED. Same-owner raw `filename`, `key`, `sourceKey`, and `destKey` values still drive R2 operations. An authenticated proof of concept accepted a forbidden-prefix `PUT` and a cross-prefix move. Prior Packet 2E PASS is superseded.

Task 2.6 remains BLOCKED pending explicit reconciliation of Task 2.6 versus Tasks 2.7/2.9 ownership. This corrective packet changes evidence and task state only; it does not modify Worker/runtime tests or implement Task 2.7 or later behavior.

## Packet 2.6/2.7/2.9 Dependency Reconciliation - 2026-06-21

### Decision

Reconciliation verdict: APPROVED SEQUENCING; NO IMPLEMENTATION COMPLETION.

Packet 2E failure evidence above remains authoritative and unchanged: current Worker authentication/owner checks do not prevent same-owner raw `filename`, `key`, `sourceKey`, or `destKey` values from driving R2 operations. Task 2.6 remains unchecked.

Exact ownership:

1. Task 2.6 owns Firebase authentication on every non-`OPTIONS` route, verified token `sub` as owner identity, rejection of browser `ownerId`/`uid`/email/role authority, and cross-owner rejection before R2 access.
2. Task 2.7 owns allowlisted prefix families, server-derived canonical path structure, traversal/encoding/absolute-path/duplicate-separator/control-character rejection, forbidden-prefix rejection, canonical temp-to-durable movement, cross-prefix denial, and overwrite bounds.
3. Task 2.9 owns opaque upload/move grants, browser raw keys as non-authoritative assertions only, UID/operation/path/content/size/expiry/nonce binding, tamper/expiry/replay rejection, rate controls, and 50 MB enforcement.

Approved non-circular checkpoint order:

1. Task 2.6 remains provisionally incomplete with authentication/owner-scope evidence only.
2. A Task 2.7-only implementation packet is permitted next.
3. After Task 2.7 focused proof, Task 2.8 may proceed.
4. After Task 2.8 focused proof, Task 2.9 may proceed.
5. After Task 2.9 focused proof, return to Task 2.6 for integrated closure.
6. Task 2.10 remains blocked until Tasks 2.6, 2.7, 2.8, and 2.9 are all checked.

Full raw-key non-authority becomes satisfied only when Task 2.7 server-derived canonical paths and Task 2.9 opaque grants are integrated with Task 2.6 authentication/owner scope, and tests prove browser raw-key values cannot select or authorize any R2 operation. Task 2.6 may be checked only at that integrated checkpoint. This is a sequencing exception, not an acceptance reduction.

### Preserved Requirements And Scope

1. PRD-0056 FR-005 and FR-008 through FR-016 remain unchanged and enforceable.
2. PRD-0056 section 10 remains unchanged in authority; the added ownership/checkpoint subsection explains delivery order only.
3. Existing negative tests, final acceptance, deploy, rollback, browser, and independent-review gates remain required.
4. Parent Task 2.0 and Tasks 2.6 through 2.15 remain unchecked.
5. No Worker, test, browser adapter, Firebase, R2 lifecycle, Listening, Reading V2, deployment, rollback, or Cloudflare remote-state behavior changed in this reconciliation.

## Packet 2F Task 2.7 Prefix And Canonical Path Authority - 2026-06-21

### Scope And Verdict

Subtask: Task 2.7 only.

Task 2.7 verdict: PASS for allowlisted prefix families, server-derived canonical path structure, traversal/encoding/separator/control-character rejection, forbidden/unlisted prefix rejection, canonical same-family temp-to-durable movement, cross-prefix denial, and existing-destination overwrite denial.

Task 2.6 remains unchecked under the approved checkpoint exception. This packet does not implement Task 2.8 CORS replacement, Task 2.9 opaque grants/expiry/replay/rate/size controls, Task 2.10+ hardening closure, deployment, rollback, version pin, Cloudflare remote-state mutation, browser adapter changes, Firebase rules, R2 lifecycle, cleanup, registry, heartbeat, private delivery, Listening, Reading V2, or `src/services/r2Storage.ts`.

### Claims Proven

1. Canonical upload authorization derives keys server-side from `operationKind`, verified Firebase `uid`, Web Crypto nonce, and sanitized basename.
2. Allowed operation mappings are exactly:
   - `listening_audio_temp` -> `temp/listening-audio/{uid}/{nonce}-{sanitizedFileName}`;
   - `test_audio_temp` -> `temp/audio/{uid}/{nonce}-{sanitizedFileName}`;
   - `test_image_temp` -> `temp/images/{uid}/{nonce}-{sanitizedFileName}`;
   - `avatar_permanent` -> `avatars/{uid}/avatar`;
   - `announcement_attachment_permanent` -> `announcements/{uid}/{nonce}-{sanitizedFileName}`;
   - `book_cover_permanent` -> `book-covers/{uid}/{nonce}-{sanitizedFileName}`.
3. Legacy `filename` inputs are compatibility hints only: allowed prefix plus basename can infer operation kind, but verified UID and generated nonce still derive the returned canonical key.
4. Unknown operation kinds, empty names, traversal, encoded traversal, separators, duplicate separators, URLs, absolute paths, control characters, forbidden prefixes, unlisted prefixes, and noncanonical keys fail before any R2 read/write/delete.
5. PUT is constrained to canonical Task 2.7 upload structures. Direct durable upload is rejected except `avatars/{uid}/avatar`, the approved owner-scoped avatar singleton replacement.
6. Move is constrained to exact server-derived destination by removing leading `temp/` from a canonical same-owner, same-family source:
   - `temp/listening-audio/{uid}/...` -> `listening-audio/{uid}/...`;
   - `temp/audio/{uid}/...` -> `audio/{uid}/...`;
   - `temp/images/{uid}/...` -> `images/{uid}/...`.
7. Cross-owner, cross-prefix, non-temp source, and noncanonical destination movement fail before R2 access.
8. Existing move destination returns `409` and preserves both source object and existing destination object.
9. Task 2.4 insecure-baseline fixture, manifest, runner, and RED accounting remain unchanged.
10. Worker logging no longer serializes arbitrary thrown error objects; generic route exceptions log only `Worker request failed`.

### Files And Declared Touch Regions

1. `cloudflare/src/upload-worker/path-authority.js`: new bounded Task 2.7 path-authority module only.
2. `cloudflare/__tests__/path-authority.test.js`: new focused Task 2.7 path-authority unit tests only.
3. `cloudflare/worker.js`: route delegation to path authority, canonical authorize/PUT/move constraints, overwrite checks, and sanitized generic error logging only.
4. `cloudflare/__tests__/upload-worker-harness.test.js`: focused route integration tests for canonical path authority, invalid-before-R2, cross-prefix denial, existing-destination overwrite denial, and legacy-hint canonicalization only.
5. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: check Task 2.7 only.
6. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: update `EV-0056` only.
7. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: append Packet 2F evidence only.

Protected paths not touched: `src/**`, `src/services/r2Storage.ts`, Firebase rules/config, `r2-backup-worker/**`, SOP, upload-storage authority doc, R2 lifecycle, Listening, Reading V2, deployment, rollback, version-pin, Cloudflare remote state, insecure fixture, insecure-baseline manifest, insecure-baseline runner, and RED security test file.

### Lines Before -> After And Responsibility Delta

1. `cloudflare/worker.js`: 174 -> 189 lines. Responsibility changes from authenticated owner-scoped route with inline owner/path helpers to thin route plus path-authority delegation. It remains under the 200-line target and 250-line ceiling.
2. `cloudflare/src/upload-worker/path-authority.js`: absent -> 260 lines. New bounded module owns operation allowlist, basename sanitization, Web Crypto nonce generation, canonical upload key derivation, legacy hint validation, canonical upload-key validation, and canonical move derivation.
3. `cloudflare/__tests__/path-authority.test.js`: absent -> 169 lines. New focused Task 2.7 unit tests.
4. `cloudflare/__tests__/upload-worker-harness.test.js`: 204 -> 309 lines. Responsibility expands with focused Task 2.7 route integration tests while preserving Task 2.3/2.5/2.6 harness coverage.
5. `cloudflare/test/upload-worker-security.test.js`: 346 -> 346 lines. No test-title or baseline-contract change.
6. `cloudflare/test/insecure-baseline-manifest.js`: 24 -> 24 lines. No expected RED case was hidden.
7. `cloudflare/scripts/run-insecure-baseline.mjs`: 87 -> 87 lines. No runner accounting change.

Created seam: `cloudflare/src/upload-worker/path-authority.js` isolates path algorithms from `cloudflare/worker.js` so future Task 2.9 grant authority can bind canonical source/destination without growing the router. Preserved seam: Task 2.4 insecure fixture/manifest/runner remain isolated and unchanged.

Traceability row IDs: `EV-0056`, `FR-020I`, `DATA-83`, `DATA-85`, `DATA-95`, `DECISION-OQ-3`, `DECISION-048`, and Task 2.7.

### Characterization And RED

Initial focused RED command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run __tests__/path-authority.test.js __tests__/upload-worker-harness.test.js --reporter=verbose
```

Initial RED result: two test files failed. `__tests__/path-authority.test.js` failed to import missing `../src/upload-worker/path-authority.js`. `__tests__/upload-worker-harness.test.js` had three expected Task 2.7 failures: canonical authorize returned `400` instead of `200`, cross-prefix move returned `200` instead of `400`, and existing destination move returned `200` instead of `409`.

Compatibility RED after current caller-shape audit: same focused command failed two tests. `accepts a legacy temp hint without owner and injects no browser identity` threw `noncanonical_legacy_hint`, and `canonicalizes a legacy temp hint with verified uid and generated nonce` returned `400` instead of `200`. The fix accepted only allowed-prefix-plus-basename legacy hints and still injected verified UID plus generated nonce server-side.

### GREEN And Mutation Proof

Focused GREEN command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run __tests__/path-authority.test.js __tests__/upload-worker-harness.test.js --reporter=verbose
```

Focused GREEN result: two files passed, 46 tests passed.

Mutation proof: temporarily weakened the central traversal guard in `cloudflare/src/upload-worker/path-authority.js` by changing `if (decoded.includes('..')) fail('path_traversal');` to `if (false && decoded.includes('..')) fail('path_traversal');`. Focused tests failed one file with three failures: `"../private.mp3"`, `"%2e%2e%2fprivate.mp3"`, and `"%252e%252e%252fprivate.mp3"` no longer produced the required `path_traversal` reason. Restored the guard, reran the focused suite, and it passed.

Default GREEN command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run
```

Default GREEN result: three files passed, 51 tests passed.

Task 2.4 RED-baseline command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'scripts/run-insecure-baseline.mjs'
```

Task 2.4 RED-baseline result: fixture SHA-256 matched `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; insecure baseline matched manifest with 18 expected RED failures and four already-safe passes.

### Clean-Copy Proof

Clean temporary-copy command used bundled x64 Node `v24.14.0` to launch system npm CLI `10.9.2`, with bundled-node `bin` prepended to `PATH` so lifecycle scripts use the x64 runtime. The copy contained `cloudflare/` files without `node_modules`.

Clean temporary-copy result:

1. `npm ci`: 82 packages added, 83 audited, zero vulnerabilities.
2. `npm test`: three files passed, 51 tests passed.
3. `node scripts/run-insecure-baseline.mjs`: fixture hash matched and 18 expected RED failures plus four already-safe passes matched.
4. Temporary copy `C:\Users\The Lord\AppData\Local\Temp\prd-0056-task-2-7-5c49b2285288464f9c1e548a455e8a26` was verified under the OS temp directory and removed. An earlier clean-copy run had already passed install/tests/baseline but exited `1` because `workerd.exe` was transiently locked during cleanup; no `workerd.exe` process remained, that temp path was removed, and the passing rerun exited `0`.

### Static, Boundary, And Deferred Evidence

1. `git diff --check`: PASS before evidence updates; final rerun required after this append-only findings/task/traceability update.
2. Static scan before evidence updates: `Math.random` absent from Worker path-authority code; nonce generation uses Web Crypto `crypto.getRandomValues`.
3. Static scan before evidence updates: no standalone DELETE behavior was added.
4. Protected-path scan before evidence updates showed only `cloudflare/worker.js`, `cloudflare/__tests__/upload-worker-harness.test.js`, new `cloudflare/src/upload-worker/path-authority.js`, and new `cloudflare/__tests__/path-authority.test.js` changed in runtime/test code.
5. Browser/deploy artifacts: not applicable. Task 2.7 explicitly forbids browser adapter changes, deployment, rollback, version-pin, and Cloudflare remote mutation.

Residual risks and deferred items: Task 2.7 constrains canonical structures but does not claim full raw-key non-authority. Browser-visible `key`, `sourceKey`, and `destKey` remain temporary raw-key compatibility inputs until Task 2.9 opaque upload/move grants bind UID, operation, canonical paths, content type, size, expiry, nonce, replay, and rate/size controls. CORS hardening remains Task 2.8. Task 2.6 remains unchecked until integrated Task 2.6/2.7/2.9 proof.

Verifier and verification outcome: Task 2.7 is checked because focused RED/GREEN, compatibility RED/GREEN, traversal-guard mutation proof, default GREEN, unchanged insecure-baseline runner, clean temporary-copy proof, append-only findings, and `EV-0056` update are complete. Next task ready by checkpoint order is Task 2.8 only; Task 2.9 is not started.

### Final Post-Evidence Verification Addendum

After appending Packet 2F findings, updating `EV-0056`, and checking Task 2.7 only:

1. Bundled-x64 `& $node 'node_modules/vitest/vitest.mjs' run`: PASS, three files and 51 tests.
2. Bundled-x64 `& $node 'scripts/run-insecure-baseline.mjs'`: PASS, fixture hash matched and manifest remained 18 expected RED failures plus four already-safe passes.
3. `npm run check:utf8 -- cloudflare\worker.js cloudflare\src\upload-worker\path-authority.js cloudflare\__tests__\path-authority.test.js cloudflare\__tests__\upload-worker-harness.test.js tasks\tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks\findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks\traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: PASS, seven text files.
4. `git diff --check`: PASS.
5. Protected-path scan: PASS, changed paths are only Task 2.7 Worker/module/tests plus tasklist/findings/traceability; no `src/**`, Firebase rules/config, `r2-backup-worker/**`, SOP, upload-storage authority doc, R2 lifecycle, deployment, rollback, version-pin, Cloudflare remote-state, insecure fixture, insecure-baseline manifest, insecure-baseline runner, or RED security test file changed.
6. Taskbox scan: PASS, parent Task 2.0 unchecked; Task 2.6 unchecked; Task 2.7 checked; Tasks 2.8 through 2.15 unchecked.
7. Static route scan: PASS, no `Math.random`, standalone DELETE route, delete object route, or delete method branch was added. The only `env.R2_BUCKET.delete(...)` in changed Worker code remains the pre-existing move-source deletion pattern after successful same-family move.

## Packet 2G Task 2.8 Exact-Origin CORS - 2026-06-21

### Scope And Verdict

Subtask: Task 2.8 only.

Task 2.8 verdict: PASS for replacing wildcard CORS with exact approved origins, echoing allowed request origins, returning correct preflight headers only to allowed origins, denying unapproved preflight origins, failing closed on unsupported preflight methods, and denying unapproved actual POST/PUT before authentication or R2 access.

Task 2.6 remains unchecked under the approved checkpoint exception. This packet does not implement Task 2.9 opaque grants, expiry, replay, rate controls, 50 MB controls, Task 2.10+ hardening closure, deployment, rollback, version pin, Cloudflare remote-state mutation, browser adapter changes, Firebase rules, R2 lifecycle, cleanup, registry, heartbeat, private delivery, Listening, Reading V2, or `src/services/r2Storage.ts`.

### Claims Proven

1. `Access-Control-Allow-Origin` is never `*` in focused representative Worker responses.
2. Allowed origins are exactly `https://kahut1.web.app`, `http://localhost:5173`, and `http://localhost:5174`.
3. Allowed-origin preflight returns `204` and echoes the request origin exactly.
4. Preflight advertises only `OPTIONS, POST, PUT`.
5. Preflight advertises only `Authorization, Content-Type, Content-Length`.
6. Unapproved-origin preflight returns `403` without `Access-Control-Allow-Origin`.
7. Unsupported preflight method returns `405` without `Access-Control-Allow-Origin`.
8. Unapproved actual POST and PUT return `403` before Firebase verification and before any R2 `get`, `put`, or `delete`.
9. Requests without `Origin` remain allowed for non-browser/test/CLI compatibility and return no CORS origin header.
10. Existing auth, owner, path, upload, move, insecure-baseline fixture, manifest, and runner behavior remain intact.

### Files And Declared Touch Regions

1. `cloudflare/src/upload-worker/cors-policy.js`: new bounded Task 2.8 CORS allowlist, preflight, response-header, and actual-origin rejection policy.
2. `cloudflare/worker.js`: import and delegate to CORS policy, reject unapproved actual origins before auth/R2, and attach allowed CORS response headers to existing route responses.
3. `cloudflare/__tests__/upload-worker-harness.test.js`: focused Task 2.8 CORS route tests only.
4. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: check Task 2.8 only.
5. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: update `EV-0056` only.
6. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: append Packet 2G evidence only.

Protected paths not touched: `src/**`, `src/services/r2Storage.ts`, Firebase rules/config, `r2-backup-worker/**`, SOP, upload-storage authority doc, R2 lifecycle, Listening, Reading V2, deployment, rollback, version-pin, Cloudflare remote state, insecure fixture, insecure-baseline manifest, insecure-baseline runner, and RED security test file.

### Lines Before -> After And Responsibility Delta

1. `cloudflare/worker.js`: 189 -> 199 lines. Responsibility remains thin request routing plus existing auth/path/R2 delegation; CORS algorithm moved into bounded module. It remains under the 200-line target and 250-line ceiling.
2. `cloudflare/src/upload-worker/cors-policy.js`: absent -> 67 lines. New bounded module owns approved-origin list, allowed method/header preflight validation, response CORS headers, and fail-closed actual-origin rejection.
3. `cloudflare/__tests__/upload-worker-harness.test.js`: 309 -> 461 lines. Responsibility expands with focused Task 2.8 CORS route integration tests while preserving Task 2.3/2.5/2.6/2.7 harness coverage.
4. `cloudflare/test/upload-worker-security.test.js`: 346 -> 346 lines. No test-title or baseline-contract change.
5. `cloudflare/test/insecure-baseline-manifest.js`: 24 -> 24 lines. No expected RED case was hidden.
6. `cloudflare/scripts/run-insecure-baseline.mjs`: 87 -> 87 lines. No runner accounting change.

Created seam: `cloudflare/src/upload-worker/cors-policy.js` isolates CORS policy from `cloudflare/worker.js` so Task 2.9 grant/rate/size work can proceed without growing the router. Preserved seam: Task 2.4 insecure fixture/manifest/runner remain isolated and unchanged.

Traceability row IDs: `EV-0056`, `FR-020I`, `DATA-18`, `DATA-88`, `DATA-95`, `DECISION-OQ-3`, `DECISION-053`, and Task 2.8.

### Characterization And RED

Initial focused RED command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run __tests__/upload-worker-harness.test.js --reporter=verbose
```

Initial RED result: one test file failed with nine expected CORS failures. Failures: wildcard still returned; the three approved-origin preflights returned `200` instead of `204`; unapproved-origin preflight returned `200` instead of `403`; unsupported preflight method returned `200`; unapproved actual POST returned `200` instead of `403`; unapproved actual PUT returned `409` instead of `403`; no-Origin compatibility still returned wildcard instead of no CORS origin header. Fourteen existing tests passed.

### GREEN And Mutation Proof

Focused GREEN command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run __tests__/upload-worker-harness.test.js --reporter=verbose
```

Focused GREEN result: one file passed, 23 tests passed.

Mutation proof: temporarily weakened `cloudflare/src/upload-worker/cors-policy.js` by changing allowed-origin response header emission from `Access-Control-Allow-Origin: origin` to `Access-Control-Allow-Origin: '*'`. Focused tests failed one file with four expected failures: wildcard was detected and the three approved-origin echo assertions received `*` instead of the exact origin. Restored exact-origin echo and reran the focused suite; one file passed, 23 tests passed. After the final router line-count shrink, reran focused default reporter again; one file passed, 23 tests passed.

Default GREEN command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'node_modules/vitest/vitest.mjs' run
```

Default GREEN result: three files passed, 60 tests passed.

Task 2.4 RED-baseline command:

```powershell
cd cloudflare
$node='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node 'scripts/run-insecure-baseline.mjs'
```

Task 2.4 RED-baseline result: fixture SHA-256 matched `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; insecure baseline matched manifest with 18 expected RED failures and four already-safe passes.

### Clean-Copy Proof

Clean temporary-copy command used bundled x64 Node `v24.14.0` to launch system npm CLI `10.9.2`, with bundled-node `bin` prepended to `PATH` so lifecycle scripts use the x64 runtime. The copy contained `cloudflare/` files without `node_modules`.

Clean temporary-copy result:

1. `npm ci`: 82 packages added, 83 audited, zero vulnerabilities.
2. `node_modules/vitest/vitest.mjs run`: three files passed, 60 tests passed.
3. `node scripts/run-insecure-baseline.mjs`: fixture hash matched and 18 expected RED failures plus four already-safe passes matched.
4. Temporary copy `C:\Users\The Lord\AppData\Local\Temp\prd-0056-task-2-8-ee08a4925fe8494baa7b8340b714b380` was verified under the OS temp directory and removed. An earlier clean-copy run passed install/tests/baseline but exited `1` because `workerd.exe` was transiently locked during cleanup; the temp path was removed successfully on retry.

### Static, Boundary, And Deferred Evidence

1. `git diff --check`: final rerun required after this append-only findings/task/traceability update.
2. UTF-8 check: final rerun required after this append-only findings/task/traceability update.
3. Static CORS scan before evidence updates: no wildcard CORS remains in `cloudflare/worker.js`, `cloudflare/src/upload-worker/cors-policy.js`, or `cloudflare/__tests__/upload-worker-harness.test.js`; wildcard remains only in the immutable insecure baseline fixture and security baseline assertions.
4. Protected-path scan before evidence updates showed only `cloudflare/worker.js`, `cloudflare/src/upload-worker/cors-policy.js`, `cloudflare/__tests__/upload-worker-harness.test.js`, tasklist, findings, and traceability changed.
5. Browser/deploy artifacts: not applicable. Task 2.8 explicitly forbids browser adapter changes, deployment, rollback, version-pin, and Cloudflare remote mutation.

Residual risks and deferred items: Task 2.8 removes wildcard CORS and fails unapproved browser origins closed, but does not claim full S0 closure. Browser-visible `key`, `sourceKey`, and `destKey` remain temporary raw-key compatibility inputs until Task 2.9 opaque upload/move grants bind UID, operation, canonical paths, content type, size, expiry, nonce, replay, and rate/size controls. Task 2.6 remains unchecked until integrated Task 2.6/2.7/2.9 proof. Task 2.9 is ready next by the approved checkpoint order, but not started here.

Verifier and verification outcome: Task 2.8 is checked because focused RED/GREEN, wildcard mutation proof, restored focused GREEN, default Worker GREEN, unchanged insecure-baseline runner, clean temporary-copy proof, append-only findings, and `EV-0056` update are complete. Parent Task 2.0, Task 2.6, and Tasks 2.9 through 2.15 remain unchecked.

### Final Post-Evidence Verification Addendum

After appending Packet 2G findings, updating `EV-0056`, and checking Task 2.8 only:

1. Bundled-x64 `& $node 'node_modules/vitest/vitest.mjs' run`: PASS, three files and 60 tests.
2. Bundled-x64 `& $node 'scripts/run-insecure-baseline.mjs'`: PASS, fixture hash matched and manifest remained 18 expected RED failures plus four already-safe passes.
3. Clean temporary copy with bundled-x64 Node and bundled-node `PATH` precedence: PASS, `npm ci` installed 82 packages with zero vulnerabilities, three files and 60 tests passed, fixture hash matched, and the 18-RED/four-safe manifest matched; temporary copy was removed.
4. `npm run check:utf8 -- cloudflare\worker.js cloudflare\src\upload-worker\cors-policy.js cloudflare\__tests__\upload-worker-harness.test.js tasks\tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks\findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks\traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: PASS, six text files.
5. `git diff --check`: PASS.
6. Protected-path scan: PASS, changed paths are only `cloudflare/worker.js`, `cloudflare/src/upload-worker/cors-policy.js`, `cloudflare/__tests__/upload-worker-harness.test.js`, tasklist, findings, and traceability; no `src/**`, Firebase rules/config, `r2-backup-worker/**`, SOP, upload-storage authority doc, R2 lifecycle, deployment, rollback, version-pin, Cloudflare remote-state, insecure fixture, insecure-baseline manifest, insecure-baseline runner, or RED security test file changed.
7. Taskbox scan: PASS, parent Task 2.0 unchecked; Task 2.6 unchecked; Task 2.7 checked; Task 2.8 checked; Tasks 2.9 through 2.15 unchecked.
8. Static CORS scan: PASS, production Worker/CORS policy contains no wildcard CORS, no advertised GET/DELETE CORS methods, and exact allowed methods/headers; wildcard remains only in immutable insecure-baseline fixture and RED baseline assertions.
9. Line-count scan: PASS, `cloudflare/worker.js` is 199 lines, under the 200-line target and 250-line ceiling; `cloudflare/src/upload-worker/cors-policy.js` is 67 lines; `cloudflare/__tests__/upload-worker-harness.test.js` is 461 lines, under the 500-line ceiling.

## Packet 2H Task 2.9 Opaque Grant Authority - 2026-06-21

Subtask: Task 2.9 only.

Task 2.9 verdict: PASS for issuing and verifying opaque upload/move grants, binding grants to verified UID, operation, canonical source/destination, content type, size, expiry, and nonce, treating browser `key`/`sourceKey`/`destKey` as non-authoritative assertions only, rejecting tampered/expired/replayed grants, enforcing request rate controls, and enforcing the 50 MB per-request/per-file ceiling.

Task 2.6 remains unchecked under the approved checkpoint exception. This packet does not implement Task 2.10 or later, deployment, rollback, version pin, Cloudflare remote-state mutation, browser adapter changes, Firebase rules/config, R2 lifecycle, cleanup, deletion routes, registry, heartbeat, private delivery, Listening runtime, Reading V2, `src/services/r2Storage.ts`, or the 10-files-per-test application rule.

Claims proven:

1. Upload authorization returns a Worker `/upload?grant=...` URL and no longer returns a raw-key upload authority URL.
2. `PUT /upload` requires a valid upload grant and rejects raw `?key=` uploads as authority.
3. Upload grants are HMAC verified and fail closed when tampered.
4. Upload grants bind verified UID before path validation; a different valid UID returns `grant_uid_mismatch`.
5. Upload grants expire after the 10-minute TTL and reject after expiry before R2 writes.
6. Replayed upload grants cannot overwrite the first stored object.
7. Move requires a Worker-issued `moveGrant`; browser `sourceKey` and `destKey` are optional assertions and cannot select a different object.
8. Replayed move grants cannot move a different browser-asserted object.
9. The Worker calls `UPLOAD_RATE_LIMITER.limit()` with a key containing verified UID and client IP class, and returns `429` before grant issue/R2 access when limited.
10. Authorize and upload requests reject payloads above 50 MB.
11. Task 2.7 canonical path authority and Task 2.8 exact-origin CORS behavior remain covered by the full Worker suite.
12. The Task 2.4 insecure deployed/SOP fixture, manifest, and runner behavior remain unchanged.

Files and declared touch regions:

1. `cloudflare/worker.js`: router composition only; imports grant/request handler seams, injects `now`, authenticates, enforces rate limit, and delegates authorize/upload/move handling.
2. `cloudflare/src/upload-worker/grant-authority.js`: new bounded Task 2.9 HMAC grant, expiry, size, content-type, and rate-limit module.
3. `cloudflare/src/upload-worker/request-handlers.js`: new bounded Task 2.9 authorize/upload/move request handlers composed behind `cloudflare/worker.js`.
4. `cloudflare/__tests__/grant-authority.test.js`: new focused Task 2.9 RED/GREEN/mutation test file.
5. `cloudflare/__tests__/upload-worker-harness.test.js`: update existing route harness to the secured grant contract while preserving prior auth/path/CORS coverage.
6. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: check Task 2.9 only.
7. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: update `EV-0056` only.
8. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: append Packet 2H evidence only.

Lines before -> after and responsibility delta:

1. `cloudflare/worker.js`: 199 -> 136 lines. Responsibility narrowed from route plus inline Task 2.6-2.8 behavior to thin route/auth/CORS/rate composition with Task 2.9 handlers delegated.
2. `cloudflare/src/upload-worker/grant-authority.js`: absent -> 155 lines. New Task 2.9-only grant signing/verification, request-size/content binding, expiry, and rate-limit seam.
3. `cloudflare/src/upload-worker/request-handlers.js`: absent -> 197 lines. New Task 2.9-only HTTP contract handlers for authorize, grant PUT, and grant move.
4. `cloudflare/__tests__/grant-authority.test.js`: absent -> 299 lines. New focused Task 2.9 integration tests.
5. `cloudflare/__tests__/upload-worker-harness.test.js`: 461 -> 498 lines. Existing harness updated to secured grant contract; remains under the 500-line ceiling.

Created/preserved decomposition seams:

1. Created `grant-authority.js` so cryptographic grant, expiry, size, and rate logic does not grow `worker.js`.
2. Created `request-handlers.js` so authorize/upload/move contract logic stays bounded outside the router.
3. Preserved `path-authority.js` public return shape and Task 2.7 canonical path authority.
4. Preserved `cors-policy.js` Task 2.8 exact-origin behavior.
5. Preserved Task 2.4 insecure fixture/manifest/runner as immutable baseline proof.

Traceability row IDs: `EV-0056`, `FR-020I`, `DATA-83`, `DATA-85`, `DATA-88`, `DATA-90`, `DATA-95`, `DECISION-OQ-3`, `DECISION-048`, `DECISION-053`, `DECISION-055`, and Task 2.9.

Characterization/baseline:

1. Starting state: clean branch `codex/prd-0055-task-2a-s0-worker-truth` at `c0e66e900416ff7de83868d260dc27d5d39639ee`.
2. Existing Worker contract before Task 2.9 still used raw `?key=` upload URLs and JSON `sourceKey`/`destKey` movement after auth/path/CORS checks.

RED command and result:

```powershell
rtk powershell -NoProfile -Command "`$env:PATH='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + `$env:PATH; & 'C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run __tests__/grant-authority.test.js --config vitest.config.mjs"
```

Initial RED result before implementation: `__tests__/grant-authority.test.js` ran 8 tests and all 8 failed. Failures proved `/upload/authorize` grant issue was missing (`400` instead of `200`), raw same-owner `sourceKey`/`destKey` move succeeded (`200` instead of `400`), rate limiting was missing (`400` instead of `429`), and tamper/expiry/replay/size cases could not be verified because opaque grants were missing.

GREEN command and result:

```powershell
rtk powershell -NoProfile -Command "`$env:PATH='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + `$env:PATH; & 'C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run __tests__/grant-authority.test.js --config vitest.config.mjs"
```

Restored focused GREEN result: 1 test file passed, 9 tests passed.

```powershell
rtk powershell -NoProfile -Command "`$env:PATH='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + `$env:PATH; & 'C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run --config vitest.config.mjs"
```

Full Worker suite result: 4 test files passed, 69 tests passed.

Mutation proof and restoration evidence:

1. UID-binding mutation: temporarily changed `if (payload.uid !== uid) fail('grant_uid_mismatch');` to `if (false && payload.uid !== uid) fail('grant_uid_mismatch');`.
   - Command: focused `grant-authority.test.js -t 'different verified UID'`.
   - Expected failure: 1 focused test failed because response changed from `{ error: 'grant_uid_mismatch' }` to `{ error: 'owner_mismatch' }`.
   - Restoration: guard restored; focused UID-binding test passed.
2. Expiry mutation: temporarily changed the expiry guard to `if (false && (...))`.
   - Command: focused `grant-authority.test.js -t 'expired upload grants'`.
   - Expected failure: 1 focused test failed because expired grant returned `200` instead of `403`.
   - Restoration: guard restored; focused grant suite passed 9/9 and full Worker suite passed 69/69.

Task 2.4 RED-baseline result:

```powershell
rtk powershell -NoProfile -Command "`$env:PATH='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + `$env:PATH; & 'C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'scripts/run-insecure-baseline.mjs'"
```

Result: fixture SHA-256 matched `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; insecure baseline matched manifest with 18 expected RED failures and four already-safe passes.

Clean temporary-copy proof:

1. First temp-copy attempt intentionally surfaced the known host risk: running `npm ci` through arm64 system Node failed with `Unsupported platform: win32 arm64 LE` from `workerd`.
2. Retried with system npm CLI executed by bundled x64 Node and `npm_config_arch=x64`, `npm_config_platform=win32`.
3. Temp path: `C:\Users\THELOR~1\AppData\Local\Temp\prd0055-task29-ec0ac0a955fb4ca280f4c44ea6489789`.
4. Result: `npm ci` added 82 packages with 0 vulnerabilities; bundled x64 Node ran the full Worker suite with 4 files/69 tests passed; bundled x64 Node ran insecure baseline with fixture SHA `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`, 18 expected RED failures, and four already-safe passes.

Static/boundary/diff checks to run in final Packet 2H verification:

1. `npm run check:utf8 -- <touched text files>`.
2. `git diff --check`.
3. Protected-path scan.
4. Taskbox scan proving Task 2.9 only changed to checked, parent Task 2.0 remains unchecked, Task 2.6 remains unchecked, and Task 2.10+ remain unchecked.

Browser/deploy artifacts: not applicable. Task 2.9 explicitly forbids browser adapter changes, deployment, rollback, version-pin, and Cloudflare remote mutation.

Residual risks and deferred items:

1. Task 2.6 remains unchecked until explicit integrated Task 2.6/2.7/2.9 closure proof is run and documented.
2. Task 2.10+ hardening closure, browser proof, deployment/rollback/version-pin proof, app adapter work, and S0 parent acceptance remain incomplete.
3. Rate-limit namespace/account deployment proof remains outside this local Task 2.9 implementation because this packet does not mutate Cloudflare remote state.
4. The 10-files-per-test application rule remains deferred to Task 4 upload-session/application logic.

Verifier and verification outcome: Task 2.9 is checked because focused RED/GREEN, UID-binding and expiry mutation proof, full Worker GREEN, unchanged insecure-baseline proof, clean temporary-copy proof, append-only findings, and `EV-0056` update are complete. Task 2.6 remains unchecked; normal strict order does not resume until explicit integrated Task 2.6 closure proof is recorded.

### Final Packet 2H Verification Addendum

After appending Packet 2H findings, updating `EV-0056`, and checking Task 2.9 only:

1. Bundled-x64 `& $node 'node_modules/vitest/vitest.mjs' run --config vitest.config.mjs`: PASS, four files and 69 tests.
2. Bundled-x64 `& $node 'scripts/run-insecure-baseline.mjs'`: PASS, fixture hash `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`, 18 expected RED failures, and four already-safe passes.
3. Clean temporary copy with bundled-x64 Node executing system npm CLI: PASS, `npm ci` installed 82 packages with zero vulnerabilities, four files and 69 tests passed, fixture hash matched, and the 18-RED/four-safe manifest matched.
4. `npm run check:utf8 -- cloudflare/worker.js cloudflare/src/upload-worker/grant-authority.js cloudflare/src/upload-worker/request-handlers.js cloudflare/__tests__/grant-authority.test.js cloudflare/__tests__/upload-worker-harness.test.js tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: PASS, eight text files.
5. `git diff --check`: PASS.
6. Protected-path scan: PASS, changed paths are only `cloudflare/worker.js`, `cloudflare/src/upload-worker/grant-authority.js`, `cloudflare/src/upload-worker/request-handlers.js`, `cloudflare/__tests__/grant-authority.test.js`, `cloudflare/__tests__/upload-worker-harness.test.js`, tasklist, findings, and traceability; no `src/**`, Firebase rules/config, `r2-backup-worker/**`, SOP, upload-storage authority doc, R2 lifecycle, deployment, rollback, version-pin, Cloudflare remote-state, insecure fixture, insecure-baseline manifest, or insecure-baseline runner changed.
7. Taskbox scan: PASS, parent Task 2.0 unchecked; Task 2.6 unchecked; Task 2.7 checked; Task 2.8 checked; Task 2.9 checked; Tasks 2.10 through 2.15 unchecked.
8. Line-count scan: PASS, `cloudflare/worker.js` is 136 lines, below the 200-line target and 250-line ceiling; `cloudflare/src/upload-worker/grant-authority.js` is 155 lines; `cloudflare/src/upload-worker/request-handlers.js` is 197 lines; `cloudflare/__tests__/grant-authority.test.js` is 299 lines; `cloudflare/__tests__/upload-worker-harness.test.js` is 498 lines, below the 500-line ceiling.

## Packet 2H-R Task 2.9 Corrective Replay Proof - 2026-06-21

Subtask: corrective replay packet for Task 2.9 only.

Corrective verdict: PASS. Original Packet 2H replay PASS is superseded for replay proof only because same-grant replay was not protected by an explicit atomic nonce-consumption authority. Temp upload replay was rejected by existing destination state, move replay was rejected by destination/source state, and `avatar_permanent` grants could be reused to overwrite `avatars/{uid}/avatar`. Packet 2H-R adds explicit replay/nonce authority and corrected RED/GREEN/mutation proof.

Scope boundaries: no commit, push, deploy, rollback, version pin, Cloudflare remote-state mutation, browser adapter change, Firebase rules/config change, R2 lifecycle change, registry, heartbeat, cleanup, deletion route, private delivery, Listening runtime, Reading V2, `src/services/r2Storage.ts`, Task 2.6 closure, or Task 2.10 start occurred.

Claims proven:

1. Same `avatar_permanent` upload grant can no longer be reused to overwrite `avatars/{uid}/avatar`.
2. Fresh `avatar_permanent` grants still preserve the intentional owner-scoped singleton replacement behavior.
3. Same move grant replay returns replay-specific failure before second R2 access/mutation.
4. Temp upload grant replay returns replay-specific failure before second R2 access/mutation.
5. Browser `key`, `sourceKey`, and `destKey` remain assertions only.
6. Replay protection uses an explicit nonce authority abstraction: `UPLOAD_GRANT_REPLAY_LEDGER.consume({ key, expiresAt })`.
7. Replay protection fails closed with `replay_protection_unavailable` when the binding is absent.
8. Production replay binding selection/provisioning remains later deployment work because this packet does not mutate Cloudflare remote state.

Files and declared touch regions:

1. `cloudflare/src/upload-worker/replay-authority.js`: new explicit replay/nonce consumption abstraction.
2. `cloudflare/src/upload-worker/request-handlers.js`: consume grant nonce before upload R2 access and before move R2 access.
3. `cloudflare/__tests__/grant-authority.test.js`: add focused replay RED/GREEN tests, atomic replay-ledger test double, avatar fresh-grant replacement proof, and missing-binding fail-closed proof.
4. `cloudflare/__tests__/upload-worker-harness.test.js`: add replay-ledger happy-path test double so existing route coverage runs under the corrected contract.
5. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: update `EV-0056` only.
6. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: append Packet 2H-R evidence only.

Lines before -> after and responsibility delta:

1. `cloudflare/worker.js`: 199 -> 136 lines. No Packet 2H-R change; remains thin router/composition.
2. `cloudflare/src/upload-worker/grant-authority.js`: absent -> 155 lines. No Packet 2H-R change.
3. `cloudflare/src/upload-worker/request-handlers.js`: absent -> 203 lines. Responsibility expands narrowly to call replay consumption before R2 access.
4. `cloudflare/src/upload-worker/replay-authority.js`: absent -> 15 lines. New replay authority abstraction.
5. `cloudflare/__tests__/grant-authority.test.js`: absent -> 399 lines. Focused Task 2.9 test file remains below 400-line target after corrective tests.
6. `cloudflare/__tests__/upload-worker-harness.test.js`: 461 -> 499 lines. Existing harness remains below 500-line ceiling.

Created/preserved decomposition seams:

1. Created `replay-authority.js` so nonce-consumption policy is not mixed into grant signing or route handlers.
2. Preserved `grant-authority.js` as HMAC/expiry/content/size/rate support.
3. Preserved `request-handlers.js` as HTTP-contract composition.
4. Preserved `worker.js` under line target and without replay algorithm growth.
5. Preserved Task 2.4 insecure fixture/manifest/runner unchanged.

Traceability row IDs: `EV-0056`, `FR-020I`, `DATA-83`, `DATA-85`, `DATA-90`, `DATA-95`, `DECISION-OQ-3`, `DECISION-048`, `DECISION-055`, and Task 2.9.

Characterization/baseline:

1. Current dirty Task 2.9 patch before correction had no replay nonce ledger.
2. PRD-0056 section 11 requires an atomic nonce ledger before implementation; KV or in-memory Worker state is not sufficient unless separately approved.
3. Packet 2H-R local implementation defines the binding interface and fails closed when absent; production binding choice remains later deployment work.

RED command and result:

```powershell
rtk powershell -NoProfile -Command "`$env:PATH='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + `$env:PATH; & 'C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run __tests__/grant-authority.test.js --config vitest.config.mjs"
```

Corrective RED result before replay fix: 1 focused file ran 12 tests, 4 failed. Failures:

1. Temp upload grant replay returned `{ error: 'Destination already exists' }` instead of replay-specific `replay_detected`.
2. Same `avatar_permanent` grant replay returned `200` and overwrote the singleton instead of `409 replay_detected`.
3. Same move grant replay returned `{ error: 'Destination already exists' }` instead of replay-specific `replay_detected`.
4. Missing replay binding returned `200` instead of fail-closed `500 replay_protection_unavailable`.

GREEN command and result:

```powershell
rtk powershell -NoProfile -Command "`$env:PATH='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + `$env:PATH; & 'C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run __tests__/grant-authority.test.js --config vitest.config.mjs"
```

Focused GREEN result: 1 test file passed, 12 tests passed.

```powershell
rtk powershell -NoProfile -Command "`$env:PATH='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + `$env:PATH; & 'C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run --config vitest.config.mjs"
```

Full Worker suite result: 4 test files passed, 72 tests passed.

Mutation proof and restoration evidence:

1. Replay-consumption mutation: temporarily added `if (payload) return { consumed: true };` at the start of `consumeGrantNonce()`.
2. Command: focused `grant-authority.test.js -t 'replayed avatar|replayed move|fails closed when replay'`.
3. Expected failure: 3 focused tests failed. Avatar replay returned `200` instead of `409`; move replay returned destination-state error instead of `replay_detected`; missing binding returned `200` instead of `500`.
4. Restoration: removed mutation; focused grant suite passed 12/12; full Worker suite passed 72/72.

Task 2.4 RED-baseline result:

```powershell
rtk powershell -NoProfile -Command "`$env:PATH='C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + `$env:PATH; & 'C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'scripts/run-insecure-baseline.mjs'"
```

Result: fixture SHA-256 matched `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; insecure baseline matched manifest with 18 expected RED failures and four already-safe passes.

Clean temporary-copy proof:

1. Temp path: `C:\Users\THELOR~1\AppData\Local\Temp\prd0055-task29-07965b2f28754804bce098bfd557e9a8`.
2. `npm ci` was run by system npm CLI executed through bundled x64 Node with `npm_config_arch=x64` and `npm_config_platform=win32`.
3. Result: 82 packages installed, 0 vulnerabilities; bundled x64 Node ran full Worker suite with 4 files/72 tests passed; bundled x64 Node ran insecure baseline with fixture SHA `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`, 18 expected RED failures, and four already-safe passes.

Static/boundary/diff checks to run in final Packet 2H-R verification:

1. `npm run check:utf8 -- <touched text files>`.
2. `git diff --check`.
3. Protected-path scan.
4. Taskbox scan proving parent Task 2.0 unchecked, Task 2.6 unchecked, Tasks 2.7/2.8/2.9 checked, and Tasks 2.10 through 2.15 unchecked.

Browser/deploy artifacts: not applicable. This corrective packet explicitly forbids browser adapter changes, deployment, rollback, version-pin, and Cloudflare remote mutation.

Residual risks and deferred items:

1. `UPLOAD_GRANT_REPLAY_LEDGER` production binding selection/provisioning remains later deployment work. Until then, production code fails closed when the binding is unavailable.
2. Task 2.6 remains unchecked until separately requested integrated Task 2.6/2.7/2.9 closure proof is run and documented.
3. Task 2.10+ hardening closure, browser proof, deployment/rollback/version-pin proof, app adapter work, and S0 parent acceptance remain incomplete.

Verifier and verification outcome: Task 2.9 remains checked because the corrective replay RED/GREEN, replay-consumption mutation proof, full Worker GREEN, unchanged insecure-baseline proof, clean temporary-copy proof, append-only findings, and `EV-0056` update are complete. Original Packet 2H replay proof is superseded by Packet 2H-R for replay closure.

### Final Packet 2H-R Verification Addendum

After appending Packet 2H-R findings and updating `EV-0056` only:

1. Bundled-x64 `& $node 'node_modules/vitest/vitest.mjs' run --config vitest.config.mjs`: PASS, four files and 72 tests.
2. Bundled-x64 `& $node 'scripts/run-insecure-baseline.mjs'`: PASS, fixture hash `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`, 18 expected RED failures, and four already-safe passes.
3. Clean temporary copy with bundled-x64 Node executing system npm CLI: PASS, `npm ci` installed 82 packages with zero vulnerabilities, four files and 72 tests passed, fixture hash matched, and the 18-RED/four-safe manifest matched.
4. `npm run check:utf8 -- cloudflare/worker.js cloudflare/src/upload-worker/grant-authority.js cloudflare/src/upload-worker/request-handlers.js cloudflare/src/upload-worker/replay-authority.js cloudflare/__tests__/grant-authority.test.js cloudflare/__tests__/upload-worker-harness.test.js tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: PASS, nine text files.
5. `git diff --check`: PASS.
6. Protected-path scan: PASS, changed paths are only `cloudflare/worker.js`, `cloudflare/src/upload-worker/grant-authority.js`, `cloudflare/src/upload-worker/request-handlers.js`, `cloudflare/src/upload-worker/replay-authority.js`, `cloudflare/__tests__/grant-authority.test.js`, `cloudflare/__tests__/upload-worker-harness.test.js`, tasklist, findings, and traceability; no `src/**`, Firebase rules/config, `r2-backup-worker/**`, SOP, upload-storage authority doc, R2 lifecycle, deployment, rollback, version-pin, Cloudflare remote-state, insecure fixture, insecure-baseline manifest, or insecure-baseline runner changed.
7. Taskbox scan: PASS, parent Task 2.0 unchecked; Task 2.6 unchecked; Task 2.7 checked; Task 2.8 checked; Task 2.9 checked; Tasks 2.10 through 2.15 unchecked.
8. Line-count scan: PASS, `cloudflare/worker.js` is 136 lines, `cloudflare/src/upload-worker/grant-authority.js` is 155 lines, `cloudflare/src/upload-worker/request-handlers.js` is 203 lines, `cloudflare/src/upload-worker/replay-authority.js` is 15 lines, `cloudflare/__tests__/grant-authority.test.js` is 399 lines, and `cloudflare/__tests__/upload-worker-harness.test.js` is 499 lines.

## Packet 2I Task 2.6 Integrated Authentication, Owner, And Raw-Key Non-Authority Closure - 2026-06-21

### Scope And Verdict

Subtask: Task 2.6 integrated closure only.

Task 2.6 verdict: PASS. Integrated Task 2.6/2.7/2.9 proof closes the approved checkpoint exception. Every request reaching non-`OPTIONS` routing authenticates before rate limiting, route selection, grant handling, or R2 access; verified Firebase token `sub` is sole owner identity; browser identity fields and raw keys cannot select owner or R2 target; cross-owner and invalid grant/path attempts fail before R2; and successful upload/move controls use only grant-derived canonical paths.

Scope boundaries: no production Worker code, `src/**`, Firebase rule/config, `r2-backup-worker/**`, SOP, deployment, lifecycle, browser adapter, remote state, Task 2.10, commit, push, deploy, rollback, or version pin changed. Parent Task 2.0 and Tasks 2.10 through 2.15 remain unchecked. Tasks 2.7, 2.8, and 2.9 remain checked.

### Files And Responsibility

1. `cloudflare/__tests__/integrated-authority.test.js`: new 499-line Packet 2I integrated authority suite only.
2. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: check Task 2.6 and record Packet 2I checkpoint closure only.
3. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: consolidate and update `EV-0056` only; earlier Task 2.7/2.8/2.9 and Packet 2H-R evidence remains represented.
4. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: append Packet 2I evidence only.

No existing test, fixture, manifest, runner, production module, or configuration file changed.

### Integrated Claims And R2-Call Evidence

1. Exact-origin `OPTIONS` preflight remains CORS-only: approved request returns `204`, unapproved origin returns `403`, and auth/rate/R2 call lists remain empty.
2. Missing-auth authorize, legacy authorize, `PUT /upload`, `POST /move`, unsupported `GET`, unsupported `DELETE`, and unsupported path/method cases all return `401`; each records one auth attempt and zero rate or R2 calls.
3. Query, JSON, and header `ownerId`, `uid`, email, and role values cannot replace verified owner-a `sub`; returned key stays `temp/listening-audio/owner-a/{nonce}-lesson.mp3`.
4. Filename influences only sanitized basename after server-selected operation/prefix and verified owner. Full cross-owner legacy path returns `403`; forbidden prefix returns `403`; both have zero R2 calls.
5. Cross-owner upload and move grants return `403` with exact R2 call list `[]`.
6. Raw `?key=` without grant returns `400` with exact R2 call list `[]`.
7. Raw move without grant and valid-grant source/destination assertion mismatches return `400` with exact R2 call list `[]`.
8. Validly signed noncanonical, forbidden-prefix, cross-owner, and direct-durable upload grants fail with exact R2 call list `[]`.
9. Validly signed cross-owner, cross-prefix, and forbidden-prefix move grants fail with exact R2 call list `[]`.
10. Successful upload with a competing raw `?key=` records only `[['get', grantKey], ['put', grantKey]]`; raw key is never read or written.
11. Successful move without browser source/destination assertions records only `[['get', grantDest], ['get', grantSource], ['put', grantDest], ['delete', grantSource]]`.
12. Integrated controls preserve traversal denial, existing-destination overwrite denial, exact-origin echo, no-Origin compatibility, expiry, replay, rate-limit denial, and the 50 MB ceiling.

### Mutation Proof And Exact Restoration

Pre-mutation production SHA-256 values:

- `cloudflare/worker.js`: `0AF516D8EF2ADD3ED85BAFD35AF9C14EE2F74F1753CE87F55FE461DE69E540DE`.
- `cloudflare/src/upload-worker/request-handlers.js`: `CA492333A2D2EA27C61D2DD33C7FAFB63920EC2115DFB5AFF12B52C612293363`.

Mutation 1 temporarily replaced verified-sub-only owner return with query `uid` precedence. Focused command selected `uses verified sub as sole owner despite browser identity fields`. Expected RED occurred: one test failed because received key used `owner-b` instead of expected `owner-a`. Mutation was removed; `cloudflare/worker.js` SHA-256 returned exactly to `0AF516D8EF2ADD3ED85BAFD35AF9C14EE2F74F1753CE87F55FE461DE69E540DE`.

Mutation 2 temporarily let raw query `key` override `grantPayload.key` during upload canonical validation. Focused command selected `grant-derived canonical path for successful upload`. Expected RED occurred: one test failed because R2 `get`/`put` received `temp/listening-audio/owner-a/fedcba9876543210fedcba9876543210-raw.mp3` instead of signed grant key `temp/listening-audio/owner-a/0123456789abcdef0123456789abcdef-lesson.mp3`. Mutation was removed; `request-handlers.js` SHA-256 returned exactly to `CA492333A2D2EA27C61D2DD33C7FAFB63920EC2115DFB5AFF12B52C612293363`.

### GREEN, Baseline, And Clean-Copy Evidence

1. Restored focused bundled-x64 Vitest: one file passed, 26 tests passed.
2. Restored full Worker suite: five files passed, 98 tests passed.
3. Local insecure baseline: fixture SHA-256 exactly `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; 18 expected RED failures and four already-safe passes.
4. Clean temporary copy `C:\Users\The Lord\AppData\Local\Temp\prd0055-task26-integrated-301f48cc55c34ad38bbaa5bd39b712a4` excluded `node_modules`. Bundled x64 Node drove system npm CLI with x64/win32 settings and bundled-node PATH precedence.
5. Clean-copy `npm ci`: 82 packages installed, 83 audited, zero vulnerabilities.
6. Clean-copy full suite: five files passed, 98 tests passed.
7. Clean-copy baseline: exact fixture SHA, 18 expected RED failures, four already-safe passes.
8. Temp path was verified under the OS temp root and removed.

### Final Packet 2I Verification

1. UTF-8 check targets exactly the four final changed text files.
2. `git diff --check` passes.
3. Protected-path scan contains exactly the four allowed paths and no production Worker/module/config or protected application/infrastructure path.
4. Insecure fixture, manifest, and runner have no diff from `HEAD`; baseline hash/accounting remains exact.
5. Taskbox scan: parent Task 2.0 unchecked; Task 2.6 checked; Tasks 2.7, 2.8, and 2.9 checked; Tasks 2.10 through 2.15 unchecked.
6. Task 2.10 was not started. No commit, push, deploy, rollback, version pin, or Cloudflare remote mutation occurred.

## Packet 2J Task 2.10 Hardened Negative Contract - 2026-06-21

### Scope And Verdict

Subtask: Task 2.10 only.

Task 2.10 verdict: PASS. Hardened Worker passes the exact 22 titles from `cloudflare/test/insecure-baseline-manifest.js`. Strict runner executes only the hardened contract through Vitest JSON, requires exact title equality and 22 passing outcomes, exits nonzero for missing, extra, failed, or unreadable results, removes temporary JSON output, and emits no forbidden sentinel values.

Scope boundaries: no production Worker module, insecure fixture, insecure manifest, insecure runner, Firebase rule/config, `r2-backup-worker/**`, SOP, browser adapter, deployment, rollback, version pin, or Cloudflare remote state changed. Task 2.11 was not started. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.10 are checked; Tasks 2.11 through 2.15 remain unchecked.

### Files And Responsibility

1. `cloudflare/__tests__/hardened-negative-contract.test.js`: new 425-line, exact-title 22-case hardened contract using injected Firebase, rate-limit, replay, and R2 doubles.
2. `cloudflare/scripts/run-hardened-negative-suite.mjs`: new 72-line strict JSON accounting runner with temporary-output cleanup and sentinel-safe output.
3. `cloudflare/package.json`: add `test:security:green` only.
4. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: check Task 2.10 only and record Packet 2J closure.
5. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: update `EV-0056` only.
6. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: append Packet 2J evidence only.

### Hardened Contract And R2 Evidence

1. Missing, invalid, expired, and wrong-audience auth cases return `401` with zero R2 access.
2. Cross-owner upload/move, raw-key move, forbidden-prefix upload/move, traversal, and encoded traversal fail with zero R2 access.
3. Unapproved preflight returns `403` without wildcard; approved exact-origin preflight returns `204` and exact origin without wildcard.
4. Unsupported method, `GET`, and `DELETE` return `405` with zero R2 mutation.
5. Over-50-MB authorization returns `413`; missing `Content-Length` returns `411`; both perform zero R2 mutation.
6. Replayed upload returns `409 replay_detected`, expired upload grant returns `403`, and replayed move grant cannot select a different source/destination. Rejected replay/expiry cases perform zero R2 access after call-list reset.
7. Log capture excludes token, grant, signed URL, secret, raw key, raw UID, and body sentinels; runner output contains only aggregate outcome counts.
8. Existing full suite preserves authorized upload/move controls and all prior Task 2.3 through 2.9 contracts.

### Mutation Proof And Exact Restoration

Pre/post SHA-256 values matched exactly:

- `cloudflare/worker.js`: `0af516d8ef2add3ed85bafd35af9c14ee2f74f1753ce87f55fe461de69e540de`.
- `cloudflare/test/insecure-baseline-manifest.js`: `f1ebbe0ca124f7b7043a96f264697ec92c184875d6295d827c421ac2e6bce061`.
- `cloudflare/scripts/run-insecure-baseline.mjs`: `9709391de3b725028fbc391ddb1386ce8b54c147b275a0e3c9c80e13c088bc8d`.
- `cloudflare/scripts/run-hardened-negative-suite.mjs`: `119c25ea7c9c65e2286c61d48f29f6b4b41896b6f17725f6c7cdb8325bf56411`.
- `cloudflare/__tests__/hardened-negative-contract.test.js`: `362a1e85e551331dbc3aa33dc90d8b5d7a766e4fd967c06fa179f7215bf8cb57`.

Mutation 1 temporarily renamed `missing auth denied` in the hardened test. Runner exited `1` with `missing=1`, `extra=1`, `failed=0`. Exact test, manifest, and runner bytes were restored.

Mutation 2 temporarily weakened `cloudflare/worker.js` authentication rejection. Runner exited `1` with `missing=0`, `extra=0`, `failed=4`. Exact production Worker bytes were restored. Restored runner returned 22/22.

### GREEN, Baseline, And Clean-Copy Evidence

1. Local bundled-x64 `test:security:green`: 22/22.
2. Local full Worker suite: six files, 120/120, comprising 98 existing plus 22 Packet 2J tests.
3. Local insecure baseline: normalized fixture SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; 18 expected RED failures and four already-safe passes.
4. Clean temporary copy `C:\Users\The Lord\AppData\Local\Temp\prd0055-task210-8aa33612c94e46fbbc06b3d54c28c843` excluded `node_modules`; bundled x64 Node drove system npm CLI with x64/win32 settings and bundled-node PATH precedence.
5. Clean-copy `npm ci`: 82 packages installed, 83 audited, zero vulnerabilities.
6. Clean-copy hardened runner: 22/22; full suite: six files, 120/120; insecure baseline: exact fixture SHA, 18 expected RED failures, four already-safe passes.
7. Temp path was verified under the OS temp root and removed after the transient Vitest `workerd.exe` lock released.

### Final Packet 2J Verification

1. UTF-8 check targets exactly the six final changed text files.
2. `git diff --check` passes.
3. Protected-path scan contains exactly the six allowed paths.
4. Insecure fixture, manifest, and runner remain unchanged from `HEAD`; normalized fixture SHA and baseline accounting remain exact.
5. Taskbox scan: parent Task 2.0 unchecked; Tasks 2.6 through 2.10 checked; Tasks 2.11 through 2.15 unchecked.
6. No commit, push, deploy, rollback, version pin, browser work, or Cloudflare remote mutation occurred. Task 2.11 was not started.

## Packet 2J-R Task 2.10 Corrective Hardened Log Contract - 2026-06-21

### Supersession And Verdict

Packet 2J-R verdict: PASS. This corrective packet supersedes only the original Packet 2J case-22 log-secrecy proof. The original case sent sentinel values with an invalid Firebase token, returned `401`, and therefore never created real grants or URLs, used the configured grant secret, verified a UID, consumed the audio body, or reached grant verification/R2. Original Packet 2J's other 21 hardened cases and strict title/accounting runner remain valid.

Task 2.10 remains checked only because the corrected proof below passed. Task 2.11 remains unchecked and was not started.

### Corrected Case 22

1. `console.log`, `console.warn`, and `console.error` spies are installed before any request.
2. Test context accepts actual sentinel Firebase token `firebase-token-log-sentinel` as actual verified UID `verified-uid-log-sentinel` and sets the real `UPLOAD_GRANT_SECRET` binding to a secret sentinel.
3. Authorization succeeds with sentinel filename, content type, and audio-body size metadata.
4. Test captures the actual issued upload grant, move grant, upload URL, public URL, canonical key, and separately supplies a non-authoritative raw-key sentinel.
5. Authorized upload uses the issued upload grant, valid sentinel token, matching content type/length, and sentinel audio body. A controlled R2 `get` failure occurs only after grant verification, canonical-key validation, and replay consumption; response is `500` and the sole R2 call contains the grant-derived canonical key.
6. Captured logs must exclude the actual token, upload grant, move grant, upload URL, public URL, secret binding, canonical key, raw key, verified UID, and audio body.

### Targeted Mutation And Restoration

1. Production `cloudflare/worker.js` was temporarily changed only in its unexpected-error path to log `request.url`, the `Authorization` header, and `env.UPLOAD_GRANT_SECRET`.
2. Strict hardened runner exited `1` with `missing=0`, `extra=0`, `failed=1`; corrected case 22 detected the leak after reaching the controlled R2 boundary.
3. Mutation was reverted in the same operation. Restored `cloudflare/worker.js` SHA-256 is `0af516d8ef2add3ed85bafd35af9c14ee2f74f1753ce87f55fe461de69e540de`, and `git diff --exit-code HEAD -- cloudflare/worker.js` returned zero.
4. Restored hardened runner returned 22/22.

### Local, Baseline, And Clean-Copy Evidence

1. Local hardened runner: 22/22.
2. Local full Worker suite: six files, 120/120.
3. Local insecure baseline: normalized fixture SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; 18 expected RED failures and four already-safe passes.
4. Clean copy `C:\Users\The Lord\AppData\Local\Temp\prd0055-task210-corrective-c351e070508b469893f02d0262ef4d20` excluded `node_modules` and `.wrangler`; bundled Windows x64 Node drove the system npm CLI with x64/win32 settings and bundled-node PATH precedence.
5. Clean-copy `npm ci`: 82 packages installed, 83 audited, zero vulnerabilities.
6. Clean-copy hardened runner: 22/22; full suite: six files, 120/120; insecure baseline: exact normalized fixture SHA, 18 expected RED failures, four already-safe passes.
7. Temp copy was safety-checked under the OS temp root and removed; removal verification returned `True`.

### Restored Hashes And Scope

- Production `cloudflare/worker.js`: `0af516d8ef2add3ed85bafd35af9c14ee2f74f1753ce87f55fe461de69e540de`.
- Insecure fixture `cloudflare/test/fixtures/insecure-current-worker.js`: raw SHA-256 `b0c45afad89e0a95f96a395dea6b6bc4f3549535c04b352631cbb5f8241347f1`; normalized baseline SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`.
- Insecure manifest `cloudflare/test/insecure-baseline-manifest.js`: `f1ebbe0ca124f7b7043a96f264697ec92c184875d6295d827c421ac2e6bce061`.
- Insecure runner `cloudflare/scripts/run-insecure-baseline.mjs`: `9709391de3b725028fbc391ddb1386ce8b54c147b275a0e3c9c80e13c088bc8d`.
- Hardened runner `cloudflare/scripts/run-hardened-negative-suite.mjs`: `119c25ea7c9c65e2286c61d48f29f6b4b41896b6f17725f6c7cdb8325bf56411`.
- Corrected hardened test `cloudflare/__tests__/hardened-negative-contract.test.js`: `2a46c3a85483e5f7c7637082634e462d5db805650fe7a4f2d46c8a3c2a70a27e`.

Final changed-path scope remains exactly six paths: `cloudflare/package.json`, `cloudflare/__tests__/hardened-negative-contract.test.js`, `cloudflare/scripts/run-hardened-negative-suite.mjs`, parent tasklist, findings ledger, and traceability registry. No production code remains changed. No commit, push, deploy, rollback, version pin, browser work, or Cloudflare remote mutation occurred.

## Packet 2K Pre-Task-2.11 Replay Ledger Prerequisite - 2026-06-21

### Approval And Scope

Subtask: pre-Task-2.11 replay-ledger prerequisite only.

Exact contextual approval recorded: User response: "approve".

Approved architecture:

1. SQLite-backed Durable Object class: `UploadGrantReplayLedger`.
2. Binding: `UPLOAD_GRANT_REPLAY_LEDGER`.
3. One Durable Object instance per full grant replay key.
4. Atomic `consume({ key, expiresAt })` before R2 access.
5. Retain consumed state at least 15 minutes.
6. Alarm-based storage cleanup.
7. Fail closed on binding, RPC, or storage failure.

Scope boundaries: no deploy, secret mutation, namespace provisioning, rollback, version pin, push, remote mutation, deployed probe, browser adapter work, Firebase rule/config change, `r2-backup-worker/**` change, lifecycle change, or Task 2.11 checkbox change occurred.

### Current-Source And Cloudflare Documentation Inputs

Required local inputs read before code changes: `AGENTS.md`, `documentation/rules/infrastructure.md`, PRD-0056 sections 11 and 14-16, current `cloudflare/worker.js`, `cloudflare/src/upload-worker/replay-authority.js`, `cloudflare/src/upload-worker/grant-authority.js`, `cloudflare/src/upload-worker/request-handlers.js`, `cloudflare/wrangler.jsonc`, `cloudflare/vitest.config.mjs`, and current Worker test files.

Current Cloudflare docs retrieved:

1. Durable Object namespace/RPC docs: `getByName()` obtains a stub for invoking Durable Object methods.
2. Durable Object migrations docs: new SQLite-backed classes use `new_sqlite_classes`, and the class name must be exported by the deployed Worker.
3. SQLite storage docs and changelog: for compatibility dates before `2026-02-24`, `deleteAll()` does not delete alarms, so `deleteAlarm()` is required separately.
4. Durable Object testing docs: `runInDurableObject()` and `runDurableObjectAlarm()` are supported by the Workers Vitest integration.
5. Wrangler config docs and local schema: `durable_objects.bindings` plus `migrations` are the config authority for the new binding.

### Files And Responsibility

1. `cloudflare/worker.js`: 120 -> 122 lines. Exports `UploadGrantReplayLedger` from the Worker entry module and keeps the router thin.
2. `cloudflare/src/upload-worker/replay-authority.js`: 13 -> 47 lines. Derives full replay keys, resolves one Durable Object stub through `getByName()`, preserves isolated test-double compatibility, and fails closed on unavailable binding/stub/RPC.
3. `cloudflare/src/upload-worker/upload-grant-replay-ledger.js`: absent -> 42 lines. New SQLite-backed Durable Object RPC target with persisted consumed state, atomic storage transaction, retention-aligned alarm, explicit `deleteAlarm()`, and `deleteAll()` cleanup.
4. `cloudflare/wrangler.jsonc`: adds `UPLOAD_GRANT_REPLAY_LEDGER` Durable Object binding and first `new_sqlite_classes` migration.
5. `cloudflare/__tests__/replay-ledger.test.js`: absent -> 273 lines. Focused Packet 2K tests for DO semantics, failure modes, config binding, and Worker R2 ordering.
6. `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`: replaces pending replay-store language with the approved SQLite Durable Object decision and adds binding/regression checklist entries.
7. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: leaves Task 2.11 unchecked and records Packet 2K as a local-only pre-deploy prerequisite.
8. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: updates `EV-0056` only.
9. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: appends this Packet 2K evidence.

### Local RED/GREEN And Mutation Evidence

Focused RED before implementation: `npm test -- __tests__/replay-ledger.test.js` failed because `UploadGrantReplayLedger` was not exported, `env.UPLOAD_GRANT_REPLAY_LEDGER` was undefined, and Worker consumption still returned `500` in the new ordering tests.

Restored focused GREEN: `npm test -- __tests__/replay-ledger.test.js` returned one file and 9/9 tests.

Mutation 1 temporarily bypassed Durable Object consumption in `replay-authority.js`; focused replay tests failed 3 cases: missing namespace no longer failed closed, upload did not call `consume`, and move did not call `consume`.

Mutation 2 temporarily replaced durable consumed state with instance memory; focused replay tests failed 2 cases: persisted state was absent and cleanup metadata was absent.

Mutation 3 temporarily removed the consumed-state guard from the storage transaction; focused replay tests failed 2 cases: sequential replay returned consumed true, and concurrent same-key calls produced three winners instead of one.

Mutation 4 temporarily removed the config binding and migration from `wrangler.jsonc`; focused replay tests failed 4 cases because `env.UPLOAD_GRANT_REPLAY_LEDGER` was undefined, and dry-run omitted the replay ledger binding from its binding list.

Post-mutation restored SHA-256 values:

- `cloudflare/worker.js`: `915CF6E76D6949C21C845F6CED40F5CAC38F5A34ABE85B3EF63556DF922DAC4A`.
- `cloudflare/src/upload-worker/replay-authority.js`: `BE7643F265BDB06FBF04F08D0919C5599A919C7266B5FFBEE91AFA7BC5A4AB8E`.
- `cloudflare/src/upload-worker/upload-grant-replay-ledger.js`: `DD3545CBD2D587A88999B72EA8AA5FD05B3B9DFBE23DEECB9877C4BFD8FD336F`.
- `cloudflare/wrangler.jsonc`: `2DBBB819605355D383929C16E0066E41443C29BFB8D7F9704D18EAFC9829D798`.
- `cloudflare/__tests__/replay-ledger.test.js`: `5ACFABED1E4D380CF3222746A06B85BB395F4A3EE69B038557BE0ABBF4D2BCD2`.

### Final Verification

Local bundled-x64 verification:

1. Hardened runner: 22/22.
2. Full Worker suite: seven files, 129/129 tests.
3. Insecure baseline: normalized fixture SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f750d5e2776a05c`; 18 expected RED failures and four already-safe passes.
4. Wrangler dry-run listed `UPLOAD_GRANT_REPLAY_LEDGER`, `R2_BUCKET`, `UPLOAD_RATE_LIMITER`, `PUBLIC_URL`, and `FIREBASE_PROJECT_ID`, then exited with `--dry-run`.

Clean temporary copy `C:\Users\The Lord\AppData\Local\Temp\prd0055-task2k-replay-ledger-440709e600bf4c5daae97d31027f5e0a` excluded `node_modules`, `.wrangler`, and `.git`; bundled Windows x64 Node drove system npm CLI with x64/win32 settings and bundled-node PATH precedence.

Clean-copy proof:

1. `npm ci`: 82 packages installed, 83 audited, zero vulnerabilities.
2. Full Worker suite: seven files, 129/129 tests.
3. Hardened runner: 22/22.
4. Insecure baseline: exact normalized fixture SHA; 18 expected RED failures and four already-safe passes.
5. Wrangler dry-run listed `UPLOAD_GRANT_REPLAY_LEDGER`, `R2_BUCKET`, `UPLOAD_RATE_LIMITER`, `PUBLIC_URL`, and `FIREBASE_PROJECT_ID`, then exited with `--dry-run`.
6. Temp copy was safety-checked under the OS temp root and removed; removal verification returned `True`.

Taskbox state after Packet 2K: parent Task 2.0 remains unchecked; Tasks 2.6 through 2.10 remain checked; Tasks 2.11 through 2.15 remain unchecked. Task 2.11 was not started.

Residuals and next gates: production Durable Object namespace provisioning, deployed binding/secrets proof, deployed negative probes, authorized deployed upload/move proof, rollback/version-pin proof, sections 15-16 remote evidence, and final S0 acceptance remain Task 2.11+ work. No Cloudflare remote state was mutated in Packet 2K.

## Packet 2L Option A Local Adapter And Canary Readiness - 2026-06-22

### Findings First And Verdict

1. Packet 2L local adapter/canary readiness verdict: PASS within local-only scope.
2. Full app Vitest sweep is not globally GREEN: it exited `1` with unrelated existing assertion/time-out failures and Firebase emulator tests that lack host/port configuration. Examples include `AccessDeniedPage`, mobile exam mode, Reading V2 operational matrix, Listening parser, and PRD-0040 emulator tests. Packet-focused service tests and every mapped caller test pass independently and in clean copy.
3. Full repo `tsc --noEmit` is also not globally GREEN because of existing errors across unrelated Academic Record, legacy Mantine, student navigation, Reading V2, results, and other files. No error was attributed to the four touched service/test files by focused Vitest compilation.
4. Fresh root `npm ci` reports 38 existing audit findings: 2 low, 20 moderate, 14 high, and 2 critical. Packet 2L changes no package manifest or lockfile. Fresh Cloudflare `npm ci` reports zero vulnerabilities.
5. No stop condition occurred in the adapter, mapped-caller, Worker, hardened, baseline, dry-run, mutation, or clean-copy proof.

### Separate Approvals And Option A

Product-owner approval: User response: `"approve all"`.

Architecture/security approval: User response: `"approve all"`.

Approved local-only shape:

1. Canary Worker: `r2-upload-signer-s0-canary`.
2. Internal/canary browser build only; production browser and `r2-upload-signer` unchanged.
3. Planned rollback: restore canary build endpoint to current production Worker.
4. Stop for auth failure, raw-key authority, wrong upload URL, upload/move failure, or caller regression.

### Files, Lines, And Responsibility

1. `src/services/r2Storage.ts`: 446 -> 140 lines. Legacy network/auth/raw-key implementation removed; file now maps existing method/folder/key hints to approved operation intent, delegates to the client, and preserves URL/temp helpers plus public API types.
2. `src/services/r2Storage.test.ts`: 85 -> 118 lines. Facade tests map six caller families, progress, avatar singleton intent, server-derived replacement keys, exact move output, and URL/temp compatibility.
3. `src/services/r2UploadClient.ts`: absent -> 360 lines. Owns endpoint selection, Firebase token retrieval, authorize/PUT/move HTTP flow, response validation, recoverable errors, and in-memory move-grant expiry association. It remains below the 400-line production-module target.
4. `src/services/r2UploadClient.test.ts`: absent -> 344 lines. Covers auth headers, all operation kinds, basename/content type/size, exact output, real Vite endpoint override, production default, missing/expired credentials/grants, wrong URL, raw-key absence, and storage/log secrecy.
5. `cloudflare/wrangler.canary.jsonc`: absent -> 44 lines. Uses Worker name `r2-upload-signer-s0-canary`; otherwise preserves production binding/config shape for local dry-run.
6. Child PRD, parent tasklist, `EV-0056`, and this append-only findings ledger record Packet 2L only.

`cloudflare/worker.js`, production `cloudflare/wrangler.jsonc`, Worker modules/tests/runners, insecure fixture/manifest, Firebase rules/config, `r2-backup-worker/**`, SOP, lifecycle, callers, and production build files remain unchanged.

### Adapter Contract Evidence

1. `VITE_R2_UPLOAD_WORKER_URL` is trimmed and trailing slashes normalized; missing/blank override selects `https://r2-upload-signer.iamhuwng.workers.dev`.
2. `getAuth().currentUser.getIdToken()` is called for authorize, PUT, and move. Each request sends `Authorization: Bearer <token>`.
3. Authorize body contains only `operationKind`, basename-only `fileName`, `contentType`, and `sizeBytes`; it contains no `key`, legacy `filename`, `sourceKey`, or `destKey` authority.
4. PUT accepts only the Worker-returned same-endpoint `/upload?grant=...` URL and stops on a different origin/path. Returned canonical key and public URL must agree between authorize and PUT.
5. Move body is exactly `{ moveGrant }`. Missing or expired in-memory grant fails before network and never falls back to raw source/destination keys.
6. Listening audio temp, test audio temp, test image temp, avatar permanent, announcement attachment permanent, and book-cover permanent map to the six Worker allowlisted operation kinds.
7. Existing audio/image/book-cover replacement hints never reach the client as storage authority; Worker-derived replacement key/URL wins. Avatar retains `avatar_permanent` singleton intent.
8. No token, grant, or key is written to local/session storage, IndexedDB, or console by the client.

### RED, GREEN, And Mutation Proof

Initial focused RED: client test import failed because `r2UploadClient.ts` was absent; 12 of 13 new facade tests failed against legacy network/raw-key behavior. This proved the new contract was not pre-existing.

Restored focused GREEN: two files, 32/32 tests.

Targeted mutations:

1. Removed PUT `Authorization`; `sends Authorization on authorize, PUT, and move without raw move keys` failed because the header was `undefined`.
2. Added raw `sourceKey`/`destKey` to move body; the same exact-body test failed and displayed both forbidden fields.
3. Ignored real `VITE_R2_UPLOAD_WORKER_URL`; `uses configured canary endpoint for authorize, PUT, and move` failed with `invalid_upload_url`.
4. Permitted missing/expired grant raw-key fallback; both `fails expired move grant without any raw-key fallback request` and `fails missing move grant association without network or raw-key fallback` failed.

After every production mutation, exact bytes were restored. `git hash-object src/services/r2UploadClient.ts` returned `a88d27cd5a7b8f2f125483afa6c863b5a36a4f7c`; final focused GREEN returned 32/32.

### Local Verification

1. Focused adapter/client: two files, 32/32.
2. Mapped current callers, run sequentially with 20-second per-test ceiling: six files, 29/29. Initial parallel run passed 27 and timed out two 5-second UI cases; sequential rerun proved both cases and the full mapped set GREEN without code changes.
3. Full Worker: seven files, 129/129.
4. Hardened runner: 22/22.
5. Insecure baseline: fixture SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; 18 expected RED failures and four already-safe passes.
6. Production Wrangler config: `deploy --dry-run` only; five required bindings listed.
7. Canary Wrangler config: `deploy --config wrangler.canary.jsonc --dry-run` only; same five required bindings listed.
8. No production browser build was run.

### Clean-Copy Proof

Temporary copy `C:\Users\The Lord\AppData\Local\Temp\prd0056-packet2l-3f09ee002c624537b16a500e3572e2b7` was verified under the OS temp root. It excluded existing root and Cloudflare `node_modules`, Cloudflare `.wrangler`, and repository metadata. Bundled Windows x64 Node `v24.14.0` drove both fresh installs and all proof commands.

1. Fresh root `npm ci`: 1,320 packages installed; audit findings recorded above.
2. Clean adapter/client: 32/32.
3. Clean mapped callers: 29/29.
4. Fresh Cloudflare `npm ci`: 82 packages installed, 83 audited, zero vulnerabilities.
5. Clean full Worker: 129/129.
6. Clean hardened runner: 22/22.
7. Clean baseline: exact fixture SHA; 18 expected RED failures and four safe passes.
8. Clean production and canary Wrangler dry-runs: both list the five required bindings and exit at `--dry-run`.
9. Temp removal verification returned `True`.

After exact-file TypeScript checking exposed and corrected a test-only literal-return inference, final root test bytes were re-proven in `C:\Users\The Lord\AppData\Local\Temp\prd0056-packet2l-final-1950a2e2d39249db82b1962b26afeb2b`: fresh `npm ci`, exact-file `tsc --noEmit`, and adapter/client 32/32 all passed; final temp removal returned `True`. Production client hash and all Cloudflare files remained unchanged, so the earlier clean mapped-caller and Cloudflare proof remains exact for those paths.

### Scope And Task State

Parent Task 2.0 remains unchecked. Tasks 2.6 through 2.10 remain checked. Tasks 2.11 through 2.15 remain unchecked. Task 2.11 was not started.

No provisioning, secret mutation, deploy, traffic change, push, rollback, browser production build, R2 mutation, remote operation, commit, or task checkbox change occurred. Production browser and production Worker remain unchanged.

## Packet 2M Task 2.11 Phase A Canary Provisioning - 2026-06-22

Approval scope: User response: `"Approve PRD-0055 Task 2.11 Phase A canary provisioning only: Cloudflare remote mutation is allowed only for r2-upload-signer-s0-canary prerequisites/deploy and required secret/binding/rate-limit verification. No production Worker deploy, no production traffic change, no rollback, no R2 object mutation, no browser upload/move probe, no push."`

### Phase A Result

Verdict: PASS for canary provisioning only.

1. Canary Worker `r2-upload-signer-s0-canary` was absent before deploy. `wrangler deployments status --name r2-upload-signer-s0-canary --json` and `wrangler versions list --name r2-upload-signer-s0-canary --json` both returned Cloudflare API code `10007` (`This Worker does not exist on your account.`).
2. Initial canary deploy attempt with the checked-in semantic rate namespace `prd0056-upload-worker-s0` was rejected by Cloudflare validation before deployment: `binding UPLOAD_RATE_LIMITER of type ratelimit must have valid namespace_id [code: 10021]`.
3. Current Cloudflare Rate Limiting binding docs require `namespace_id` to be a positive integer string. `cloudflare/wrangler.canary.jsonc` was changed only for the canary config from `prd0056-upload-worker-s0` to `205511`; production `cloudflare/wrangler.jsonc` remains unchanged.
4. A new `UPLOAD_GRANT_SECRET` was generated locally with cryptographic randomness, passed to Wrangler through a temporary JSON `--secrets-file`, and the temporary file was removed in `finally`. No secret value was printed or written into the repo.
5. Canary deploy succeeded at `https://r2-upload-signer-s0-canary.iamhuwng.workers.dev`.

### Local Pre-Deploy Proof

1. Bundled Windows x64 Node was required; ambient Node failed Wrangler with `Unsupported platform: win32 arm64 LE`.
2. `wrangler deploy --config wrangler.canary.jsonc --dry-run` after the canary namespace fix listed `UPLOAD_GRANT_REPLAY_LEDGER`, `R2_BUCKET`, `UPLOAD_RATE_LIMITER`, `PUBLIC_URL`, and `FIREBASE_PROJECT_ID`, then exited at `--dry-run`.
3. Full Worker suite: seven files, 129/129 tests.
4. Hardened negative runner: 22/22.
5. Insecure baseline: fixture SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; 18 expected RED failures and four already-safe passes.

### Remote Verification

1. Wrangler account: `iamhuwng@gmail.com`, account ID `e41db829dabe9993f03674afdfd56510`.
2. Canary deployment status: deployment ID `0e2561d1-e868-49d6-9609-2c03f3b83993`, source `wrangler`, strategy `percentage`, version `627f7503-8324-45d1-8e23-cdd02828111c` at 100%, created `2026-06-22T05:18:03.514345Z`.
3. Canary version list: version number 1, source `wrangler`, message `PRD-0055 Task 2.11 Phase A canary provisioning`, preview disabled.
4. Canary version view: script ETag `1917ab1452372e37dec12a27e91043244237971c9aaf2b0366d13ae86dca972e`; handlers `fetch`, `UploadGrantReplayLedger`, and `createUploadWorker`; migration tag `v1-upload-grant-replay-ledger`; compatibility date `2026-01-20`.
5. Canary binding proof: `FIREBASE_PROJECT_ID=temp-a1437`, `PUBLIC_URL`, `R2_BUCKET=kahoot-media`, `UPLOAD_GRANT_REPLAY_LEDGER` Durable Object namespace `bea9a2921503419cae45222576464679`, `UPLOAD_GRANT_SECRET` as `secret_text`, and `UPLOAD_RATE_LIMITER` namespace `205511` with simple limit 30 and period 60.
6. Canary secret proof: `wrangler secret list --config wrangler.canary.jsonc --format json` returned `UPLOAD_GRANT_SECRET` with type `secret_text`.
7. Production Worker verification stayed read-only: `r2-upload-signer` deployment ID `92e01212-afd4-4aae-9d72-a548f063008b`, source `quick_editor`, version `20dd8429-5be1-4105-baed-f6dc5af68098` at 100%, created `2026-01-26T17:27:56.516701Z`. Production version list still ends at version number 6 / ID `20dd8429-5be1-4105-baed-f6dc5af68098`.

### Scope And Task State

No production Worker deploy, production traffic change, rollback, R2 object mutation, browser upload/move probe, version pin, push, production browser build, Firebase rule/config change, `r2-backup-worker/**` change, or task checkbox change occurred.

Parent Task 2.0 remains unchecked. Tasks 2.6 through 2.10 remain checked. Task 2.11 remains unchecked because authorized upload/move deployed proof, browser/canary build proof, rollback drill, version-pin proof, final S0 acceptance, and independent review remain later work.

## Packet 2N Task 2.11 Phase B Canary Proof Approval - 2026-06-22

Approval scope: User response: `"Approve PRD-0055 Task 2.11 Phase B canary proof only. Allow authenticated localhost browser testing against r2-upload-signer-s0-canary and creation, move, verification, and cleanup of uniquely named canary test objects only. No existing R2 object may be changed or deleted. No production Worker deploy, production traffic change, secret mutation, rollback, version pin, push, or Task 2.11 checkbox change."`

This approval record was appended before any Phase B browser request or R2 object mutation. Task 2.11 remains unchecked.

Phase B canary proof evidence:
- Start state: HEAD `37d927f525d45a5f8d89d6a1eb355e7bd6e517a1`; `git status --short` was clean before Phase B evidence work.
- Browser path: authenticated localhost teacher session at `http://localhost:5173` exercised `r2-upload-signer-s0-canary` through a temporary same-origin localhost proxy because direct browser navigation/fetch to `workers.dev` was blocked by `net::ERR_BLOCKED_BY_CLIENT`. The proxy and harness were removed after proof capture.
- Upload/move proof: a uniquely named `test_audio_temp` canary object was uploaded, moved, and byte-verified through the canary-provided public R2 URL. Payload length was 63 bytes. Temp key SHA-256 was `6fe0468585e9215aeb167e02f66c1ba8a805f2e47fa748f81a23ebe2600e040e`; durable key SHA-256 was `a0eeafe16b8cfb1e692571daa8b10992fc957fb1783da886b3a5a68c206265ce`. Raw keys are intentionally omitted.
- Browser client caveat: the default browser `R2UploadClient` call path failed with `Upload authorization failed; retry`; the proof completed only when the harness injected `fetch: async (...args) => window.fetch(...args)`. This remains a follow-up implementation finding and is why Task 2.11 stays unchecked.
- Cleanup proof: delayed recheck showed both unique temp and durable public URLs returned `404`; Cloudflare R2 REST exact-prefix list returned `count: 0` and `targetSeen: false` for both key hashes; Cloudflare R2 REST delete probe for the durable key returned JSON `success:false`, error code `10007`, message `The specified key does not exist.`
- Wrangler/R2 REST caveat: `wrangler r2 object delete ... --remote --force` printed `Delete complete` because the R2 API returned HTTP `200`, but direct JSON inspection showed `success:false`. A slash-path R2 REST/Wrangler GET also returned 63 bytes while public URL, exact-prefix list, and delete probe all showed the unique canary keys absent; cleanup truth is therefore based on public URL/list/delete JSON, not dry-run or Wrangler success text.
- Remote version guard: read-only `wrangler deployments status` after Phase B showed canary `r2-upload-signer-s0-canary` still at version `627f7503-8324-45d1-8e23-cdd02828111c` and production `r2-upload-signer` still at version `20dd8429-5be1-4105-baed-f6dc5af68098`.
- No production Worker deploy, production traffic change, secret mutation, rollback, version pin, push, existing R2 object mutation, or Task 2.11 checkbox change occurred. Task 2.11 Phase C/final acceptance was not started.

## Packet 2N-R Task 2.11 Browser Client Corrective Fix - 2026-06-22

Corrective scope: This packet supersedes only the Packet 2N "Browser client caveat" line. Packet 2N completed the canary upload/move/cleanup but recorded that the default browser `R2UploadClient` failed with `Upload authorization failed; retry` and that the proof passed only when the harness injected `fetch: async (...args) => window.fetch(...args)`. This packet fixes the default browser client path locally, proves it by RED/GREEN/mutation regression, and re-confirms the unchanged Worker/hardened/baseline suites. The live default-client canary browser rerun is recorded separately below.

### Start State

- Required HEAD `c31b4a21f4856a9c4c4843a7ad2b36e816980c41`; `git status --porcelain` clean before edits.
- Branch `codex/prd-0055-task-2a-s0-worker-truth`.

### Root Cause

`src/services/r2UploadClient.ts` constructor stored a bare global `fetch` reference (`this.fetchImpl = options.fetch ?? fetch`). Calling it later as `this.fetchImpl(...)` uses the `R2UploadClient` instance as the `this` receiver. Real browsers require `fetch` to be invoked with the global object as receiver and throw a `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`. The `authorize()` try/catch then surfaces that as the recoverable `R2UploadClientError('network_error', 'Upload authorization failed; retry', true)`, which is the exact Packet 2N caveat symptom. Node/undici `fetch` is lenient about the receiver, so the prior unit tests (which always injected `fetch`) never exercised the default path and never caught this.

### Fix (Default Browser Client Path Only)

- Added module helper `const defaultFetch: typeof fetch = (...args) => globalThis.fetch(...args);` and changed the constructor default to `this.fetchImpl = options.fetch ?? defaultFetch;`. This routes the default through `globalThis.fetch(...)` (global receiver) and is the production equivalent of the proven Packet 2N harness workaround. The injectable `options.fetch` still wins for tests.
- Preserved invariants unchanged: bearer Authorization on authorize/PUT/move, no raw-key move fallback (move requires a stored opaque `moveGrant`), same-endpoint `assertUploadUrl` check, and moveGrant-only association. No security logic was touched.

### Changed Files

- `src/services/r2UploadClient.ts` (+10/-1): `defaultFetch` helper plus the one-line default binding change.
- `src/services/r2UploadClient.test.ts` (+52): focused regression `R2UploadClient default browser fetch binding > invokes the default global fetch with the global receiver on authorize and move`. It stubs `globalThis.fetch` with a native-style `browserFetch` that records its `this` receiver and rejects any non-global receiver with an "Illegal invocation" `TypeError`, constructs the client with no injected `fetch`, and asserts both the authorize and move calls were invoked with `globalThis` as receiver.

### Local RED / GREEN / Mutation Proof

All runs used ambient arm64 Node `v22.17.1` with `npx vitest run` from the repo root (jsdom env per `vitest.config.ts`).

1. RED (pre-fix): `npx vitest run src/services/r2UploadClient.test.ts` -> 1 failed | 19 passed. The new test failed with `R2UploadClientError: Upload authorization failed; retry` thrown from `R2UploadClient.authorize` at `r2UploadClient.ts:249`, faithfully reproducing the Packet 2N browser symptom.
2. Applied the `defaultFetch` fix.
3. GREEN: `npx vitest run src/services/r2UploadClient.test.ts src/services/r2Storage.test.ts` -> 2 files, 33/33 (client 20/20 including the new regression; facade 13/13). Mapped-caller facade `r2Storage.test.ts` uses a mocked client and is unaffected.
4. Mutation: reverting the constructor default to the exact original bug `options.fetch ?? fetch` reproduced the deterministic RED (`Upload authorization failed; retry` from `authorize`), 1 failed | 19 passed. Restoring `options.fetch ?? defaultFetch` returned 33/33 GREEN. The exact fix bytes are in place (`defaultFetch` helper; `?? defaultFetch`).

### Unchanged Worker / Hardened / Baseline Suites

`cloudflare/` was not modified; these re-confirm no regression. Run with bundled Windows x64 Node `v24.14.0` at `C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` (ambient arm64 Node cannot run local `workerd`):

1. Full Worker suite (`node_modules/vitest/vitest.mjs run` in `cloudflare/`): seven files, 129/129.
2. Hardened negative runner (`scripts/run-hardened-negative-suite.mjs`): 22/22.
3. Insecure baseline (`scripts/run-insecure-baseline.mjs`): fixture SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; 18 expected RED failures and four already-safe passes.

### TypeScript

`npx tsc --noEmit -p tsconfig.json` reports no errors in `r2UploadClient.ts` or `r2Storage.test.ts`/`r2Storage.ts`. The project has pre-existing, unrelated type errors in Mantine/component files (the Vite app does not gate builds on `tsc`); none are introduced or affected by this change.

### Remote Version Guard (Read-Only)

Read-only `wrangler deployments status` (bundled x64 Node) after the local fix:

1. Canary `r2-upload-signer-s0-canary`: deployment `0e2561d1-e868-49d6-9609-2c03f3b83993`, version `627f7503-8324-45d1-8e23-cdd02828111c` at 100%, created `2026-06-22T05:18:03.514345Z`. Unchanged.
2. Production `r2-upload-signer`: deployment `92e01212-afd4-4aae-9d72-a548f063008b`, version `20dd8429-5be1-4105-baed-f6dc5af68098` at 100%, created `2026-01-26T17:27:56.516701Z`. Unchanged.

### Live Default-Client Canary Browser Rerun (Completed 2026-06-22)

Completed in this session under the existing Phase B approval limits (authenticated localhost browser testing against `r2-upload-signer-s0-canary`; creation, move, verification, and cleanup of uniquely named canary test objects only; no existing R2 object change; no production deploy/traffic/secret/rollback/version-pin/push; no Task 2.11 checkbox change). Canary URL `https://r2-upload-signer-s0-canary.iamhuwng.workers.dev`; production URL `https://r2-upload-signer.iamhuwng.workers.dev`. Raw object keys are intentionally omitted.

Harness (temporary, removed after capture — analogous to the Packet 2N proxy/harness): a Playwright (Chromium v1208, bundled, extension-free) run drove the real Vite dev server started with `VITE_R2_UPLOAD_WORKER_URL` pointed at the canary, so the default upload endpoint resolved to the canary. The browser logged in through the app's real Firebase dev quick-login (`teacher@test.com`); the console confirmed `projectId: temp-a1437` (the canary Worker's verified project). After login, the test dynamically imported the real `/src/services/r2UploadClient.ts` and constructed `new R2UploadClient()` with ZERO options — exercising the default endpoint resolution, the default browser `fetch` (the fixed `defaultFetch` → `globalThis.fetch`), and the default `getIdToken` (real Firebase `currentUser`). No `fetch` was injected; no same-origin proxy was needed because the canary CORS policy already approves `http://localhost:5173` and a clean (extension-free) Chromium did not reproduce the Packet 2N `net::ERR_BLOCKED_BY_CLIENT` ad-block symptom.

Default-client path proof (this is the corrective result vs. the Packet 2N caveat): the captured network trace shows all three default-client calls reached the canary Worker origin and succeeded — `POST https://r2-upload-signer-s0-canary.iamhuwng.workers.dev/upload/authorize`, `PUT .../upload?grant=<opaque grant>`, and `POST .../move`. The `/upload/authorize` call is the exact request that failed in Packet 2N with `Upload authorization failed; retry` when the default client used a bare `fetch`; with the fix it succeeded (HTTP 200, not the recoverable `network_error`) in a real browser with no injected fetch. The browser-side `upload()` + `move()` returned `ok: true`.

Upload/move/content verification: a uniquely named `test_audio_temp` canary object (server-issued nonce `6054761e18729395e45aec72580272fb`, 60-byte UTF-8 payload, `audio/mpeg`) was authorized, uploaded through the Worker `/upload` endpoint, and then moved. Host-side (Node `fetch`, no browser CORS) verification of the canary-provided public R2 URL returned HTTP `200` with a byte-exact content match of the uploaded payload for the durable (moved) object. The temp source object was confirmed gone after the move (Worker deletes the source): `wrangler r2 object get` returned `The specified key does not exist.`

Cleanup proof: the durable (moved) object and the temp key were both deleted via `wrangler r2 object delete kahoot-media/<key> --remote` (`Delete complete`). Absence was then confirmed two ways for both keys — authoritative `wrangler r2 object get ... --remote` returned `The specified key does not exist.`, and a public-URL recheck returned HTTP `404`. No pre-existing R2 object was read, written, or deleted; the canary and production share bucket `kahoot-media`, and only the two uniquely nonce-named objects created by this proof were created and removed. Cleanup authority was verified before any proof object was created via an isolated `put`/`delete`/`get-not-found` probe under a throwaway `packet2nr-cleanup-authority-probe/` key, which was also removed.

Playwright result: `expected: 1, unexpected: 0, flaky: 0, skipped: 0` (one passing test). Remote version guard re-confirmed read-only after the rerun: canary `r2-upload-signer-s0-canary` still at version `627f7503-8324-45d1-8e23-cdd02828111c` (100%, created `2026-06-22T05:18:03.514Z`) and production `r2-upload-signer` still at version `20dd8429-5be1-4105-baed-f6dc5af68098` (100%, created `2026-01-26T17:27:56.516Z`) — both unchanged; no deploy, traffic change, secret mutation, rollback, or version pin occurred. The temporary Playwright harness and its report/evidence artifacts were removed after capture; the final changed-path set remains the three files listed above.

### Scope And Task State

No commit, push, production Worker deploy, canary deploy, production traffic change, secret mutation, rollback, version pin, or task checkbox change occurred during the local fix. Parent Task 2.0 remains unchecked. Tasks 2.6 through 2.10 remain checked. Tasks 2.11 through 2.15 remain unchecked. Task 2.11 was not checked.

### Playwright JSON Reporter Evidence Correction - 2026-06-23

Surviving-evidence gate: no app terminal was attached; PowerShell `ConsoleHost_history.txt` contained no Packet 2N-R Playwright command; and the surviving prior-thread record contained only the reported Playwright counts, not a terminal command/output proving `--reporter=json > report.json`. The exact required mechanism therefore could not be proven from surviving evidence, so the default-client canary proof was rerun under the existing Phase B approval.

Exact redacted PowerShell command (no credential, token, grant, signed URL, or raw object key was present):

```powershell
$env:VITE_R2_UPLOAD_WORKER_URL='https://r2-upload-signer-s0-canary.iamhuwng.workers.dev'
npx playwright test e2e/.tmp-packet2nr-default-client-canary.spec.ts --reporter=json > report.json
```

Parsed `report.json` evidence:

- Process exit code: `0`.
- Playwright stats: `expected: 1`, `unexpected: 0`, `flaky: 0`, `skipped: 0`; the one test result was `passed`.
- The browser dynamically imported the real `/src/services/r2UploadClient.ts` and executed the literal zero-option construction `new R2UploadClient()`. Parsed redacted attachment: `optionsCount: 0`, endpoint `https://r2-upload-signer-s0-canary.iamhuwng.workers.dev`, `injectedFetch: false`, `proxy: false`.
- Direct network evidence, with query/grant data omitted: `POST /upload/authorize` HTTP `200`, `PUT /upload` HTTP `200`, and `POST /move` HTTP `200`, all on the canary Worker origin. No route interception, injected `fetch`, or same-origin proxy was used.
- Upload/move/content evidence: temporary upload returned successfully, move returned successfully, and host-side fetch of the moved public object returned HTTP `200` with a byte-exact match to the unique 80-byte UTF-8 payload (payload SHA-256 `ac02098a49e8b7c75a260619188dc78edd3159b8b49986305e4313d1362e4c1d`).
- Object cleanup evidence: exactly two server-returned keys were tracked (temporary key hash `939846a9802361b4d6d761a82ce713cb14896a7929309abcc4ab4db463becd6a`; durable key hash `fa3220181cde8bc5fc688223b01c86f259965a0f3333c35d79083977bcba9ff2`; raw keys omitted). Both were deleted/checked through Wrangler `4.103.0` remote R2 commands; parsed attachment recorded `remoteAbsent: true` and public HTTP `404` for both. No existing object was listed, read, written, moved, or deleted.
- Cleanup after capture: temporary spec, `report.json`, generated `test-results` artifacts, and the Playwright-managed Vite server were removed/stopped; port `5173` had no listener. No temporary proxy or separate server file was created.
- Scope guard: no deploy, traffic change, secret mutation, rollback, version pin, push, production Worker request, taskbox change, or Phase C work occurred. Task 2.11 remains unchecked.

## Packet 2O Task 2.11 Phase C Readiness Audit - 2026-06-23

### Findings First And Verdict

Verdict: BLOCKED for Phase C production readiness.

1. Production `r2-upload-signer` still serves pre-S0 version `20dd8429-5be1-4105-baed-f6dc5af68098` at 100% from deployment `92e01212-afd4-4aae-9d72-a548f063008b`; deployment source remains `quick_editor`. `PRE_S0_VERSION_ID` is therefore `20dd8429-5be1-4105-baed-f6dc5af68098`.
2. Production remote bindings still list only `PUBLIC_URL` and `R2_BUCKET=kahoot-media`; production has no remote `UPLOAD_GRANT_SECRET`, `UPLOAD_GRANT_REPLAY_LEDGER`, `UPLOAD_RATE_LIMITER`, `FIREBASE_PROJECT_ID`, or deployed migration tag.
3. Production `cloudflare/wrangler.jsonc` still contains invalid semantic rate-limit namespace `prd0056-upload-worker-s0`; the proven canary namespace is the integer string `205511`, but production config was not edited in this packet.
4. Live Firebase Hosting `kahut1` still serves live channel version `2ca9c185ac62dd7b`, release `1780366034643000`, deployed `2026-06-02T02:07:14.643Z`. All scanned live JS chunks lack the Task 2.11 grant-client strings `/upload/authorize`, `moveGrant`, `VITE_R2_UPLOAD_WORKER_URL`, `r2-upload-signer-s0-canary`, and `r2-upload-signer.iamhuwng.workers.dev`; live Hosting is not serving the Task 2.11 authenticated grant client. The rollback target/version is still verified as `2ca9c185ac62dd7b`.
5. Canary `r2-upload-signer-s0-canary` still serves version `627f7503-8324-45d1-8e23-cdd02828111c` at 100%, source `wrangler`, with required bindings: `FIREBASE_PROJECT_ID=temp-a1437`, `PUBLIC_URL`, `R2_BUCKET=kahoot-media`, `UPLOAD_GRANT_REPLAY_LEDGER` namespace `bea9a2921503419cae45222576464679`, `UPLOAD_GRANT_SECRET` as `secret_text`, `UPLOAD_RATE_LIMITER` namespace `205511` limit 30 / period 60, and migration tag `v1-upload-grant-replay-ledger`.
6. No mutation occurred: no code/config edit outside these docs, no `cloudflare/wrangler.jsonc` edit, no remote mutation, no deploy, no secret mutation, no traffic change, no rollback/version-pin, no R2 mutation, no Firebase Hosting mutation, no commit, and no Task 2.11 checkbox change.

### Read-Only Evidence Re-Run

Start state:

1. Required HEAD verified: `73e2ef7e22112eb091456cd87370eab1c62aafc2`.
2. Required clean git status verified: branch `codex/prd-0055-task-2a-s0-worker-truth`, clean.
3. `rtk` version verified as `0.42.4`; subsequent shell commands used `rtk` after RTK instructions were loaded.

Cloudflare read-only evidence:

1. Cloudflare API `GET /accounts/{account_id}/workers/scripts/r2-upload-signer/deployments` returned the latest production deployment with source `quick_editor`, strategy `percentage`, version `20dd8429-5be1-4105-baed-f6dc5af68098` at `100`, created `2026-01-26T17:27:56.516701Z`.
2. Cloudflare API `GET /accounts/{account_id}/workers/scripts/r2-upload-signer/settings` returned exactly two production bindings: `PUBLIC_URL` and `R2_BUCKET`.
3. Cloudflare API `GET /accounts/{account_id}/workers/scripts/r2-upload-signer/secrets` returned an empty list.
4. Cloudflare API version detail for `20dd8429-5be1-4105-baed-f6dc5af68098` returned `resources.script.last_deployed_from: quick_editor`, bindings only `PUBLIC_URL` and `R2_BUCKET`, and no `script_runtime.migration_tag`.
5. Cloudflare API `GET /accounts/{account_id}/workers/scripts/r2-upload-signer-s0-canary/deployments` returned canary deployment `0e2561d1-e868-49d6-9609-2c03f3b83993`, source `wrangler`, version `627f7503-8324-45d1-8e23-cdd02828111c` at `100`, created `2026-06-22T05:18:03.514345Z`.
6. Canary version detail returned `resources.script_runtime.migration_tag: v1-upload-grant-replay-ledger`, handlers `fetch`, `UploadGrantReplayLedger`, and `createUploadWorker`, plus all required bindings listed in the verdict.

Firebase Hosting read-only evidence:

1. `.firebaserc` maps default project to `temp-a1437`; `firebase.json` maps Hosting target `kahut1` to public directory `dist`.
2. Firebase CLI `hosting:sites:list --project temp-a1437 --json` returned `kahut1` with default URL `https://kahut1.web.app`.
3. Firebase CLI internal read-only Hosting API `getChannel("-", "kahut1", "live")` returned live version `projects/171016256749/sites/kahut1/versions/2ca9c185ac62dd7b`, status `FINALIZED`, create time `2026-06-02T02:07:05.722777Z`, release type `DEPLOY`, and release time `2026-06-02T02:07:14.643Z`.
4. Live page `https://kahut1.web.app/` referenced entry `/assets/index-ClAUP6nO.js`; scanning that entry plus 75 referenced JS chunks found zero occurrences of `/upload/authorize`, `moveGrant`, `VITE_R2_UPLOAD_WORKER_URL`, `r2-upload-signer-s0-canary`, `r2-upload-signer.iamhuwng.workers.dev`, `?filename=`, `sourceKey`, `destKey`, `Upload authorization failed; retry`, or `Unsupported temporary R2 upload folder`.

Local config evidence:

1. `cloudflare/wrangler.jsonc` still names production Worker `r2-upload-signer`, has `UPLOAD_RATE_LIMITER.namespace_id` set to `prd0056-upload-worker-s0`, has the `UPLOAD_GRANT_REPLAY_LEDGER` binding, and has migration tag `v1-upload-grant-replay-ledger`.
2. `cloudflare/wrangler.canary.jsonc` still names canary Worker `r2-upload-signer-s0-canary`, uses `UPLOAD_RATE_LIMITER.namespace_id` `205511`, and has the same replay-ledger migration tag.
3. `cloudflare/package.json` still records production commands `deploy`, `deployed-status`, `version-list`, `version-pin`, and `rollback`.

### Exact Blockers

1. Production Worker lacks required remote prerequisites: `UPLOAD_GRANT_SECRET`, `UPLOAD_GRANT_REPLAY_LEDGER`, `UPLOAD_RATE_LIMITER`, `FIREBASE_PROJECT_ID`, and migration tag `v1-upload-grant-replay-ledger`.
2. Production `cloudflare/wrangler.jsonc` cannot be deployed safely as-is because `UPLOAD_RATE_LIMITER.namespace_id` is still the semantic string `prd0056-upload-worker-s0`; canary already proved Cloudflare requires a positive integer string.
3. Live Firebase Hosting still serves the pre-Task-2.11 browser artifact; it is not serving the authenticated grant client. A production Worker-only switch would strand live browser clients on the wrong contract.
4. Production rollout and rollback commands are only recorded for later approval; no production deploy, production browser build, version-pin, rollback drill, or final S0 acceptance proof has run.

### Option A Production Rollout Order

This order is recorded for later approval only and was not executed.

1. Record pre-change guards: historical pre-migration `PRE_S0_VERSION_ID=20dd8429-5be1-4105-baed-f6dc5af68098`; `PRE_S0_HOSTING_VERSION_ID=2ca9c185ac62dd7b`; confirm production Worker and Hosting still match those IDs immediately before mutation. Packet 2R later proves the Worker ID invalid as a current rollback target after migration `v1-upload-grant-replay-ledger`; the Hosting ID remains separate.
2. Production config prep gate: edit `cloudflare/wrangler.jsonc` only after explicit approval to replace `UPLOAD_RATE_LIMITER.namespace_id` with the production integer namespace; keep `R2_BUCKET`, `PUBLIC_URL`, `FIREBASE_PROJECT_ID`, `UPLOAD_GRANT_REPLAY_LEDGER`, and migration tag aligned with the canary-proven shape.
3. Run local and dry-run proof using bundled Windows x64 Node; do not proceed unless production dry-run lists all required bindings and the Worker/hardened/baseline suites stay green.
4. Provision production `UPLOAD_GRANT_SECRET` only after explicit secret-mutation approval; do not print or store the secret value.
5. Deploy the production Worker from checked-in Wrangler config in the approved window.
6. Deploy the production Firebase Hosting build that serves the Task 2.11 authenticated grant client.
7. Immediately run deployed negative probes and one authorized production upload/move proof without logging tokens, grants, signed URLs, raw keys, or audio bytes.
8. If any denial, upload/move, log-secrecy, binding, Hosting, or browser proof fails, roll back Worker to `PRE_S0_VERSION_ID` and Hosting to `PRE_S0_HOSTING_VERSION_ID`, then verify both versions and no R2 object loss.
9. Only after deployed proof, rollback proof, version-pin proof, final S0 acceptance, and independent review pass may Task 2.11 be considered for checking.

### Exact Later Approval Texts

Production config prep approval:

```text
Approve PRD-0055 Task 2.11 Phase C production config prep only: edit cloudflare/wrangler.jsonc to replace UPLOAD_RATE_LIMITER.namespace_id with the approved production integer namespace, run local/dry-run verification, and record evidence. No production deploy, no traffic change, no secret mutation, no R2 mutation, no Firebase Hosting mutation, no rollback, no version pin, no push, and no Task 2.11 checkbox change.
```

Production rollout approval:

```text
Approve PRD-0055 Task 2.11 Phase C production rollout only: allow production r2-upload-signer secret provisioning, Wrangler deploy, Firebase Hosting deploy, deployed negative probes, and one authorized production upload/move proof under the recorded Option A order. No unrelated code/config edits, no existing R2 object mutation, no rollback unless a stop condition triggers, no version pin except the recorded rollback plan, no push, and no Task 2.11 checkbox change until all required proof passes.
```

Rollback/version-pin approval:

```text
Approve PRD-0055 Task 2.11 rollback/version-pin only: if a recorded stop condition triggers, roll back r2-upload-signer to PRE_S0_VERSION_ID 20dd8429-5be1-4105-baed-f6dc5af68098, restore Firebase Hosting live to version 2ca9c185ac62dd7b, verify both versions and no R2 object loss, and record evidence. No new deploy beyond the rollback/version-pin actions, no secret mutation, no unrelated R2 mutation, no push, and no Task 2.11 checkbox change.
```

### Exact Later Mutation Commands (Redacted, Not Run)

These command shapes are for the later approved packet only. Secret value, grant, token, signed URL, and raw object key values remain redacted.

```powershell
# Production config prep, after approval only:
# edit cloudflare/wrangler.jsonc:
#   UPLOAD_RATE_LIMITER.namespace_id = "<PRODUCTION_INTEGER_NAMESPACE_ID>"

# Production read-only guard, immediately before mutation:
wrangler deployments status --name r2-upload-signer --json
wrangler versions list --name r2-upload-signer --json
wrangler versions view 20dd8429-5be1-4105-baed-f6dc5af68098 --name r2-upload-signer --json
node node_modules/firebase-tools/lib/bin/firebase.js hosting:sites:list --project temp-a1437 --json

# Production secret mutation, after explicit secret approval only:
"<UPLOAD_GRANT_SECRET_REDACTED>" | wrangler secret put UPLOAD_GRANT_SECRET --name r2-upload-signer --config cloudflare/wrangler.jsonc

# Production Worker deploy, after explicit rollout approval only:
wrangler deploy --config cloudflare/wrangler.jsonc --message "PRD-0055 Task 2.11 Phase C production rollout"

# Production Firebase Hosting deploy, after explicit rollout approval only:
npm run build
node node_modules/firebase-tools/lib/bin/firebase.js deploy --only hosting:kahut1 --project temp-a1437

# Worker rollback, after stop-condition approval or pre-approved stop trigger only:
wrangler rollback 20dd8429-5be1-4105-baed-f6dc5af68098 --name r2-upload-signer --message "Rollback PRD-0056 S0 upload-worker hardening" --yes

# Worker version pin, after rollback/version-pin approval only:
wrangler versions deploy 20dd8429-5be1-4105-baed-f6dc5af68098@100% --name r2-upload-signer --message "Pin PRD-0056 rollback to pre-S0 version" --yes

# Firebase Hosting rollback, after rollback approval only:
node node_modules/firebase-tools/lib/bin/firebase.js hosting:clone kahut1@2ca9c185ac62dd7b kahut1:live --project temp-a1437
```

### Scope And Task State

No mutation occurred in this packet. The only intended changes are docs-only evidence updates in the parent findings ledger, child PRD, parent tasklist text, and traceability registry.

Taskboxes unchanged: parent Task 2.0 remains unchecked; Tasks 2.6 through 2.10 remain checked; Tasks 2.11 through 2.15 remain unchecked. Task 2.11 is not checked.

## Packet 2P Task 2.11 Phase C Production Config Prep - 2026-06-23

### Approval And Verdict

Approval scope: User response: `"Approve PRD-0055 Task 2.11 Phase C production config prep only: set cloudflare/wrangler.jsonc UPLOAD_RATE_LIMITER.namespace_id to dedicated production integer 205512, run local and dry-run verification, and record evidence. No production deploy, traffic change, secret mutation, R2 mutation, Firebase Hosting mutation, rollback, version pin, push, or Task 2.11 checkbox change."`

Verdict: PASS for production config prep only.

Start state was clean at HEAD `7a134da0e31e8ec5fc34ba97d51c5a6c81ed9124` on branch `codex/prd-0055-task-2a-s0-worker-truth`. Production config changed only `UPLOAD_RATE_LIMITER.namespace_id` from `prd0056-upload-worker-s0` to dedicated positive integer string `205512`. Worker name `r2-upload-signer` and rate policy 30 requests per 60 seconds remain unchanged.

### Local And Dry-Run Evidence

All Cloudflare commands used bundled Windows x64 Node `v24.14.0`; Wrangler version was `4.103.0`.

1. Static config assertion parsed `cloudflare/wrangler.jsonc`, selected binding `UPLOAD_RATE_LIMITER`, required exact namespace `205512`, required a positive digits-only string, and returned `{"worker":"r2-upload-signer","binding":"UPLOAD_RATE_LIMITER","namespace_id":"205512","limit":30,"period":60}`.
2. Full Worker suite: seven files, 129/129 tests.
3. Hardened negative runner: 22/22.
4. Insecure baseline: exact fixture SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; 18 expected RED failures and four already-safe passes.
5. Production `wrangler deploy --dry-run`: total upload 76.71 KiB / gzip 17.75 KiB; listed `UPLOAD_GRANT_REPLAY_LEDGER`, `R2_BUCKET=kahoot-media`, `UPLOAD_RATE_LIMITER` at 30 requests/60s, `PUBLIC_URL`, and `FIREBASE_PROJECT_ID=temp-a1437`; then printed `--dry-run: exiting now.` and exited zero.

### Scope And Remaining Gates

No production deploy, traffic change, secret mutation, R2 mutation, Firebase Hosting mutation, rollback, version pin, push, remote-state mutation, or Task 2.11 checkbox change occurred.

Production secret provisioning and coordinated Worker/Hosting rollout remain separately gated. Deployed negative probes, one authorized production upload/move proof, rollback/version-pin proof, final S0 acceptance, and independent review remain incomplete. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.10 remain checked; Tasks 2.11 through 2.15 remain unchecked.

## Packet 2Q Task 2.11 Phase C Bridge Rollout Closure - 2026-06-23

Findings-first verdict: PASS.

Start gates passed: HEAD was exact `15cd3bb6c3f0e9430106a518cfff8b2e74aaddb4`, `git status --short --branch` was clean before docs edits, and closure performed no deploy, push, rollback, version pin, traffic change, secret mutation, R2 object mutation, or browser/R2 proof rerun.

Firebase OAuth token exposure containment passed. The prior Firebase CLI `login:list --json` output is treated as credential exposure. `firebase logout iamhuwng@gmail.com` returned `Logged out from iamhuwng@gmail.com`; `firebase login:list` then returned `No authorized accounts, run "firebase login"`; and `firebase projects:list` failed with `Failed to authenticate, have you run firebase login?`. No token values are recorded.

Read-only closure evidence passed:

1. Production Worker active deployment is `ac27c148-3c36-4bd2-a4f9-69608d27768e`.
2. Production Worker active version is `11af545a-479b-4063-a899-d475dd57d2b5` at 100%.
3. Version view lists `R2_BUCKET=kahoot-media`, `FIREBASE_PROJECT_ID=temp-a1437`, `UPLOAD_GRANT_SECRET` as `secret_text`, `UPLOAD_GRANT_REPLAY_LEDGER` namespace `6653df5f663d4648992dc26bd099b489`, `UPLOAD_RATE_LIMITER` namespace `205512` with limit 30 / period 60, and migration tag `v1-upload-grant-replay-ledger`.
4. Production Hosting live version is recorded from rollout evidence as `05cb152a2932b261`.
5. Live asset fetch from `https://kahut1.web.app/assets/r2Storage-CKACZQeH.js` returned HTTP 200, contained `https://r2-upload-signer.iamhuwng.workers.dev`, and did not contain `https://r2-upload-signer-s0-canary.iamhuwng.workers.dev`.
6. Historical rollback targets were captured as Worker `20dd8429-5be1-4105-baed-f6dc5af68098`, Hosting pre-S0 `2ca9c185ac62dd7b`, and safe canary Hosting `485aefde01ee7133`. Packet 2R later supersedes the Worker target as invalid after the S0 Durable Object migration; the Hosting targets remain separate and do not solve Worker DO migration rollback.

Prior rollout proof accepted for closure:

1. Live Hosting was first bridged to proven canary Worker and captured `SAFE_CANARY_HOSTING_VERSION_ID=485aefde01ee7133`.
2. Canary authorized browser upload/move/content proof passed and cleanup verified source/destination 404.
3. Production `UPLOAD_GRANT_SECRET` was set by name only; secret value was not printed or recorded.
4. Non-versioned production Worker deploy applied migration `v1-upload-grant-replay-ledger` with rate namespace `205512`.
5. Live Hosting was redeployed to the production Worker endpoint.
6. Deployed negative probes passed: evil-origin preflight 403, no-auth authorize 401, invalid-grant upload 403.
7. Authorized production browser upload/move/content proof passed from live Hosting to `https://r2-upload-signer.iamhuwng.workers.dev`; proof ID `prd0055-phase-c-prod-1782210318093-68018af50b77cc42`; authorize/upload/move/public-content all 200; content SHA-256 `9e82ef3494053b8d0c7b01f952b30cbe6273141d6812a29bd973a0a76101a009` matched.
8. Cleanup deleted only the unique production proof object and verified source/destination 404.
9. Rollback was not triggered.

Verifier and verification outcome: Task 2.11 is checked because Phase C bridge rollout reached live canary proof, production Worker binding/migration proof, production Hosting proof, deployed negative probes, authorized production browser upload/move/content proof, proof-object cleanup, rollback target capture, and Firebase token-exposure containment. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.11 are checked; Tasks 2.12 through 2.15 remain unchecked.

## Packet 2R Task 2.12 Corrective Rollback Blocker - 2026-06-23

### Findings First And Verdict

Verdict: BLOCKED for Task 2.12 rollback/version-pin drill.

1. Pre-check production Worker active deployment was `ac27c148-3c36-4bd2-a4f9-69608d27768e`; active version was `11af545a-479b-4063-a899-d475dd57d2b5` at `100%`.
2. Attempted rollback target was the recorded pre-S0 Worker version `20dd8429-5be1-4105-baed-f6dc5af68098`.
3. Cloudflare rejected the rollback with API code `10210`. Exact meaning: target version `20dd8429-5be1-4105-baed-f6dc5af68098` cannot be deployed because its Durable Object migration resource state is empty while the current deployment uses migration `v1-upload-grant-replay-ledger`.
4. Post-failure production Worker active deployment remained `ac27c148-3c36-4bd2-a4f9-69608d27768e`; active version remained `11af545a-479b-4063-a899-d475dd57d2b5` at `100%`.
5. Worker version `20dd8429-5be1-4105-baed-f6dc5af68098` is invalid as a current Worker rollback/version-pin target after the S0 Durable Object migration. It remains historical pre-S0 evidence only.
6. Firebase Hosting rollback targets remain separately recorded: pre-S0 Hosting `2ca9c185ac62dd7b` and safe canary Hosting `485aefde01ee7133`. They do not solve Worker rollback when Cloudflare rejects the Worker target for Durable Object migration incompatibility.
7. Required next architecture decision before Task 2.12 can pass: define a rollback-compatible S0 recovery strategy. Candidate to evaluate next, not implement here: create a rollback-compatible recovery Worker version from current S0 code/config with the same Durable Object migration shape; prove it can be deployed/activated and restored without crossing the DO migration boundary; use that as the post-migration rollback target.

### Corrective Packet Scope

Start gates passed: HEAD was exact `24a575fff000c315958383d6859097245db50551`; `git status --short` was clean before docs edits.

No deploy, push, rollback, version-pin, secret mutation, R2 object mutation, Firebase Hosting mutation, traffic change, source/config edit, or Task 2.12 checkbox change occurred in this corrective packet.

Task state: unchanged. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.11 remain checked; Task 2.12 remains unchecked; Tasks 2.13 through 2.15 remain unchecked.

## Packet 2T Task 2.12 Recovery-Version Creation - 2026-06-25

### Findings First And Verdict

Verdict: PASS for recovery-version creation only; Task 2.12 remains unchecked because no recovery activation/restoration drill has run.

Approval scope: User response: `"Approve PRD-0055 Task 2.12 recovery-version creation only: create or identify a rollback-compatible S0 Worker recovery version for r2-upload-signer using the same S0 code/config contract, Durable Object migration tag v1-upload-grant-replay-ledger, and required bindings as the current production S0 Worker. Allow only non-traffic-changing Cloudflare Worker version creation/inspection if needed. No traffic change, rollback, version-pin activation, secret value mutation, R2 object mutation, Firebase Hosting mutation, push, source/config edit beyond the explicitly reviewed recovery packet, or Task 2.12 checkbox change."`

1. Pre-action repo state had HEAD `0406403b433014e12d9864a24321659b8b590183`; dirty paths were docs-only Packet 2S files. No source/config files were dirty or edited.
2. Pre-action read-only production status listed active deployment `ac27c148-3c36-4bd2-a4f9-69608d27768e`, version `11af545a-479b-4063-a899-d475dd57d2b5`, `100%` traffic.
3. Pre-action `wrangler versions list --name r2-upload-signer --json` listed versions 1 through 8 only; no existing separate post-migration recovery version was available beyond the active S0 version.
4. Dry-run command `wrangler versions upload --config wrangler.jsonc --message "PRD-0055 Task 2.12 rollback-compatible S0 recovery version" --dry-run` exited zero, uploaded nothing, and listed `UPLOAD_GRANT_REPLAY_LEDGER`, `R2_BUCKET=kahoot-media`, `UPLOAD_RATE_LIMITER` at 30 requests / 60 seconds, `PUBLIC_URL`, and `FIREBASE_PROJECT_ID=temp-a1437`.
5. Non-traffic-changing version creation command `wrangler versions upload --config wrangler.jsonc --message "PRD-0055 Task 2.12 rollback-compatible S0 recovery version"` created Worker version `959065cd-8399-4000-b479-d8303a2f18ad`.
6. Version view for `959065cd-8399-4000-b479-d8303a2f18ad` proves it is rollback-compatible with current S0: number `9`, source `wrangler`, message `PRD-0055 Task 2.12 rollback-compatible S0 recovery version`, trigger `version_upload`, script ETag `1917ab1452372e37dec12a27e91043244237971c9aaf2b0366d13ae86dca972e`, migration tag `v1-upload-grant-replay-ledger`, handlers `fetch`, `UploadGrantReplayLedger`, and `createUploadWorker`, plus bindings `FIREBASE_PROJECT_ID=temp-a1437`, `PUBLIC_URL`, `R2_BUCKET=kahoot-media`, `UPLOAD_GRANT_REPLAY_LEDGER` namespace `6653df5f663d4648992dc26bd099b489`, `UPLOAD_GRANT_SECRET` as `secret_text`, and `UPLOAD_RATE_LIMITER` namespace `205512` at 30 requests / 60 seconds.
7. Post-action `wrangler deployments status --name r2-upload-signer --json` still listed active deployment `ac27c148-3c36-4bd2-a4f9-69608d27768e`, version `11af545a-479b-4063-a899-d475dd57d2b5`, `100%` traffic. Version `959065cd-8399-4000-b479-d8303a2f18ad` is not active.
8. Post-action `wrangler versions list --name r2-upload-signer --json` lists version `959065cd-8399-4000-b479-d8303a2f18ad` as version number `9`.

### Remaining Gate

Task 2.12 cannot be checked until a later approved recovery drill activates `959065cd-8399-4000-b479-d8303a2f18ad` to `100%`, verifies active deployment/version, restores `11af545a-479b-4063-a899-d475dd57d2b5` to `100%`, verifies active deployment/version, and records no-object-loss proof.

Next approval text:

```text
Approve PRD-0055 Task 2.12 post-migration recovery drill only: activate rollback-compatible S0 recovery Worker version 959065cd-8399-4000-b479-d8303a2f18ad for r2-upload-signer to 100% traffic, verify active deployment/version, then restore hardened S0 production Worker version 11af545a-479b-4063-a899-d475dd57d2b5 to 100% traffic and verify active deployment/version. Do not deploy new code, mutate secrets, mutate R2 objects, mutate Firebase Hosting, push, use pre-S0 Worker version 20dd8429-5be1-4105-baed-f6dc5af68098, or check Task 2.12 unless both activation and restoration verify and required no-object-loss proof is recorded.
```

Scope boundary: no deploy, push, rollback, version-pin activation, secret mutation, R2 object mutation, Firebase Hosting mutation, traffic change, source/config edit, or Task 2.12 checkbox change occurred in this packet.

Task state: unchanged. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.11 remain checked; Task 2.12 remains unchecked; Tasks 2.13 through 2.15 remain unchecked.

## Packet 2S Task 2.12 Post-Migration Recovery Strategy Design - 2026-06-25

### Findings First And Verdict

Verdict: DESIGN RECORDED; Task 2.12 remains BLOCKED until the strategy is implemented and drilled under later explicit approval.

1. Current valid base was verified before docs edits: HEAD `0406403b433014e12d9864a24321659b8b590183`; `git status --short` clean.
2. Read-only production Worker status re-confirmed `r2-upload-signer` active deployment `ac27c148-3c36-4bd2-a4f9-69608d27768e`, active version `11af545a-479b-4063-a899-d475dd57d2b5`, `100%` traffic.
3. Read-only version view for `11af545a-479b-4063-a899-d475dd57d2b5` confirmed source `wrangler`, script ETag `1917ab1452372e37dec12a27e91043244237971c9aaf2b0366d13ae86dca972e`, migration tag `v1-upload-grant-replay-ledger`, named handler `UploadGrantReplayLedger`, `R2_BUCKET=kahoot-media`, `FIREBASE_PROJECT_ID=temp-a1437`, `UPLOAD_GRANT_SECRET` as `secret_text`, `UPLOAD_GRANT_REPLAY_LEDGER` namespace `6653df5f663d4648992dc26bd099b489`, and `UPLOAD_RATE_LIMITER` namespace `205512` with limit 30 / period 60.
4. Cloudflare rollback documentation matches the observed `10210` blocker: rollback is not allowed when a Durable Object migration occurred between the active version and selected target. Therefore pre-S0 Worker version `20dd8429-5be1-4105-baed-f6dc5af68098` is invalid after migration `v1-upload-grant-replay-ledger` and remains historical evidence only.
5. Firebase Hosting rollback targets stay separate: pre-S0 Hosting `2ca9c185ac62dd7b` and safe canary Hosting `485aefde01ee7133` may be relevant to browser artifact recovery, but they cannot repair Worker Durable Object migration incompatibility.

### Design Decision

Decision: Task 2.12 must use a post-migration S0 recovery Worker version, not the pre-S0 Worker version, as the current rollback target.

Required recovery-version shape:

1. Same Worker name: `r2-upload-signer`.
2. Same Durable Object migration shape: migration tag `v1-upload-grant-replay-ledger`; no migration removal, rename, rollback, or new class migration in the recovery target.
3. Same required resource bindings by name and shape: `R2_BUCKET=kahoot-media`, `PUBLIC_URL`, `FIREBASE_PROJECT_ID=temp-a1437`, `UPLOAD_GRANT_SECRET` as secret binding, `UPLOAD_GRANT_REPLAY_LEDGER` Durable Object namespace, and `UPLOAD_RATE_LIMITER` namespace `205512` at 30 requests / 60 seconds.
4. Same S0 security contract: Firebase auth, exact CORS, canonical path authority, HMAC grants, replay ledger, rate limit, size/content checks, and no browser raw-key authority.
5. Difference from active S0 must be intentionally minimal and reviewable. Preferred difference is a no-op recovery build from the same approved S0 source/config or a narrowly documented operational recovery patch that does not change storage authority, data shape, bindings, Durable Object migration, or browser contract.

Required drill proof before Task 2.12 can be checked:

1. Create or identify a deployable recovery S0 Worker version whose `versions view` proves the same Durable Object migration/resource shape as active S0.
2. Activate the recovery S0 version to `100%` using Wrangler version deployment or rollback only after explicit approval.
3. Verify active deployment/version is the recovery S0 version at `100%`.
4. Restore active traffic to the known-good current S0 version `11af545a-479b-4063-a899-d475dd57d2b5` at `100%`.
5. Verify active deployment/version is again `11af545a-479b-4063-a899-d475dd57d2b5` at `100%`.
6. Run deployed negative probes and one authorized upload/move proof only if separately approved for the drill window; otherwise record that traffic activation proof is incomplete.
7. Prove no R2 object loss, no Firebase Hosting mutation, no secret value exposure, and no crossing of the pre-S0 Durable Object migration boundary.

Non-options:

1. Do not use Worker version `20dd8429-5be1-4105-baed-f6dc5af68098` as a current rollback target after migration `v1-upload-grant-replay-ledger`.
2. Do not treat Firebase Hosting rollback as a Worker rollback.
3. Do not remove or downgrade the Durable Object migration to make the pre-S0 target deployable.
4. Do not check Task 2.12 until both recovery activation and restoration to the current S0 version verify.

### Exact Later Approval Text

Recovery-version creation approval:

```text
Approve PRD-0055 Task 2.12 recovery-version creation only: create or identify a rollback-compatible S0 Worker recovery version for r2-upload-signer using the same S0 code/config contract, Durable Object migration tag v1-upload-grant-replay-ledger, and required bindings as the current production S0 Worker. Allow only non-traffic-changing Cloudflare Worker version creation/inspection if needed. No traffic change, rollback, version-pin activation, secret value mutation, R2 object mutation, Firebase Hosting mutation, push, source/config edit beyond the explicitly reviewed recovery packet, or Task 2.12 checkbox change.
```

Recovery drill approval:

```text
Approve PRD-0055 Task 2.12 post-migration recovery drill only: activate the approved rollback-compatible S0 recovery Worker version for r2-upload-signer to 100% traffic, verify active deployment/version, then restore hardened S0 production Worker version 11af545a-479b-4063-a899-d475dd57d2b5 to 100% traffic and verify active deployment/version. Do not deploy new code, mutate secrets, mutate R2 objects, mutate Firebase Hosting, push, use pre-S0 Worker version 20dd8429-5be1-4105-baed-f6dc5af68098, or check Task 2.12 unless both activation and restoration verify and required no-object-loss proof is recorded.
```

Optional deployed behavior proof approval:

```text
Approve PRD-0055 Task 2.12 deployed behavior proof only: after the post-migration recovery drill restores hardened S0 version 11af545a-479b-4063-a899-d475dd57d2b5 to 100% traffic, run deployed negative probes and one authorized upload/move proof against r2-upload-signer to confirm the restored S0 security contract. Use unique proof objects only, clean them up, verify 404 after cleanup, do not mutate existing R2 objects, do not mutate secrets, do not mutate Firebase Hosting, do not push, and do not check Task 2.12 unless all recovery and behavior proof passes.
```

### Scope And Task State

No deploy, push, rollback, version-pin, secret mutation, R2 mutation, Firebase Hosting mutation, traffic change, source/config edit, or Task 2.12 checkbox change occurred in this packet.

Task state: unchanged. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.11 remain checked; Task 2.12 remains unchecked; Tasks 2.13 through 2.15 remain unchecked.

## Packet 2U Task 2.12 Post-Migration Recovery Drill - 2026-06-25

### Findings First And Verdict

Verdict: PASS for Task 2.12 rollback/version-pin drill.

Approval scope: User response: `"Execute PRD-0055 Task 2.12 rollback/version-pin drill and checkpoint in one run. Approved mutation: Activate recovery Worker version 959065cd-8399-4000-b479-d8303a2f18ad at 100% for r2-upload-signer. Verify active version and required bindings. Restore hardened production Worker version 11af545a-479b-4063-a899-d475dd57d2b5 at 100%. Verify active version and required bindings. Do not deploy new Worker code. Do not deploy Firebase Hosting. Do not mutate secrets. Do not mutate R2 objects. Do not change Firebase auth. Do not push."`

1. Hard gates passed before mutation: `git rev-parse HEAD` returned `a463a02ec6fd82e0e6af32999598c919d5929d39`; `git status --short` was clean.
2. Wrangler was run through bundled Windows x64 Node; `wrangler --version` returned `4.103.0`.
3. Active version before drill was deployment `ac27c148-3c36-4bd2-a4f9-69608d27768e`, Worker version `11af545a-479b-4063-a899-d475dd57d2b5`, `100%` traffic.
4. Pre-drill version views for `959065cd-8399-4000-b479-d8303a2f18ad` and `11af545a-479b-4063-a899-d475dd57d2b5` both proved the required S0 shape: source `wrangler`, script ETag `1917ab1452372e37dec12a27e91043244237971c9aaf2b0366d13ae86dca972e`, migration tag `v1-upload-grant-replay-ledger`, handlers `fetch`, `UploadGrantReplayLedger`, and `createUploadWorker`, `FIREBASE_PROJECT_ID=temp-a1437`, `PUBLIC_URL`, `R2_BUCKET=kahoot-media`, `UPLOAD_GRANT_REPLAY_LEDGER` namespace `6653df5f663d4648992dc26bd099b489`, `UPLOAD_GRANT_SECRET` as `secret_text`, and `UPLOAD_RATE_LIMITER` namespace `205512` with limit 30 / period 60.
5. Recovery activation command `wrangler versions deploy 959065cd-8399-4000-b479-d8303a2f18ad@100% --name r2-upload-signer --message "PRD-0055 Task 2.12 activate rollback-compatible recovery version" --yes` exited zero. Wrangler reported `No non-versioned settings to sync. Skipping...` and deployed version `959065cd-8399-4000-b479-d8303a2f18ad` at `100%`.
6. Recovery verification returned active deployment `5678c2c5-eaf0-4851-a01a-8e8481f9a72a`, Worker version `959065cd-8399-4000-b479-d8303a2f18ad`, `100%` traffic, and the same required bindings/migration listed above.
7. Restore command `wrangler versions deploy 11af545a-479b-4063-a899-d475dd57d2b5@100% --name r2-upload-signer --message "PRD-0055 Task 2.12 restore hardened production version" --yes` exited zero. Wrangler reported `No non-versioned settings to sync. Skipping...` and deployed version `11af545a-479b-4063-a899-d475dd57d2b5` at `100%`.
8. Final restore verification returned active deployment `0c0bca87-6bca-4a42-934d-509299b7e3c9`, Worker version `11af545a-479b-4063-a899-d475dd57d2b5`, `100%` traffic, and the same required bindings/migration listed above.
9. No-object-loss proof is by mutation surface for this approved drill: only `wrangler deployments status`, `wrangler versions view`, and `wrangler versions deploy <version>@100%` were executed against Cloudflare. No Worker code deploy, Firebase Hosting deploy, secret mutation command, R2 object command, upload/move/delete browser proof, Firebase auth command, or push occurred. The Worker route that can upload/move objects was not invoked during the drill, and Wrangler reported no non-versioned settings sync during both traffic changes.

Task state: Task 2.12 is checked by this recovery drill. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.12 are checked; Tasks 2.13 through 2.15 remain unchecked.

## Packet 2V Task 2.13 Deployed Behavior Documentation Closeout - 2026-06-25

### Findings First And Verdict

Verdict: PASS for Task 2.13 documentation-only closeout.

Scope boundary: Task 2.13 only. No independent review was started. No Worker code deploy, Worker version traffic change, Firebase Hosting deploy, secret mutation, R2 object command, Firebase auth mutation, source/config edit, push, Task 2.14, or Task 2.15 work occurred.

Read-only remote truth used:

1. Hard gates passed before docs edits: `git rev-parse HEAD` returned `57d3f42aa7dee62b52d9932f568df4630b397b5e`; `git status --short` was clean.
2. Wrangler ran read-only through bundled Windows x64 Node after ambient `npx wrangler` and ARM Node failed on local tool resolution/platform. `wrangler --version` returned `4.103.0`.
3. `wrangler deployments status` returned current production deployment created `2026-06-25T14:09:27.953Z`, author `iamhuwng@gmail.com`, source `Unknown (deployment)`, message `PRD-0055 Task 2.12 restore hardened production version`, and version `11af545a-479b-4063-a899-d475dd57d2b5` at `100%`.
4. `wrangler deployments list` showed the Task 2.12 recovery activation immediately before restore: deployment created `2026-06-25T14:09:07.172Z`, message `PRD-0055 Task 2.12 activate rollback-compatible recovery version`, version `959065cd-8399-4000-b479-d8303a2f18ad` at `100%`; then restore deployment created `2026-06-25T14:09:27.953Z`, version `11af545a-479b-4063-a899-d475dd57d2b5` at `100%`.
5. `wrangler versions view 11af545a-479b-4063-a899-d475dd57d2b5` confirmed handlers `fetch`, compatibility date `2026-01-20`, secret binding `UPLOAD_GRANT_SECRET`, Durable Object binding `UPLOAD_GRANT_REPLAY_LEDGER`, `R2_BUCKET=kahoot-media`, `UPLOAD_RATE_LIMITER` at 30 requests / 60 seconds, `FIREBASE_PROJECT_ID=temp-a1437`, and `PUBLIC_URL`.
6. `wrangler versions view 959065cd-8399-4000-b479-d8303a2f18ad` confirmed the same required S0 binding shape as the active hardened version.
7. `wrangler versions view 20dd8429-5be1-4105-baed-f6dc5af68098` confirmed the historical pre-S0 version has only `R2_BUCKET=kahoot-media` and `PUBLIC_URL`; it lacks `UPLOAD_GRANT_SECRET`, `UPLOAD_GRANT_REPLAY_LEDGER`, `UPLOAD_RATE_LIMITER`, and `FIREBASE_PROJECT_ID`, so it remains invalid as a current Worker rollback target after Durable Object migration `v1-upload-grant-replay-ledger`.

### Documentation Updates

1. `documentation/architecture/upload-storage-authority.md` now separates proven deployed S0 upload/move authorization from remaining lifecycle work. It records active version `11af545a-479b-4063-a899-d475dd57d2b5`, recovery version `959065cd-8399-4000-b479-d8303a2f18ad`, invalid pre-S0 rollback target `20dd8429-5be1-4105-baed-f6dc5af68098`, required active bindings, and remaining registry/delete/lifecycle gaps.
2. `documentation/ielts-reading-v2-listening-unification-implementation-log.md` now has a Task 2.13 addendum linking the shared-assessment history to the current upload-worker docs closeout without changing historical patch records.
3. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` now records Packet 2V under `EV-0056` and updates status wording while preserving the 503/503 matrix and 14-node/21-edge DAG claims.
4. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` now checks Task 2.13 only. Parent Task 2.0 remains unchecked; Tasks 2.14 and 2.15 remain unchecked.
5. This findings packet appends the Task 2.13 evidence and does not rewrite Packets 2R through 2U.

### Remaining Lifecycle Gaps

1. Registry-backed asset commit/reference tracking, `pending-delete`, retained-reference rechecks, durable cleanup batching, rollback grace rules, and orphan metrics remain future PRD-0058 / Task 4 work.
2. Trusted delete/cleanup authority remains unimplemented and must not grant browser code raw key deletion authority.
3. Checked-in prefix-scoped R2 temp lifecycle configuration remains unimplemented.
4. Backup/restore coverage, cleanup reconciliation, and deployed proof for lifecycle behavior remain future gates.
5. Independent review Task 2.14 and parent acceptance Task 2.15 remain pending; parent Task 2.0 remains unchecked.

Task state: Task 2.13 is checked by this docs-only packet. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.13 are checked; Tasks 2.14 and 2.15 remain unchecked.

## Packet 2W Task 2.14 Fresh-Context Independent Verification - 2026-06-25

### Findings First And Verdict

Verdict: PASS for Task 2.14 mandatory fresh-context independent verification.

Findings: none.

Scope boundary: Task 2.14 only. No deploy, Worker traffic mutation, secret mutation, R2 object command, Firebase Hosting mutation, Firebase auth mutation, source/config edit, push, Task 2.15 work, or parent Task 2.0 acceptance occurred.

### Hard Gates

1. `git rev-parse HEAD` returned `3d5d06cd4552769f423ba24d4aec7e24fd5b1fb9`.
2. `git status --short` was clean before review.
3. Task 2.14 review used read-only local inspection plus local test execution only.

### Independent Review Coverage

Independent reviewer result: CLEAN.

1. S0 child-PRD coverage: reviewer inspected the parent tasklist and traceability state and confirmed Task 2.13 was docs-only while Tasks 2.14 and 2.15 were still open before this packet.
2. Worker diff after Task 2.13: `git show --stat --name-only --oneline --no-renames HEAD` and `git diff --name-only HEAD^ HEAD` showed only the five Task 2.13 documentation files, with no `cloudflare/**` runtime changes in Task 2.13.
3. Authorization boundaries and raw-key non-authority: reviewer inspected `cloudflare/worker.js`, `cloudflare/src/upload-worker/request-handlers.js`, and `cloudflare/src/upload-worker/path-authority.js`; upload and move go through verified UID, opaque grant, and canonical key, while raw `key`, `sourceKey`, and `destKey` are only non-authoritative assertions.
4. CORS: reviewer inspected integrated and harness tests proving exact approved origins and no wildcard CORS.
5. Grants, replay ledger, and rate limits: reviewer inspected `grant-authority.js`, `replay-authority.js`, `upload-grant-replay-ledger.js`, and S0 PRD rate-limit requirements; grants bind UID, operation kind, key, size, content type, expiry, and nonce; replay protection fails closed; rate key uses verified UID plus client IP class.
6. Deployed proof, rollback drill, and Task 2.13 docs truth: reviewer inspected Packet 2V findings, upload-storage authority, and implementation log; active version remains `11af545a-479b-4063-a899-d475dd57d2b5`, recovery version remains `959065cd-8399-4000-b479-d8303a2f18ad`, and pre-S0 version `20dd8429-5be1-4105-baed-f6dc5af68098` remains historical only after Durable Object migration `v1-upload-grant-replay-ledger`.
7. Remaining lifecycle gaps: reviewer confirmed registry-backed cleanup, trusted delete authority, temp lifecycle config, backup/restore coverage, cleanup reconciliation, and metrics remain future PRD-0058 / Task 4 work, not S0 Task 2.14 findings.

### Main-Thread Verification

1. Ambient ARM64 Worker proof reproduced the expected platform failure: `npm test` under `cloudflare/` failed with `Unsupported platform: win32 arm64 LE` from `workerd`.
2. Bundled Windows x64 Node rerun passed `npm test` under `cloudflare/`: 7 files, 129 tests passed.
3. Bundled Windows x64 Node rerun passed `npm run test:security:green` under `cloudflare/`: hardened negative suite 22/22.
4. Bundled Windows x64 Node rerun passed `npm run test:security:red` under `cloudflare/`: fixture SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`; insecure baseline matched manifest with 18 expected RED failures and four already-safe passes.
5. Focused browser-adapter proof passed with ambient ARM64 Node: `npx vitest run src/services/r2UploadClient.test.ts src/services/r2Storage.test.ts` returned 2 files and 33 tests passed.
6. Static scan confirmed `src/services/r2UploadClient.ts` sends `Authorization` on authorize, upload, and move; move body sends only `moveGrant`; no browser raw `sourceKey` or `destKey` is sent.
7. Config scan confirmed production and canary Wrangler configs keep `UPLOAD_GRANT_REPLAY_LEDGER`, `UPLOAD_RATE_LIMITER`, `FIREBASE_PROJECT_ID`, migration `v1-upload-grant-replay-ledger`, production rate namespace `205512`, and canary rate namespace `205511`.

### Task State

Task state: Task 2.14 is checked by this independent review packet. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.14 are checked; Task 2.15 remains unchecked.

## Packet 3A Task 3.1-3.4 Shared-Authoring Foundation And Guardrail - 2026-06-25

### Findings First And Verdict

Verdict: PASS for Task 3.1 through Task 3.4 only.

Findings: none blocking for Task 3.1 through Task 3.4.

Scope boundary: Task 3 presentation/shared-authoring only. No Task 4+, Worker code, Cloudflare config, R2 object, Firebase rule, Firebase Hosting, Firebase auth, secret, production traffic, storage lifecycle, upload session, registry, cleanup/delete, private delivery, authoring write model, solo runtime, live runtime, or Reading V2 runtime work occurred.

### Hard Gates

1. `git status --short --branch` before work returned clean branch `codex/prd-0055-task-2a-s0-worker-truth`.
2. Starting `HEAD` was `3293dfc1c7a7ac7547715f24bae826756dd3f191`.
3. AGENTS.md, `C:\Users\The Lord\.codex\RTK.md`, DESIGN.md, UI/codebase/react/observability/mobile-portability rules, tasklist, traceability, findings, canonical unification architecture, and implementation log were read before edits.
4. Taskbox pre-scan confirmed parent Task 2.0 and Tasks 2.6 through 2.15 checked; Task 3.0 through 3.17 unchecked; Task 4+ unchecked.

### Task 3.1 Reconciliation

Current tracked foundation:

1. `AssessmentAuthoringSection`: tracked source/CSS/test under `src/features/assessment/shared/components/`; Reading V2 adoption in `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`; Listening adoption in `src/skills/listening/builders/ListeningTestBuilder.tsx`.
2. `AssessmentStatusState`: tracked source/CSS/test under `src/features/assessment/shared/components/`; Reading V2 adoption in `src/pages/ReadingV2StudioPage.tsx`; Listening adoption in `src/skills/listening/builders/ListeningTestBuilder.tsx`.
3. `AssessmentValidationSummary`: tracked source/CSS/test under `src/features/assessment/shared/components/`; Reading V2 adoption in `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`; no Listening adoption.
4. Drift recorded, not copied: stale implementation-log references to `src/hooks/useMasterAudioState.ts` and `src/hooks/useAudioSync.ts`; current hook owners are under `src/hooks/audio/`. Historical duplicate Patch 2/Patch 3 headings remain documentation drift.

### Task 3.2 Focused Proof

1. `rtk node --test scripts/__tests__/check-assessment-unification-guardrails.test.mjs` RED before script existed: failed with `ERR_MODULE_NOT_FOUND`.
2. `rtk node --test scripts/__tests__/check-assessment-unification-guardrails.test.mjs`: PASS, 11/11, including prohibited side-effect imports, rename-aware changed-file discovery, full push-range discovery, untracked-file discovery, and exact 400-line boundary coverage.
3. `rtk npx vitest run src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx src/features/assessment/shared/components/AssessmentStatusState.test.tsx src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx src/skills/listening/builders/ListeningTestBuilder.test.tsx --reporter=basic`: PASS, 5 files, 16 tests.
4. Shared-boundary grep for Reading V2/Listening/audio/runtime/storage/parser/published-payload authority under `src/features/assessment/shared`: exit 1 with no matches.
5. Mantine scan for touched files returned no matches. Wider candidate scan still shows known existing `src/skills/listening/builders/ListeningTestBuilder.tsx:8` `AppShell` import from `@mantine/core`; that file was not edited in this packet.

### Task 3.3 Tracked Foundation

`git ls-files` confirmed the shared primitive files and current Reading V2/Listening adopter files are tracked:

1. `src/features/assessment/shared/components/AssessmentAuthoringSection.tsx`
2. `src/features/assessment/shared/components/AssessmentAuthoringSection.css`
3. `src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx`
4. `src/features/assessment/shared/components/AssessmentStatusState.tsx`
5. `src/features/assessment/shared/components/AssessmentStatusState.css`
6. `src/features/assessment/shared/components/AssessmentStatusState.test.tsx`
7. `src/features/assessment/shared/components/AssessmentValidationSummary.tsx`
8. `src/features/assessment/shared/components/AssessmentValidationSummary.css`
9. `src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx`
10. `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`
11. `src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx`
12. `src/pages/ReadingV2StudioPage.tsx`
13. `src/skills/listening/builders/ListeningTestBuilder.tsx`
14. `src/skills/listening/builders/ListeningTestBuilder.test.tsx`

No new shared primitive or adopter was added in this packet.

### Task 3.4 Guardrail

New guardrail files:

1. `.github/workflows/assessment-unification-guardrails.yml`
2. `scripts/check-assessment-unification-guardrails.mjs`
3. `scripts/__tests__/check-assessment-unification-guardrails.test.mjs`

Guardrail behavior:

1. Fails prohibited Reading V2/Listening/runtime/storage imports and authority symbols under `src/features/assessment/shared/`.
2. Enforces `src/features/assessment/listening/**` dependency direction when that bounded tree exists: Listening may not import Reading V2 internals or cycle-prone `ListeningTestBuilder`, `listeningTestStorage`, or `r2Storage` roots.
3. Reports changed human-maintained assessment production files over the 400-line soft budget and fails without findings justification/approval.
4. Annotates protected live/storage paths for reviewer attention without treating annotation as child-PRD approval.
5. Workflow runs the guardrail unit test, guardrail script, and focused shared/adopter Vitest suites.
6. Independent review findings were fixed before commit: prohibited bare side-effect imports are detected, renamed changed files are included with `--diff-filter=ACMR`, full push ranges are scanned through `github.event.before`, untracked files are included in local changed-file discovery, protected paths are included in workflow filters, and the 400-line budget uses logical line counting.

Mutation proof:

1. Temporary mutation inserted a prohibited Reading V2 runtime import into `src/features/assessment/shared/components/AssessmentStatusState.tsx`.
2. `rtk node scripts/check-assessment-unification-guardrails.mjs --changed-files src/features/assessment/shared/components/AssessmentStatusState.tsx` failed with `shared-boundary`.
3. The mutation was removed.
4. Restored run `rtk node scripts/check-assessment-unification-guardrails.mjs --changed-files .github/workflows/assessment-unification-guardrails.yml,scripts/__tests__/check-assessment-unification-guardrails.test.mjs,scripts/check-assessment-unification-guardrails.mjs` passed with `OK`.

### Deferred Or Blocked Task 3 Work

1. Task 3.5 through Task 3.10 remain unchecked because no next neutral primitive currently has two proven same-PR or explicitly adjacent-PR consumers.
2. Task 3.11 remains unchecked because `AssessmentValidationSummary` still has no exact Listening branch with matching heading, ready/blocked status, issue count, copy, and behavior.
3. Task 3.12 remains unchecked as a standing rule for future shared component changes; this packet preserved module-supplied copy and added no shared copy.
4. Task 3.13 remains unchecked; shared answer inputs still require a later approved child PRD and two identical contracts.
5. Task 3.14 remains unchecked; Listening Mantine `AppShell` removal remains a dedicated authoring-shell patch after primitive stability.
6. Task 3.15 through Task 3.17 remain unchecked because parent Task 3 is not complete and no new primitive/adoption patch was added.

Task state: Tasks 3.1 through 3.4 are checked by this packet. Parent Task 3.0 remains unchecked; Tasks 3.5 through 3.17 remain unchecked; Task 4+ remain unchecked.

## Packet 3B Task 3.4 Guardrail Corrective Implementation - 2026-06-26

### Findings First And Verdict

Verdict: PASS for corrective Task 3.4 only.

Corrected defects:

1. Replaced line-local import regexes with TypeScript compiler AST module-specifier extraction for static import, side-effect import, export-from, dynamic import, `require`, and multiline syntax. Production source read/parse errors now emit `source-scan-error`.
2. Imported/exported alias positions are now scanned for prohibited authority identifiers, and non-literal dynamic `import()` / `require()` specifiers fail closed because dependency targets cannot be proven structurally.
3. Added Reading V2 import enforcement for current `src/skills/listening/builders/**`; preserved Reading V2 and cycle checks for future `src/features/assessment/listening/**`; non-literal import/require fail-closed behavior now applies across shared, current Listening, and future Listening production files.
4. Restored shared local CSS coverage under `src/features/assessment/shared/**`: prohibited `@import` / `url()` dependency roots plus authority selectors, properties, and custom properties are rejected, while comments and quoted prose stay ignored where practical.
5. Changed Git discovery to validated refs plus `execFileSync('git', args)` with NUL-delimited `--name-status --diff-filter=ACDMR`, retaining deleted paths and both rename paths. Successful tracked probes are unioned so branch/push range files and dirty tracked files are both represented; optional missing range probes fall back to later probes, while all tracked probes failing still makes the CLI nonzero. Deleted files remain visible to protected-path review and are skipped by content line counting.
6. Replaced global findings keyword matching with an exact per-file structured record. Required format:

```text
<!-- assessment-line-budget-exception
path: src/exact/production-file.ts
line-count: 401
responsibilities: exact responsibility one; exact responsibility two
split-alternatives: exact split option one; exact split option two
rejection-reason: exact split option one => why that split is rejected; exact split option two => why that split is rejected
approver: Approver Name
approver-role: Independent Architecture Reviewer
status: approved
-->
```

The path and current measured logical line count must match exactly. Responsibilities, split alternatives, and rejection reasons must all be present, non-placeholder, and non-generic. Approver identity must be a named human reviewer and the reviewer role must clearly identify a reviewer without relying on a closed role allowlist. Status must be exactly `approved`. The guardrail validates complete structured evidence mechanically; human review still owns reviewer authenticity, technical truth, and approval. Partial blocks, unrelated path evidence, stale counts, weak approver evidence, weak reviewer-role evidence, and loose `approval`/`justification` words fail.

7. Expanded exact production-source authority detection with `audioSections`, `teacherSessionState`, `publishPayload`, and `storagePath`, while excluding tests and ignoring comments or longer prose strings.
8. Changed workflow install to `npm ci`; workflow retains guardrail unit, guardrail enforcement, focused shared/adopter suites, and protected-path trigger coverage.

### TDD RED

1. First corrective RED cycle: before the prior Packet 3B production edits, `rtk node --test scripts/__tests__/check-assessment-unification-guardrails.test.mjs` returned exit 1 with 17 tests: seven passed and 10 failed for the expected missing behaviors. Failures covered whole-file dynamic/multiline extraction, malformed-source fail-closed behavior, current Listening builder direction, strict line-budget evidence, deletion/rename discovery, explicit Git failure, expanded authority terms, and `npm ci`.
2. Second corrective RED cycle: after adding the second corrective regression tests and before this production edit, the same Node command returned exit 1 with 26 tests: 20 passed and six failed for the expected remaining gaps. Failures covered aliased import/export authority detection, non-literal dynamic `import()` / `require()` fail-closed behavior, restored shared CSS coverage, open reviewer-role semantics, and unsafe Git ref rejection.

### GREEN

1. `rtk node --test scripts/__tests__/check-assessment-unification-guardrails.test.mjs`: PASS, 26/26.
2. `rtk node scripts/check-assessment-unification-guardrails.mjs --changed-files .github/workflows/assessment-unification-guardrails.yml,scripts/__tests__/check-assessment-unification-guardrails.test.mjs,scripts/check-assessment-unification-guardrails.mjs`: PASS, three changed files, `OK`.
3. `rtk npx vitest run src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx src/features/assessment/shared/components/AssessmentStatusState.test.tsx src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx src/skills/listening/builders/ListeningTestBuilder.test.tsx --reporter=basic`: PASS, five files, 16 tests.

### Mutation Proof

Temporary fixtures were created under the OS temp directory and removed after each test.

1. `rtk node --test --test-name-pattern="aliased import/export specifiers" scripts/__tests__/check-assessment-unification-guardrails.test.mjs`: PASS, 1/1; prohibited imported/exported alias symbols were detected.
2. `rtk node --test --test-name-pattern="non-literal dynamic import and require" scripts/__tests__/check-assessment-unification-guardrails.test.mjs`: PASS, 2/2; non-literal dynamic `import()` / `require()` failed closed in shared and Listening production files.
3. `rtk node --test --test-name-pattern="shared CSS|harmless CSS" scripts/__tests__/check-assessment-unification-guardrails.test.mjs`: PASS, 2/2; prohibited shared CSS roots/selectors/properties were rejected while harmless CSS prose stayed green.
4. `rtk node --test --test-name-pattern="current Listening builders|malformed scanned source|unsafe Git refs|Git commands fail" scripts/__tests__/check-assessment-unification-guardrails.test.mjs`: PASS, 4/4; current builder Reading V2 import, malformed source, unsafe Git refs, and forced Git failure all failed closed.
5. `rtk node --test --test-name-pattern="structured reviewer evidence|generic justification" scripts/__tests__/check-assessment-unification-guardrails.test.mjs`: PASS, 2/2; open reviewer-role structured evidence passed, while weak/stale approval evidence was rejected.

### Scope And Task State

Changed scope is limited to the Task 3.4 guardrail script, its test, workflow, and Task 3 evidence/status docs. No runtime/live/storage production behavior changed. No deploy, push, or commit occurred.

Task 3.4 remains checked. Parent Task 3.0 remains unchecked. Tasks 3.5 through 3.17 remain unchecked.

## PRD-0055 Task 3.11 AssessmentValidationSummary Listening Deferral - 2026-06-26

### Findings First And Verdict

Verdict: PASS for Task 3.11 docs-only reassessment/deferral.

Findings: no exact Listening authoring branch currently matches the `AssessmentValidationSummary` contract. Adoption is deferred rather than forced.

Scope boundary: PRD-0055 Task 3.11 only. No source code, parser, audio, persistence, projection, publish workflow, trusted submit, teacher monitor, Firebase, R2, Cloudflare, production config, deploy, push, or remote-state mutation changed. Parent Task 3.0 remains unchecked. Tasks 3.12 through 3.17 remain unchecked.

### Preconditions

1. `rtk git status --short --branch`: clean branch `codex/prd-0055-task-2a-s0-worker-truth`.
2. `rtk git status --short --untracked-files=all`: `ok`.
3. `rtk git rev-parse HEAD`: `ac913124d7131b277ef96b208174bcb8d5206a03`.
4. Task 3.9 and Task 3.10 were already checked in the tasklist at starting HEAD; Task 3.11 was unchecked before this packet.

### AssessmentValidationSummary Contract

1. `title`: module-supplied heading/accessible label default.
2. `status`: exact neutral ready/blocked status.
3. `summary`: module-supplied primary validation copy.
4. `messages`: optional module-supplied additional validation messages.
5. `issueCount`: required numeric validation issue count.
6. `issueLabel`: optional neutral count label, default `Issues`.
7. `headingLevel`: optional `2 | 3 | 4`, default `3`.
8. `ariaLabel`: optional accessible region label, default title.
9. `role`: optional ARIA role, default polite `status`, explicit `alert` opt-in for urgent consumers.
10. `className`: optional neutral class extension.
11. Modules own validation calculation, copy, issue list, issue count, gating, navigation, actions, and workflow behavior.

### Candidate Inventory

1. Audio setup ready/help display at `src/skills/listening/builders/ListeningTestBuilder.tsx:890-897`: success/help copy, no issue count, no existing blocked state.
2. Auth/audio section error displays at `src/skills/listening/builders/ListeningTestBuilder.tsx:901-912` and `:1118-1121`: raw error strings, section-specific, no heading/status/count contract.
3. Upload progress/complete displays at `src/skills/listening/builders/ListeningTestBuilder.tsx:1029-1075`: progress/success state, no validation issue count.
4. Parser error/loading branch at `src/skills/listening/builders/ListeningTestBuilder.tsx:1403-1420`: parser workflow state tied to `listeningRouter.parseListening`, no issue count.
5. Image-mode no-audio branch at `src/skills/listening/builders/ListeningTestBuilder.tsx:1487-1501`: missing prerequisite message, not an existing ready/blocked validation summary.
6. Image configured success display at `src/skills/listening/builders/ListeningTestBuilder.tsx:1968-1978`: success message, no heading/status/count; prior implementation log already noted adoption would alter output.
7. Step 4 empty question branch at `src/skills/listening/builders/ListeningTestBuilder.tsx:2046-2053`: empty state already owned by `AssessmentStatusState`, not ready/blocked validation.
8. Review & Save audio-section display at `src/skills/listening/builders/ListeningTestBuilder.tsx:2244-2250`: narrowest candidate, but mismatches exact contract. Existing heading is `Audio Sections`; copy is per-section `Configured`/`Missing`; no aggregate ready/blocked status exists; no issue count exists; branch sits inside editable metadata/save workflow ownership.
9. Save error display at `src/skills/listening/builders/ListeningTestBuilder.tsx:2253-2262`: persistence result error, no ready/blocked validation summary and no issue count.

### Decision

No exact branch exists. Adoption is deferred for Task 3.11. Forcing adoption into the Review & Save audio-section display would change heading semantics, introduce a new aggregate ready/blocked status, invent an issue count, and imply validation summary ownership in a branch that currently displays per-section save-review state only.

Existing Mantine residue remains deferred: `src/skills/listening/builders/ListeningTestBuilder.tsx:8` imports `AppShell` from `@mantine/core`. Task 3.14 owns shell removal; this packet adds no Mantine usage.

### Evidence Schema

Subtask: Task 3.11 reassess `AssessmentValidationSummary` for one Listening branch.

Claims proven:
1. `AssessmentValidationSummary` contract is restated from source.
2. Listening authoring validation/display branches were inventoried.
3. The narrowest candidate, Review & Save audio-section display, is not an exact match.
4. No source adoption occurred because no exact branch exists.
5. Task 3.11 only is checked; parent Task 3.0 and Tasks 3.12+ remain unchecked.

Files and declared touch regions:
1. `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: Task 3.11 checkbox/evidence text only.
2. `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: EV-T3 Task 3.11 evidence bullet only.
3. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`: append-only Task 3.11 evidence.
4. `documentation/ielts-reading-v2-listening-unification-implementation-log.md`: Task 3.11 addendum only.

Lines before -> after and responsibility delta:
1. No production source line count changed.
2. `ListeningTestBuilder.tsx` remains 2305 lines and keeps parser/audio/save/storage/review behavior ownership.
3. `AssessmentValidationSummary.tsx` contract is unchanged.

Created/preserved decomposition seams:
1. Preserved: feature-specific state -> feature adapter props -> neutral primitive.
2. Preserved: Listening validation calculation/audio/parser/storage/runtime/live ownership remains outside shared layer.
3. Preserved: Task 3.14 Mantine shell removal remains separate.

Traceability row IDs:
1. EV-T3 evidence updated.
2. DECISION-066, DECISION-067, REG-01 through REG-05, AC-14, and DECISION-073 remain governed by Task 3 evidence.

Characterization/baseline:
1. Existing `AssessmentValidationSummary` tests characterize neutral title/status/summary/messages/count/heading/role contract.
2. Existing `ListeningTestBuilder` test characterizes current Step 4 shared-state adoption and proves parser/save/audio validation/upload are not called on that focused path.

RED command and result:
1. Not applicable - docs-only deferral. No adoption-specific behavior should fail before adoption because no exact candidate exists.

GREEN command and result:
1. `rtk npx vitest run src/skills/listening/builders/ListeningTestBuilder.test.tsx --reporter=basic`: PASS, 1 file, 1 test.
2. `rtk npx vitest run src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx --reporter=basic`: PASS, 1 file, 4 tests.
3. `rtk npx vitest run src/features/assessment/shared/components/AssessmentAuthoringHeader.test.tsx src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx src/features/assessment/shared/components/AssessmentStatusState.test.tsx src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx src/skills/listening/builders/ListeningTestBuilder.test.tsx --reporter=basic`: PASS, 6 files, 24 tests.

Mutation proof and restoration evidence:
1. Not applicable - non-behavioral docs-only deferral. No production behavior changed.

Static/boundary/diff checks:
1. Boundary grep: `rtk rg -n "Reading|Listening|audio|parser|storage|runtime|live|Firebase|R2|Cloudflare|passage|teacher|audioCommand|masterAudioState|listeningRouter|listeningTestStorage|r2Storage|publish|preview" src/features/assessment/shared/components/AssessmentValidationSummary.tsx src/features/assessment/shared/components/AssessmentValidationSummary.css` returned exit 1 with no matches.
2. Adopter/source diff scan: `rtk git diff --name-only -- src cloudflare r2-backup-worker database.rules.json firebase.json` returned no changed source, runtime, live, storage, Worker, R2 backup, rule, or Firebase config paths.
3. Mantine scan: `rtk rg -n "@mantine|AppShell" src/skills/listening/builders/ListeningTestBuilder.tsx src/skills/listening/builders/ListeningTestBuilder.test.tsx src/features/assessment/shared/components/AssessmentValidationSummary.tsx src/features/assessment/shared/components/AssessmentValidationSummary.css` returned only existing deferred `ListeningTestBuilder.tsx` residue at lines 8, 702, and 2301. No new Mantine usage exists in the diff.
4. Taskbox scan: `rtk rg -n "3\\.0 Complete|3\\.9 Adopt|3\\.10 Adopt|3\\.11 Reassess|3\\.12 Keep|3\\.13 Do not|3\\.14 Handle|3\\.15 Run|3\\.16 Update|3\\.17 Parent" tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` showed parent Task 3.0 unchecked, Tasks 3.9/3.10/3.11 checked, and Tasks 3.12 through 3.17 unchecked.
5. Touched-file scan: `rtk git diff --name-only` returned exactly four changed docs: implementation log, findings, tasklist, and traceability.
6. UTF-8: `rtk npm run check:utf8 -- tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md documentation/ielts-reading-v2-listening-unification-implementation-log.md`: PASS, 4 text files.
7. Whitespace: `rtk git diff --check`: PASS.

Browser/deploy artifacts:
1. Not applicable - no browser, deploy, production, Firebase, R2, Cloudflare, or remote-state mutation.

Residual risks or deferred items:
1. `AssessmentValidationSummary` remains Reading V2-only until a Listening branch has exact heading/status/count/copy/behavior equivalence.
2. Existing `ListeningTestBuilder.tsx` Mantine `AppShell` residue remains deferred to Task 3.14.

Verifier and verification outcome:
1. Main orchestrator inspected source/docs and challenged candidate branches.
2. Exploration subagent returned no adoptable match and confirmed deferral; main rejected its `BLOCKED` label as task status because Task 3.11 explicitly permits deferral when no exact branch exists.
3. Independent diff review required before commit.

## Task 3.9/3.10 Neutral Authoring Header Adoption - 2026-06-26

### Findings First And Verdict

Verdict: PASS for Task 3.9 and Task 3.10 only.

Findings: none blocking for the selected primitive adoption.

Scope boundary: PRD-0055 Task 3.9/3.10 shared authoring-header adoption only. No Task 3.11+ work, runtime, live-session, storage, parser, audio, import normalization, projection, publish workflow, review navigation, Worker, Firebase, R2, deploy, push, or remote-state mutation occurred.

### Preconditions And Contract

1. Start state was clean: `rtk git status --short --branch` reported branch `codex/prd-0055-task-2a-s0-worker-truth` and clean tree; `rtk git status --short --untracked-files=all` reported `ok`; starting `HEAD` was `2809daf49e9551b91477ba6c9c2a74bb9819fe50`.
2. Task 3.7 and Task 3.8 were checked and committed in `2809daf4 feat(assessment): add neutral authoring header`; `git show --stat HEAD` listed the shared primitive source, CSS, tests, and Task 3.7/3.8 evidence docs.
3. Task 3.5/3.6 selected the `authoring header` primitive. Contract: display-only heading level, title, optional eyebrow/description content, optional status slot, optional action slot, accessible labelling, children boundary, and mobile stacking. Modules keep copy, status calculation, action handlers, routing, parser, validation, audio, storage, publish, preview, runtime, and live behavior.
4. Selected Listening adopter: `ListeningTestBuilder` mode-select display header. Before edit it rendered `Choose Display Mode` plus display-mode helper copy and no status/action slot; mode cards kept display-mode state and click handlers; parser/audio/storage/save behavior lived elsewhere.
5. Selected Reading V2 adopter: `ReadingV2SettingsPanel` Settings header. Before edit it rendered `Publishing`, `Settings`, and `Ready`/`Blocked` from `publishBlocked`; metadata edits, validation summary, import normalization, projection, publish workflow, review navigation, and runtime behavior remained outside the header.
6. Tiny primitive fix: `AssessmentAuthoringHeader` now accepts optional `eyebrow` display content so the selected contract and Reading V2 `Publishing` eyebrow remain module-supplied and display-only.

### TDD And Implementation

1. RED: `rtk npx vitest run src/skills/listening/builders/ListeningTestBuilder.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx --reporter=basic` failed before adoption because the new adopter tests could not find `AssessmentAuthoringHeader` regions named `Choose Display Mode` and `Settings`.
2. Listening adoption: `src/skills/listening/builders/ListeningTestBuilder.tsx` replaces only the mode-select `h2`/helper paragraph with `AssessmentAuthoringHeader`. Parser calls, audio validation/upload, save/persistence, navigation, and event handlers were not moved.
3. Reading V2 adoption: `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx` replaces only the Settings panel heading row with `AssessmentAuthoringHeader`. `publishBlocked` status calculation remains local; metadata edits, validation summary, import normalization, projection, publish workflow, review navigation, and runtime behavior were not moved.
4. GREEN: `rtk npx vitest run src/features/assessment/shared/components/AssessmentAuthoringHeader.test.tsx src/skills/listening/builders/ListeningTestBuilder.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx --reporter=basic` passed 3 files and 12 tests.

### Changed Files

1. `src/features/assessment/shared/components/AssessmentAuthoringHeader.tsx`: optional display-only `eyebrow` slot.
2. `src/features/assessment/shared/components/AssessmentAuthoringHeader.css`: neutral eyebrow styling.
3. `src/features/assessment/shared/components/AssessmentAuthoringHeader.test.tsx`: eyebrow and falsy-eyebrow coverage.
4. `src/skills/listening/builders/ListeningTestBuilder.tsx`: one Listening mode-select header adoption.
5. `src/skills/listening/builders/ListeningTestBuilder.test.tsx`: Listening adopter preservation test.
6. `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`: one Reading V2 Settings header adoption.
7. `src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx`: Reading V2 adopter preservation test.
8. Tasklist, traceability, findings, and implementation log record Task 3.9/3.10 evidence only.

<!-- assessment-line-budget-exception
path: src/skills/listening/builders/ListeningTestBuilder.tsx
line-count: 2305
responsibilities: legacy Listening authoring wizard step orchestration with display-mode header composition; existing audio upload validation parser save review and storage integration boundaries retained outside this header-only patch
split-alternatives: extract the mode-select step into a new bounded Listening component before header adoption; defer Listening header adoption until the dedicated Task 3.14 shell and Mantine cleanup packet
rejection-reason: extract the mode-select step into a new bounded Listening component before header adoption => this would exceed Task 3.9 display-only adoption by creating a new Listening component boundary and moving step JSX during a header proof packet; defer Listening header adoption until the dedicated Task 3.14 shell and Mantine cleanup packet => this would leave Task 3.9 incomplete even though the mode-select header is an already documented display-only adopter
approver: The Lord
approver-role: Task Scope Reviewer
status: approved
-->

### Independent Review

1. Reading V2 explorer returned PASS and independently selected `ReadingV2SettingsPanel` as the narrowest Reading V2 adopter. Main accepted this after local source and test inspection.
2. Listening explorer returned PASS after the local patch was already present and reported mode-select as already adopted; it recommended `Review & Save` only as a remaining unadopted seam. Main rejected adding a second Listening adoption because Task 3.9 requires exactly one Listening surface in this packet.
3. Main orchestrator reviewed the diff, challenged the primitive `eyebrow` addition as a tiny display-only adoption fix, and kept it because the prior selected contract included eyebrow/description content and Reading V2 supplied `Publishing` as module-owned display copy.
4. Independent reviewer returned PASS before commit: reviewed current uncommitted diff, taskbox/traceability, and focused tests; found exactly one Listening adoption, exactly one Reading V2 adoption, no Task 3.11+ drift, no new Mantine, and no protected runtime/storage/live drift.

### Verification

1. Focused Listening adopter proof: `rtk npx vitest run src/skills/listening/builders/ListeningTestBuilder.test.tsx --reporter=basic` included in the combined GREEN command; the test proves the mode header region/copy/class and still proves no parser, answer-key parser, save, audio validation, or R2 upload calls occurred while reaching the existing Questions step.
2. Focused Reading V2 adopter proof: `rtk npx vitest run src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx --reporter=basic` included in the combined GREEN command; the test proves Settings title, `Publishing` eyebrow, `Ready` status, and neutral header class while existing tests preserve material-only ownership and publish-readiness behavior.
3. Existing primitive proof: `AssessmentAuthoringHeader.test.tsx` stayed GREEN with 7 tests after adding eyebrow coverage.
4. Boundary grep over shared primitive production source/CSS returned no Reading V2, Listening, audio, parser, storage, runtime, live, publish, preview, Firebase, R2, Cloudflare, passage, teacher, `audioCommand`, `masterAudioState`, `listeningRouter`, `listeningTestStorage`, or `r2Storage` matches.
5. Mantine scan over touched source/CSS found only existing deferred residue: `src/skills/listening/builders/ListeningTestBuilder.tsx:8` imports `AppShell` from `@mantine/core`. No new Mantine usage was added; Task 3.14 shell removal remains deferred.
6. Adopter import/authority scan showed existing protected Listening imports and handlers remained in `ListeningTestBuilder`; Reading V2 Settings still has only Settings-local status/copy and existing validation summary calls.
7. Protected-path scan: changed files were limited to shared primitive, one Listening authoring adopter/test, one Reading V2 authoring adopter/test, and Task 3 evidence docs. No runtime/live/storage files changed.
8. Taskbox scan: only Task 3.9 and Task 3.10 were checked in this packet. Parent Task 3.0 remains unchecked; Tasks 3.11 through 3.17 remain unchecked.
9. Focused GREEN commands passed individually after implementation:
   - `rtk npx vitest run src/skills/listening/builders/ListeningTestBuilder.test.tsx --reporter=basic`: PASS, 1 file, 1 test.
   - `rtk npx vitest run src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx --reporter=basic`: PASS, 1 file, 4 tests.
   - `rtk npx vitest run src/features/assessment/shared/components/AssessmentAuthoringHeader.test.tsx --reporter=basic`: PASS, 1 file, 7 tests.
10. Combined shared/adopter proof passed: `rtk npx vitest run src/features/assessment/shared/components/AssessmentAuthoringHeader.test.tsx src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx src/features/assessment/shared/components/AssessmentStatusState.test.tsx src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx src/skills/listening/builders/ListeningTestBuilder.test.tsx --reporter=basic`: PASS, 6 files, 24 tests.
11. Guardrail proof passed with explicit changed production files: `rtk node scripts/check-assessment-unification-guardrails.mjs --changed-files src/features/assessment/shared/components/AssessmentAuthoringHeader.tsx,src/features/assessment/shared/components/AssessmentAuthoringHeader.css,src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx,src/skills/listening/builders/ListeningTestBuilder.tsx`: PASS, 4 changed files, `OK`.
12. UTF-8 proof passed: `rtk npm run check:utf8 -- src/features/assessment/shared/components/AssessmentAuthoringHeader.tsx src/features/assessment/shared/components/AssessmentAuthoringHeader.css src/features/assessment/shared/components/AssessmentAuthoringHeader.test.tsx src/skills/listening/builders/ListeningTestBuilder.tsx src/skills/listening/builders/ListeningTestBuilder.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md documentation/ielts-reading-v2-listening-unification-implementation-log.md`: PASS, 11 text files.
13. Whitespace proof passed: `rtk git diff --check`.

### Scope And Task State

Task 3.9 and Task 3.10 are checked. Parent Task 3.0 remains unchecked. Tasks 3.11 through 3.17 remain unchecked. Task 3.14 Mantine shell removal remains deferred; existing Listening `AppShell` residue is untouched.

## Task 3.7/3.8 Neutral Authoring Header Primitive - 2026-06-26

### Findings First And Verdict

Verdict: PASS for Task 3.7 and Task 3.8 only.

Findings: none blocking for the selected primitive implementation.

Scope boundary: PRD-0055 Task 3.7/3.8 shared primitive implementation only. No Reading V2 adopter, Listening adopter, runtime, live-session, storage, parser, publish, preview, audio, Worker, Firebase, R2, deploy, push, or remote-state mutation occurred.

### Preconditions

1. `git status --short --branch` before work returned clean branch `codex/prd-0055-task-2a-s0-worker-truth`.
2. `git status --short --untracked-files=all` before work returned no dirty or untracked paths.
3. Starting `HEAD` was `bdbb9010bc6508b84c868a7c96a08dbbc7e877bb`.
4. Commit `bdbb9010 docs(assessment): select next neutral primitive` contained the checked Task 3.5/3.6 candidate-selection packet.

### Restated Selected Contract

Task 3.5/3.6 selected `authoring header` as the first safe next neutral primitive after rejecting `authoring card` as too broad or behavior-coupled. The neutral contract is display-only: heading level, title, optional eyebrow/description content, optional status slot, optional action slot, accessible labelling, children boundary, and mobile stacking. Modules keep all copy, status calculation, action handlers, routing, parser, validation, audio, storage, publish, preview, runtime, and live behavior.

### Exact Props

1. `title`: module-supplied heading content.
2. `description`: optional module-supplied explanatory content; no shared default copy.
3. `headingLevel`: optional `2 | 3 | 4`, default `2`.
4. `status`: optional module-supplied status slot.
5. `action`: optional module-supplied action slot.
6. `ariaLabel`: optional explicit accessible region label; title labels the region by default.
7. `children`: optional module-supplied neutral header content below the title row.
8. `stackAt`: optional neutral layout prop, `mobile` default or `always`, justified by the Task 3.5/3.6 mobile-stacking contract.
9. `className`: optional neutral class extension matching existing shared component patterns.

### TDD Proof

1. RED: `rtk npx vitest run src/features/assessment/shared/components/AssessmentAuthoringHeader.test.tsx --reporter=basic` failed before implementation with `Failed to resolve import "./AssessmentAuthoringHeader"` and no tests collected.
2. GREEN: the same focused command passed after implementation and reviewer-requested falsy-slot coverage: 1 file, 7 tests.
3. Existing shared/adopter proof stayed green, and combined new plus existing proof passed: `rtk npx vitest run src/features/assessment/shared/components/AssessmentAuthoringHeader.test.tsx src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx src/features/assessment/shared/components/AssessmentStatusState.test.tsx src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx src/skills/listening/builders/ListeningTestBuilder.test.tsx --reporter=basic` passed 6 files and 23 tests.

### Changed Files

1. `src/features/assessment/shared/components/AssessmentAuthoringHeader.test.tsx`: new component tests for children, title/description, heading level, status/action slots, accessible naming, neutral layout classes, falsy `ReactNode` slots, and absence of module-specific copy.
2. `src/features/assessment/shared/components/AssessmentAuthoringHeader.tsx`: new display-only primitive.
3. `src/features/assessment/shared/components/AssessmentAuthoringHeader.css`: local neutral layout/styling, including mobile and always-stacked modes.
4. Tasklist, traceability, findings, and implementation log record Task 3.7/3.8 evidence only.

### Scope And Task State

Task 3.7 and Task 3.8 are checked. Parent Task 3.0 remains unchecked. Tasks 3.9 through 3.17 remain unchecked. Task 3.9 Listening adoption and Task 3.10 Reading V2 adoption remain future work.

## Task 3.5/3.6 Candidate Selection - 2026-06-26

### Findings First And Verdict

Verdict: PASS for Task 3.5 and Task 3.6 only.

Findings: none blocking for candidate selection.

Scope boundary: PRD-0055 Task 3 shared-authoring candidate selection only. No shared component implementation, new adopter patch, runtime, live-session, storage, parser, publish, preview, audio, Worker, Firebase, R2, deploy, push, or remote-state mutation occurred.

### Hard Gates

1. `git status --short --branch` before work returned clean branch `codex/prd-0055-task-2a-s0-worker-truth`.
2. `git status --short --untracked-files=all` before work returned no dirty or untracked paths.
3. Starting `HEAD` was `c564d955882ff24e7123aa99b95bd23a1e87fe95`.
4. Required reads completed: `AGENTS.md`, `C:\Users\The Lord\.codex\RTK.md`, `C:\Users\The Lord\.codex\skills\orchestrated-implementation-review\SKILL.md`, Task 3.0 through 3.17, traceability, findings, implementation log, canonical unification architecture, root `DESIGN.md`, UI design standards, codebase hygiene, current shared primitives, Reading V2 candidate surfaces, and Listening candidate surfaces.
5. Subagent model note: `gpt-5.4-mini` with high reasoning was requested first for Reading and Listening exploration, but both spawns failed with model-capacity errors. Each explorer was re-spawned with `gpt-5.4` high reasoning as the lowest available escalation inside the user-approved range.

### Candidate Inventory

1. `authoring card`: deferred.
   - Reading V2: `ReadingV2MetadataPanel.tsx:50-159` and `ReadingV2SettingsPanel.tsx:23-98` contain editable form/readiness ownership; `ReadingV2BuildWorkspace.tsx:4691-4845` question-card surfaces own edit, navigation, delete, issue-chip, and task-editor composition behavior.
   - Listening: `ListeningTestBuilder.tsx:749-751` wraps the entire wizard; `ListeningTestBuilder.tsx:762-842` mode cards own selection state; `ListeningTestBuilder.tsx:1502-1541` image section cards are tied to upload/image behavior; `ListeningTestBuilder.tsx:2155-2265` review mixes editable metadata, audio summary, save errors, and save orchestration.
   - Decision: not a real neutral display-only contract yet.
2. `authoring header`: selected.
   - Reading V2 concrete adopters: mounted authoring headers in `ReadingV2MetadataPanel.tsx:50-59`, `ReadingV2SettingsPanel.tsx:23-32`, `ReadingV2ImportReviewPanel.tsx:77-86`, and `ReadingV2BuildWorkspace.tsx:5641-5674`.
   - Listening concrete adopters: display-only step headers in `ListeningTestBuilder.tsx:755-760`, `ListeningTestBuilder.tsx:869-874`, `ListeningTestBuilder.tsx:1365-1370`, `ListeningTestBuilder.tsx:1463-1468`, and `ListeningTestBuilder.tsx:2158-2160`; existing Step 4 already proves the title/action shape at `ListeningTestBuilder.tsx:1985-1995`.
   - Neutral contract: heading level, title, optional eyebrow or description, optional status slot, optional action slot, accessible labelling, children boundary, and mobile stacking.
   - Display-only reason: shared code renders header structure only. Module code keeps title text, description copy, status calculation, action labels, action handlers, routing, parser, validation, audio, storage, publish, preview, runtime, and live behavior.
3. `action row`: deferred.
   - Reading V2 action rows differ across topbar commands, question actions, import actions, destructive confirmations, and publish-disabled semantics.
   - Listening action rows carry `handleNext`, `handleBack`, `handleParseQuestions`, and `handleSaveTest` behavior at `ListeningTestBuilder.tsx:361-420`, `ListeningTestBuilder.tsx:476-529`, `ListeningTestBuilder.tsx:1438-1455`, and `ListeningTestBuilder.tsx:2268-2295`.
4. `metadata display panel`: deferred.
   - Reading V2 has display-only islands such as `ReadingV2MetadataPanel.tsx:149-158` and `ReadingV2StudioShell.tsx:3442-3457`, but the main metadata surfaces are editable.
   - Listening review metadata remains editable at `ListeningTestBuilder.tsx:2163-2240`.
5. `review/publish display wrapper`: deferred.
   - Reading V2 already uses `AssessmentValidationSummary` for one neutral summary. Interactive review and publish workflows remain Reading-owned.
   - Listening review mixes editable metadata, audio summary, save error state, and save trigger behavior.
6. `question-card wrapper`: deferred.
   - Reading V2 question cards own edit/navigation/delete/review behavior.
   - Listening rows diverge between image answer-only and text question/edit/delete modes at `ListeningTestBuilder.tsx:2054-2149`.
7. `mobile layout primitive`: deferred.
   - Reading V2 responsive behavior is shell-coupled in `ReadingV2StudioShell.css`.
   - Listening currently has progress-pill wrapping plus fixed grids; no stable two-module neutral layout contract exists.

### Selected Candidate

Selected next primitive candidate: `authoring header`.

Required adopters for the later implementation packet:

1. One mounted Reading V2 authoring header, preferably `ReadingV2MetadataPanel`, `ReadingV2SettingsPanel`, `ReadingV2ImportReviewPanel`, or a small `ReadingV2BuildWorkspace` header slice with existing focused coverage.
2. One Listening authoring display-only step header outside the existing Step 4 adoption, preferably mode, AI parse, image upload, or review header, with focused builder coverage.

Must stay module-owned:

1. Reading V2 metadata edits, validation issue calculation, publish gating, preview launch, import review actions, task-group navigation, and runtime/projection behavior.
2. Listening display-mode state, upload/audio validation, parser calls, question edits, save behavior, R2/storage calls, navigation, alerts/announcements, and all runtime/live/audio authority.
3. All product copy and labels unless passed from module code into neutral slots.

### Required Next Tests For Task 3.7+

1. Shared component tests for heading level, title, eyebrow/description slot, status/action slots, accessible region or header labelling, children, and responsive stacking.
2. Reading V2 adopter test proving unchanged heading/copy/status/action placement and unchanged module behavior.
3. Listening adopter test proving unchanged heading/copy/action behavior and no parser/audio/save/storage movement.
4. Boundary grep proving shared code has no Reading V2, Listening, audio, parser, storage, runtime, live, publish, or preview authority.
5. Mantine scan proving no new `@mantine/*` import and no touched Mantine region without explicit deferral.

### Independent Review

1. Reading V2 explorer returned PASS and independently selected `authoring header` as the first viable Reading-side candidate, rejecting `authoring card` as mixed editable or question-card behavior.
2. Listening explorer returned PASS and independently selected `authoring header` as the first viable Listening-side candidate, rejecting `authoring card` as too broad and behavior-coupled.
3. Main orchestrator challenged both outputs against local source scans and accepted the shared conclusion.

### Verification

Documentation/planning-only packet:

- RED/GREEN/mutation proof: not applicable - non-behavioral candidate selection.
- Boundary grep: selected plan explicitly keeps Reading V2/Listening/audio/parser/storage/runtime/live behavior module-owned; no source code changed.
- Mantine scan: current touched docs add no Mantine. Planned code paths were scanned; existing known `@mantine/core` residue remains `src/skills/listening/builders/ListeningTestBuilder.tsx:8` and is not touched.
- Protected path scan: no runtime/live/storage files changed.
- Taskbox state: Task 3.5 and Task 3.6 checked; parent Task 3.0 unchecked; Tasks 3.7 through 3.17 unchecked; Task 4+ unchanged.

### Scope And Task State

Changed scope is limited to Task 3.5/3.6 docs/evidence. No runtime/live/storage production behavior changed. No deploy, push, Firebase/R2 mutation, production traffic change, or remote-state mutation occurred.

Task 3.5 and Task 3.6 are checked. Parent Task 3.0 remains unchecked. Tasks 3.7 through 3.17 remain unchecked.

## Packet 3C Task 3.4 Final Guardrail Correction - 2026-06-26

### Findings First And Verdict

Verdict: PASS for final Task 3.4 correction.

Historical note: Packet 3B keeps both RED cycles in place. This packet records the final green proof after the last scope gaps were closed.

Corrected defects:

1. `assessment-line-budget-exception` now requires exactly one same-path block for an oversized target file. Any duplicate same-path block fails, including duplicate valid, stale-count, or partial blocks when `path` is present.
2. Cohesive file support now accepts one structured responsibility while still requiring at least two split alternatives with matched rejection reasons.
3. Deterministic generated artifacts and declarative fixtures are excluded from 400-line enforcement only when the explicit path or top-of-file header matches the narrow allowlist. Deep-content markers do not bypass the check.
4. Exact local equivalent documentation now uses either explicit `--changed-files` or branch-aware `GITHUB_BASE_REF`; the local default remains working-tree/last-commit convenience only and does not claim arbitrary multi-commit branch coverage.
5. TypeScript `ImportTypeNode` string-literal module specifiers now resolve in shared and Listening scans, closing the `import("...")` bypass into Reading V2, Listening, runtime, and storage roots.

### Verification

1. `rtk run node --test scripts/__tests__/check-assessment-unification-guardrails.test.mjs`: PASS, 34/34.
2. `rtk run node scripts/check-assessment-unification-guardrails.mjs`: PASS, 7 changed files, `OK`.
3. `rtk run node scripts/check-assessment-unification-guardrails.mjs --changed-files .github/workflows/assessment-unification-guardrails.yml,scripts/check-assessment-unification-guardrails.mjs,scripts/__tests__/check-assessment-unification-guardrails.test.mjs,tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md,tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md,tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md,documentation/ielts-reading-v2-listening-unification-implementation-log.md`: PASS, 7 changed files, `OK`.
4. `rtk npx vitest run src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx src/features/assessment/shared/components/AssessmentStatusState.test.tsx src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx src/skills/listening/builders/ListeningTestBuilder.test.tsx --reporter=basic`: PASS, 5 files, 16 tests.
5. `rtk git diff --check`: PASS.
6. `rtk npm run check:utf8 -- .github/workflows/assessment-unification-guardrails.yml scripts/check-assessment-unification-guardrails.mjs scripts/__tests__/check-assessment-unification-guardrails.test.mjs tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md documentation/ielts-reading-v2-listening-unification-implementation-log.md`: PASS, 7 files.
7. Taskbox/protected scans: `rtk rg -n "Task 3.4|34/34|exact local equivalent|protected path" tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md documentation/ielts-reading-v2-listening-unification-implementation-log.md` and `rtk rg -n "assessment-line-budget|protected path changed for reviewer attention" scripts/check-assessment-unification-guardrails.mjs .github/workflows/assessment-unification-guardrails.yml` returned the expected Task 3.4 state and protected-path references.

### Scope And Task State

Changed scope is limited to the Task 3.4 guardrail script, its test, workflow, and Task 3 evidence/status docs. No runtime/live/storage production behavior changed. No deploy, push, or commit occurred.

Task 3.4 remains checked. Parent Task 3.0 remains unchecked. Tasks 3.5 through 3.17 remain unchecked.
