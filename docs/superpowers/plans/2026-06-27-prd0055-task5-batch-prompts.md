# PRD-0055 Task 5 Batch Implementation Prompts

Date: 2026-06-27
Scope: PRD-0055 Task 5.0 only - Listening Save draft, Publish, immutable revision, concurrency, and legacy-R2 transition behavior.

## Readiness Verdict

Verdict: BLOCKED for immediate code start in this planning turn.

Task 4 parent acceptance is recorded complete locally, but Task 5 is fully unchecked and PRD-0057 still requires child-specific review plus explicit implementation authorization. The live tree is dirty with many modified and untracked Task 4 / PRD-0056A / PRD-0058 files. A Task 5 implementation prompt must therefore start with live state proof, exact dirty-path handling, and no deploy / no push / no stage / no commit unless separately authorized.

Use the prompts below only as explicit batch authorization when pasted into a fresh implementation context.

## Batch Map

| Batch | Subtasks | Main model | Why this grouping |
| --- | --- | --- | --- |
| A | 5.1-5.8 | GPT-5.5 medium | Child-PRD reconciliation, baseline proof, data contract, facade split, registry commit, concurrency, and idempotency share one write-model context. |
| B | 5.9-5.11 | GPT-5.5 medium | Legacy version-1 freeze, raw-R2 resolver, draft recovery, and archive/delete governance share compatibility and retention context. |
| C | 5.12-5.15 | GPT-5.4 high | Save/Publish controls, teacher copy, upload guidance, and shared announcements share authoring UI context. |
| D | 5.16-5.19 | GPT-5.5 medium | Publish readiness, accessibility, integration tests, and observability share validation and proof context. |
| E | 5.20-5.23 | GPT-5.4 high | Browser/a11y proof, local rollout evidence, independent review, and parent acceptance are closure work, not feature coding. |

Subagent model rule for all batches: lowest permitted subagent is GPT-5.4-mini with high reasoning. Highest permitted subagent is GPT-5.5 with medium reasoning. Inspect the actual spawned model immediately; close the subagent if it violates this range.

## Shared Guardrails For Every Batch

1. Start with:
   ```powershell
   rtk git status --short --branch
   rtk git status --short --untracked-files=all
   rtk git rev-parse HEAD
   ```
2. Read before edits:
   - `AGENTS.md`
   - `C:\Users\The Lord\.codex\RTK.md`
   - `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md`
   - `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` lines 500-558
   - `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`
   - `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
   - `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
   - `documentation/ielts-reading-v2-listening-unification-implementation-log.md`
   - `documentation/architecture/upload-storage-authority.md`
3. Respect triggered rule reads:
   - UI: `DESIGN.md`, `documentation/architecture/ui-design-standards.md`, `documentation/architecture/ielts-reading-v2-listening-unification.md`
   - Announcements: `documentation/rules/announcements.md`
   - Observability: `documentation/rules/observability.md`, `.agent/skills/observability-tracking/SKILL.md`
   - RTDB / new nodes / shared IDs: `documentation/rules/infrastructure.md`
   - Navigation: `documentation/rules/navigation.md`
   - React components/timers/loading states: `documentation/rules/react-patterns.md`
   - Imports / data producer-consumer contracts / no Mantine: `documentation/rules/codebase-hygiene.md`
   - Browser APIs / storage / navigation abstraction: `documentation/rules/mobile-portability.md`
4. Hard exclusions unless the batch says otherwise:
   - No Task 6, Task 7, Task 8, Task 9 work.
   - No solo/homework runtime changes.
   - No live-session runtime changes.
   - No `AudioPlayer.tsx` internal changes.
   - No Reading V2 internals.
   - No Google Drive behavior change.
   - No Cloudflare deploy, Firebase deploy, production rollout, remote-state mutation, push, staging, or commit.
