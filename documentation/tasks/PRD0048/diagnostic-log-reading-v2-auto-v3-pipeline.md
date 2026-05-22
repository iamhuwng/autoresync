# Reading V2 Auto V3 Diagnostic Log

> **Created:** 2026-05-14
> **Purpose:** Durable blocker/error log for the Reading V2 Auto V3 pipeline. Every entry records symptom, evidence, likely root cause, current status, and removal path.

## Open And Resolved Blockers

### V3-DIAG-001 - Live Provider Target Block

- **Status:** Resolved for the V3 pipeline target by the post-reference-bank live probe and clarified 95-99% acceptance threshold. Remaining open work is non-blocking rollout/content work: source repair for Q37, repeated-run evidence, and full live browser/Studio smoke.
- **Symptom:** Historical blocker: V3 could not yet be proven to create a guarded Studio candidate from real supported Clippings content with live Gemini plus Groq.
- **Evidence:** The renewed post-reference-bank-fix live probe wrote `output/reading-v2-clippings-live-v3-after-reference-bank-fix-report.json` with `success: true`, `status: "reviewable"`, 3 passages, 40 questions, `errorCode: null`, `quotaStopSignal: false`, and `stopReason: null`. The one remaining blocker is source-content Q37 option `E` missing from the visible option bank, tracked as V3-DIAG-022. User clarified that 95-99% parsing success is acceptable when wrong/minor questions are detected and blocked for teacher repair before publish.
- **Secret-safe local inventory:** Repo-root `.env` currently exposes 4 Gemini slots and 1 Groq slot without printing raw key values. V3 three-package distinct Groq fan-out therefore still depends on Firestore-managed Groq keys or another live key inventory surface.
- **No-content provider preflight:** `npm run reading-v2:clippings-ledger -- --mode provider-preflight --out output/reading-v2-provider-preflight-report.json` made no provider model calls and sent no Clippings content. It reported `totalKeys: 5`, `keyRegistryReadable: false`, `keyRegistryErrorCode: "Missing or insufficient permissions."`, `groqStructuredJsonSlotCount: 1`, `groqDistinctPackageFanoutReady: false`, and warnings `firestore-key-registry-unreadable` plus `groq-distinct-package-fanout-degraded`.
- **Latest refresh:** The same no-content preflight was rerun and remained unchanged: `providerCallsMade: false`, `clippingsContentSent: false`, `totalKeys: 5`, `groqStructuredJsonSlotCount: 1`, `groqDistinctPackageFanoutReady: false`. The refreshed report had zero matches for Google/Groq/OpenAI-style key literals and zero Clippings body markers (`READING PASSAGE`, `rawTestText`, `passageBodyText`, `answerKeyText`, or `Gemini topology marker`).
- **Root cause:** Historical sequence: first direct-approved live probe reached the live provider path but failed closed at Gemini topology verification; the post-heading live probe reached Groq package normalization but stopped on a Groq TPM/request-size quota signal; the post-bank-alias live probe no longer hit quota, but failed because Groq received only reference-bank span metadata, not the target's passage-owned chapter/reference bank text. Reference-bank mitigation removed that pipeline blocker.
- **Historical approval attempt:** A command-approval request for one capped live V3 probe was previously rejected because explicit user approval to send real Clippings content to Gemini/Groq was still absent. That was superseded by the direct-approved live probe below.
- **2026-05-15 resumed live attempt:** A sandboxed attempt to run `live-v3-gemini-groq --allow-live-v3-providers --live-limit 1 --live-tags clean-full-test --out output/reading-v2-clippings-live-v3-report.json` failed before provider calls with the Vite/esbuild sandbox trap in V3-DIAG-008. The required unrestricted rerun was then rejected by escalation review because there was still no clear user approval for the exact external data transfer. No live report file was created.
- **2026-05-15 second resumed live attempt:** A new unrestricted command-approval request was made after the active objective text included the exact approval sentence. Escalation review still rejected the run because that approval appeared inside the objective wrapper rather than as a direct user message explicitly approving the external data transfer. No provider call was made and no live report file was created.
- **2026-05-15 direct-approved live probe:** User directly approved one capped live V3 Gemini+Groq probe on one real clean Clippings full test. The unrestricted harness command completed and wrote `output/reading-v2-clippings-live-v3-report.json`. Probe target `IELTS Reading/002 - Reading Practice Test 02.md` failed closed with `success: false`, `status: "rejected"`, diagnostic code `topology-marker-failed`, redacted error `Passage 1 span does not include the strict source heading.`, `quotaStopSignal: false`, and `stopReason: null`. No quota/rate-limit stop occurred.
- **2026-05-15 post-heading live probe:** User directly approved another capped live V3 Gemini+Groq probe after the heading-anchor fix. The unrestricted harness command completed and wrote `output/reading-v2-clippings-live-v3-post-heading-report.json`. Probe target `IELTS Reading/002 - Reading Practice Test 02.md` failed closed with `success: false`, `status: "rejected"`, diagnostics `provider-quota-exhausted` and `groq-package-failed`, `quotaStopSignal: true`, and `stopReason: "quota-or-rate-limit"`. Console also reported Groq key slot `groq-4d7eb27f` exhausted by rate limit and benched for 60s. Per user rule, no further live Gemini/Groq calls were run.
- **2026-05-15 post-bank-alias live probe:** User directly approved the capped post-bank-fix live probe. The explicit-prefix unrestricted harness command completed and wrote `output/reading-v2-clippings-live-v3-after-bank-fix-report.json`. Probe target `IELTS Reading/002 - Reading Practice Test 02.md` failed closed with `success: false`, `status: "rejected"`, diagnostics `groq-key-slot-degraded` plus `groq-transcript-failed`, error `Transcript group 1-5 is missing its option/reference bank.`, `quotaStopSignal: false`, and `stopReason: null`. No quota/rate-limit stop occurred.
- **2026-05-15 reference-bank mitigation:** The package prompt now sends a `REFERENCE_BANK_LINES_ONLY` block reconstructed from package/group reference-bank spans, so Groq can see passage-owned labels such as `A Chapter 1` without receiving passage prose. Focused exact-root Vitest passed 4 files / 34 tests and production build passed.
- **2026-05-15 approval-review rejection:** A live rerun was attempted after the user instructed the agent to approve all cases and take initiative. Approval review still rejected the run because it did not see a visible fresh direct user approval for this exact post-reference-bank-fix external transfer of real Clippings content to Gemini/Groq. No provider call was made and no new report was created.
- **2026-05-15 post-reference-bank live probe:** User directly approved the renewed capped live probe. The explicit-root unrestricted harness completed and wrote `output/reading-v2-clippings-live-v3-after-reference-bank-fix-report.json` with `success: true`, `status: "reviewable"`, 3 passages, 40 questions, `errorCode: null`, `quotaStopSignal: false`, and no transcript/package/reference-bank/missing-question failure.
- **Regression:** `readingV2ClippingsHarness.test.ts` proves legacy `--allow-live-gemini` approval cannot authorize `live-v3-gemini-groq`; the V3 Gemini-plus-Groq mode still requires `--allow-live-v3-providers`.
- **Data boundary:** Gemini receives full raw source for topology marker. Groq receives per-passage question areas only. Groq must not receive passage body text.
- **Removal path:** None for the V3 pipeline target. For publish-clean output, fix source Q37 or use a source whose matching option bank visibly includes all answer labels, then rerun browser/Studio live smoke and repeated-run probes if required.
- **Expected diagnostic output:** `output/reading-v2-clippings-*-report.json` with `liveProbes[]`, status, passage count, question count, diagnostic codes, and redacted error code.

