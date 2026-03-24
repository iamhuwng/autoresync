# Conversation Log â€” 2026-03-21

**Session start:** 2026-03-21 ~23:36 UTC+7

---

## 1. AI Core System Research & Maintenance Mode Implementation

**User request:**
1. Research current AI core system and produce improvement suggestions report
2. Implement feature to show "AI system in maintenance" message when all API keys are exhausted
3. Keep process running until complete

### Actions Taken

#### Research Phase
- Audited all AI-related files across the codebase:
  - `src/services/ai/` â€” 12 files (providers, router, validator, section extractor, tests)
  - `src/services/api-keys.service.ts` â€” Firestore CRUD for encrypted API keys
  - `src/services/key-cooldown.service.ts` â€” centralized in-memory cooldown registry
  - `src/config/env.config.ts` â€” env validation + `loadAllGeminiApiKeys()`
  - `src/services/formativeFeedback.service.ts` â€” direct Gemini/Groq calls (bypasses router)
  - `src/services/progressiveFeedback.service.ts` â€” direct Gemini calls (bypasses router)
  - `src/services/test-creation/thcsDocumentParser.service.ts` â€” direct calls (bypasses router)
  - `src/services/test-creation/ai-extractor.service.ts` â€” IELTS extraction (uses router)
- Identified AI consumer pages: TestCreationPage, THCSTestEditorPage, WritingGradingPage, AdminSettingsPage, AcademicRecordPage

#### Report Created
- **File:** `documentation/ai-system-research-report.md`
- Covers: architecture overview, file map, provider strategy, 11 improvement suggestions across 3 severity levels (Critical/Moderate/Minor), priority roadmap

#### Key Findings:
- **No user-facing maintenance notification** when all keys are exhausted
- **Multiple direct callers bypass the router** (formativeFeedback, progressiveFeedback, thcsDocumentParser) â€” duplicating key rotation logic
- **GeminiProvider doesn't use centralized cooldown** (unlike GroqProvider which does)
- **HybridGeminiProvider doesn't load Firestore keys** (only .env keys)
- **XOR "encryption"** is security theater (noted in existing code comments)

#### Implementation Phase â€” AI Maintenance Mode

**New files created:**
1. `src/services/ai-status.service.ts` â€” Centralized AI availability checker
   - `getAIAvailability()` â€” aggregates key status across Gemini + Groq
   - `invalidateAIStatusCache()` â€” forces fresh check after key benching
   - 15-second cache TTL to avoid hammering Firestore

2. `src/hooks/useAIStatus.ts` â€” React hook for AI status
   - Polls every 30 seconds
   - Exposes `available`, `maintenance`, `reason`, `loaded`, `details`
   - `refresh()` action for manual retry

3. `src/components/ai/AIMaintenanceBanner.tsx` â€” UI banner component
   - Warning-toned banner (amber gradient, matching existing design patterns)
   - Shows when all keys are exhausted
   - Displays benched/total key counts
   - "Retry" button for manual refresh
   - Dismissible with Ã— button
   - Auto-recovers when keys become available
   - Uses `role="alert"` and `aria-live="polite"` for accessibility

**Files modified:**
4. `src/services/key-cooldown.service.ts` â€” Added `invalidateAIStatusCache()` call in `benchKey()` so the maintenance banner updates promptly when a key gets rate-limited

5. `src/pages/TestCreationPage.tsx` â€” Added `AIMaintenanceBanner` import and render
6. `src/pages/THCSTestEditorPage.tsx` â€” Added `AIMaintenanceBanner` import and render
7. `src/pages/WritingGradingPage.tsx` â€” Added `AIMaintenanceBanner` import and render
8. `src/pages/AdminSettingsPage.tsx` â€” Added `AIMaintenanceBanner` import and render

### Build Verification
- Ran `npx tsc --noEmit` â€” all errors are pre-existing (Listening builder, accessibility utils, PDF generator, etc.)
- Zero new TypeScript errors from added files
- No circular import issues (key-cooldown uses dynamic import for ai-status)