5. Do not mark any Task 5 checkbox done until source, tests, taskbox, traceability, findings, implementation log, and current architecture docs match live truth.
6. Keep `src/services/listeningTestStorage.ts` and `src/skills/listening/builders/ListeningTestBuilder.tsx` thin. Record before/after line counts before touching either file.
7. New human-maintained production files should target 400 lines or less. If a file must exceed that, add an architecture-review record in findings before closure.
8. Use subagents as evidence producers, not authorities. Main thread owns final decisions and proof.

## Prompt A - Batch A, Task 5.1-5.8

Recommended main model: GPT-5.5 medium.

Copy-paste prompt:

```text
Implement PRD-0055 Task 5 Batch A only: subtasks 5.1 through 5.8.

Scope:
- 5.1 Record explicit product-owner plus architecture reviewer sign-off in findings; reconcile the provisional Task 5 scaffold against approved PRD-0057; child PRD wins; stop on mismatch.
- 5.2 Start only after Task 4 parent acceptance; preserve baseline tests for current single-save behavior, missing-audio hard block, published writes, existing R2 reads, and unchanged Google Drive code/tests.
- 5.3 Write failing service tests for explicit first Save draft, autosave-after-draft-ID, lenient draft validation, strict Publish validation, immutable published versions, revision drafts, assignment/result pinning, idempotency, and optimistic conflict rejection.
- 5.4 Define child-PRD-approved authoring state/contracts in bounded Listening-owned modules under `src/features/assessment/listening/{authoring,storage,adapters,types}/`.
- 5.5 Keep `src/services/listeningTestStorage.ts` as the public persistence facade; move create/update draft, publish, revision, archive/delete, and legacy-read responsibilities into focused modules and delegate through the facade.
- 5.6 Route every new audio-bearing Save draft and Publish through Task 4 registry-backed commit/reference APIs; do not use legacy untracked permanent-key move for new draft audio; never persist a temp URL as saved content.
- 5.7 Implement optimistic concurrency with approved conflict tokens; reject stale writes with recoverable conflict state.
- 5.8 Implement Save draft/Publish idempotency keys so retries return existing operation/version and never duplicate records or audio references.

Hard exclusions:
- Do not start 5.9+.
- Do not create UI controls from 5.12+ except minimal test-only seams needed for service proof.
- Do not touch solo/homework runtime, live runtime, `AudioPlayer.tsx`, Reading V2 internals, Google Drive behavior, Cloudflare deploy, Firebase deploy, production data, staging, commit, or push.

First commands:
```powershell
rtk git status --short --branch
rtk git status --short --untracked-files=all
rtk git rev-parse HEAD
```

Stop if dirty paths include unrelated work that cannot be isolated. If dirty paths are pre-existing Task 4 / PRD-0056A / PRD-0058 prerequisites, record them and do not revert them.

Mandatory reads before edits:
- `AGENTS.md`
- `C:\Users\The Lord\.codex\RTK.md`
- `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md`
- `documentation/rules/infrastructure.md`
- `documentation/rules/codebase-hygiene.md`
- `documentation/rules/mobile-portability.md`
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`
- `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `documentation/architecture/upload-storage-authority.md`
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md`
- Current source/test files: `src/services/listeningTestStorage.ts`, `src/services/listeningTestStorage.test.ts`, `src/features/assessment/listening/storage/*`, `database.rules.json`, `firebase.json`, relevant `r2-backup-worker/src/backup/*`, relevant `r2-backup-worker/src/restore/*`.

Required subagents:
- Spawn one read-only explorer on GPT-5.4-mini high to map existing callers/readers of `saveListeningTestToFirebase`, `updateListeningTestInFirebase`, `deleteListeningTestFromFirebase`, direct `tests/` writes, and existing Listening R2 read paths. Require files inspected, search terms, misses possible, and exact follow-up checklist.
- Spawn one read-only explorer on GPT-5.4-mini high to reconcile PRD-0057 sections 4, 8-10, 18-21, 25, 27, and 33 against Task 5.1-5.8 and traceability rows. Require mismatch list or explicit no-mismatch evidence.
- If changing `database.rules.json` or backup/restore scope, run a focused reviewer on GPT-5.5 medium before closure.