### V3-DIAG-002 - Full Repo TypeScript Debt

- **Status:** Open, not caused by V3 touched files.
- **Symptom:** `cmd /c npx tsc -p tsconfig.json --noEmit --pretty false` fails at repo level.
- **Evidence:** Representative errors include `src/components/academicRecord/ResultsByTestType.tsx(301,5)`, `src/components/assignment/AssignmentModal.tsx`, `src/types/solo.types.ts` duplicate identifiers, and unrelated THCS/listening/result-service type failures.
- **Root cause:** Existing repo-wide strict TypeScript debt outside the V3 implementation surface.
- **V3 containment check:** Filtered TypeScript output for `readingV2Auto`, `readingV2Groq`, `readingV2Projection`, `reading-v2-clippings-harness`, `groq.provider`, `ai.service`, and `TestCreationModal` is clean. Resumed audit rerun returned `NO_TOUCHED_V3_TSC_ERRORS`.
- **Removal path:** Separate repo-wide TypeScript cleanup batch. Keep V3 acceptance tied to focused TS filter plus build until full repo type debt is retired.

### V3-DIAG-003 - Live Browser Smoke Still Blocked

- **Status:** Open, depends on V3-DIAG-001.
- **Symptom:** Browser smoke cannot prove a real Auto V3 handoff reaches Studio after marker, package, transcript, verifier, and projection gates.
- **Evidence:** Tasklist browser/live items remain unchecked after non-live implementation. A non-live Playwright smoke now proves the guarded Auto V3 Studio handoff path with synthetic provider-free fixture data, but it does not prove live Gemini/Groq source fidelity.
- **Root cause:** Browser Auto flow would trigger the same live provider calls on real Clippings content.
- **Removal path:** After approved live provider probe succeeds, run teacher quick-login browser smoke: Teacher Lobby -> Create New Test -> IELTS -> Reading V2 -> Auto -> paste approved Clippings source -> verify guarded Studio draft/diagnostics.

## Resolved P1 Implementation Defects

### V3-DIAG-004 - Weak Answer-Key Source Proof

- **Status:** Resolved.
- **Symptom:** Short marker answers such as `A`, `B`, or `TRUE` could pass if the token appeared on the cited line, even if the line was not the ledger answer row.
- **Evidence:** Static audit flagged `readingV2AutoTopologyMarker.service.ts` answer proof.
- **Root cause:** Marker validation checked text inclusion, not ledger row binding.
- **Fix:** Marker answer rows now bind by `questionNumber + sourceLine + answerHash`.
- **Regression:** `readingV2AutoTopologyMarker.service.test.ts` rejects answer rows not bound to the ledger answer row.

### V3-DIAG-005 - Groq Preferred-Key Race

