# Task List: PRD 0055 IELTS Reading V2 And Listening Unified Assessment Platform

Status: Task 1 planning completed on 2026-06-20 after explicit product-owner and architecture/security reviewer approval; implementation remains unstarted and requires separate child-specific authorization and gates
Source PRD: `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
Generated under: `documentation/tasks/generate-tasks.md`

## Relevant Files

- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - Approved parent product and architecture authority; OQ-1 through OQ-4 are binding, while implementation remains gated by approved child PRDs.
- `tasks/0056-prd-listening-upload-worker-security-gate-s0.md` - Draft child PRD for the severable Listening upload-worker Security Gate S0; Task 1 planning is complete; implementation remains blocked pending a child-specific approved implementation packet, product-owner plus architecture/security review, and all S0 proof gates.
- `tasks/0056a-prd-listening-upload-session-bridge.md` - Approved planning bridge for backend-issued Listening upload sessions/assets and the `temp/listening-audio/` to `temp/listening/` transition; Task 1 planning is complete; implementation remains blocked pending an approved implementation packet and deployed/current S0 proof.
- `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md` - Draft child PRD for Listening draft, publish, immutable version, revision, and legacy transition behavior; B2 Option B data contract and Task 1 planning are approved; implementation remains blocked pending Task 3 shared-presentation stability, minimum PRD-0058 foundation, child-specific review, and explicit authorization.
- `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md` - Draft child PRD for R2 asset lifecycle, registry, reconciliation, cleanup, and delivery; B1 Option B bridge ownership and Task 1 planning are approved; implementation remains blocked pending deployed/current PRD-0056A proof, child-specific review, dependencies, and explicit authorization.
- `tasks/0059-prd-listening-solo-homework-runtime-alignment.md` - Draft child PRD for Listening solo/homework runtime alignment, submit idempotency, resume, mobile state, and host-bounded private delivery; Task 1 planning is complete; implementation remains blocked pending Task 5 authoring stability, child-specific product-owner plus architecture review, and remaining proof gates.
- `tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md` - Draft child PRD for canonical Listening live-session authority, teacher/student runtime recovery, private-delivery handoff, and the 100-student-by-20-session load-test plan; Task 1 planning is complete; implementation remains blocked pending dedicated authority tests/harness, applicable authoring/delivery dependencies, child-specific product-owner plus architecture/security approval, and remaining proof gates.
- `tasks/0061-prd-reading-v2-runtime-visual-alignment.md` - Draft child PRD for projection-bound Reading V2 runtime visual alignment, protected host/data contracts, responsive/accessibility proof, and bounded presentation decomposition; Task 1 planning is complete; implementation remains blocked pending Task 3 shared-authoring stability, dedicated Reading V2 runtime tests, child-specific product-owner review, and explicit authorization.
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - This implementation tasklist and progress source of truth.
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - Append-only implementation findings/evidence file to create before implementation.
- `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - Requirement-to-task/child-PRD/test matrix; zero unmapped rows required before Task 1 STOP.
- `tasks/large-file-maps-0055/` - Per-file structural comprehension maps required before editing or boundary-verifying large/named source files.
- `documentation/ielts-reading-v2-listening-unification-strategy.md` - Product direction and sequencing.
- `documentation/ielts-reading-v2-listening-unification-research.md` - Current architecture research.
- `documentation/ielts-reading-v2-listening-unification-audit.md` - Boundary and risk audit.
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md` - Existing shared-primitive patch evidence.
- `documentation/architecture/ielts-reading-v2-listening-unification.md` - Canonical module-boundary authority.
- `documentation/architecture/upload-storage-authority.md` - R2-only upload authority and storage lifecycle contract.
- `documentation/architecture/ui-design-standards.md` - Required teacher/shared UI design rules.
- `documentation/architecture/mobile-ielts-listening-audio-navigation.md` - Listening mobile navigation authority.
- `documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md` - Listening runtime diagnostics authority.
- `documentation/rules/infrastructure.md` - Required rules for Firebase paths, workers, backups, and deployments.
- `documentation/rules/codebase-hygiene.md` - Required rules for producer/consumer storage changes and Mantine removal.
- `documentation/rules/react-patterns.md` - Required rules for new shared components and async React state.
- `documentation/rules/mobile-portability.md` - Required rules for browser APIs and client persistence.
- `documentation/rules/observability.md` - Required page/action tracking contract.
- `documentation/rules/announcements.md` - Required save/publish/delete user announcement behavior.
- `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md` - Current manual deployment guide for the deployed `r2-upload-signer` native `env.R2_BUCKET` worker; differs from checked-in upload-worker source.
- `src/features/assessment/shared/components/AssessmentStatusState.tsx` - Existing neutral loading/error/empty/status primitive.
- `src/features/assessment/shared/components/AssessmentStatusState.test.tsx` - Component semantics and accessibility tests.
- `src/features/assessment/shared/components/AssessmentValidationSummary.tsx` - Existing neutral calculated-validation display.
- `src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx` - Validation summary semantics tests.
- `src/features/assessment/shared/components/AssessmentAuthoringSection.tsx` - Existing neutral authoring section primitive.
- `src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx` - Section roles, heading, action, and slot tests.
- `src/pages/ReadingV2StudioPage.tsx` - Existing Reading V2 route-level shared status adoption.
- `src/pages/ReadingV2StudioPage.test.tsx` - Reading V2 route-state regression tests.
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx` - Existing shared section/validation adoption.
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx` - Reading V2 display-section regression tests.
- `src/skills/listening/builders/ListeningTestBuilder.tsx` - Current Listening builder, upload flow, questions, review, and single save/publish UI.
- `src/skills/listening/builders/ListeningTestBuilder.test.tsx` - Listening builder authoring tests.
- `src/pages/TestBuilderRouter.tsx` - Routes Listening authoring to `ListeningTestBuilder`.
- `src/services/listeningTestStorage.ts` - Current Listening persistence owner; currently hard-blocks missing audio and writes `isPublished: true`.
- `src/services/r2Storage.ts` - Current R2 browser upload/move service, exported as `r2StorageService`.
- `src/services/r2Storage.test.ts` - Current R2 client-service tests.
- `cloudflare/worker.js` - Current upload/move worker; security gate S0 target.
- `cloudflare/package-lock.json` - Existing upload-worker dependency lock; no checked-in `package.json` currently exists.
- `cloudflare/wrangler.toml` - Proposed only if Task 2 chooses Wrangler-managed upload-worker deployment; does not currently exist.
- `database.rules.json` - RTDB rules for any new Listening draft/version/asset registry paths.
- `firebase.json` - Firebase emulator/deployment configuration; Task 4 must verify executable RTDB emulator wiring before rule-test work.
- `src/__tests__/security/firebaseRules.test.ts` - Existing non-emulator RTDB contract test; not sufficient as the Task 4 emulator anchor.
- `src/__tests__/security/prd0040-security.emulator.test.ts` - Existing `@firebase/rules-unit-testing` emulator-backed rule-test pattern for Task 4.
- `.github/workflows/assessment-unification-guardrails.yml` - Proposed low-cost CI guardrail workflow for shared-boundary grep and focused shared tests.
- `r2-backup-worker/src/auth/firebase-auth.ts` - Existing worker-side Firebase identity verification pattern.
- `r2-backup-worker/src/index.ts` - Existing scheduled worker/router and potential reconciliation integration owner.
- `r2-backup-worker/src/backup/media-delta.ts` - Existing media backup behavior relevant to deletion retention.
- `r2-backup-worker/src/backup/retention.ts` - Backup retention owner.
- `r2-backup-worker/src/restore/gdpr-filter.ts` - Existing restore/deletion filtering behavior.
- `r2-backup-worker/wrangler.toml` - Existing scheduled worker bindings and cron configuration.
- `r2-backup-worker/package.json` - Worker test/deploy commands.
- `src/components/practice/ListeningPracticeView.tsx` - Solo/homework Listening runtime owner.
- `src/components/practice/ListeningPracticeView.test.tsx` - Solo/homework runtime regression tests.
- `src/components/test/mobile/MobileListeningExamScaffold.tsx` - Student mobile Listening shell.
- `src/components/test/mobile/MobileListeningExamScaffold.test.tsx` - Mobile shell tests.
- `src/components/test/mobile/mobileListeningState.ts` - Solo/homework mobile playback persistence owner.
- `src/components/test/mobile/mobileListeningState.test.ts` - Mobile state tests.
- `src/skills/listening/components/AudioPlayer.tsx` - Shared Listening playback component; protected for live/runtime work.
- `src/skills/listening/components/AudioPlayer.test.tsx` - Playback, source, and synchronization tests.
- `src/skills/listening/components/ListeningTestPage.tsx` - Live Listening student runtime owner.
- `src/__tests__/integration/ListeningTestPage.test.tsx` - Live Listening integration test anchor.
- `src/pages/TestPageRouter.tsx` - Student/live test runtime router.
- `src/pages/TestPageRouter.test.tsx` - Runtime routing tests.
- `src/pages/TeacherTestMonitorPage.tsx` - Teacher live-monitor and authority shell.
- `src/pages/TeacherTestMonitorPage.test.tsx` - Teacher monitor tests.
- `src/components/test/AudioProgressPanel.tsx` - Rich teacher audio-state UI and broadcast owner.
- `src/components/test/TeacherTestControlBar.tsx` - Teacher monitor action bar.
- `src/components/test/HeadphoneRequestPanel.tsx` - Headphone readiness approval/denial UI.
- `src/hooks/monitor/useMonitorControls.ts` - Teacher live-session command writer.
- `src/hooks/monitor/useMonitorControls.test.ts` - Monitor command tests.
- `src/hooks/audio/useMasterAudioState.ts` - Master audio-state synchronization owner.
- `src/hooks/audio/useAudioSync.ts` - Student drift-correction owner.
- `src/config/featureRegistry.ts` - Visible action/page observability registry.
- `src/config/featureRegistry.test.ts` - Registry coverage tests.
- `src/components/results/ReviewTab.tsx` - Existing saved-result review surface relevant to Listening audio compatibility.
- `src/components/results/ReviewTab.test.tsx` - Result review regression tests.
- `src/components/results/ResultSlidePanel.tsx` - Existing result detail/review shell.
- `src/components/results/ResultSlidePanel.test.tsx` - Result detail/review tests.

### Notes

- Follow `documentation/tasks/process-task-list.md` while implementing. Complete tasks in order unless this tasklist explicitly permits parallel work.
- Create the findings file before implementation. Keep it strictly append-only: append after each completed subtask; never edit, remove, reorder, or combine prior entries.
- Corrections to findings are appended as new entries that supersede earlier entries; prior entries are never mutated. Traceability matrix is the mutable status/evidence surface.
- PRD-0055 authorizes planning, not one broad implementation patch. Task 1.12 approval was recorded on 2026-06-20. No implementation task may start in the same run that completes Task 1.
- Task 3 may proceed only in a separate explicitly scoped and approved run because it preserves presentation-only boundaries and reconciles existing shared work. Task 1 approval does not authorize Task 3 or bypass storage, authoring, runtime, or child-specific gates.
- Execution order is not strict numeric order after the Task 1 planning STOP. Any later task requires separate explicit scope and authorization. Backbone dependency order remains Task 2 -> Task 4 -> Task 5, but no task is automatically authorized or automatically next.
- Tasks 2 and 4 through 8 are provisional scaffolding. Before each starts, regenerate/reconcile its subtasks against the approved child PRD. If the child PRD differs, the child PRD wins and this tasklist must be rewritten before implementation.
- OQ-1 through OQ-4 were formally approved on 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`. Junior developers must follow the approved binding decisions and must not alter them silently.
- OQ-1 binding decision: no Google Drive migration, current playback removal, new behavior, or new Google Drive-specific error state; upload-code removal and disposition/deletion of Google Drive-backed tests occur in a separate task. OQ-1 does not block Task 3.
- OQ-3 binding decision approves urgent severable S0 child-PRD planning only. Keep S0 narrow: authentication, ownership, prefix/raw-key validation, CORS, rate limits, tests, deploy, and rollback. Canonical-worker selection remains unresolved until the S0 child PRD.
- Confirmed deployment drift must be resolved before S0 design: checked-in `cloudflare/worker.js` uses `aws4fetch` plus S3 credentials, while `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md` documents deployed `r2-upload-signer` code using native `env.R2_BUCKET`. No upload-worker `wrangler.toml`, checked-in deploy command, or checked-in rollback command currently exists.
- Private-delivery order is fixed: Task 6 builds server issuance/range support and result-review integration while solo/live stay public; Task 7 may cut solo only through a proven host/adapter path without `AudioPlayer` internal edits; Task 8 owns every `AudioPlayer` internal refresh/source-handoff change and the live cutover.
- Rollout is phase-local, not deferred to Task 9: Task 5 produces real draft/publish traffic before Task 6 reconciliation; Tasks 6, 7, and 8 each run internal/selected cohorts before their dependents or final rollout.
- File-architecture anti-goal: do not reproduce the Reading V2 monolith pattern in Listening. New behavior must be born in small single-responsibility modules behind thin existing facades; safe-edit protocols for large files do not authorize growing them.
- Existing shared components/adoptions must be reconciled and tested before being marked complete. Current dirty/untracked state is not completion evidence.
- Google Drive handling is outside this tasklist. Do not add, remove, migrate, test as new supported behavior, or change existing Google Drive playback. Separate cleanup/deletion task owns it.
- Root tests use Vitest, not Jest. Use focused commands such as `npx vitest run <files> --reporter=basic`.
- Browser, deployment, multi-browser, iOS Safari, and live-session proofs are human-assisted gates. Agent must prepare commands/fixtures/evidence template and stop when human access or approval is required.
- Every Playwright run must emit JSON: `npx playwright test <optional-spec> --reporter=json > report.json`. Preserve `report.json` or record its artifact path in findings before another run overwrites it.
- Worker tests use the owning worker package command after its test harness is defined. `r2-backup-worker` uses `npm --prefix r2-backup-worker test`.
- Before Firebase path/rule work, read `documentation/rules/infrastructure.md`; before modifying producer/consumer storage shapes, read `documentation/rules/codebase-hygiene.md`.
- Before UI/action work, read `DESIGN.md`, `documentation/architecture/ui-design-standards.md`, `documentation/rules/observability.md`, and `documentation/rules/announcements.md`.
- Each implementation parent lands as one or more independently reviewable and independently revertible packets/PRs. Parent completes only after every packet is merged, tested, traceable, and has rollback evidence. Approved child PRD defines packet boundaries; one mega-commit per parent is prohibited.
- Serialize merge-conflict hotspots: Task 3 `ListeningTestBuilder.tsx` presentation work lands before Task 5 authoring behavior work; `listeningTestStorage.ts` write-model packets do not overlap; Task 7 does not edit `AudioPlayer.tsx` internals before Task 8.
- Every completed subtask/parent must update its traceability rows with implementation status and verification evidence. A checked task without updated traceability is incomplete.
- Stop if implementation needs a storage path, schema, authority owner, migration rule, or runtime behavior not fixed by PRD-0055 or an approved child PRD. Record the gap; do not invent it.