Implementation rules:
- Use TDD. Add RED service/rules tests before implementation, prove they fail for the intended reason, then implement.
- Bind canonical paths from PRD-0057 approved Option B: `listening_authoring/drafts/{draftId}`, `listening_authoring/revision_drafts/{draftId}`, `listening_authoring/versions/{versionId}`, `listening_authoring/operations/{operationId}`.
- Store only hashed idempotency keys, never raw keys.
- Make immutable version records create-only in service contract and tests.
- Preserve the current single-save baseline until explicit split behavior is implemented and tested.
- If the batch needs a path, schema, rules behavior, backup behavior, or delivery behavior not approved by PRD-0057 plus Task 4 truth, stop and write a blocker instead of inventing it.

Expected file areas:
- New bounded files under `src/features/assessment/listening/authoring/`
- New bounded files under `src/features/assessment/listening/types/`
- New bounded authoring-storage facade/service files under `src/features/assessment/listening/storage/`
- Focused tests beside those modules
- Thin delegation additions only in `src/services/listeningTestStorage.ts`
- RTDB rules/tests and backup/restore coverage only if required by PRD-0057 first canonical write support.

Proof before any checkbox:
- `rtk node .\node_modules\vitest\vitest.mjs run <focused Batch A service tests> --reporter=basic`
- Relevant existing baselines, at minimum `src/services/listeningTestStorage.test.ts`, `src/services/r2Storage.test.ts`, and `src/services/r2UploadClient.test.ts` if touched or adjacent behavior changes.
- RTDB emulator/rules tests if `database.rules.json` changes.
- Backup/restore tests if `r2-backup-worker/**` changes.
- `rtk git diff --check`
- `rtk npm run check:utf8 -- <exact touched text files>`
- Boundary grep: no Task 6/7/8 files, no `AudioPlayer.tsx`, no Reading V2 internals, no new `@mantine/*`, no raw idempotency keys, no signed URLs/audio content in logs.

Closure output:
- Findings first: PASS/BLOCKED for Batch A.
- Requirement map 5.1-5.8 to files/tests/proof.
- Dirty path summary and exact touched files.
- Before/after line counts for `listeningTestStorage.ts` if touched.
- Subagent outputs audited, with blind spots.
- Do not stage, commit, push, deploy, or start Batch B.
```

## Prompt B - Batch B, Task 5.9-5.11

Recommended main model: GPT-5.5 medium.

Copy-paste prompt:

```text
Implement PRD-0055 Task 5 Batch B only: subtasks 5.9 through 5.11.

Precondition:
- Batch A must be complete, verified, and authority-synced. If Batch A is not closed in source/tests/docs/taskbox/traceability/findings/log, stop.

Scope:
- 5.9 Implement legacy transition and shared Listening audio-resolution dependency early: freeze first-edited legacy R2 published record as immutable version 1, create revision draft, preserve assignment/result/session pinning, define one Listening-owned legacy raw-R2 audio resolver/read adapter, and make future Tasks 6 and 7 consume that resolver rather than reimplementing legacy URL handling.
- 5.10 Implement draft soft-delete/recovery: default soft delete, seven-day recovery, restore same draft and valid asset references, permanent cleanup blocked before recovery expiry and reference checks, idempotent retry tests.
- 5.11 Implement published-test deletion governance: archive published tests by default, block physical deletion while attempts/results/revisions/assigned sessions/retained references exist, preserve immutable versions and pinned learning evidence, expose physical deletion only through future approved Task 6 audited operation.

Hard exclusions:
- Do not start 5.12+ UI work.
- Do not implement private delivery, reconciliation runners, cleanup execution, Task 6 deletion operation, solo/homework runtime, live runtime, `AudioPlayer.tsx`, Reading V2 internals, Google Drive behavior, deploy, staging, commit, or push.

First commands:
```powershell
rtk git status --short --branch
rtk git status --short --untracked-files=all
rtk git rev-parse HEAD
```