### Pre-existing Lint Errors (NOT from this session):
- `TestCreationPage.tsx:205` â€” `onStartParsing` prop mismatch with `TestUploadWizardProps`
- `THCSTestEditorPage.tsx:761` â€” `title` prop not in `ButtonProps`

---

## 2. AI Maintenance Mode Hardening and Exhausted-Key Recovery

**Follow-up goal:**
- Ensure the UI shows maintenance when all AI API keys are exhausted, especially across the routed Gemini path and the hybrid THCS Gemini path.

### Initial Findings
- `ai-status.service` already depended on the shared cooldown registry.
- `GeminiProvider` still tracked exhausted keys in its private `exhaustedKeys` map, so routed Gemini failures could be invisible to maintenance mode.
- `HybridGeminiProvider` loaded only env Gemini keys, so THCS hybrid extraction could disagree with the global AI status.
- `AIMaintenanceBanner` dismissal did not reset after recovery, so later outages on the same mounted page could stay hidden.
- `AcademicRecordPage` still exposed AI progressive-feedback refresh without a maintenance guard.

### Trial Methods and Failure Analysis
1. Shared benching for routed Gemini exhaustion.
   - Added `benchKey` and `isKeyBenched` integration in `src/services/ai/gemini.provider.ts`.
   - Result: routed Gemini key exhaustion now contributes to the same maintenance signal the UI reads.
2. Shared key source and cooldown behavior for hybrid Gemini.
   - Switched `src/services/ai/providers/hybrid.gemini.provider.ts` to `loadAllGeminiApiKeys()`.
   - Added benched-key filtering and rate-limit benching.
   - First patch attempt left mixed-encoding noise and an unused helper, so the provider section was rewritten cleanly and reverified.
3. Banner recovery behavior.
   - Reset dismiss state when maintenance clears so a later outage reappears correctly.
4. Student-facing AI guard.
   - Added `AIMaintenanceBanner` to `AcademicRecordPage`.
   - Disabled manual progressive-feedback refresh while maintenance is active and tracked blocked actions.
5. Maintenance wording hardening.
   - Updated the shared status message to explicitly say that all configured AI API keys are exhausted or cooling down.

### Logic Changes
- `src/services/ai/gemini.provider.ts`
  - Benches Gemini keys in the shared cooldown registry when they are exhausted.
  - Treats shared benched keys as exhausted before reuse.
- `src/services/ai/providers/hybrid.gemini.provider.ts`
  - Loads the shared Gemini key pool instead of env-only keys.
  - Skips benched keys.
  - Retries extraction across remaining usable keys.
  - Benches rate-limited keys so maintenance mode can see hybrid failures.
- `src/services/ai-status.service.ts`
  - Uses explicit maintenance wording when all configured keys are unavailable.
- `src/components/ai/AIMaintenanceBanner.tsx`
  - Cleans banner copy and resets dismissal after recovery.
- `src/pages/AcademicRecordPage.tsx`
  - Renders the maintenance banner.
  - Blocks progressive-feedback refresh while maintenance is active.

### New Measures and Solutions for Failures
- Added focused regression coverage for the exact failure mode: all configured keys exhausted should resolve to maintenance, not a false available state.
- Added hybrid-provider coverage to ensure shared-key loading and key benching happen on rate-limit failures.
- Added banner regression coverage so dismissal does not hide later outages forever.
- Kept verification at two levels: focused Vitest coverage and a full production build.

### Verification
- `npx vitest run src/services/ai-status.service.test.ts src/services/ai/gemini.provider.test.ts src/services/ai/providers/hybrid.gemini.provider.test.ts src/components/ai/AIMaintenanceBanner.test.tsx --reporter=basic`
  - Result: 4 test files passed, 22 tests passed.
- `npm run build`
  - Result: passed.

### Final Solution
- AI maintenance mode now reflects real exhausted-key state across both the routed Gemini provider and the hybrid Gemini provider.
- The maintenance banner now correctly reappears after recovery and return-to-outage cycles.
- `AcademicRecordPage` now surfaces the maintenance state and blocks AI refresh actions while all AI keys are cooling down or exhausted.