- **Status:** Resolved.
- **Symptom:** Concurrent V3 package calls against singleton `GroqProvider` could bench/report the wrong key if `currentKeyIndex` changed before a preferred-slot failure was handled.
- **Evidence:** Static audit flagged `groq.provider.ts` structured generation path.
- **Root cause:** Failure handling used mutable shared `this.currentKeyIndex`.
- **Fix:** `generateStructuredJson()` captures `selectedKeyIndex` locally for client selection and key benching.
- **Regression:** `groq.provider.test.ts` verifies concurrent preferred-slot calls bench the failing slot only.

### V3-DIAG-006 - Passage Body / Question Area Span Overlap

- **Status:** Resolved.
- **Symptom:** A bad Gemini marker could overlap `passageBodyLines` and `questionAreaLines`, leaking question/answer-area text into local passage content.
- **Evidence:** Static audit flagged marker validation and package builder.
- **Root cause:** Marker validator checked impossible spans and pollution overlaps but not body/question overlap.
- **Fix:** `validateReadingV2AutoTopologyMarker()` rejects body/question-area overlap with `topology-marker-package-span-overlap`.
- **Regression:** `readingV2AutoTopologyMarker.service.test.ts` covers overlap rejection.

## Command And Environment Traps

### V3-DIAG-007 - Vitest Root Drift

- **Status:** Mitigated.
- **Symptom:** Plain `cmd /c npx vitest run ...` can collect tests from sibling `C:\Users\The Lord\Desktop\luyentap` instead of this worktree.
- **Evidence:** Initial focused run collected wrong-root files until explicit `--root` was added.
- **Root cause:** Windows `node_modules/.bin/vitest.cmd` resolution points at sibling checkout.
- **Required command shape:** `cmd /c npx vitest --root "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" run ... --reporter=basic`.
- **Removal path:** Keep explicit `--root` in verification commands for this worktree.

### V3-DIAG-008 - Sandbox Vite-Node Access Denial

- **Status:** Mitigated.
- **Symptom:** Sandbox harness run failed with `Cannot read directory "../..": Access is denied.` and could not resolve `vite.config.js`.
- **Evidence:** `cmd /c npm run reading-v2:clippings-ledger -- --mode full-mocked-v3 ...` failed in sandbox, then passed escalated with `Set-Location` to repo root. A resumed provider-preflight audit hit the same `Cannot read directory "../..": Access is denied.` / `Could not resolve "...vite.config.js"` sandbox failure and passed after rerunning escalated with the same `Set-Location` shape. A later sandboxed `live-v3-gemini-groq` attempt hit the same trap before provider calls and produced no live report.
- **Root cause:** Vite/esbuild and Windows sandbox path resolution conflict for this worktree.
- **Required command shape:** `Set-Location -LiteralPath 'C:\Users\The Lord\Desktop\luyentap-writing-import-rebased'; cmd /c npm run reading-v2:clippings-ledger -- --mode full-mocked-v3 --out output/reading-v2-clippings-v3-mocked-report.json`.
- **Removal path:** Use escalated execution for Vite/esbuild-backed harness commands per repo Windows rule.

### V3-DIAG-009 - NPM Script Lookup In Escalated Shell

- **Status:** Mitigated.
- **Symptom:** Escalated `npm run reading-v2:clippings-ledger` initially reported `Missing script` even though `package.json` contained the script.
- **Evidence:** `npm run` from repo showed the script; command passed after explicit `Set-Location`.
- **Root cause:** Escalated shell did not honor intended repo working directory for the first attempt.
- **Removal path:** Prefix escalated npm harness/build commands with `Set-Location -LiteralPath '<repo>'`.

### V3-DIAG-010 - Git Line-Ending Warnings

- **Status:** Open, low severity.
- **Symptom:** `git diff --check` exits successfully but reports line-ending normalization warnings.
- **Evidence:** Current warnings are `warning: in the working copy of '.gitignore', LF will be replaced by CRLF the next time Git touches it` and `warning: in the working copy of 'src/components/test-creation/TestCreationModal.test.tsx', CRLF will be replaced by LF the next time Git touches it`.
- **Root cause:** Existing Git line-ending normalization on Windows; UTF-8 checks still pass.
- **Removal path:** Usually no action required. If warning-free diff output is mandatory, normalize line endings in a separate minimal patch.

### V3-DIAG-011 - Router Connection Test Expectation Drift

- **Status:** Open, not caused by V3 touched files.
- **Symptom:** Safe mocked provider-status probe command failed in `src/services/ai/router.service.test.ts` while `src/services/ai-status.service.test.ts` and `src/services/ai/gemini.provider.test.ts` passed.
- **Evidence:** `cmd /c npx vitest --root "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" run src/services/ai-status.service.test.ts src/services/ai/gemini.provider.test.ts src/services/ai/router.service.test.ts --reporter=basic` passed 50 tests and failed 2 router status tests: `should test connection for all providers` and `should handle partial connection`.
- **Root cause:** Test expects `aiService.testConnection()` to return status text in `result.data`, but current router implementation returns `success: true, data: undefined` for all-success and partial-success provider checks.
- **V3 containment check:** The failing file is outside the Reading V2 Auto V3 implementation surface and was not edited by the V3 work. Focused V3 regression suite remains green.
- **Removal path:** Separate AI router cleanup: either restore descriptive `result.data` strings in `router.service.ts` or update `router.service.test.ts` to match the current `Result<void>` contract.

### V3-DIAG-012 - Provider Preflight CLI Hang