Mandatory reads:
- Shared Guardrails reads from the batch prompt file
- Batch A closure evidence in findings/log/tasklist/traceability
- PRD-0057 sections 11, 12, 16, 17, 18, 21, 25, 27, and 33
- Existing assignment/session/result readers and writers that may reference `tests/{testId}` or Listening audio URLs
- `src/services/listeningTestStorage.ts`
- Batch A authoring modules
- Task 4 storage modules under `src/features/assessment/listening/storage/`

Required subagents:
- Spawn one read-only explorer on GPT-5.4-mini high to inventory all result/session/assignment readers that depend on legacy `tests/{testId}` or raw R2 audio fields. Require exact file paths and whether each must remain pinned.
- Spawn one read-only explorer on GPT-5.4-mini high to audit deletion/archive call sites and current `deleteListeningTestFromFirebase` consumers. Require producer-consumer risk list.
- Use GPT-5.5 medium reviewer before closure if legacy freeze, deletion governance, or pinned-reference behavior changes.

Implementation rules:
- No on-read migration.
- No generic `drafts/**` backfill.
- No content mutation of frozen legacy row beyond approved `authoringVersioning` freeze metadata.
- Legacy raw-R2 resolver is read-only and creates no registry rows by side effect.
- Archive is metadata-only and preserves immutable versions and audio references.
- Hard delete fails closed unless future Task 6 audited operation is explicitly approved.
- Soft delete preserves conflict token/recovery data; restore recovers same draft identity.

Proof:
- Focused tests for duplicate first-edit transition, version-1 freeze, revision draft creation, pin preservation, raw-R2 resolver no side effects, soft delete/restore/expiry/ownership/idempotency, archive behavior, and hard-delete block.
- Existing Batch A service tests.
- Existing listening storage baseline if facade touched.
- Producer-consumer grep proving no hidden caller bypasses freeze/archive guards.
- `rtk git diff --check`
- `rtk npm run check:utf8 -- <exact touched text files>`
- Boundary grep for no Task 6 private delivery/reconciliation, no runtime, no `AudioPlayer.tsx`, no Reading V2 internals, no Google Drive behavior change.

Closure output:
- PASS/BLOCKED for Batch B.
- Requirement map 5.9-5.11.
- Legacy compatibility evidence and retained-reference proof.
- Before/after line counts for touched large files.
- Subagent audit and residual risks.
- Do not stage, commit, push, deploy, or start Batch C.
```

## Prompt C - Batch C, Task 5.12-5.15

Recommended main model: GPT-5.4 high.

Copy-paste prompt:

```text
Implement PRD-0055 Task 5 Batch C only: subtasks 5.12 through 5.15.

Precondition:
- Batches A and B must be complete, verified, and authority-synced. If not, stop.

Scope:
- 5.12 Add net-new Save draft and separate Publish controls with saving/saved/error/conflict states using bounded Listening-owned components such as `ListeningSavePublishBar` and `ListeningDraftStatus`; `ListeningTestBuilder.tsx` only orchestrates data/handlers.
- 5.13 Add module-owned teacher copy for first save, missing-audio draft warning, publish blockers, stale conflict, duplicate action, 8-hour expiry, re-upload, navigation-away discard, and completed discard in focused components.
- 5.14 Add exact upload guidance through bounded component such as `ListeningUploadGuidance`: `Up to 10 audio files, 50 MB each.`, `MP3 or M4A recommended.`, label counters `audio files`, keep audio count separate from `Questions (0/10)`.
- 5.15 Use shared announcement system for Save draft/Publish/archive/restore/discard outcomes through a focused action/announcement adapter. No page banners, `alert()`, or silent success.

Hard exclusions:
- Do not change data model semantics from Batches A/B.
- Do not start 5.16+.
- Do not touch solo/homework runtime, live runtime, `AudioPlayer.tsx`, Reading V2 internals, Google Drive behavior, deploy, staging, commit, or push.