## 3. AI Maintenance Mode Review Follow-up: Shared Status Store and Single-Source Exhaustion Logic

**Follow-up goal:**
- Remove the remaining correctness gap where the UI could say AI recovered while Gemini still treated keys as exhausted.
- Replace per-banner polling loops with a shared status store.
- Improve the banner so users can see when recovery is likely.

### Initial Findings
- The review correctly identified that `useAIStatus` still created one polling loop per consumer.
- `GeminiProvider` still had two sources of truth: the shared cooldown registry and a private 24-hour `exhaustedKeys` map.
- That dual tracking could produce the worst-case UX: maintenance banner clears, but Gemini still refuses the same key.
- The banner already reappeared after recovery, but it still gave no recovery estimate.
- A blanket "disable every AI-looking button" pass was not safe: some cited actions were not true AI calls, and the IELTS test-creation path still has non-AI fallback behavior.

### Trial Methods and Failure Analysis
1. Shared polling architecture.
   - Replaced independent hook timers with a shared subscription store in `ai-status.service`.
   - Chose `useSyncExternalStore` to match the existing toast-store pattern in the repo.
   - Added visibility-aware polling so background tabs stop checking until the tab is visible again.
2. Single-source Gemini exhaustion logic.
   - Removed the practical dependency on Gemini's private exhaustion tracking.
   - Kept benching in the shared cooldown registry as the only availability source for Gemini key reuse.
   - Directly addressed the hidden failure mode where banner state and provider behavior could drift apart.
3. Shared cooldown handling for forbidden keys.
   - The private map previously gave 403/Forbidden failures an effectively longer block.
   - To avoid regression after removing that private map, `key-cooldown.service` now assigns a long shared cooldown to forbidden or invalid Gemini keys.
4. Banner recovery estimate.
   - Added `shortestCooldownRemaining` to AI availability so the banner can show an estimated recovery time instead of only saying "a few minutes".
5. Review triage on page-level guards.
   - Did not blanket-disable all actions named in the review.
   - Kept the already-correct `AcademicRecordPage` blocking behavior from the previous pass.
   - Deferred broader page guards unless the underlying action is confirmed to be truly AI-blocked with no valid fallback.

### Logic Changes
- `src/services/ai-status.service.ts`
  - Added a shared snapshot store with `subscribeAIStatus()` and `getAIStatusSnapshot()`.
  - Added `refreshAIStatus()` so all consumers refresh the same state.
  - Added in-flight dedupe to avoid duplicate availability fetches.
  - Added visibility-aware polling to pause checks while the tab is hidden.
  - Added `shortestCooldownRemaining` to the aggregate AI availability result.
- `src/hooks/useAIStatus.ts`
  - Switched from local polling state to `useSyncExternalStore` over the shared AI status store.
- `src/services/key-cooldown.service.ts`
  - Added long shared cooldown handling for Gemini `403`, `Forbidden`, and invalid-key style errors.
- `src/services/ai/gemini.provider.ts`
  - Removed the old private 24-hour exhaustion truth path.
  - Now relies on shared benched-key state as the real reuse gate.
  - Added regression coverage proving pre-benched keys are skipped.
- `src/components/ai/AIMaintenanceBanner.tsx`
  - Added estimated recovery text based on the shortest remaining cooldown.
  - Replaced the plain dismiss x with the standard times symbol.

### New Measures and Solutions for Failures
- Added cache and invalidation coverage for AI availability checks.
- Added shared-store coverage to ensure subscribers receive refreshed status snapshots.
- Added cooldown parsing coverage for forbidden Gemini keys and `retryDelay` handling.
- Added banner coverage for the retry action and recovery estimate display.
- Added provider coverage proving Gemini respects the shared benched-key registry directly.

### Verification
- `npx vitest run src/services/ai-status.service.test.ts src/services/key-cooldown.service.test.ts src/services/ai/gemini.provider.test.ts src/components/ai/AIMaintenanceBanner.test.tsx --reporter=basic`
  - Result: 4 test files passed, 28 tests passed.
- `npm run build`
  - Result: passed.