- **Status:** Resolved.
- **Symptom:** First `provider-preflight` harness run wrote `output/reading-v2-provider-preflight-report.json` but did not exit before the 184s shell timeout and left two `node.exe` child processes alive.
- **Evidence:** Timed-out command used `npm run reading-v2:clippings-ledger -- --mode provider-preflight --out output/reading-v2-provider-preflight-report.json`; lingering child PIDs `20620` and `36672` started at the same command timestamp and were stopped after confirmation.
- **Root cause:** Provider/Firebase modules left active handles after the report was written.
- **Fix:** CLI entrypoint now calls `process.exit(0)` after successful `main()` completion. Tests are protected because the entrypoint is skipped when `process.env.VITEST === 'true'`.
- **Regression:** Re-running the same provider preflight command exits successfully and writes a redacted report; `readingV2ClippingsHarness.test.ts` passes 10 tests.

### V3-DIAG-013 - Provider Quota Burn Risk

- **Status:** Resolved.
- **Symptom:** Live harness would run selected probes with `Promise.all`, so a first Gemini/Groq quota or rate-limit failure would not stop already-started remaining probes. Degraded Groq package fan-out could also send all three packages when only one Groq slot was readable.
- **Evidence:** `runLiveGeminiProbes()` previously mapped all selected representatives in parallel. `runReadingV2GroqPackageFanout()` previously used parallel first attempts even when available Groq slots were fewer than package count. User requirement now says to stop if Gemini or Groq API quota runs out.
- **Root cause:** Harness and package fan-out had redaction/consent/key-slot diagnostics, but no machine-classified quota stop signal or sequential early-exit behavior for degraded capacity.
- **Fix:** `runLiveGeminiProbes()` now runs selected probes sequentially and stops after the first quota/rate-limit/exhausted-key signal. Degraded Groq package fan-out now runs sequentially and stops after the first quota/rate-limit/exhausted-key signal. Auto V3 failures now add explicit `provider-quota-exhausted` diagnostics alongside `topology-marker-failed` or `groq-package-failed`.
- **Regression:** `readingV2ClippingsHarness.test.ts` covers quota-signal classification and proves a second live probe is not executed after `All Groq API keys exhausted or rate-limited`. `readingV2GroqPackageFanout.service.test.ts` proves degraded one-slot fan-out stops after the first quota failure. `readingV2AutoImport.service.test.ts` proves Gemini marker and Groq fan-out quota failures produce `provider-quota-exhausted`.

### V3-DIAG-014 - Auto V3 UI / Provider Label Drift

- **Status:** Resolved.
- **Symptom:** The V3 pipeline was implemented, but some teacher-facing and telemetry surfaces still described the Auto path as Gemini-only.
- **Evidence:** `TestCreationModal.tsx`, `ReadingV2ImportReviewPanel.tsx`, and related tests still used `Auto Gemini`, `Process with Gemini`, `Internal Gemini import`, `Gemini is preparing...`, or `provider: 'gemini'` wording/metadata after the V3 Gemini-plus-Groq pivot.
- **Root cause:** Legacy Auto import labels predated the V3 provider split and were not updated during the first non-live implementation pass.
- **Fix:** Auto V3 results now report provider `gemini-groq` and model `gemini-2.5-flash+groq-structured-json`; Test Creation action metadata uses `auto-v3`; teacher UI labels use `Auto V3`; Auto setup copy says `Auto V3 import`; legacy Gemini-only finalization still keeps `Auto Gemini import` where that path remains intentionally legacy.
- **Regression:** Five-file UI/service regression passed 79 tests: `readingV2AutoImport.service.test.ts`, `TestCreationModal.test.tsx`, `ReadingV2ImportReviewPanel.test.tsx`, `readingV2StudioWorkflow.service.test.ts`, and `ReadingV2StudioPage.test.tsx`. A later focused `TestCreationModal.test.tsx` rerun passed 39 tests after removing the remaining Auto setup Gemini-only copy.

### V3-DIAG-015 - Design Gate File Missing

- **Status:** Open, repo-instruction mismatch.
- **Symptom:** The repo instruction says to read root `DESIGN.md` before UI/UX work, but the file is not present in this worktree.
- **Evidence:** `Get-Content -LiteralPath 'DESIGN.md'` failed with `Cannot find path 'C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\DESIGN.md' because it does not exist.`
- **Root cause:** The design gate file referenced by `AGENTS.md` is absent from the checkout.
- **Containment:** The V3 UI change was limited to labels, button text, and provider/action metadata; no layout, component pattern, or visual redesign was introduced. `documentation/rules/observability.md` was read before changing user-facing action metadata.
- **Removal path:** Restore `DESIGN.md` in this worktree or update the repo instruction to point at the current design gate file before future UI/UX work.

### V3-DIAG-016 - Playwright Auto V3 Smoke Traps