### Verification Standard

This standard applies to every numbered subtask. A checkbox may change to `[x]` only when its own evidence record satisfies this standard; parent acceptance cannot retroactively prove incomplete subtasks.

Per-subtask Definition of Done:

1. Preconditions and declared scope are satisfied.
2. Required output exists in the named file/path.
3. Exact acceptance claims are listed as binary statements in findings.
4. Focused verification names the tests/checks that prove each claim.
5. Traceability rows are updated with status, verification technique, and artifact links.
6. Diff audit shows no undeclared files/regions or unrelated behavior changes.
7. Any blocker, partial result, or deferred requirement remains unchecked and is recorded explicitly.

Behavioral code/data/contract subtasks additionally require:

1. Characterization or target test written/identified before production edit.
2. RED evidence captured: exact command, failing test name, failure count, and expected failure reason.
3. GREEN evidence captured: exact command, passing test names/counts, and relevant output.
4. Mutation proof captured:
   - temporarily break the exact claimed behavior using a local test-only/source mutation;
   - run the focused test and record the expected failure;
   - restore the production file byte-exact or prove the intended diff is restored;
   - rerun the focused test and record GREEN;
   - never perform mutation proof against deployed production data or irreversible infrastructure.
5. Browser/deploy proof added when unit/integration tests cannot prove the claim.

Required evidence schema for each completed subtask in the append-only findings file:

```text
Subtask:
Claims proven:
Files and declared touch regions:
Lines before -> after and responsibility delta:
Created/preserved decomposition seams:
Traceability row IDs:
Characterization/baseline:
RED command and result:
GREEN command and result:
Mutation proof and restoration evidence:
Static/boundary/diff checks:
Browser/deploy artifacts:
Residual risks or deferred items:
Verifier and verification outcome:
```

For documentation/planning-only subtasks, mark RED/GREEN/mutation as `not applicable - non-behavioral` and provide structural checks, contradiction scans, source citations, and independent review evidence instead.

Independent verification:

- Tasks 2, 4, 5, 6, 7, and 8 each require a fresh-context verification pass after implementation and before parent acceptance.
- Verifier must not be the same implementation pass. Use a separate agent/thread or human reviewer with only the approved PRD/child PRD, traceability rows, comprehension maps, diff, and evidence packet.
- Verifier must search for omitted PRD details, inspect undeclared files/regions, rerun focused tests, rerun mutation proofs, confirm protected boundaries, and challenge claimed deferrals.
- Implementer fixes findings, updates evidence, and obtains a clean re-review before parent completion.

### Large-File Protocol

Trigger:

- Any human-maintained source, test, or style file with 800 or more lines.
- Any named file below, regardless of current line count:
  - `src/skills/listening/builders/ListeningTestBuilder.tsx`
  - `src/skills/listening/components/ListeningTestPage.tsx`
  - `src/skills/listening/components/AudioPlayer.tsx`
  - `src/components/practice/ListeningPracticeView.tsx`
  - `src/services/listeningTestStorage.ts`
  - `src/components/test/AudioProgressPanel.tsx`
  - `src/pages/TeacherTestMonitorPage.tsx`
  - `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx`
  - `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
  - `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`
  - `src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.tsx`
  - `src/components/reading-v2/studio/ReadingV2TaskGroupEditor.tsx`

No edit or boundary-verification claim for a triggered file may begin until:

1. Full-read evidence:
   - read every line/page end-to-end;
   - record `lines read N / total N`, command/tool, and completion timestamp;
   - partial read is a hard stop.
2. Structural comprehension map:
   - create/update `tasks/large-file-maps-0055/<path-slug>.md`;
   - map every export and top-level symbol;
   - map every state variable;
   - map every `useEffect` and dependency list;
   - map every side-effecting network, Firebase, R2, audio, storage, navigation, timer, and session call;
   - map branch conditions and their line ranges;
   - identify callers/consumers relevant to the declared change.
   - record proposed future decomposition seams: named regions/responsibilities that should become separate modules under a later approved refactor PRD.
3. Doc-vs-code parity:
   - compare PRD, audit, architecture docs, implementation log, and current code;
   - record matching claims, drift, and which source wins before editing.
4. Characterization baseline:
   - add or identify tests pinned to the exact current behavior of the region being changed;
   - run GREEN before production edit;
   - if no focused test can characterize it, stop and add one first.
5. Declared touch region:
   - record exact functions/symbols and pre-edit line ranges allowed to change;
   - record protected neighboring functions/regions that must not change.
6. Surgical edit:
   - use verified-unique anchors and scoped patches;
   - never overwrite/rewrite the whole large file;
   - never reflow or format unrelated regions;
   - decomposition is allowed only inside the active seam, behind green characterization tests, and only when it reduces risk for the approved change.
7. Intra-file diff audit:
   - inspect every changed hunk;
   - prove each hunk belongs to the declared touch region;
   - record unexpected formatting/reflow as failure and restore it.
8. Context-budget guard:
   - check remaining context before loading a 3,000-plus-line file;
   - when context is insufficient, use a dedicated read-only exploration/sub-agent pass to produce the full comprehension map;
   - editing pass must still fully read and understand every region it edits, validate the map against current bytes, and cannot rely blindly on another agent's summary.

Large-file evidence is linked from the subtask findings record and traceability matrix. Missing map, partial read, absent characterization test, or undeclared changed hunk blocks completion.

### File-Architecture Principles (MANDATORY)

Anti-goal: do not recreate the Reading V2 large-file pattern represented by `ReadingV2BuildWorkspace.tsx`, `readingV2ImportNormalization.service.ts`, and `ReadingV2StudioShell.tsx`. Healthy reference is `src/features/assessment/shared/components/`: one responsibility per file, focused tests, explicit boundaries, and small composition surfaces.

1. New behavior is born in new single-responsibility modules, not appended to `src/services/listeningTestStorage.ts`, `src/skills/listening/builders/ListeningTestBuilder.tsx`, or `src/services/r2Storage.ts`.
2. Those existing files remain public facades/orchestrators. They may receive narrow imports, delegation calls, wiring, and compatibility adapters, but must not gain a new domain responsibility. Findings record `lines before -> after`, responsibilities before/after, and justification for every net increase.
3. Default feature home follows PRD section 9: new Listening authoring, storage, audio/media, adapter, and type modules live under an approved coherent bounded package, preferably `src/features/assessment/listening/**`. A child PRD may select an existing Listening root only when it keeps one coherent package and does not create a third scattered ownership root.
4. Soft size budget: each new human-maintained production source file targets 400 lines or fewer. Exceeding 400 lines requires written responsibility analysis, split alternatives, and reviewer approval in findings. Generated artifacts and large declarative fixtures are excluded but still require focused ownership.
5. Extract-on-touch: when a triggered large file must be edited to add behavior, default action is to place new behavior in a new module behind green characterization tests and add only thin delegation in the large file. Appending behavior in place requires explicit child-PRD justification and architecture-review approval.
6. Dependency direction for new feature modules is `listening -> shared`. New Listening modules never import Reading V2 internals and must not create cycles back through facade internals.
7. Task 3.4 CI enforces dependency direction and size-budget reporting for new/changed assessment feature modules. CI is guardrail, not substitute for child-PRD ownership review.
8. Every parent touching a named monolith records created/preserved extraction seams, before/after line counts, and responsibility deltas in its comprehension map, findings, and traceability rows. Future refactor PRDs inherit these maps.

## Tasks

- [x] 1.0 Resolve PRD-0055 approval gates and establish child-PRD execution boundaries
  - [x] 1.1 Read `AGENTS.md`, PRD-0055, all four unification docs, canonical unification architecture, upload-storage authority, `process-task-list.md`, and every triggered rule document before implementation.
  - [x] 1.2 Create `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` with sections for working tree, decisions, current owners, completed subtasks, verification, blockers, rollback notes, and next subtask.
  - [x] 1.3 Record `git status --short`, current branch/upstream, tracked/untracked state of PRD/shared-component files, and existing unrelated user changes. Do not clean, stage, revert, or absorb unrelated work.
  - [x] 1.4 Re-run current-state inspection proving: Listening save hard-blocks missing audio; save writes `isPublished: true`; no Listening draft lifecycle exists; current R2 service path is `src/services/r2Storage.ts`; live audio remains dual-path; existing shared primitives/adoptions match the implementation log.
  - [x] 1.5 Present OQ-1 through OQ-4 to the product owner exactly as written in PRD section 29 and record explicit approval/revision for each:
    - OQ-3 worker security severability first because it is a live security issue.
    - OQ-1 Google Drive scope: recommendation already settled in conversation; obtain formal sign-off and do not treat it as a new product decision.
    - OQ-2 legacy published transition.
    - OQ-4 public/private R2 transition.
  - [x] 1.6 Update PRD-0055 from Draft to Approved only after all four questions are resolved using non-destructive documentation history: retain each provisional `Proposed under OQ-*` statement, mark it obsolete in a blockquote with the approval date/decision reference, append the approved binding text, and run contradiction scans. Do not erase or silently rewrite prior decision history.
  - [x] 1.7 Create separate child PRDs, using the next available task numbers at creation time, for:
    - urgent upload-worker security S0 if OQ-3 approves it; this child PRD must first decide whether checked-in `aws4fetch`/S3 code or deployed native `env.R2_BUCKET` code is canonical, then capture worker name, non-secret binding/secret names, exact deploy mechanism, exact rollback/version-pin mechanism, and mechanism-matched test harness;
    - approved Packet 1J bridge PRD-0056A between S0 and storage lifecycle, owning backend-issued upload sessions/assets and the temp-prefix transition;
    - Listening authoring draft/publish/version behavior;
    - R2 asset lifecycle, registry, reconciliation, cleanup, and delivery;
    - Listening solo/homework runtime alignment;
    - Listening live-session authority/runtime and load-test plan;
    - Reading V2 runtime visual alignment, explicitly deferred until shared authoring stability and dedicated Reading V2 runtime tests exist.
  - [x] 1.8 Require each child PRD, including approved bridge PRD-0056A, to list exact owned files, protected files, data paths, schemas, allowed changes, prohibited changes, tests, browser proof, rollback, observability, and stop conditions. Each child PRD that adds Listening behavior must define its coherent bounded module home, facade boundaries, allowed dependency direction, per-file size budget, before/after line-count evidence, and decomposition seams under the File-Architecture Principles. Storage/delivery child PRD must define delivery-read authorization from retained reference/assignment/result access and cross-user issuance denial. Do not allow placeholders or "developer decides."
  - [x] 1.9 Create `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` before finalizing child PRDs:
    - one row for every PRD functional requirement, including lettered requirements;
    - one row for every section 17 edge case;
    - one row for every section 19 data/storage constraint and required lifecycle/security item;
    - one row for every section 20 accessibility requirement;
    - one row for every section 21 mobile/desktop requirement;
    - one row for every section 25 success metric;
    - one row for every section 26 acceptance criterion;
    - one row for every section 27 regression-checklist item;
    - one row for every section 29 open question and decision-register item;
    - columns: requirement ID, exact summary, owning parent/subtask, owning child PRD, implementation status, verification technique (`test`, `RED/GREEN`, `mutation`, `browser`, `deploy`, `parity`, `diff audit`, or approved combination), verification evidence/artifact links, and explicit defer reason/approval where applicable;
    - during child-PRD drafting, `tasks/<draft-id> (pending finalization)` is a valid interim owning-child-PRD value; `none`, blank owner, vague `later`, or unmapped rows remain hard failures;
    - before Task 1.11, every interim draft owner must resolve to a finalized child PRD or a named product-owner-approved deferral;
    - every explicit deferral names its future PRD/task, entry gate, and product-owner approval;
    - update the matrix whenever a child PRD or this tasklist changes.
  - [x] 1.10 Define dependency order in findings, traceability matrix, and child PRDs:
    - Task 1.12 approval/HARD STOP was satisfied on 2026-06-20 by separate explicit product-owner and architecture/security reviewer approvals. This completes planning only and does not authorize any implementation node.
    - Task 3 neutral shared presentation may proceed only in a separate explicitly approved run under its existing display-only scope and may then parallelize with separately approved S0 or live-contract test preparation.
    - PRD-0056 S0 canonical Worker/deploy/rollback/harness implementation and deployed/current proof precede PRD-0056A reliance on secured upload/move behavior.
    - PRD-0056A is the mandatory bridge between PRD-0056 and PRD-0058; no direct PRD-0056 -> PRD-0058 implementation edge exists.
    - PRD-0056A precedes minimum PRD-0058 registry-backed lifecycle: commit, references, immediate discard cleanup, fallback cleanup, backup/restore coverage, and orphan metrics.
    - no audio-bearing Save draft may ship until that minimum PRD-0058 foundation is accepted.
    - PRD-0057 authoring write-model work waits for approved B2 plus Task 3 shared-presentation stability and minimum PRD-0058 foundation.
    - PRD-0058 advanced reconciliation, result-review private delivery, and issuance/range proof follow minimum storage; Task 5 selected-teacher traffic must exist before Task 6 reconciliation conclusions.
    - PRD-0059 solo runtime waits for Task 5 authoring stability; solo private cutover waits for Task 6 issuance/range/result proof and never modifies `AudioPlayer` internals.
    - PRD-0060 live runtime waits for dedicated authority contract tests and test harness; Task 8 owns shared `AudioPlayer` internal refresh/source-handoff and live cutover.
    - PRD-0061 Reading V2 runtime waits for Task 3 shared-authoring stability and dedicated Reading V2 runtime tests.
    - Task 9 full rollout waits for all applicable phase-local acceptance gates.
  - [x] 1.11 Parent acceptance: PRD status/decision text is internally consistent, child PRDs exist, dependency graph is recorded, traceability is 100 percent with zero orphan requirements, every interim draft owner is resolved to a finalized child PRD or named approved deferral, every deferral is named/approved, no implementation ambiguity is delegated to a junior developer, and document checks pass.
  - [x] 1.12 HARD STOP: presented OQ decisions, draft child PRDs, complete traceability matrix, dependency graph, and Task 1 evidence to the product owner plus architecture/security reviewer. Separate explicit approvals were recorded on 2026-06-20 under `PRD-0055-TASK-1.12-PRODUCT-OWNER-APPROVAL-2026-06-20` and `PRD-0055-TASK-1.12-ARCHITECTURE-SECURITY-APPROVAL-2026-06-20`. End the run. Do not continue into Task 2 or any later implementation task without separate explicit authorization.

- [ ] 2.0 Ship urgent severable upload-worker security hardening gate S0
  - [x] 2.1 Record explicit product-owner plus architecture/security reviewer sign-off in findings. Reconcile/regenerate this provisional scaffold against the approved S0 child PRD; child PRD wins. Do not continue on mismatch.
  - [x] 2.2 Resolve canonical upload-worker and deployment truth before code changes:
    - read `documentation/rules/infrastructure.md`, `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md`, checked-in `cloudflare/worker.js`, and deployed `r2-upload-signer` source/configuration;
    - record deployed worker name, route/domain, native bindings, secret names without values, deployment history, and current rollback mechanism;
    - decide whether canonical implementation uses checked-in `aws4fetch`/S3 credentials or native `env.R2_BUCKET`;
    - record exact source-of-truth, deploy, version-pin, and rollback procedure;
    - if Wrangler becomes canonical, record that approved `cloudflare/wrangler.toml` must be checked in during the approved harness/implementation subphase before deploy; if dashboard deployment remains canonical, document exact dashboard deployment/version rollback steps;
    - stop if deployed source/configuration cannot be obtained or reconciled.
  - [x] 2.3 Establish a checked-in test harness only after 2.2 resolves mechanism. For `aws4fetch`/S3 style, use focused fetch/signing mocks. For native `env.R2_BUCKET`, use Miniflare or `@cloudflare/vitest-pool-workers` and add the required dev dependency/config. Restore/create `cloudflare/package.json` consistently, add focused worker tests, and document exact local command. Treat harness/bootstrap as a non-trivial S0 subphase.
  - [x] 2.4 Write negative tests first and prove insecure-baseline failures for:
    - missing/invalid Firebase identity;
    - cross-owner upload;
    - cross-owner move;
    - arbitrary `sourceKey`/`destKey`;
    - forbidden prefixes;
    - wildcard/unapproved CORS origin;
    - unsupported method;
    - over-limit upload request;
    - replayed or expired authorization.
  - [x] 2.5 Reuse or extract the verified Firebase-token pattern from `r2-backup-worker/src/auth/firebase-auth.ts` only if compatible with the upload worker runtime; do not copy service secrets or introduce client-trusted ownership.
  - [x] 2.6 Require Firebase authentication on every non-`OPTIONS` upload/move route; use verified token `sub` as owner identity; reject browser `ownerId`, `uid`, email, and role authority; and reject cross-owner operations before R2 access. Browser-supplied raw keys must never select or authorize an R2 operation. Packet 2I integrated Task 2.6/2.7/2.9 proof establishes full raw-key non-authority and closes the approved checkpoint exception.
  - [x] 2.7 Restrict operations to child-PRD-approved prefix families and server-derived canonical owner/path structure; reject traversal, alternate encoding, absolute paths/URLs, duplicate separators, control characters, unsupported/forbidden prefixes, cross-prefix movement, and overwrite outside allowed scope. Task 2.7 implementation is explicitly permitted while Task 2.6 remains provisionally incomplete.
  - [x] 2.8 Replace wildcard CORS with exact approved production and localhost origins; return correct preflight headers only to allowed origins. Task 2.8 may proceed after Task 2.7 focused proof while Task 2.6 remains provisionally incomplete.
  - [x] 2.9 Issue and verify opaque upload/move grants; bind UID, operation, canonical source/destination, content type, size, expiry, and nonce; treat browser `key`, `sourceKey`, and `destKey` only as optional non-authoritative assertions; enforce expiry, tamper/replay rejection, request/rate controls, and the 50 MB per-request/per-file ceiling. Task 2.9 may proceed after Task 2.8 focused proof while Task 2.6 remains provisionally incomplete. Full raw-key non-authority is satisfied only after Tasks 2.7 and 2.9 integrate with Task 2.6 authentication/owner scope; then Task 2.6 may be checked and normal strict order resumes at Task 2.10. Do not implement the 10-files-per-test rule here because S0 has no authoritative test-level state; Task 4 upload-session/application logic owns that rule. Do not implement registry, heartbeat, deletion, cleanup, or private-delivery behavior in S0.
  - [ ] 2.10 Run the negative suite after hardening and prove all authorization/prefix/CORS cases pass locally.
  - [ ] 2.11 Human-assisted deploy gate: deploy only with explicit approval through the exact mechanism captured in 2.2. Verify configured bindings/secrets by name, deployed negative tests, and one authorized upload/move path without exposing token values, signed URLs, or raw keys in logs. Any Playwright/browser proof uses `--reporter=json > report.json`.
  - [ ] 2.12 Document and drill rollback using the real mechanism: preserve previous deployment version, identify Wrangler rollback/version command or exact dashboard version-pin steps, restore that version in a non-destructive proof, and verify rollback does not delete or move existing audio.
  - [ ] 2.13 Update upload-storage authority, implementation log, and findings with exact deployed behavior and remaining lifecycle gaps.
  - [ ] 2.14 Run the mandatory fresh-context independent verification pass from the Verification Standard. Reviewer must inspect S0 child-PRD coverage, worker diff, authorization boundaries, large-file maps if triggered, RED/GREEN and mutation evidence, deployed proof, and rollback; resolve all findings and obtain clean re-review.
  - [ ] 2.15 Parent acceptance: local and deployed cross-owner/raw-key/CORS tests pass, authorized existing upload/move still works, no lifecycle behavior changed, independent verification passes, and S0 is independently revertible.

- [ ] 3.0 Complete neutral shared assessment authoring primitives and safe cross-module visual adoption
  - [ ] 3.1 Reconcile existing uncommitted/tracked foundation against implementation log:
    - `AssessmentStatusState`;
    - `AssessmentValidationSummary`;
    - `AssessmentAuthoringSection`;
    - Reading V2 Studio/Settings adoptions;
    - Listening Questions/empty-state adoptions.
    - Treat current source/tasklist paths as authoritative where the implementation log has drift. Record, but do not copy, stale `src/hooks/useMasterAudioState.ts` / `src/hooks/useAudioSync.ts` references; current owners are under `src/hooks/audio/`. Record duplicate Patch 2/Patch 3 headings as documentation drift.
  - [ ] 3.2 Run existing focused tests and boundary grep before marking any foundation subtask complete. Record failures or drift rather than recreating components.
  - [ ] 3.3 Track/commit the existing shared primitives and current Reading/Listening adoptions in a focused green patch before adding another primitive. Do not build new shared work on an uncommitted or failing foundation.
  - [ ] 3.4 Add a low-cost CI guardrail before additional shared extraction:
    - create `.github/workflows/assessment-unification-guardrails.yml`;
    - fail on prohibited Reading V2/Listening imports or module-specific authority symbols under `src/features/assessment/shared/`;
    - enforce new `src/features/assessment/listening/**` dependency direction: Listening may import neutral shared contracts, never Reading V2 internals, and never create a cycle through `ListeningTestBuilder.tsx`, `listeningTestStorage.ts`, or `r2Storage.ts`;
    - report new/changed human-maintained assessment production files over the 400-line soft budget and fail when required findings justification/approval is absent;
    - run focused Vitest suites for `src/features/assessment/shared/**`;
    - optionally annotate changes to protected live/storage files for reviewer attention without pretending annotation replaces child-PRD gates;
    - document exact local equivalents and prove CI fails under one temporary prohibited-import/test mutation, then restore and prove green.
  - [ ] 3.5 Define one small next neutral primitive only when Reading V2 and Listening both have immediate same-PR or explicitly adjacent-PR consumers. Candidate order:
    - authoring card;
    - authoring header;
    - action row;
    - metadata display panel;
    - review/publish display wrapper;
    - question-card wrapper;
    - mobile layout primitive for neutral spacing, stacking, and touch-target sizing.
  - [ ] 3.6 For each candidate, document both concrete adopters, existing semantics, heading structure, action placement, mobile behavior, and tests before creating the shared component. If a question-card/mobile primitive lacks two identical neutral contracts, explicitly defer it in the traceability matrix to the named Reading V2/Listening runtime child PRD; do not silently omit or speculatively extract it.
  - [ ] 3.7 Write component tests first for children, title/description, heading level, status/action slots, accessible region naming, neutral layout props, and absence of module behavior.
  - [ ] 3.8 Implement the primitive under `src/features/assessment/shared/components/` using local CSS and no new Mantine dependency.
  - [ ] 3.9 Adopt in one Listening authoring display-only surface without moving parser, validation calculation, audio, persistence, or event handlers.
  - [ ] 3.10 Adopt in one Reading V2 authoring display-only surface without moving import normalization, projection, publish workflow, review navigation, or runtime behavior.
  - [ ] 3.11 Reassess `AssessmentValidationSummary` for one Listening branch. Adopt only if heading, ready/blocked status, issue count, copy, and existing behavior remain exact; otherwise record deferral.
  - [ ] 3.12 Keep shared copy module-supplied. Shared components must not contain Reading, Listening, audio, passage, parser, storage, teacher, or live-session wording/conditions.
  - [ ] 3.13 Do not create shared answer inputs until two modules prove identical semantic, validation, accessibility, and persistence contracts in a later approved child PRD.
  - [ ] 3.14 Handle Listening Mantine `AppShell` removal as a dedicated authoring-shell patch after primitive stability; read codebase hygiene/UI architecture first and do not combine with storage or save-model work.
  - [ ] 3.15 Run focused component/adopter tests and boundary grep:
    - no imports from Reading V2 internals in shared;
    - no imports from Listening internals in shared;
    - no `audioCommand`, `masterAudioState`, parser, storage, passage, or published-payload behavior in shared.
  - [ ] 3.16 Update implementation log and findings after each primitive/adoption patch, including exact tests and deferred candidates.
  - [ ] 3.17 Parent acceptance: CI guardrails are green and mutation-proven for shared boundaries plus new Listening dependency/size rules; each new shared primitive has two real consumers; both modules retain behavior ownership; tests pass; boundary grep is clean; runtime/live/storage files remain untouched.

- [ ] 4.0 Establish minimum registry-backed draft-audio retention foundation
  - [ ] 4.1 Record explicit product-owner plus architecture/security reviewer sign-off in findings. Reconcile/regenerate this provisional scaffold against the approved storage child PRD; child PRD wins. Do not continue on mismatch.
  - [ ] 4.2 Start only after S0 completion. Preserve baseline tests for current upload, publish-time promotion, playback, and failure behavior before changing storage ownership. Confirm the storage child PRD satisfies the File-Architecture Principles: it names the bounded home for registry/upload-session/commit/cleanup/heartbeat/metrics modules and keeps `r2Storage.ts` plus `listeningTestStorage.ts` as thin compatibility facades.
  - [ ] 4.3 Scope-confirmation gate: verify the approved storage child PRD includes exactly the minimum capabilities below before implementation starts. If any are absent or materially different, rewrite Tasks 4.4-4.19 and obtain approval; do not implement from this summary:
    - backend-issued immutable `assetId`;
    - authenticated owner-scoped upload session;
    - trusted registry entry;
    - draft/test reference tracking;
    - idempotent commit;
    - immediate discard cleanup;
    - 24-hour temp fallback;
    - strict file-content validation;
    - 10-minute signed upload authorization;
    - checked-in temp lifecycle configuration;
    - checksum metadata without deduplication;
    - replacement-by-new-asset flow;
    - publish reference reuse without byte recopy;
    - explicit cross-test reuse policy;
    - orphan/commit metrics.
  - [ ] 4.4 Add minimal asset states required for safe draft retention: `temp`, `committing`, `committed`, and `pending-delete`. Do not add fields or paths not approved by the storage child PRD.
  - [ ] 4.5 Ship registry durability with first registry creation:
    - use `src/__tests__/security/prd0040-security.emulator.test.ts` as the emulator-backed pattern; do not treat `firebaseRules.test.ts` as emulator proof;
    - confirm executable RTDB emulator wiring exists through a checked-in `firebase.json` emulator block or `firebase emulators:exec` wrapper before writing registry rule tests; stop if tests cannot prove they run against emulator rules;
    - add child-PRD-approved registry rules/indexes and emulator-backed negative tests proving owner scope, cross-owner denial, browser inability to forge committed/delete state, and separation of teacher/service authority;
    - include registry path in backup coverage;
    - obtain sign-off from the named `r2-backup-worker/` disaster-recovery owner, distinct from the storage implementer/reviewer;
    - implement/test registry restore behavior and complete an end-to-end restore drill: back up a test `media_assets` registry node, wipe the test node, restore it, and verify references/integrity;
    - prove existing scheduled backup cron paths still succeed after the registry coverage change;
    - require checksum metadata for integrity/future analysis while prohibiting checksum-based deduplication in this implementation;
    - prove cleanup remains disabled or fail-closed while registry restore/integrity is unresolved;
    - document restore ordering before any cleanup job trusts the registry.
  - [ ] 4.6 Add authenticated upload-session creation:
    - signed upload authorization expires after 10 minutes;
    - authorization is scoped to one owner, upload session, asset, size limit, and approved media contract;
    - enforce MP3, M4A, AAC, WAV, or OGG;
    - enforce the application-level maximum of 10 active audio files per test;
    - enforce 50 MB per file in client/session validation and the S0 worker boundary;
    - validate extension, declared MIME, magic bytes, decodability, file size, and duration metadata before commit;
    - reject spoofed, corrupt, unsupported, expired, or replayed uploads with tests.
  - [ ] 4.7 Add checked-in, prefix-scoped R2 lifecycle configuration or an idempotent checked-in deployment script for `temp/` expiration at 24 hours:
    - dashboard-only configuration is insufficient;
    - durable prefixes must be excluded;
    - add an exact verification command and expected output;
    - prove active registry-backed committed audio is not covered.
  - [ ] 4.8 Implement idempotent registry-backed commit so Save draft/Publish can:
    - validate temp object and ownership;
    - create immutable durable object;
    - verify object;
    - write owning reference;
    - mark committed;
    - delete temp source only after durable success.
    - publishing an already committed draft adds/reuses the published reference and does not copy the bytes again.
    - while public delivery remains active, write both canonical `assetId` and a derived legacy-compatible public `audioUrl`/`streamUrl` into the owning published payload so unmodified solo, live, and result readers continue to work.
    - prove a newly committed/published asset plays through the current public reader without Task 6, 7, or 8 runtime changes.
  - [ ] 4.9 Implement replacement before Task 5 authoring can expose it:
    - upload replacement under a new `assetId`;
    - keep old committed reference authoritative while replacement commits;
    - save/swap the new reference only after surrounding draft/test save succeeds;
    - remove old reference only after success;
    - failed/cancelled replacement cleans the new temp asset and preserves old playback;
    - block a second replacement while the first commit is unresolved.
  - [ ] 4.10 Implement immediate best-effort cleanup for explicit remove, builder cancel, confirmed navigation, logout, auth loss, failed save/publish, replacement cancellation, and detected abandonment.
  - [ ] 4.11 Implement minimum heartbeat/fallback safety before authoring consumes it:
    - 60-second heartbeat;
    - stale after 3 minutes;
    - maximum 8 hours;
    - heartbeat never creates retention;
    - surviving uncommitted temp object removed by 24-hour fallback.
  - [ ] 4.12 Implement same-owner/same-draft multi-tab lease aggregation so closing one valid tab cannot delete audio still leased by another valid tab.
  - [ ] 4.13 Implement reference removal and safe `pending-delete` entry for discarded drafts. Authoritative references, not timestamps, decide whether the object remains.
  - [ ] 4.14 Define cross-test reuse explicitly:
    - no filename, URL, or checksum match may imply reuse;
    - if cross-test reuse is supported, it must use an explicit trusted registry-reference operation with ownership/reference tests;
    - if no product workflow needs it in this program, record explicit product-owner-approved deferral in the traceability matrix while preserving the prohibition on implicit reuse.
  - [ ] 4.15 Put orphan-growth and commit-failure metrics live before Task 5 enables audio-bearing drafts:
    - storage child PRD names the concrete secured metrics sink and schema;
    - state whether threshold detection is automated alerting or human dashboard review;
    - for human review, name responsible role, review cadence, evidence location, and escalation runbook;
    - each threshold names owner and exact stop-rollout action consumed by Tasks 5.21 and 9.9;
    - record baseline counts/bytes and a product-owner accepted-risk statement for known untracked permanent audio;
    - default acceptable new untracked-draft-audio count is zero.
  - [ ] 4.16 Add rollback controls: disable new registry writes, stop cleanup/deletion, retain referenced assets, and preserve legacy publish reads without mutating existing audio.
  - [ ] 4.17 Run focused registry/commit/replacement/cleanup/lifecycle/rules tests. Human-assisted deployed proof requires explicit approval; any Playwright run uses `--reporter=json > report.json`.
  - [ ] 4.18 Run the mandatory fresh-context independent verification pass from the Verification Standard. Reviewer must audit every registry/storage traceability row, large-file maps, declared touch regions, RED/GREEN and mutation proofs, rules/backup/restore/lifecycle configuration, and cleanup safety; resolve all findings and obtain clean re-review.
  - [ ] 4.19 Parent acceptance: an audio-bearing draft can only retain audio through tracked immutable asset/reference commit; registry rules/indexes/backup/end-to-end restore/emulator tests ship together with DR-owner sign-off and cron proof; strict validation/upload TTL/lifecycle config pass; replacement and publish reuse are reference-safe; new assets remain playable through old public readers; cleanup fails closed without registry integrity; discarded/abandoned draft audio has immediate cleanup plus fallback; named metrics sink/owner/stop actions are live; new storage/audio behavior lives in approved bounded modules; `r2Storage.ts` and `listeningTestStorage.ts` gained no net new responsibility; before/after line counts and future decomposition seams are recorded; independent verification passes; no untracked legacy permanent promotion is introduced.

- [ ] 5.0 Introduce Listening Save draft, Publish, immutable revision, concurrency, and legacy-R2 transition behavior
  - [ ] 5.1 Record explicit product-owner plus architecture reviewer sign-off in findings. Reconcile/regenerate this provisional scaffold against the approved authoring child PRD; child PRD wins. Confirm it names bounded authoring/storage module homes and facade limits under the File-Architecture Principles. Do not continue on mismatch.
  - [ ] 5.2 Start only after Task 4 parent acceptance. Preserve baseline tests proving current single-save behavior, missing-audio hard block, published writes, existing R2 reads, and unchanged Google Drive code/tests.
  - [ ] 5.3 Write failing service tests for explicit first Save draft, autosave-after-draft-ID, lenient draft validation, strict Publish validation, immutable published versions, revision drafts, assignment/result pinning, idempotency, and optimistic conflict rejection.
  - [ ] 5.4 Define child-PRD-approved authoring state/contracts in small Listening-owned modules under one coherent bounded package. Prefer `src/features/assessment/listening/{authoring,storage,adapters,types}/` per PRD section 9 unless the child PRD proves an existing Listening root is more coherent. Do not create a third scattered Listening root or place draft/version/publish behavior in neutral shared presentation.
  - [ ] 5.5 Keep `src/services/listeningTestStorage.ts` as the public Listening persistence entrypoint/facade. Implement create/update draft, publish, revision, archive/delete, and legacy-read responsibilities as separate focused modules, such as a draft store, publish service, revision service, deletion-governance service, and legacy audio resolver, then delegate through the facade. Record facade lines/responsibilities before and after; net growth is limited to narrow delegation/compatibility wiring and requires justification.
  - [ ] 5.6 Route every new audio-bearing Save draft and Publish through Task 4 registry-backed commit/reference APIs. Never use the legacy untracked permanent-key move for new draft audio and never persist a temp URL as saved content. During the public-delivery compatibility window, persist canonical `assetId` plus the Task 4 derived public `audioUrl`/`streamUrl` required by unmodified solo/live/result readers.
  - [ ] 5.7 Implement optimistic concurrency using approved revision/version tokens; reject stale writes with recoverable conflict state, never last-write-wins.
  - [ ] 5.8 Implement Save draft/Publish idempotency keys so retries return existing operation/version and never duplicate records or audio references.
  - [ ] 5.9 Implement the legacy transition and shared Listening audio-resolution dependency early in Task 5:
    - freeze first-edited legacy R2 published record as immutable version 1;
    - create revision draft;
    - preserve existing assignment/result/session pinning;
    - define one Listening-owned legacy audio resolver/read adapter for raw R2 URLs;
    - make Tasks 6 and 7 consume that resolver rather than reimplementing legacy URL handling;
    - land and test the resolver before any private-delivery cutover.
  - [ ] 5.10 Implement draft soft-delete/recovery:
    - soft-delete draft by default;
    - preserve recovery for seven days;
    - restore recovers the draft and valid asset references;
    - permanent draft deletion/reference cleanup cannot begin before recovery expiry and reference checks;
    - tests cover delete, restore, expiry, ownership, and retry idempotency.
  - [ ] 5.11 Implement published-test deletion governance:
    - archive published tests by default;
    - block physical deletion while attempts, results, revisions, assigned sessions, or other retained references exist;
    - preserve immutable versions and pinned learning evidence;
    - expose physical deletion only through the approved audited operation from Task 6.
  - [ ] 5.12 Add net-new Save draft and separate Publish controls with saving/saved/error/conflict states. Compose new UI from bounded Listening-owned components, such as `ListeningSavePublishBar` and `ListeningDraftStatus`; `ListeningTestBuilder.tsx` only orchestrates data/handlers and must not absorb control-state implementation.
  - [ ] 5.13 Add module-owned teacher copy for first save, missing-audio draft warning, publish blockers, stale conflict, duplicate action, 8-hour expiry, re-upload, navigation-away discard, and completed discard. Keep copy/state rendering in focused components such as `ListeningDraftStatus` or `ListeningConflictRecovery`, not inline branches added to `ListeningTestBuilder.tsx`.
  - [ ] 5.14 Add exact upload guidance through a bounded component such as `ListeningUploadGuidance`:
    - `Up to 10 audio files, 50 MB each.`;
    - `MP3 or M4A recommended.`;
    - label all audio counters `audio files`;
    - keep audio count separate from `Questions (0/10)`.
  - [ ] 5.15 Use shared announcement system for Save draft/Publish/archive/restore/discard outcomes; keep feature-owned orchestration in a focused action/announcement adapter rather than expanding builder branches. No page banners, `alert()`, or silent success.
  - [ ] 5.16 Add Publish-time audio accessibility validation in a focused service plus bounded readiness component such as `ListeningPublishReadiness`:
    - verify canonical asset/reference exists;
    - verify current delivery path is reachable;
    - verify byte-range capability rather than URL presence alone;
    - fail closed when range response is missing/malformed or media is non-seekable;
    - preserve draft save with warnings while blocking Publish.
  - [ ] 5.17 Add authoring accessibility verification across the bounded authoring components:
    - correct heading hierarchy and region labels;
    - validation/error/loading semantics use status/alert appropriately;
    - color is not the only ready/blocked/error signal;
    - icon-only controls have accessible names;
    - keyboard focus reaches Save draft, Publish, conflict recovery, archive/restore, and validation targets;
    - visible controls meet the 44px by 44px touch-target floor where applicable.
  - [ ] 5.18 Add integration tests for create, first Save draft, reload, autosave, missing-audio draft, blocked Publish, publish range/accessibility failure, replacement/cancel, Publish, revision reopen, stale conflict, duplicate click, parser failure/manual mode, legacy first edit, draft delete/restore/expiry, published archive/delete block, discard cleanup, registry reference state, and a newly published asset-ID record playing through the unchanged current public reader via derived `audioUrl`/`streamUrl`.
  - [ ] 5.19 Add observability for Save draft, autosave failure, Publish, conflict, revision creation, archive/restore, discard, commit failure, orphan growth, and legacy transition without logging signed URLs/audio content.
  - [ ] 5.20 Human-assisted browser/a11y gate: run focused authoring/service/rules tests and teacher desktop/tablet keyboard/screen-reader proof. Any Playwright run uses `npx playwright test <optional-spec> --reporter=json > report.json`. Do not touch solo/live runtime.
  - [ ] 5.21 Perform Task-5-local rollout before Task 6 depends on production-shaped data:
    - internal fixtures first;
    - selected teachers next;
    - observe child-PRD-approved minimum traffic/sample window;
    - record draft creation, publish, discard, commit failure, and orphan-growth metrics;
    - use Task 4 threshold owner/runbook and stop for unexplained permanent-object growth, failed cleanup, wrong audio, or legacy incompatibility.
  - [ ] 5.22 Run the mandatory fresh-context independent verification pass from the Verification Standard. Reviewer must compare authoring child PRD/traceability against the diff, inspect large-file maps/touch regions for `ListeningTestBuilder.tsx` and `listeningTestStorage.ts`, rerun behavioral mutation proofs, verify lifecycle/reference integration, and challenge every claimed legacy/deletion/accessibility behavior; resolve all findings and obtain clean re-review.
  - [ ] 5.23 Parent acceptance: draft/publish semantics are unambiguous; every audio-bearing draft uses tracked Task 4 retention; replacement/publish reuse are safe; draft recovery and published archive/delete rules pass; Publish proves accessible range-capable audio; authoring accessibility passes; new persistence/UI behavior lives in approved bounded modules/components; `listeningTestStorage.ts` and `ListeningTestBuilder.tsx` remain thin facades with no net new responsibility; before/after line counts and created/preserved decomposition seams are recorded; selected-teacher evidence shows no unexplained orphan growth; legacy R2 records/results remain usable; Task 6 migration inventory covers any pre-registry or accidentally interim-promoted audio; independent verification passes; Google Drive behavior is unchanged.

- [ ] 6.0 Complete R2 reconciliation, historical cleanup, backup governance, and authorized delivery
  - [ ] 6.1 Record explicit product-owner plus architecture/security reviewer sign-off in findings. Reconcile/regenerate this provisional scaffold against the approved storage child PRD and Task 4 implementation truth; child PRD wins. Do not continue on mismatch.
  - [ ] 6.2 Complete final deletion governance not required for Task 4 minimum safety:
    - full approved state-machine and invalid-transition tests;
    - seven-day zero-reference `pending-delete` grace;
    - immediate reference recheck before deletion;
    - metadata-only deletion tombstone retained for exactly 90 days;
    - tombstone excludes signed URLs, secrets, keys, and audio content;
    - separate audited administrative deletion operation;
    - administrative deletion must not reuse the teacher endpoint and must still honor retained-reference rules.
  - [ ] 6.3 Start reconciliation validation only after Task 5 selected-teacher rollout has produced the child-PRD-approved minimum real traffic/sample window. Implement bounded/checkpointed hourly temp reconciliation and daily durable pending-delete reconciliation with immediate pre-delete reference recheck. Storage child PRD must set per-run object-operation count, estimated R2 cost, and wall-clock budgets plus abort/report thresholds. Do not close on synthetic data alone or continue a run after a capacity stop.
  - [ ] 6.4 Run one-time historical orphan inventory covering:
    - audio left by past Listening-test deletions;
    - pre-registry permanent audio;
    - any audio promoted by an interim or failed rollout scheme;
    - objects with missing/ambiguous owner or reference evidence.
    Require dry run, accepted-risk record, backup review, explicit approval, bounded deletion, rollback evidence, and child-PRD-approved maximum list/copy/delete operation count, estimated cost, and wall-clock duration before deletion. Abort and report when any capacity budget is exceeded.
  - [ ] 6.5 Document/test audio-object backup governance only: `r2-backup-worker/` media retention, restore authority, GDPR/permanent-deletion filtering, and proof backup copies do not count as live product references. Registry-node backup/restore is already mandatory in Task 4 and must not be deferred here. Obtain distinct DR-worker owner approval, prove existing scheduled backup crons still succeed, and perform an end-to-end test backup/restore/deletion-filter drill before acceptance.
  - [ ] 6.6 Build and prove server-side authorized delivery issuance without cutting solo or live runtime traffic:
    - resolve canonical asset IDs through the approved service boundary;
    - authorize issuance from the trusted asset reference graph: asset owner, or a student/result viewer with active retained authorization to the referenced immutable test version;
    - possession of a valid `assetId` is never sufficient; deny cross-user/cross-owner issuance;
    - issue 60-minute authorized URLs;
    - support refresh issuance below 10 minutes;
    - return valid `Range`, `206`, `Accept-Ranges`, and stable `Content-Length`;
    - reject malformed/unsupported range behavior and fail closed before Publish/result/live rollout;
    - never mark non-seekable delivery ready;
    - keep solo and live `AudioPlayer` traffic on public R2;
    - do not modify `AudioPlayer.tsx` in Task 6.
  - [ ] 6.7 Integrate private delivery only into the saved-result/review path that does not require live `AudioPlayer` changes. Prove a past Listening result with a legacy raw public R2 URL still plays through the shared resolver and a new asset-ID result resolves through authorized delivery.
  - [ ] 6.8 Human-assisted server/result proof matrix: authorized issuance, known-asset-ID cross-user/cross-owner issuance denial, byte ranges, expiration/refresh issuance, Chrome, Edge, desktop Safari, iOS Safari result review, and legacy/new result records. Every Playwright run uses `--reporter=json > report.json`. Solo and live playback remain public in this task.
  - [ ] 6.9 Perform Task-6-local rollout for reconciliation and result-review delivery:
    - internal fixtures;
    - selected-teacher/result-review traffic;
    - observe cleanup and result-playback metrics;
    - do not switch solo or live traffic;
    - stop on missing references, premature deletion, result audio failure, or backup-policy conflict.
  - [ ] 6.10 Extend metrics/alerts for temp age, reconciliation, delete failure, issuance/refresh failure, reclaimed bytes, auth denial, and assets blocked by references. Preserve Task 4 orphan metrics continuously through migration.
  - [ ] 6.11 Add rollback controls: stop cleanup/deletion, preserve old/new readers, retain referenced assets, and return result review to public R2 without data mutation.
  - [ ] 6.12 Run the mandatory fresh-context independent verification pass from the Verification Standard. Reviewer must audit reconciliation against real Task-5 data, deletion/admin/tombstone rules, result-resolution behavior, backup governance, range proofs, rollback, RED/GREEN/mutation evidence, and any triggered large-file maps; resolve all findings and obtain clean re-review.
  - [ ] 6.13 Parent acceptance: real Task-5 traffic has been reconciled within approved operation/cost/time budgets; historical/interim assets are inventoried; deletion is reference-safe; registry/audio backup policies have DR-owner approval, cron proof, and restore-drill evidence; old/new result review audio works; server issuance/range behavior and cross-user denial pass; any touched monolith has before/after line counts, unchanged responsibility boundaries, and future decomposition seams recorded; independent verification passes; solo/live remain on public delivery.

- [ ] 7.0 Align Listening solo/homework runtime presentation after authoring stabilization
  - [ ] 7.1 Record explicit product-owner plus architecture reviewer sign-off in findings. Reconcile/regenerate this provisional scaffold against the approved solo/homework child PRD; child PRD wins. Do not continue on mismatch.
  - [ ] 7.2 Start only after Task 5 authoring stability acceptance. Do not include live-session state or teacher authority.
  - [ ] 7.3 Capture baseline tests for `ListeningPracticeView`, `AudioPlayer`, solo hooks, timer, autosave, resume, submission, review, and mobile state before visual changes. Baseline coverage does not authorize modifying `AudioPlayer` internals.
  - [ ] 7.4 Map every solo/homework state owner: answer state, viewed section, current audio index, position, speed, volume, completed audio, timer, autosave, resume, and submission.
  - [ ] 7.5 Select only neutral presentation wrappers already proven in authoring. Do not move playback, persistence, submit, or resume logic into shared components.
  - [ ] 7.6 Apply visual alignment incrementally to shell/status/question-card/review display with one focused adopter patch at a time. Task 7 may wrap or configure `AudioPlayer`, but must not modify its internal source, refresh, synchronization, or playback logic; all `AudioPlayer` internal changes belong to Task 8.
  - [ ] 7.7 Preserve `mobileListeningState.ts` semantics and mobile hydration; do not write `audioCommand` or `masterAudioState`.
  - [ ] 7.8 Verify viewport switching does not reset answer/audio state and mobile keyboard does not cover answer controls.
  - [ ] 7.9 Add solo/homework submit race protection:
    - double-click/retry uses one idempotent submit operation;
    - pending submit disables duplicate action;
    - when time-up occurs during an accepted answer save, finish that in-flight save where possible, then execute one submit;
    - stale/failed save produces recoverable state without duplicate result records;
    - tests cover timer/save/submit ordering and reload recovery.
  - [ ] 7.10 Add student runtime accessibility/mobile verification:
    - loading/error/validation states expose screen-reader semantics;
    - color is not the only state signal;
    - icon-only controls have accessible names;
    - keyboard and screen-reader navigation remain usable;
    - answer inputs remain visible above mobile keyboard;
    - visible touch controls meet the 44px by 44px floor;
    - shared mobile primitives are used only where the traceability matrix proves neutral contracts.
  - [ ] 7.11 Integrate solo/homework private delivery at the solo host/adapter boundary using Task 5's shared legacy resolver and Task 6's issuance service. Keep live traffic public. If safe solo refresh/cutover requires modifying `AudioPlayer` internals, block only the cutover, complete Task 8's approved shared-player delivery subphase, then return to Task 7 proof; never cross the protected live boundary early.
  - [ ] 7.12 Human-assisted pre-cutover gate: run focused runtime/mobile/a11y tests plus public/private solo proof at `localhost:5174` for desktop, 375 px, 320 px, iOS Safari, resume, time-up/submit, long playback, URL expiry/refresh, and legacy/new test records. Every Playwright run uses `--reporter=json > report.json`.
  - [ ] 7.13 Perform Task-7-local solo rollout:
    - internal fixtures;
    - selected teacher/student solo or homework traffic;
    - percentage rollout only after playback/resume metrics remain healthy;
    - keep live session traffic public;
    - stop on reload, seek, refresh, resume, mobile, or legacy playback regression.
  - [ ] 7.14 Run the mandatory fresh-context independent verification pass from the Verification Standard. Reviewer must inspect `ListeningPracticeView.tsx` and other triggered large-file maps/touch regions, prove `AudioPlayer` internals are untouched, rerun submit/time-up/private-delivery mutation proofs, and verify mobile/accessibility/legacy behavior; resolve all findings and obtain clean re-review.
  - [ ] 7.15 Parent acceptance: solo/homework looks aligned, selected traffic uses proven private delivery when host-level integration is sufficient, resume/autosave/timer/playback/idempotent-submit/review remain correct, accessibility/mobile requirements pass, any touched monolith has before/after line counts, unchanged responsibility boundaries, and future decomposition seams recorded, independent verification passes, `AudioPlayer` internals remain untouched, and no live authority path is read or written.

- [ ] 8.0 Define, test, and implement protected live Listening authority and runtime alignment
  - [ ] 8.1 Record explicit product-owner plus architecture/security reviewer sign-off in findings. Reconcile/regenerate this provisional scaffold against the approved live-session child PRD/test plan; child PRD wins. Do not continue on mismatch.
  - [ ] 8.2 Define canonical `masterAudioState` schema with monotonic revision, trusted server timestamp, section, position, speed, playing state, action metadata, and validation rules.
  - [ ] 8.3 Define compatibility `audioCommand` contract and retirement criteria. Commands mirror canonical state transactions and cannot override a newer revision.
  - [ ] 8.4 Write failing tests for authority conflicts, stale command rejection, late join, student reload, teacher reload, buffering during pause, long-pause resume, skip, seek, speed, network partition, teacher disconnect, session end during submit, authorized URL refresh, source handoff without interruption, and expiry retry.
  - [ ] 8.5 Unify `TeacherTestControlBar` and `AudioProgressPanel` behind one authority transaction so default section `1`/position `0`/speed `1.0` cannot overwrite richer state.
  - [ ] 8.6 Consolidate all required `AudioPlayer` internal changes in this task. Update `useMonitorControls`, `useMasterAudioState`, `useAudioSync`, `ListeningTestPage`, and `AudioPlayer` only as required by the approved authority and delivery contracts; re-run both solo and live playback tests because `AudioPlayer` is shared.
  - [ ] 8.7 Implement late join/reload from canonical authority: hydrate state first, account for elapsed trusted time, then drift-correct; never restore solo/local playback authority.
  - [ ] 8.8 Use 500 ms soft-correction and 2-second hard-seek values only as initial test baselines. Record measured browser results and obtain approval before setting final product thresholds.
  - [ ] 8.9 Preserve headphone pending/approved/denied behavior and teacher visibility; do not bypass readiness gates.
  - [ ] 8.10 Prove teacher disconnect freezes playback and network loss pauses after approved bounded grace; recovery resumes only from canonical authority.
  - [ ] 8.11 Define and implement load-test harness in child PRD for 100 students/session and 20 concurrent sessions, including client fidelity, network conditions, Firebase/worker limits, sync drift, audio failures, and pass/fail thresholds.
  - [ ] 8.12 Implement live authorized-delivery refresh/source handoff in `AudioPlayer` while keeping production live traffic public:
    - old URL remains active until replacement is ready;
    - refresh failure does not independently pause playback;
    - retry uses bounded backoff;
    - canonical teacher authority survives source refresh;
    - teacher monitor receives an actionable warning before URL-expiry/interruption risk;
    - warning clears after recovery and does not leak signed URLs or raw keys.
  - [ ] 8.13 Add teacher-monitor/live accessibility verification:
    - monitor controls remain keyboard reachable;
    - icon-only controls have accessible names;
    - pause/resume/skip/seek/headphone states are not conveyed by color alone;
    - loading/error/sync-loss/refresh-warning semantics use appropriate status/alert roles;
    - visible controls meet the 44px by 44px touch-target floor where applicable;
    - accessibility changes do not move authority into shared presentation code.
  - [ ] 8.14 Human-assisted pre-cutover gate: run automated integration/a11y tests plus teacher/student private-delivery browser proof in separate contexts before switching live traffic. Every Playwright run uses `npx playwright test <optional-spec> --reporter=json > report.json`:
    - teacher desktop `localhost:5173`;
    - student desktop `localhost:5174`;
    - student mobile `localhost:5174`;
    - normal/late join;
    - teacher/student reload;
    - pause/resume/skip/seek/speed;
    - buffering, stale command, authority conflict;
    - headphone states;
    - accepted/rejected submit during session end.
  - [ ] 8.15 Perform Task-8-local live rollout only after 8.14 passes:
    - internal live sessions;
    - selected teachers/classes;
    - percentage rollout with rollback control;
    - stop on sync drift, source interruption, headphone regression, wrong section/position, or submit/session-end failure.
  - [ ] 8.16 Record network writes, canonical durable DB state, screenshots/traces, `report.json`, measured drift, delivery refresh/warning, accessibility evidence, rollout cohort, and recovery evidence. Unit tests alone cannot close this task.
  - [ ] 8.17 Run the mandatory fresh-context independent verification pass from the Verification Standard. Reviewer must inspect all triggered live large-file maps/touch regions, verify protected authority paths and undeclared hunks, rerun authority/delivery/accessibility mutation proofs, challenge load-test evidence, and recheck solo regressions from shared `AudioPlayer` edits; resolve all findings and obtain clean re-review.
  - [ ] 8.18 Parent acceptance: teacher authority remains canonical, monitor controls agree, solo state remains separate, `AudioPlayer` changes pass both solo/live suites, monitor warning/accessibility requirements pass, load target passes approved methodology, every touched monolith has before/after line counts, unchanged responsibility boundaries, and future decomposition seams recorded, independent verification passes, and selected live traffic survives reload/conflict/private-delivery refresh.

- [ ] 9.0 Complete compatibility verification, staged rollout, observability, documentation, and final acceptance
  - [ ] 9.1 Verify every prior parent task has focused tests, findings evidence, rollback notes, documentation updates, all approved independently reviewable/revertible packets merged and traceable, and its required internal/selected-user rollout evidence before final rollout.
  - [ ] 9.2 Verify existing Reading V2 create/import/draft/revision/publish/projection/runtime/result flows remain unchanged by shared presentation work.
  - [ ] 9.3 Verify existing R2-backed Listening tests remain readable through legacy adapters, new writes use approved contracts, and a past result with raw public R2 URL still plays after private-delivery switch.
  - [ ] 9.4 Verify this tasklist made no Google Drive behavior change. Separate cleanup/deletion task remains independently scoped.
  - [ ] 9.5 Verify all shared-layer import/API boundary greps pass and no Reading/Listening cross-import exists.
  - [ ] 9.6 Verify every new Firebase/worker write/read path has authorization and negative tests.
  - [ ] 9.7 Verify every visible Save draft, Publish, discard, retry, conflict, archive/delete, headphone, and live-control action has feature-registry/observability coverage and shared announcement behavior where applicable.
  - [ ] 9.8 Complete final rollout rather than initiating the first real-user rollout:
    - confirm Task 5 authoring, Task 6 reconciliation/result delivery, Task 7 solo, and Task 8 live cohorts already passed their phase-local gates;
    - expand remaining percentage cohorts;
    - perform full rollout only after cross-phase evidence review;
    - retain independent rollback switches for authoring writes, cleanup/deletion, result delivery, solo delivery, and live delivery.
  - [ ] 9.9 Stop rollout immediately for data loss, wrong audio, cross-owner access, legacy incompatibility, live authority drift, or mid-test interruption.
  - [ ] 9.10 Update canonical architecture docs, upload-storage authority, implementation log, PRD/tasklist status, and findings so documentation matches deployed truth.
  - [ ] 9.11 Run final focused and cross-system test suites named by child PRDs, UTF-8 checks, boundary scans, `git diff --check`, and build only where source/CSS changed.
  - [ ] 9.12 Execute every section 27 regression-checklist item as written and attach evidence per row in the traceability matrix:
    - do not substitute summary checks for individual checklist items;
    - include `AudioProgressPanel` visibility only for in-progress Listening with audio sections;
    - include MP3/M4A recommendation copy;
    - include zero-reference durable-audio grace before deletion;
    - include all shared, Reading V2, Listening authoring, solo/homework, live-session, and teacher-monitor checks;
    - any unchecked/failed row blocks final acceptance.
  - [ ] 9.13 Human-assisted final browser proof: record exact URLs, roles, viewports, fixture IDs, expected/actual behavior, network evidence, durable DB evidence, screenshots/traces, and JSON report artifact. Every Playwright run uses `--reporter=json > report.json`.
  - [ ] 9.14 Review all deferred residue:
    - Google Drive cleanup/deletion remains a separate named task;
    - deep runtime abstraction remains a separate named PRD;
    - Reading V2 runtime visual alignment remains explicitly deferred to its dedicated child PRD until authoring stability and Reading V2 runtime tests satisfy FR-027;
    - deferred question-card/mobile shared primitives remain mapped to named child PRDs if Task 3 could not prove two neutral consumers;
    - large-file comprehension maps list future decomposition seams and responsibility boundaries for every touched monolith so later refactor PRDs start from verified maps;
    - no deferred requirement may be omitted from the traceability matrix or hidden as completion.
  - [ ] 9.15 Parent acceptance: traceability remains 100 percent with zero orphans, all approved child PRDs are complete or explicitly named/approved deferrals, all success metrics and every regression-checklist row pass, file-architecture line/responsibility/seam evidence is complete for every touched monolith, docs match production, rollback paths remain available, and PRD-0055 can be marked implemented.