### Final Solution
- AI maintenance mode now stays aligned with actual Gemini key availability instead of drifting behind a private provider map.
- The app now uses one shared AI status polling source instead of one interval per consumer.
- The maintenance banner still appears when all usable keys are exhausted, and it now gives a concrete estimated recovery window based on current cooldown data.


## 4. Result Modal AI Feedback Regression Fix

**Follow-up goal:**
- Restore visible AI feedback behavior in the result modal after the maintenance-mode hardening.
- Ensure the older teacher-side `ResultDetailModal` and the newer `ResultSlidePanel` both handle deterministic fallback, missing AI summary state, and IELTS eligibility correctly.

### Initial Findings
- The newer slide panel already generated feedback for THCS and IELTS, but its feedback UI could still look broken when only deterministic fallback was saved.
- `FeedbackTab` originally only rendered saved `aiFeedback`, so a deterministic-only payload could hide both loading and retry cues.
- The older `ResultDetailModal` still auto-triggered formative feedback only for THCS results.
- `ResultDetailModal` also assumed `generateFormativeFeedback()` would throw on failure, but the service now returns a structured result instead.
- As a result, the teacher homework result modal could silently stop surfacing AI feedback state even though generation logic was still running.

### Trial Methods and Failure Analysis
1. Shared generation-result contract.
   - Promoted `generateFormativeFeedback()` to return `{ saved, aiApplied, mode, error }`.
   - This made it possible to distinguish true save failure from deterministic fallback.
2. Slide-panel retry-state fix.
   - Updated overview and feedback tabs so they still show loading, retry, and unavailable messaging when a fallback-only payload exists without `aiFeedback`.
   - Added regression coverage for the deterministic-only state.
3. Old modal parity fix.
   - Updated `ResultDetailModal` to use the same structured generation result.
   - Broadened eligibility from THCS-only to THCS or IELTS.
   - Kept retryable UI visible when no AI summary exists, even if a base `formativeFeedback` object is already present.
4. IELTS rendering recovery.
   - Added non-THCS AI summary rendering and study-recommendation rendering in the older modal so IELTS results no longer look like AI is missing.

### Logic Changes
- `src/services/formativeFeedback.service.ts`
  - Returns structured generation status instead of silent `void` success/failure.
- `src/components/results/OverviewTab.tsx`
  - Treats "AI summary exists" as the real success condition instead of only checking for any `formativeFeedback` object.
- `src/components/results/FeedbackTab.tsx`
  - Shows explicit loading, retryable unavailable, and missing-AI states.
- `src/components/results/ResultSlidePanel.tsx`
  - Uses the structured generation result and surfaces deterministic fallback as retryable AI-unavailable state.
- `src/components/results/ResultDetailModal.tsx`
  - Now auto-generates for IELTS-eligible results.
  - Uses the structured generation result and keeps retry UI visible until `aiFeedback` is actually saved.
  - Renders AI summary and study recommendations for non-THCS results.

### New Measures and Solutions for Failures
- Added slide-panel regression coverage for deterministic-only feedback state.
- Added new `ResultDetailModal` tests for:
  - IELTS auto-generation in the modal.
  - Retryable unavailable state when only deterministic feedback exists.
  - Rendering AI summary and study recommendations when AI feedback is present.

### Verification
- `npx vitest run src/components/results/ResultSlidePanel.test.tsx src/components/results/ResultDetailModal.test.tsx --reporter=basic`
  - Result: 2 test files passed, 27 tests passed.
- `npm run build`
  - Result: passed.

### Final Solution
- AI feedback in result-detail views now remains visible and retryable until a real AI summary is saved.
- The older teacher homework result modal now supports IELTS AI feedback flow instead of only THCS.
- Deterministic fallback no longer makes the modal appear broken or finished when AI output is still unavailable.

## 5. Result Modal Single-Write Feedback Guard

**Follow-up goal:**
- Rigorously prevent any result modal path from generating new AI feedback again once a result already has saved `formativeFeedback`.
- Ensure each stored payload remains tied to the correct `resultId` and that reopening the modal only reuses saved content.