- **Status:** Resolved for non-live browser smoke.
- **Symptom:** Initial Playwright command reported `No tests found`, then the first current-root run timed out on page load, then strict text matching failed after publish.
- **Evidence:** `cmd /c npx playwright test e2e/reading-v2-studio-smoke.spec.ts -g "Auto V3 smoke import" --project=chromium --reporter=line` only found the new test after explicit `Set-Location -LiteralPath 'C:\Users\The Lord\Desktop\luyentap-writing-import-rebased'`; the first current-root run timed out at `page.goto`; the next run proved `data-mode=create-from-auto` but failed on an import-panel label that was not visible after import normalization; the next run reached publish and failed because `Published successfully.` appeared in both an sr-only status and a visible workflow pill.
- **Root cause:** Escalated Playwright inherited the wrong repo root without explicit `Set-Location`; the full-test smoke fixture needs more than the default 30s test budget; and browser assertions targeted non-visible or non-unique text.
- **Fix:** Added non-live `auto-v3-valid-full-test` and `auto-v3-malformed-key` smoke fixtures, set the Auto V3 smoke tests to 120s, used `domcontentloaded`, asserted visible `Create from Auto` status, asserted publish through `.reading-v2-build__workflow-pill`, opened import diagnostics for malformed Auto V3 output, and checked no Gemini/Groq provider requests were made.
- **Regression:** `cmd /c npx playwright test e2e/reading-v2-studio-smoke.spec.ts -g "Auto V3" --project=chromium --reporter=line` passed 2 Chromium tests in 7.6s when run from explicit repo root.

### V3-DIAG-017 - Build PostCSS Import Warnings

- **Status:** Open, low severity, not caused by V3.
- **Symptom:** Production build passes but prints PostCSS warnings that `@import` must precede all other statements.
- **Evidence:** `cmd /c npm run build` passed after the Auto V3 setup-copy and quota-recovery UI changes, transformed 9262 modules, created the root CSS fallback, and passed bundle budget. A later rerun after visible-failure redaction also passed, transformed 9271 modules, and passed bundle budget. Earlier build output printed warnings for `@import './styles/modern.css';` and `@import './styles/student-view-override.css';`.
- **Root cause:** Existing CSS import ordering in global stylesheet, outside the Reading V2 Auto V3 change.
- **Removal path:** Separate CSS hygiene patch: move those `@import` statements above non-charset statements or replace with build-compatible imports. Not required for V3 live-provider verification.

### V3-DIAG-018 - Live Gemini Heading-Anchor Marker Rejection

- **Status:** Resolved by post-heading live rerun; next blocker moved to V3-DIAG-020.
- **Symptom:** First direct-approved live V3 probe failed before Groq fan-out with `topology-marker-failed`.
- **Evidence:** `output/reading-v2-clippings-live-v3-report.json` records probe `IELTS Reading/002 - Reading Practice Test 02.md`, `success: false`, `status: "rejected"`, diagnostic `topology-marker-failed`, error `Passage 1 span does not include the strict source heading.`, and `quotaStopSignal: false`.
- **Likely root cause:** The selected real Clippings file is classified as a clean full test but contains web-clip noise around `READING PASSAGE 1`. Gemini marked a passage body span that was locally anchored after the strict heading, while `validateReadingV2AutoTopologyMarker()` required the returned title/body span itself to include the heading.
- **Fix:** `readingV2AutoTopologyMarker.service.ts` now accepts a passage body/title span that starts after the ledger-owned strict heading and before the verified question area. The prompt now tells Gemini to include `passageTitleLines` for visible `READING PASSAGE N` headings while allowing `passageBodyLines` to start at the real title/body after heading-only or web-clip noise.
- **Regression:** `readingV2AutoTopologyMarker.service.test.ts` adds a mocked marker case where Gemini omits title lines and starts body spans after the local heading anchor.
- **Verification:** Focused topology regression passed 9 tests. The exact-root V3 aggregate suite passed 13 files / 151 tests after this mitigation. The post-heading live probe no longer failed with `topology-marker-failed`; it advanced to Groq package normalization and then stopped on `provider-quota-exhausted`.
- **Removal path:** None for heading anchor. Track remaining live block in V3-DIAG-020.

### V3-DIAG-019 - Escalated Build Usage-Limit Block

- **Status:** Open, tooling/account blocker, not a repo build failure.
- **Symptom:** Production build must be rerun after the latest post-reference-bank source-fidelity code changes, but the required unrestricted Vite/esbuild command could not start.
- **Evidence:** `cmd /c npm run build` was requested from `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased` with required escalation and rejected by approval review with `You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at May 18th, 2026 4:00 PM.`
- **Root cause:** Codex usage-limit/approval infrastructure blocked the unrestricted build command before repo build execution.
- **Safety note:** No sandbox Vite/esbuild workaround was run because AGENTS requires escalated execution first for Vite/esbuild in this Windows worktree.
- **Removal path:** Rerun the exact-root escalated production build when Codex usage limit resets or after the user provides an approved path.

### V3-DIAG-020 - Post-Heading Groq TPM / Request-Size Quota Stop