First commands:
```powershell
rtk git status --short --branch
rtk git status --short --untracked-files=all
rtk git rev-parse HEAD
```

Mandatory reads:
- Shared Guardrails reads from the batch prompt file
- `DESIGN.md`
- `documentation/architecture/ui-design-standards.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/rules/announcements.md`
- `documentation/rules/observability.md`
- `.agent/skills/observability-tracking/SKILL.md`
- `documentation/rules/react-patterns.md`
- `documentation/rules/codebase-hygiene.md`
- `documentation/rules/mobile-portability.md`
- `documentation/rules/navigation.md` if any navigation or redirect is touched
- `src/config/featureRegistry.ts`
- `src/components/modern/ToastNotification.tsx`
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
- Existing `ListeningTestBuilder` tests and Batch A/B authoring modules

Required subagents:
- Spawn one read-only explorer on GPT-5.4-mini high to map current `ListeningTestBuilder.tsx` action handlers, save button region, parser/manual paths, navigation calls, feature tracking, and test selectors. Require exact line ranges and touch-risk notes.
- Spawn one read-only reviewer on GPT-5.4-mini high after patch to inspect UI/accessibility/announcement rule compliance in touched files.

Implementation rules:
- Native HTML/CSS or existing repo primitives only. No new `@mantine/*`.
- Keep `ListeningTestBuilder.tsx` a thin orchestrator. Put state display/copy in bounded components.
- Use `toast.success`, `toast.error`, `toast.info`, `toast.warning`, or `toast.show` from shared system. Failure announcements must use error tone.
- Remove or replace touched `alert()` save outcome behavior.
- Add/update feature registry actions and `trackAction()` calls for new user-facing Save draft, Publish, archive, restore, discard, conflict recovery, and duplicate-action paths that exist in this batch.
- Do not log signed URLs, raw object keys, audio content, raw idempotency keys, or secrets.
- Preserve parser skip/manual mode behavior.

Proof:
- Focused builder/component tests for Save draft and Publish visibility, disabled/coalesced duplicate clicks, warning/blocker display, announcement calls, no `alert()`, parser/manual path preservation, and upload guidance exact copy.
- Feature registry/action coverage grep.
- Announcement role/tone coverage through existing toast tests or focused tests.
- `rtk git diff --check`
- `rtk npm run check:utf8 -- <exact touched text files>`
- Boundary grep for no runtime, no `AudioPlayer.tsx`, no Reading V2 internals, no new Mantine, no raw browser storage unless platform abstraction is used.

Closure output:
- PASS/BLOCKED for Batch C.
- Requirement map 5.12-5.15.
- UI files touched and why builder remains thin.
- Before/after line count for `ListeningTestBuilder.tsx`.
- Subagent review outcome and residual UI/a11y risks.
- Do not stage, commit, push, deploy, or start Batch D.
```

## Prompt D - Batch D, Task 5.16-5.19

Recommended main model: GPT-5.5 medium.

Copy-paste prompt:

```text
Implement PRD-0055 Task 5 Batch D only: subtasks 5.16 through 5.19.

Precondition:
- Batches A, B, and C must be complete, verified, and authority-synced. If not, stop.

Scope:
- 5.16 Add Publish-time audio accessibility validation in a focused service plus bounded readiness component such as `ListeningPublishReadiness`: verify canonical asset/reference exists, current delivery path is reachable, byte-range capability exists, fail closed on missing/malformed range or non-seekable media, preserve draft save with warnings while blocking Publish.
- 5.17 Add authoring accessibility verification across bounded authoring components: heading hierarchy, region labels, status/alert semantics, non-color signals, accessible icon-only controls, keyboard reachability, and applicable 44px touch target floor.
- 5.18 Add integration tests for create, first Save draft, reload, autosave, missing-audio draft, blocked Publish, publish range/accessibility failure, replacement/cancel, Publish, revision reopen, stale conflict, duplicate click, parser failure/manual mode, legacy first edit, draft delete/restore/expiry, published archive/delete block, discard cleanup, registry reference state, and newly published asset-ID playback through unchanged public reader via derived `audioUrl`/`streamUrl`.
- 5.19 Add observability for Save draft, autosave failure, Publish, conflict, revision creation, archive/restore, discard, commit failure, orphan growth, and legacy transition without logging signed URLs/audio content.