### Initial Findings
- The previous result-modal fix still allowed regeneration logic to run when older saved payloads were missing `studyRecommendations` or still had weak fallback explanations.
- That meant reopening `ResultSlidePanel` or `ResultDetailModal` could request fresh AI content again even though the result already had saved feedback.
- `generateFormativeFeedback()` still saved to the right RTDB path, but it did not yet enforce a strict read-before-write guard at the service layer.
- There was also no explicit protection against two concurrent generation requests for the same `resultId` beyond UI-level modal guards.

### Trial Methods and Failure Analysis
1. Refresh-old-payload strategy review.
   - Re-checked the earlier logic that tried to upgrade saved payloads when recommendations were missing or explanations looked generic.
   - Rejected this approach because it violates the product rule: feedback for a result should be generated once, stored once, and then reused.
2. Service-first single-write guard.
   - Moved the hard stop into `generateFormativeFeedback()` so the rule does not depend on modal timing.
   - Added an early RTDB read for `test_results/{resultId}/formativeFeedback` and short-circuit reuse when a valid stored payload already exists.
3. Correct-result ownership safeguard.
   - Added `resultId` onto saved feedback payloads and only reuse a stored payload if it belongs to the same result or is legacy data with no `resultId` field yet.
   - This prevents a corrupted or mismatched payload from blocking correct generation for the current result.
4. UI finalization cleanup.
   - Removed the remaining modal behavior that treated deterministic-only stored feedback as an invitation to retry AI generation.
   - Saved feedback is now treated as final content in both result-detail surfaces.

### Logic Changes
- `src/services/formativeFeedback.service.ts`
  - Reuses an existing stored payload before generating anything new.
  - Dedupes concurrent generation requests per `resultId` through the in-flight promise map.
  - Saves `resultId` and `generationMode` on finalized payloads.
  - Ignores mismatched stored payloads whose `resultId` does not match the current result.
- `src/types/thcs-test.types.ts`
  - Added `resultId` and `generationMode` to the stored `FormativeFeedback` shape.
- `src/components/results/ResultSlidePanel.tsx`
  - Auto-generates only when `result.formativeFeedback` is fully absent.
  - Stops treating weak legacy explanations or missing recommendations as a reason to regenerate.
- `src/components/results/ResultDetailModal.tsx`
  - Uses the same strict "no stored feedback, no generation" rule.
  - Shows a finalized stored-feedback card for non-THCS deterministic payloads instead of retry UI.
- `src/components/results/FeedbackTab.tsx`
  - Renders stored deterministic feedback as a locked final state with no retry button.

### New Measures and Solutions for Failures
- Added service regression coverage proving:
  - existing stored feedback is reused without overwriting RTDB data;
  - concurrent requests for the same `resultId` reuse one generation flow.
- Replaced the old modal regression tests that expected payload refresh with tests that assert no second generation occurs.
- Added explicit UI coverage for the finalized deterministic-feedback state in the feedback tab and detail modal.

### Verification
- `npx vitest run src/components/results/ResultSlidePanel.test.tsx src/components/results/ResultDetailModal.test.tsx src/components/results/FeedbackTab.test.tsx src/services/formativeFeedback.generation.test.ts src/services/formativeFeedback.service.test.ts --reporter=basic`
  - Result: 5 test files passed, 46 tests passed.
  - Note: existing `act(...)` warnings remain in the older `ResultSlidePanel` test suite, but there were no failures.
- `npm run build`
  - Result: passed.

### Final Solution
- Result-detail AI feedback is now single-write per test result: once `formativeFeedback` exists, the modals reuse it and do not request fresh AI content again.
- The persistence rule now lives in the service, so it holds even across reopen, retry races, or multiple result views.
- Each finalized payload is now stamped with its `resultId`, and the UI clearly treats deterministic-only saved feedback as stored final content rather than an unfinished AI job.

## 6. AI Feedback Origin Trace

**Follow-up goal:**
- Trace the formative-feedback flow back to the first origin point after a test ends.
- Clarify whether the result modal is only a viewer or whether it can still originate AI feedback generation.