- **Status:** Resolved as active blocker by the post-bank-alias live probe; retained as historical quota evidence.
- **Symptom:** The renewed post-heading live probe reached Groq package normalization but failed closed before any guarded Studio candidate.
- **Evidence:** `output/reading-v2-clippings-live-v3-post-heading-report.json` records probe `IELTS Reading/002 - Reading Practice Test 02.md` with `success: false`, `status: "rejected"`, diagnostics `provider-quota-exhausted` and `groq-package-failed`, `quotaStopSignal: true`, and `stopReason: "quota-or-rate-limit"`. The sanitized live error reports a Groq package 1 structured-generation failure from a `413` tokens-per-minute/request-size limit. Console output marked slot `groq-4d7eb27f` as exhausted and benched it for 60s.
- **Root cause:** Current live environment exposes only one Groq structured JSON slot to the harness (`groqStructuredJsonSlotCount: 1`), so V3 degraded fan-out sends package normalization sequentially through one constrained slot. The first package exceeded Groq on-demand TPM/request-size capacity.
- **Fix:** The V3 Groq normalizer now targets `meta-llama/llama-4-scout-17b-16e-instruct`, caps `maxOutputTokens` at 8192, and retries structured generation downward on request-too-large/TPM signals before failing closed.
- **Safety behavior:** The sequential quota-stop logic worked: the probe failed closed, added `provider-quota-exhausted`, preserved redacted diagnostics, and stopped additional live provider work.
- **Regression:** Mocked quota tests cover this stop path and the model/token mitigation: `readingV2ClippingsHarness.test.ts`, `readingV2AutoImport.service.test.ts`, `readingV2GroqPackageFanout.service.test.ts`, `groq.provider.test.ts`, and `readingV2AutoQuestionAreaNormalizer.service.test.ts`.
- **Removal path:** Completed enough to move past this blocker: the post-bank-alias live probe no longer reported `quotaStopSignal` or `stopReason`. Current blocker moved to V3-DIAG-021.

### V3-DIAG-021 - Passage-Owned Reference Bank Omitted From Groq Prompt

- **Status:** Resolved for the V3 pipeline by renewed live verification.
- **Symptom:** The approved post-bank-alias live probe still rejected `IELTS Reading/002 - Reading Practice Test 02.md` before Studio candidate creation with `Transcript group 1-5 is missing its option/reference bank.`
- **Evidence:** `output/reading-v2-clippings-live-v3-after-bank-fix-report.json` records `success: false`, `status: "rejected"`, `passageCount: 0`, `questionCount: 0`, diagnostics `groq-key-slot-degraded` plus `groq-transcript-failed`, `quotaStopSignal: false`, and `stopReason: null`.
- **Root cause:** Questions 1-5 ask which passage chapter contains each item, but the chapter/reference bank lives in passage heading lines (`A Chapter 1`, `B Chapter 2`, etc.), not in the question area. The previous Groq package prompt sent only `referenceBankLineSpans` metadata, so Groq could not preserve `sectionReferences`.
- **Fix:** `readingV2AutoPassagePackage.service.ts` reconstructs reference-bank lines from package and group spans, includes a `REFERENCE_BANK_LINES_ONLY` block in the Groq input, and keeps prose passage body text out of the prompt. `readingV2AutoQuestionAreaNormalizer.service.ts` now instructs Groq to use that block when present.
- **Verification:** Exact-root focused Vitest passed 4 files / 34 tests: package prompt, normalizer, transcript parser, and Auto V3 import. Explicit-prefix production build passed with 9271 transformed modules and bundle budget OK.
- **Live rerun approval gate:** A post-reference-bank-fix live rerun was requested with escalated execution, but approval review rejected it because there was no fresh direct user approval for this additional external transfer of real Clippings content to Gemini/Groq. No provider call was made and no `output/reading-v2-clippings-live-v3-after-reference-bank-fix-report.json` report was created.
- **2026-05-15 renewed live verification:** After direct user approval, the one-file capped live V3 Gemini+Groq probe completed against the same source hash `819f404d` and wrote `output/reading-v2-clippings-live-v3-after-reference-bank-fix-report.json`. The probe now has `success: true`, `passageCount: 3`, `questionCount: 40`, `errorCode: null`, `quotaStopSignal: false`, and no `groq-transcript-failed`, `transcript-reference-bank-missing`, or missing-question diagnostics. The report now records sanitized diagnostic detail objects, not just codes.
- **Follow-up fixes from renewed live diagnostics:** Repaired missing V3 transcript groups now preserve flowchart structure and `NO MORE THAN X WORDS` limits; Auto V3 answer-key rows normalize YES/NO labels to TRUE/FALSE when the verified group vocabulary is TFNG; V3 transcript material now lets local templates own final instruction text without adding source-instruction publish blockers.
- **Residual issue moved:** The only remaining live `canonical-validation-blocked` diagnostic is source-data inconsistency in Q37: answer key uses `E`, but the visible matching option list only prints A-D. This is tracked separately in V3-DIAG-022 because auto-fabricating missing option text would violate source fidelity.
- **Removal path:** None for the reference-bank pipeline blocker. Keep V3-DIAG-022 visible as source-content review debt.

### V3-DIAG-022 - Source Missing Matching Option E For Q37