Hard exclusions:
- Do not start 5.20+ browser/rollout/acceptance.
- Do not change Task 6 private delivery, cleanup runners, reconciliation, solo/homework runtime, live runtime, `AudioPlayer.tsx`, Reading V2 internals, Google Drive behavior, deploy, staging, commit, or push.

First commands:
```powershell
rtk git status --short --branch
rtk git status --short --untracked-files=all
rtk git rev-parse HEAD
```

Mandatory reads:
- Shared Guardrails reads from the batch prompt file
- Batch A-C closure evidence
- `DESIGN.md`
- `documentation/architecture/ui-design-standards.md`
- `documentation/rules/observability.md`
- `.agent/skills/observability-tracking/SKILL.md`
- `documentation/rules/announcements.md`
- `documentation/rules/react-patterns.md`
- `documentation/rules/mobile-portability.md`
- PRD-0057 sections 15, 22, 23, 24, 25, 27, and 33
- Task 4 commit/replacement/metrics modules under `src/features/assessment/listening/storage/`
- Current public reader/playback compatibility tests, including `src/skills/listening/components/AudioPlayer.test.tsx`, without editing `AudioPlayer.tsx`

Required subagents:
- Spawn one read-only explorer on GPT-5.4-mini high to map all existing tests that can be reused for Listening builder, storage, public reader, and feature tracking coverage.
- Spawn one read-only reviewer on GPT-5.5 medium after patch to challenge publish readiness, byte-range proof quality, observability redaction, and integration-test completeness.

Implementation rules:
- Publish readiness must check actual range-capable delivery, not URL presence only.
- Draft save remains allowed with warnings; Publish blocks when readiness fails.
- Observability/tracking metadata must never include signed URLs, raw object keys, raw idempotency keys, tokens, or audio content.
- Integration tests must prove behavior, not just component snapshots.
- If range proof requires remote production R2 or private delivery not available locally, stop and record a named blocker instead of faking it.

Proof:
- Focused service/component/integration tests for publish readiness, range failure, non-seekable media, draft warning vs publish block, replacement/cancel, stale conflict, duplicate action, parser/manual mode, legacy first edit, delete/restore/archive blocks, registry reference state, public-reader derived URL compatibility, and observability redaction.
- Existing Batch A-C tests.
- `rtk git diff --check`
- `rtk npm run check:utf8 -- <exact touched text files>`
- Boundary grep for no Task 6/7/8, no runtime, no `AudioPlayer.tsx`, no Reading V2 internals, no secret/signed URL/raw key logging.

Closure output:
- PASS/BLOCKED for Batch D.
- Requirement map 5.16-5.19.
- Publish readiness proof and any blocked real-browser/remote evidence.
- Observability action list and redaction proof.
- Subagent review outcome and residual risks.
- Do not stage, commit, push, deploy, or start Batch E.
```

## Prompt E - Batch E, Task 5.20-5.23

Recommended main model: GPT-5.4 high. Use GPT-5.5 medium only for final independent verifier if Batch A-D changed high-risk storage/version/deletion behavior.

Copy-paste prompt:

```text
Execute PRD-0055 Task 5 Batch E only: subtasks 5.20 through 5.23.

Precondition:
- Batches A-D must be complete, verified, and authority-synced. If any source/test/docs/taskbox/traceability/findings/log mismatch remains, stop and report BLOCKED.