### Findings
- THCS live-session submissions generate formative feedback after the result is already saved.
  - `THCSTestLayout.tsx` saves the permanent result first via `saveTestResult(...)`, then fire-and-forget calls `generateFormativeFeedback(...)` with the saved `resultId`.
- THCS self-study / homework practice does the same.
  - `THCSPracticeView.tsx` saves the permanent result first, then fire-and-forget calls `generateFormativeFeedback(...)` with that `resultId`.
- IELTS-style submission flows do **not** currently generate formative feedback at submit time.
  - `useTestSubmission.ts` saves permanent IELTS/class-session results.
  - `useSoloSubmission.ts` saves permanent IELTS self-study / homework results.
  - Neither path currently invokes `generateFormativeFeedback(...)`.
- Because of that gap, the result-detail surfaces still act as a fallback generation origin for eligible results that have no stored `formativeFeedback`.
  - `ResultSlidePanel.tsx` reconstructs a feedback payload from the stored test result and auto-triggers generation when `result.formativeFeedback` is absent.
  - `ResultDetailModal.tsx` does the same.

### Current Architecture Conclusion
- THCS: AI formative feedback origin is the post-submit flow after the test ends.
- IELTS: AI formative feedback origin is still the result view when no stored feedback exists yet.
- Therefore, the recent single-write guard prevents duplicate generation once feedback is saved, but it does **not** yet make the result modal a read-only viewer for IELTS results.

### Recommended Next Step
- Move IELTS formative-feedback generation into the submission hooks (`useTestSubmission.ts` and `useSoloSubmission.ts`) right after `saveTestResult(...)` succeeds.
- After that, remove modal-origin generation for IELTS entirely so result-detail views become strict consumers of stored feedback only.

## 7. Immediate Gemini 403 Benching and AI Status Degraded Fallback

**Follow-up goal:**
- Close the remaining correctness gaps identified after the first AI Maintenance Mode rollout.
- Ensure Gemini callers bench dead or forbidden keys consistently, and ensure AI status does not falsely report healthy availability when the key registry check itself fails.

### Initial Findings
- Three Gemini call sites still only benched keys for 429 / quota-style failures.
  - `thcsDocumentParser.service.ts`
  - `formativeFeedback.service.ts`
  - `progressiveFeedback.service.ts`
- Those services would keep rotating past 403 / forbidden / invalid-key failures without benching the bad key, which left the same unusable key available to other callers.
- `ai-status.service.ts` still returned an optimistic fallback when availability checks threw unexpectedly.
  - On Firestore offline, auth expiry, or similar registry/read failures, it produced `available: true` with `totalKeys: 0`.
  - That prevented the maintenance banner from appearing even though AI requests would continue failing.

### Trial Methods and Failure Analysis
1. Full shared key-rotation refactor review.
   - Considered extracting a complete shared `callWithKeyRotation()` utility immediately.
   - Rejected for this pass because the immediate deploy blocker was correctness, not architecture, and the shared refactor touches too many AI paths at once.
2. Small shared Gemini error classifier.
   - Introduced one shared helper in the cooldown service to define which Gemini failures should bench a key.
   - This avoids repeating slightly different 403 / 429 / quota checks in each caller while keeping the change narrowly scoped.
3. Status fallback behavior reassessment.
   - Rejected the earlier optimistic fallback because it hid infrastructure/auth failures behind a false healthy state.
   - Replaced it with an explicit degraded-unavailable status so the UI can communicate that AI availability could not be verified.

### Logic Changes
- `src/services/key-cooldown.service.ts`
  - Added a shared `shouldBenchGeminiKeyError()` classifier.
  - Normalized cooldown parsing and error matching for blocked / forbidden / permission-denied / invalid-key / quota-style Gemini failures.
- `src/services/test-creation/thcsDocumentParser.service.ts`
  - Now benches Gemini keys for 403 / forbidden / invalid-key failures instead of only logging and continuing.
- `src/services/formativeFeedback.service.ts`
  - Now benches Gemini keys for the same broader class of bench-worthy failures instead of only 429 / quota events.
- `src/services/progressiveFeedback.service.ts`
  - Now uses the shared classifier and benches 403 / forbidden / invalid-key Gemini failures as well.