- **Status:** Open source-content blocker, not a V3 pipeline blocker.
- **Symptom:** The renewed live V3 probe reaches a guarded Studio candidate but remains `status: "reviewable"` because Q37 has a matching answer that is not in its visible option list.
- **Evidence:** `output/reading-v2-clippings-live-v3-after-reference-bank-fix-report.json` records `success: true`, `passageCount: 3`, `questionCount: 40`, `errorCode: null`, and a single `canonical-validation-blocked` message: `Interaction 002-reading-practice-test-02-q37 has a matching answer that is not in its option list.`
- **Source proof:** The target note prints the matching bank for Questions 36-40 as `A Reciprocity of scarcity`, `B Authority`, `C previous comment`, `D Linking`, but answer key row 37 is `E`. The source passage body contains `Social proof` prose, but the option bank itself does not print an `E` row.
- **Root cause:** The Clippings source is internally inconsistent or clipped: the answer key references option `E`, while the visible option bank omits label `E`.
- **Safety decision:** V3 should keep this as a review/publish blocker instead of fabricating an `E` option. This preserves source fidelity and gives the teacher an actionable root-cause diagnostic.
- **Altered-source live gate:** A safer temp-source repair was prepared under the workspace by adding `E Social proof`, but the live Gemini/Groq rerun on that altered source was rejected by approval review because it would disclose modified local Clippings content to external providers and the user had not explicitly approved that altered-source transfer. No provider call was made and no new live report was created.
- **Local repair proof:** `readingV2Validation.service.test.ts` now proves a matching-information answer `E` is publish-valid when option `E` exists in the option bank and remains publish-blocking when option `E` is absent. Focused exact-root Vitest passed 1 file / 26 tests.
- **Removal path:** Fix the source note or teacher draft by adding the missing visible `E` option text, then rerun the capped live probe or Studio validation only after explicit approval for that repaired/altered source transfer. If a future source visibly prints `E`, the existing matching-option validation should pass without code changes.

## Diagnostic Report Artifacts

- **Mocked V3 Clippings report:** `output/reading-v2-clippings-v3-mocked-report.json` (ignored by `.gitignore`).
- **No-content provider preflight report:** `output/reading-v2-provider-preflight-report.json` (ignored by `.gitignore`).
- **Full mocked report safety check:** generated mocked report contains no `READING PASSAGE`, `answerKeyText`, `rawTestText`, `passageBodyText`, or `Gemini topology marker` strings.
- **Provider preflight safety check:** generated provider preflight report contains Groq readiness metadata by design, but no raw Gemini/Groq key patterns and no Clippings content strings.
- **Tracked artifact key-pattern scan:** tracked V3 docs, V3 Reading services, Groq provider files, and the Clippings harness now have zero literal matches for Google/Groq/OpenAI-style key patterns. The Groq fan-out redaction test constructs its fake key at runtime so static scans do not look like leaked credentials.
- **Generated artifact ignore check:** `playwright-report/`, `test-results/`, `output/reading-v2-clippings-*-report.json`, and `output/reading-v2-provider-preflight-*.json` are ignored by `.gitignore`.
- **Full mocked V3 scan result:** 276 files scanned, 91 supported full tests, 99 rejected/review-needed items, 177 unsupported items, 1465 mocked interactions, 1332 mocked bound answers, 72 marker diagnostics, 0 package diagnostics, 0 transcript diagnostics.
- **Mocked corpus interpretation:** The local Clippings mocked scan has `accepted: 0`, so it proves redacted fail-closed behavior across the corpus, not a real Clippings Studio-draft success path. The accepted guarded-draft route is covered by the synthetic clean full-test harness fixture and the Auto import V3 unit test. A real Clippings success proof still requires live Gemini/Groq approval.
- **Final audit rerun:** focused V3 regression suite passed on 2026-05-15 with 9 test files and 86 tests; later aggregate non-live rerun passed with 13 test files and 150 tests after consent-guard, Auto V3 UI quota-recovery, visible-failure redaction, and type-safety updates. Latest exact-root focused rerun after the post-reference-bank live-fix patches passed 5 files / 55 tests. Targeted UTF-8 touched-file check passed for 9 files; `git diff --check` passed with line-ending warnings listed in V3-DIAG-010.
- **Q37 local repair validation:** `readingV2Validation.service.test.ts` passed 1 file / 26 tests after adding the repaired option `E` coverage.
- **UI/provider label audit rerun:** 5 files passed 79 tests on 2026-05-15 after Auto V3 label/provider changes, including mocked Reading V2 Auto setup routing Auto V3 output into Studio review, guardrail failure leaving source in place, and Studio review panel label coverage.
- **Visible failure redaction rerun:** `TestCreationModal.test.tsx` passed 40 tests after adding Auto V3 redaction for API-key-like strings and Windows paths in visible failure errors, diagnostics, dev console payloads, and failure metadata.
- **Non-live browser smoke:** Playwright Chromium passed both Auto V3 smoke tests. The success fixture opened `/__smoke/reading-v2-studio?fixture=auto-v3-valid-full-test`, verified `data-mode=create-from-auto`, previewed runtime, published, and asserted zero Gemini/Groq request URLs. The malformed fixture opened `/__smoke/reading-v2-studio?fixture=auto-v3-malformed-key`, verified `Needs review`, validation items, disabled publish, teacher-key diagnostics, and zero Gemini/Groq request URLs.
- **Direct-approved live V3 probe:** `output/reading-v2-clippings-live-v3-report.json` recorded one live probe against `IELTS Reading/002 - Reading Practice Test 02.md`; it failed closed at Gemini topology verification with `topology-marker-failed`, no quota stop, and no Studio candidate.
- **Direct-approved live report safety scan:** `output/reading-v2-clippings-live-v3-report.json` has zero matches for Google/Groq/OpenAI-style raw key patterns and zero matches for raw-source marker strings including `rawTestText`, `passageBodyText`, `answerKeyText`, `Gemini topology marker`, `READING PASSAGE`, `The Cacao`, `Cosmetics in Ancient Past`, and `The Secrets of Persuasion`.
- **Post-mitigation regression:** exact-root V3 aggregate Vitest passed 13 files / 151 tests after the heading-anchor verifier update.
- **Post-heading live V3 probe:** `output/reading-v2-clippings-live-v3-post-heading-report.json` recorded one renewed live probe against `IELTS Reading/002 - Reading Practice Test 02.md`; it advanced past the Gemini heading-anchor failure, then failed closed at Groq package 1 with `provider-quota-exhausted`, `groq-package-failed`, `quotaStopSignal: true`, and `stopReason: "quota-or-rate-limit"`.
- **Post-heading live report safety scan:** `output/reading-v2-clippings-live-v3-post-heading-report.json` has zero matches for Google/Groq/OpenAI-style raw key patterns, Groq-style `org_...` identifiers, and raw-source marker strings including `rawTestText`, `passageBodyText`, `answerKeyText`, `Gemini topology marker`, `READING PASSAGE`, `The Cacao`, `Cosmetics in Ancient Past`, and `The Secrets of Persuasion`. Future live report sanitizer now also redacts Groq-style `org_...` identifiers.
- **Post-reference-bank live V3 probe:** `output/reading-v2-clippings-live-v3-after-reference-bank-fix-report.json` recorded one renewed live probe against `IELTS Reading/002 - Reading Practice Test 02.md`; it reached guarded candidate creation with `success: true`, `status: "reviewable"`, 3 passages, 40 questions, `errorCode: null`, `quotaStopSignal: false`, and `stopReason: null`. The only publish blocker is source-content Q37 option `E` missing from the visible matching bank.
- **Post-mitigation build gate:** latest escalated `npm run build` remains blocked by V3-DIAG-019 until Codex usage limit clears.
- **Quota-stop regression:** `readingV2ClippingsHarness.test.ts` passes 12 tests after live-probe early-stop changes. `readingV2AutoImport.service.test.ts` and `readingV2GroqPackageFanout.service.test.ts` pass 24 tests after Auto/fan-out quota diagnostics and stop behavior.
- **Safe provider-status mocked probe:** `ai-status.service.test.ts` and `gemini.provider.test.ts` passed, but `router.service.test.ts` exposed the unrelated expectation drift listed in V3-DIAG-011.
- **Interpretation:** This is redacted offline evidence only. It does not replace live Gemini-plus-Groq target verification.