Scope:
- 5.20 Human-assisted browser/a11y gate: run focused authoring/service/rules tests and teacher desktop/tablet keyboard/screen-reader proof. Any Playwright run uses `npx playwright test <optional-spec> --reporter=json > report.json`. Do not touch solo/live runtime.
- 5.21 Perform Task-5-local rollout before Task 6 depends on production-shaped data: internal fixtures first, selected teachers only if explicitly authorized, observe approved sample window, record draft creation/publish/discard/commit-failure/orphan-growth metrics, stop on unexplained permanent-object growth, failed cleanup, wrong audio, or legacy incompatibility.
- 5.22 Run mandatory fresh-context independent verification pass comparing PRD-0057/traceability against diff, inspecting large-file maps/touch regions, rerunning behavioral mutation proofs, verifying lifecycle/reference integration, and challenging every legacy/deletion/accessibility claim.
- 5.23 Parent acceptance only if every Task 5 acceptance condition is proven and all authority surfaces match live truth.

Hard exclusions:
- No code feature expansion except narrowly scoped proof/doc reconciliation required by current evidence.
- No production deploy, production selected-teacher rollout, remote mutation, push, staging, commit, Task 6, Task 7, Task 8, Task 9, solo/homework runtime, live runtime, `AudioPlayer.tsx`, Reading V2 internals, or Google Drive behavior unless the user gives separate explicit approval.

First commands:
```powershell
rtk git status --short --branch
rtk git status --short --untracked-files=all
rtk git rev-parse HEAD
```

Mandatory reads:
- Shared Guardrails reads from the batch prompt file
- Complete diff from Batches A-D
- Task 5 taskbox and all authority surfaces: tasklist, traceability, findings, implementation log, canonical architecture docs, PRD-0057, upload-storage authority
- Required browser-test URL rules: teacher flows use `http://localhost:5173`; use dev quick-login Teacher button after opening bottom-right settings icon.

Required subagents:
- Spawn one independent verifier on GPT-5.5 medium after all evidence is available. Give it read-only scope. It must lead with findings and inspect PRD-0057, Task 5 tasklist, diff, tests, line counts, traceability, findings, implementation log, source boundaries, and proof artifacts.
- Spawn one read-only explorer on GPT-5.4-mini high to check stale-claim scans, forbidden path drift, checkbox state, and exact touched-file inventory.

Proof:
- Re-run all focused service/component/integration/rules tests added or touched in Batches A-D.
- Re-run existing baselines that protect current single-save, R2 reads, public-reader compatibility, parser/manual mode, and Google Drive unchanged behavior.
- Run mutation probes for at least: stale conflict accepted -> test fails; idempotency duplicate creates second version -> test fails; temp URL saved as durable content -> test fails; publish readiness ignores failed range -> test fails; legacy frozen content mutation -> test fails.
- Run browser proof with teacher quick login at `http://localhost:5173`, natural Listening authoring route, and Playwright JSON reporter.
- Prove no solo/live runtime, `AudioPlayer.tsx`, Reading V2 internals, Task 6+, deploy, push, or remote mutation occurred unless separately approved.
- Run `rtk git diff --check`.
- Run `rtk npm run check:utf8 -- <exact touched text files>`.
- Run stale phrase scans for old claims such as `Task 5 unstarted`, old proof counts, docs-only wording, unchecked/checked contradictions, and any Task 6/7/8 start claim.

Closure rules:
- If any reviewer times out, does not rerun proof, lacks method/risk model, or reports unresolved findings, do not close 5.22 or 5.23.
- Do not check Task 5.0 or 5.23 until source, tests, taskbox, traceability, findings, implementation log, and architecture docs all describe the same live truth.
- If selected-teacher evidence requires production data or remote mutation, stop and ask for separate approval.

Closure output:
- Verdict first: PASS or BLOCKED.
- Findings first, severity ordered.
- Requirement map 5.20-5.23 and parent 5.0.
- Verification commands with cwd, exit code, and result.
- Browser evidence summary with URL, viewport, account path, and artifact path.
- Independent verifier method, findings, misses possible, and final clean re-review status.
- Exact changed paths and exact unchecked/checked taskbox state.
- Residual risks and next permitted task. Do not stage, commit, push, or deploy.
```