- `src/services/ai-status.service.ts`
  - Replaced the optimistic exception fallback with a degraded-unavailable fallback.
  - Unexpected key-registry failures now report that AI availability could not be verified instead of claiming the system is available.

### New Measures and Solutions for Failures
- Added regression coverage for the shared Gemini error classifier.
  - Verified that forbidden, invalid-key, and rate-limit failures are bench-worthy, while unrelated errors are not.
- Added AI status regression coverage for unexpected availability-check failures.
  - Verified that the returned state is unavailable/degraded with an explicit reason instead of a false green status.
- This closes the immediate production bug where exhausted or disabled Gemini keys could remain in the usable pool across multiple AI features.

### Verification
- `npx vitest run src/services/ai-status.service.test.ts src/services/key-cooldown.service.test.ts --reporter=basic`
  - Result: 2 test files passed, 10 tests passed.
- `npm run build`
  - Result: passed.

### Final Solution
- Gemini 403 / forbidden / invalid-key failures are now benched consistently across THCS parsing, formative feedback, and progressive feedback flows.
- AI Maintenance Mode no longer lies with a healthy status when the availability check itself fails; it now returns a degraded unavailable state with a user-facing reason.
- The larger shared key-rotation refactor remains worthwhile, but the deploy-blocking correctness gaps are now closed without broadening the change surface unnecessarily.

## 8. Architecture Decision: Sustainable AI Refactor Route

**Decision context:**
- Reviewed the independent deep audit and compared it against the current post-maintenance-mode codebase.
- The audit correctly identified the main long-term weak link: multiple Gemini callers still own their own key loading, rotation, and error-handling loops.
- It also correctly identified that IELTS formative feedback still originates from the result-detail surfaces instead of the post-submit workflow.

### Assessment of the Proposed Route
- The route is directionally correct and worth implementing.
- A shared Gemini key-rotation execution path is the right sustainability move.
  - It reduces repeated bug-fix work across `formativeFeedback`, `progressiveFeedback`, `thcsDocumentParser`, and hybrid Gemini extraction.
  - It makes AI Maintenance Mode more trustworthy because all callers will report exhaustion through the same cooldown rules.
- Moving IELTS formative-feedback generation out of result modals is also the right architecture.
  - Result views should be strict consumers of stored feedback, not origin points for new AI work.
  - THCS already follows that pattern after `saveTestResult(...)`; IELTS should match it.

### Architectural Advice Applied
1. Do not over-generalize the first refactor.
   - The first shared utility should be Gemini-focused and own only key loading, filtering, rotation, benching, and Gemini error classification.
   - Feature-specific prompt construction and response parsing should remain inside each feature service.
2. Do not duplicate IELTS fire-and-forget generation logic separately inside multiple submission hooks.
   - Use a shared post-save workflow/helper so both class-session and solo submission flows call the same origin path.
   - This keeps result generation behavior unified across test families.
3. Treat persistent cooldown state as a future optimization, not the new source of truth.
   - If cooldown persistence is added later, persist key fingerprints plus expiry rather than raw API keys.

### Final Direction
- Implement the shared Gemini key-rotation path first.
- Then move IELTS formative-feedback generation into the post-save workflow and remove modal-origin auto-generation for IELTS.
- Leave broader cleanup items (prompt extraction, usage tracking, broader router/provider consolidation) for later passes after the runtime path is unified.

## 9. Shared Gemini Rotation and Unified Saved-Result Feedback Origin

**Implementation goal:**
- Turn the architectural advice into code.
- Unify Gemini key rotation behind a shared executor.
- Move IELTS formative-feedback origin out of result-view auto-generation and into the saved-result workflow.
- Reduce divergence between THCS and IELTS by making the post-save result record the shared source of truth for feedback generation.

### Initial Findings
- Direct Gemini callers still repeated the same load / filter / rotate / bench loop in multiple services.
- Hybrid Gemini extraction still owned a separate key-rotation path and eagerly imported the Gemini SDK.
- IELTS result-detail surfaces were still auto-triggering formative feedback generation when no stored feedback existed.
- THCS and IELTS were using different feedback-origin patterns even after the single-write safeguards were added.