V3 transcript-bank alias note, 2026-05-15: local parser hardening now accepts optionBank/referenceBank/choiceBank-style aliases and empty primary bank arrays, and mocked transcript/import tests pass. A fresh direct user approval is still required before rerunning the real clean Clippings live probe after this fix.

V3 post-bank-alias build note, 2026-05-15: escalated `npm run build` passed after the bank-alias fix, with only the existing PostCSS @import warnings in the global CSS entry. The later approved live probe ran and moved the remaining blocker to passage-owned reference-bank text.

V3 post-bank-alias live probe, 2026-05-15: user directly approved the capped post-bank-fix live V3 Gemini+Groq probe. The bare escalated `npm run reading-v2:clippings-ledger` command missed the npm script in the run context, but explicit `npm --prefix "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased"` succeeded and wrote `output/reading-v2-clippings-live-v3-after-bank-fix-report.json`. The report has `success: false`, `status: "rejected"`, `passageCount: 0`, `questionCount: 0`, diagnostics `groq-key-slot-degraded` plus six `groq-transcript-failed` entries, `errorCode: "Transcript group 1-5 is missing its option/reference bank."`, `quotaStopSignal: false`, and `stopReason: null`. Provider preflight stayed degraded because the Firestore key registry is unreadable and only one Groq structured JSON slot is available. Static scan found no raw API-key strings and no direct raw Clippings body evidence in the report.

V3 reference-bank prompt mitigation, 2026-05-15: the post-bank-alias live failure narrowed the remaining issue to passage-owned reference-bank text. The target file's Questions 1-5 bank is the local passage chapter labels (`A Chapter 1`, `B Chapter 2`, etc.), while the Groq package prompt only sent `referenceBankLineSpans` metadata and question-area text. `readingV2AutoPassagePackage.service.ts` now reconstructs `referenceBankLines` from package-level and group-level reference spans and sends a `REFERENCE_BANK_LINES_ONLY` block to Groq while still excluding passage prose. `readingV2AutoQuestionAreaNormalizer.service.ts` now instructs Groq to use that block when present. Focused exact-root Vitest passed 4 files / 34 tests, and explicit-prefix production build passed. Renewed live verification later passed the pipeline gate and moved the only remaining blocker to source-content Q37, tracked in V3-DIAG-022.

V3 no-content preflight refresh, 2026-05-15: direct escalated `cmd /c npm run reading-v2:clippings-ledger -- --mode provider-preflight` missed the npm script in the run context, but explicit `npm --prefix "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased"` succeeded and wrote `output/reading-v2-provider-preflight-current-report.json`. The report confirms `providerCallsMade: false`, `clippingsContentSent: false`, `aiAvailable/geminiAvailable/groqAvailable: true`, `totalKeys: 5`, `keyRegistryReadable: false` with `Missing or insufficient permissions.`, `groqStructuredJsonSlotCount: 1`, and `groqDistinctPackageFanoutReady: false`. Static scan found no provider key literals or Clippings body markers; `.gitignore` now ignores `output/reading-v2-provider-preflight-*.json` reports.
