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