### Trial Methods and Design Choices
1. Shared executor boundary.
   - Implemented a Gemini-specific shared executor instead of a generic provider abstraction.
   - The shared path owns key loading, ordered rotation, bench-aware skipping, and bench-worthy Gemini error handling.
   - Feature services still own prompt construction and response validation.
2. Saved-result feedback trigger.
   - Added one shared helper that fetches `test_results/{resultId}`, rebuilds the feedback payload from the persisted result, and then calls `generateFormativeFeedback(...)`.
   - This avoids duplicating payload-building logic across multiple submission hooks.
3. Pragmatic result-view behavior.
   - Removed automatic IELTS-origin generation from result views.
   - Kept explicit retry wired to the same saved-result helper so operational recovery still uses the shared workflow rather than rebuilding payloads locally.
4. Full post-save unification for THCS and IELTS.
   - Switched THCS post-save formative-feedback triggers onto the same saved-result helper as IELTS.
   - This makes the saved result the common feedback-origin source across test families.

### Logic Changes
- `src/services/ai/gemini-key-rotation.service.ts`
  - New shared Gemini executor for key loading, ordered rotation, cooldown-aware filtering, and bench-worthy error handling.
- `src/services/formativeFeedback.service.ts`
  - Gemini AI feedback generation now runs through the shared executor.
- `src/services/progressiveFeedback.service.ts`
  - Progressive AI narrative generation now runs through the shared executor.
- `src/services/test-creation/thcsDocumentParser.service.ts`
  - Gemini plain-text repair/retry calls now use the shared executor and no longer manually assemble Gemini keys.
- `src/services/ai/providers/hybrid.gemini.provider.ts`
  - Hybrid extraction now uses the shared executor as well.
  - Removed the eager top-level Gemini SDK import.
- `src/services/resultFeedbackGeneration.service.ts`
  - New shared helper for generating formative feedback from a persisted result record.
- `src/hooks/test/useTestSubmission.ts`
  - IELTS class-session submit flow now triggers the shared saved-result feedback helper immediately after `saveTestResult(...)`.
- `src/hooks/solo/useSoloSubmission.ts`
  - IELTS solo/homework submit flow now does the same.
- `src/components/thcs-student/THCSTestLayout.tsx`
  - THCS submit flow now triggers feedback from the saved-result helper instead of building the payload inline.
- `src/components/practice/THCSPracticeView.tsx`
  - THCS practice/homework submit flow now does the same.
- `src/components/results/ResultSlidePanel.tsx`
  - Removed automatic IELTS feedback-origin generation.
  - Explicit retry now goes through the shared saved-result helper.
- `src/components/results/ResultDetailModal.tsx`
  - Same behavior as the slide panel.

### New Measures and Regression Coverage
- Added regression coverage for the shared saved-result feedback helper.
- Updated result-detail tests to assert:
  - IELTS views no longer auto-trigger feedback generation.
  - manual retry uses the shared saved-result helper.
- Updated submission-hook tests to assert:
  - IELTS saves now trigger the shared post-save feedback helper.
- Updated hybrid-provider tests for the shared Gemini executor path.

### Verification
- `npx vitest run src/components/results/ResultSlidePanel.test.tsx src/components/results/ResultDetailModal.test.tsx src/hooks/test/useTestSubmission.test.ts src/hooks/solo/useSoloSubmission.test.ts src/services/resultFeedbackGeneration.service.test.ts src/services/ai/providers/hybrid.gemini.provider.test.ts --reporter=basic`
  - Result: 6 test files passed, 39 tests passed.
- `npm run build`
  - Result: passed.

### Final Solution
- Gemini key rotation is now centralized for the non-router Gemini callers and hybrid extraction, which reduces future drift when new Gemini error classes need bench handling.
- Formative feedback now originates from the saved result record through one shared workflow.
- IELTS no longer auto-generates feedback from result-view mount; the post-save workflow is now the primary origin.
- THCS and IELTS now share the same saved-result feedback-origin path, which is more sustainable for future development and easier to reason about than multiple local generation entry points.
