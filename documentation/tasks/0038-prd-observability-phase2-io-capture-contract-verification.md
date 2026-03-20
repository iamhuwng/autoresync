# PRD-0038: Observability Phase 2 — I/O Capture & Contract Verification

**Status:** Draft  
**Created:** 2026-03-18  
**Author:** Antigravity AI  
**Priority:** High  
**Depends On:** PRD-0037 (Production Reporting & Observability)  
**Target Users:** Admin/Developer (sole developer, primary consumer)  
**Scale:** 1 teacher, 4–5 students, max 2 concurrent users (early production/testing)

---

## 1. Introduction / Overview

### Problem

PRD-0037 established the foundation for production observability: error capture, feature event tracking, diagnostic bundles, and an admin reports page. However, three critical gaps remain:

1. **Silent Functional Failures:** Features that "work" but produce wrong or suboptimal results go undetected. If a teacher pastes text to create a THCS test and the parser produces 0 questions or misclassifies sections, the system records a successful event — no crash, no error, no alert. The developer discovers the problem days later, if at all.

2. **No I/O Capture for Diagnosis:** When a functional failure is discovered, there is no recorded input/output data to diagnose it. The developer must reproduce the exact scenario (same text, same conditions) to understand what went wrong. For AI-powered features this is especially painful because outputs are non-deterministic.

3. **No Feature Contract Verification:** There is no mechanism to verify that implemented features actually behave as described in their PRDs. The `featureRegistry.ts` tracks *which* actions exist, but not *whether* they are expected to fire during normal usage. A feature could silently stop working and nobody would know until a user complains.

### Solution

Build three interconnected capabilities on top of the PRD-0037 foundation:

1. **Always-On I/O Capture** for 4 critical pipelines (THCS paste parsing, AI operations, anti-cheat system, document upload) that automatically saves input + intermediate steps + output + quality signals to R2 when results fall below acceptance thresholds.

2. **On-Demand Recording Button** in the admin panel that enables full activity capture for any workflow, saving all console logs, network requests, state snapshots and trackAction events for that recording session to R2.

3. **Feature Contract Verification** that extends `featureRegistry.ts` with behavioral contracts (expected actions, PRD references) and provides an admin view showing which contracts have been observed vs. never-observed in production.

### Guiding Principles

- **Batch Diagnosis over Incremental Fixes:** The user prefers to collect diagnostic data over time and address issues in large, informed updates rather than constant minor fixes.
- **Pragmatic for Current Scale:** No sampling, no session grouping, no error deduplication beyond what PRD-0037 already provides. Always-on capture is feasible at <10 users.
- **Zero Performance Impact on Students:** All capture logic runs asynchronously. R2 uploads happen in fire-and-forget mode. No user-facing latency.
- **Build for Growth:** The system should gracefully accommodate 20–50 students in the near future. The on-demand recording toggle and threshold-based auto-capture ensure the system doesn't need redesigning when traffic increases.

---

## 2. Goals

| # | Goal | Measurable Outcome |
|---|------|--------------------|
| G1 | "I deployed a bug and didn't know for 3 days" never happens again | Every below-threshold pipeline run generates an R2 bundle within 5 seconds of completion |
| G2 | "I can't tell if paste-text actually works well" is eliminated | Every THCS parse run has its input text, pipeline trace, confidence scores, section breakdown, and final output saved to R2 |
| G3 | Diagnose functional failures without reproduction | The saved I/O bundle contains enough data (input, intermediate steps, output, metadata, console logs, state) to identify the root cause |
| G4 | Know which PRD-described features are actually exercised in production | Admin contract view shows observed vs. unobserved actions with last-seen timestamps |
| G5 | New features are automatically integrated into this tracking system | Updated agent rules and skills enforce contract registration and I/O capture hooks during development |
| G6 | On-demand deep capture for investigating unknown issues | Admin can press one button to start recording and another to stop and save the full trace bundle |

---

## 3. User Stories

### US-1: Auto-Capture Suboptimal Parse Results
**As a** developer/teacher,  
**I want** the system to automatically save the full input text, pipeline trace, and output when a THCS paste-parse produces results below acceptance thresholds,  
**So that** I can review these bundles later in batch and improve the parsing pipeline without needing to reproduce each failure.

### US-2: Auto-Capture AI Operation Failures
**As a** developer,  
**I want** every AI operation (feedback generation, quiz generation, writing grading, question classification) to save its prompt, response, provider info, and quality signals when the result is suboptimal,  
**So that** I can identify patterns in AI failures and tune prompts/providers in batch.

### US-3: Flag Bad Manual Result
**As a** teacher,  
**I want** to press a "Flag Bad Result" button when I see a poor parse or AI output,  
**So that** a diagnostic bundle is saved even when the automated thresholds don't catch it.

### US-4: Anti-Cheat Pathway Monitoring
**As a** developer,  
**I want** to know when any anti-cheat detection pathway (tab switch, copy, paste, fullscreen exit, keyboard shortcuts, auto-submit) fails to fire during a session where it was configured to be active,  
**So that** I can identify broken detection code before teachers report cheating slipping through.

### US-5: On-Demand Recording Session
**As a** developer/admin,  
**I want** to press "Start Recording" in the admin panel, perform any workflow as a teacher or student, then press "Stop Recording" which saves the entire trace to R2,  
**So that** I can investigate vague bug reports or verify complex multi-step flows.

### US-6: Contract Coverage Dashboard
**As a** developer,  
**I want** to see a dashboard showing which registered feature actions have been observed in production and which have never been seen,  
**So that** I can identify dead code, missing `trackAction` calls, or broken features.

### US-7: New Feature Auto-Integration
**As a** developer (or AI agent building features for me),  
**I want** enforceable rules ensuring every new feature registers its contracts, adds I/O capture hooks for AI/pipeline operations, and updates the feature registry,  
**So that** observability coverage never regresses.

---

## 4. Functional Requirements

### FR-1: Pipeline I/O Capture Service (Always-On)

#### FR-1.1: Core Capture Architecture
- The system MUST provide a `PipelineCaptureService` singleton that can wrap any async pipeline to capture its full I/O.
- The service MUST capture: raw input, intermediate step outputs (per-stage results), final output, timing per stage, metadata (userId, feature, pipeline name, version), and quality signals.
- Captured bundles MUST be serialized as JSON and uploaded to R2 via the existing `r2-backup-worker` at path `diagnostic-io/{feature}/{YYYY-MM-DD}/{timestamp}-{pipelineName}.json`.
- Upload MUST be fire-and-forget (no `await` in the caller's hot path). Failures MUST be silently logged to console.

#### FR-1.2: THCS Paste-Parse Pipeline Capture
- Every call to `thcsDocumentParser.service.ts` → `parseDocument()` or `parseText()` MUST be captured.
- The bundle MUST include:
  - **Input:** Raw pasted/uploaded text (full content, not truncated)
  - **Intermediate:** Pass 1 (AI restructure) output, Pass 2 (repair) output, type classification results per section
  - **Output:** Final `THCSSection[]` array with question counts, types, confidence scores
  - **Quality Signals:** `__PARSE_DEBUG` data (provider, pipeline, overallConfidence, reclassifications, warnings), question count, answered count
  - **Metadata:** Parse duration, provider used, fallback status, build version

#### FR-1.3: AI Operations Capture
- Every call routed through `ai/router.service.ts` MUST be captured when result quality is below threshold.
- Capture scope: `generateFeedback`, `gradeWritingAnswer`, `classifyQuestion`, `generateQuiz`, AI document extraction.
- The bundle MUST include:
  - **Input:** The prompt/input text sent to the AI provider
  - **Output:** The raw AI response (before parsing/validation)
  - **Parsed Output:** The structured result after parsing
  - **Quality Signals:** Provider used, model used, token count (if available), retry count, fallback chain, confidence scores
  - **Metadata:** Feature context, operation type, user role, build version

#### FR-1.4: Anti-Cheat System Capture
- When a test session completes AND anti-cheat was configured but `totalEvents === 0` AND the session lasted > 60 seconds, the system MUST save a diagnostic bundle.
- The bundle MUST include:
  - **Input:** Anti-cheat config provided to `useTestIntegrity`
  - **Output:** Final `IntegrityReport` / `HomeworkIntegrity` snapshot
  - **Quality Signals:** Total events, violation count, configured detectors vs. fired detectors
  - **Metadata:** Session code, student ID, session duration, browser info

#### FR-1.5: Document Upload Capture  
- When a document upload + parse flow completes via `TestCreationService.parseDocument()`, the system MUST capture the result.
- Capture condition: Always (given low volume at current scale).
- The bundle MUST include:
  - **Input:** File name, file size, file type (NOT the raw file binary — just text extraction result)
  - **Intermediate:** Conversion result, extraction result, classification result  
  - **Output:** `ParseResult` with `validationResult` and `metadata`
  - **Quality Signals:** `metadata.extractionSource`, `metadata.totalTimeMs`, question count from `validationResult`, `validationResult.confidence`

#### FR-1.6: Auto-Capture Threshold Criteria
The system MUST auto-save a bundle when ANY of the following conditions are met for the respective pipeline:

| Pipeline | Auto-Capture Trigger |
|----------|---------------------|
| THCS Paste Parse | `overallConfidence < 75%` OR `questionCount === 0` OR `warnings.length > 2` OR `reclassifications.length > 0` |
| AI Operations | `provider` fallback occurred OR `retryCount > 0` OR operation-specific: writing `gradingTier === 'teacher-review'` when `autoGradeWriting === true` |
| Anti-Cheat | `totalEvents === 0` AND `sessionDuration > 60s` AND at least 1 detector was configured |
| Document Upload | `success === false` OR `confidence < 70%` OR `questionCount === 0` |

Additionally, at current scale (<10 users), the system SHOULD capture all pipeline runs regardless of threshold (configurable via admin setting `alwaysCaptureIO: boolean`). This is the recommended default during the development/testing phase.

#### FR-1.7: Manual "Flag Bad Result" Button
- The system MUST provide a `flagBadResult(feature: string, context: Record<string, unknown>)` function callable from UI.
- For THCS test creation, a "🚩 Flag Bad Result" button MUST appear after a parse completes.
- Pressing the button MUST immediately save the current I/O bundle to R2, even if automated thresholds did not trigger.
- The bundle MUST include a `flagged: true` field and optional `flagReason` from the teacher.

### FR-2: On-Demand Recording Service

#### FR-2.1: Recording Toggle
- The system MUST provide a `RecordingService` singleton with `startRecording()` and `stopRecording()` methods.
- `startRecording()` MUST:
  - Begin intercepting all `console.log/warn/error` calls (reusing `DiagnosticLogger` pattern)
  - Begin capturing all `reportingService.trackAction()` calls with full metadata
  - Begin capturing all `reportingService.reportError()` calls
  - Record a timestamp and mark recording as active
- `stopRecording()` MUST:
  - Stop all interception
  - Bundle all captured data into a JSON object
  - Upload to R2 at path `recordings/{YYYY-MM-DD}/{timestamp}-manual-recording.json`
  - Return the R2 URL

#### FR-2.2: Admin UI Integration
- The Admin Reports page (or Admin Settings page) MUST display a "🔴 Start Recording" button when not recording.
- When recording is active, the button MUST change to "⏹️ Stop Recording" with a pulsing red indicator and elapsed time display.
- After stopping, the system MUST display a success message with the R2 URL or a "Download Bundle" link.
- Recording status MUST survive page navigation within the SPA (stored in a service singleton, NOT in component state).

### FR-3: Feature Contract Verification

#### FR-3.1: Contract Definition Schema
- `FeatureDefinition` in `featureRegistry.ts` MUST be extended with an optional `contracts` field:
```typescript
interface FeatureContract {
  /** Expected action that should fire during normal usage */
  expectedAction: string;
  /** When this action is expected to fire */
  expectationType: 'should-fire-during-tests' | 'should-fire-during-homework' | 'should-fire-on-page-visit' | 'should-fire-on-user-action' | 'admin-only';
  /** Reference to the PRD requirement */
  prdRef?: string;
  /** Human-readable description of the expected behavior */
  description: string;
}

interface FeatureDefinition {
  id: string;
  name: string;
  routes: string[];
  actions: string[];
  description: string;
  contracts?: FeatureContract[];  // NEW
}
```

#### FR-3.2: Contract Self-Registration (One-Time Audit)
- As part of this PRD implementation, a one-time audit MUST be performed to:
  1. Verify every `trackAction()` call in the codebase has a corresponding entry in `featureRegistry.ts` actions array.
  2. Add `contracts` to each feature definition based on the feature's PRD.
  3. Identify any `trackAction` calls using hardcoded feature IDs not in the registry and fix them.
  4. Add missing `trackAction` calls for user-facing interactions that are not currently tracked.

#### FR-3.3: Contract Coverage View (Admin UI)
- The admin reports page MUST include a "Feature Contracts" tab/section.
- For each feature with contracts defined, show:
  - Feature name and ID
  - Each expected action with its expectation type
  - A status indicator: ✅ "Observed" (with last-seen timestamp), ⚠️ "Never Observed", ❌ "Expected but Missing"
  - PRD reference link (if provided)
- The view MUST calculate an overall "contract coverage" percentage: `(observed actions / total expected actions) × 100%`.
- Data source: The existing RTDB event data from PRD-0037. No new database writes needed — query existing tracked events and compare against contracts.

#### FR-3.4: Contract Monitoring Alerts
- When contract coverage drops below 80%, the admin dashboard MUST show a warning badge.
- The system MUST NOT send external notifications (email, push) at this scale. Visual indicator on admin page is sufficient.

### FR-4: Metadata Display in Admin UI
- The `AdminReportsPage.tsx` MUST display the `metadata` field from tracked events.
- The existing `ReportEventRecord` interface MUST be updated to include `metadata?: Record<string, unknown>`.
- Metadata MUST be displayed in the event detail/expansion view as a formatted JSON block or key-value pairs.

### FR-5: Build Version Tracking
- Every event and error record MUST include a `buildVersion` field populated from `import.meta.env.VITE_BUILD_VERSION || 'dev'`.
- The admin dashboard MUST display the build version in the event detail view.
- The admin dashboard header/footer SHOULD show the currently deployed build version.

### FR-6: Error Visibility Indicator
- The admin dashboard MUST display a warning badge/icon when unresolved errors exist from the current or previous build version.
- "Unresolved" means: errors that appeared but no new build has been deployed since.
- This requires comparing error timestamps against the current `VITE_BUILD_VERSION`.

### FR-7: Agent Enforcement Rules

#### FR-7.1: Updated Observability Skill
- The `observability-tracking` skill at `.agent/skills/observability-tracking/SKILL.md` MUST be updated to include:
  - Mandatory contract registration for new features
  - I/O capture hook requirements for any AI or pipeline operation
  - Metadata guidelines (what to include in `trackAction` metadata)
  - Checklist: "Before marking task done, verify: featureRegistry updated, contracts added, trackAction calls present, I/O capture hooks added if applicable"

#### FR-7.2: Updated Observability Rule
- The `documentation/rules/observability.md` MUST be updated to include:
  - Trigger: "Creating any AI operation, parser, or multi-step pipeline" → MUST add `PipelineCaptureService` wrapper
  - Trigger: "Adding a new feature" → MUST add `contracts` array to featureRegistry entry
  - Reference to the I/O capture bundle schema

#### FR-7.3: Skill Standardization
- The observability skill MUST be accessible to both Claude (`.agent/skills/`) and Gemini (`.agents/skills/`). Ensure both paths exist and are kept in sync.

---

## 5. Non-Goals (Out of Scope)

| # | Non-Goal | Reason |
|---|----------|--------|
| NG-1 | Session tracking / session IDs | Not needed at <10 users. Can be added later when user base grows. |
| NG-2 | Core Web Vitals (FCP, LCP, CLS) | Not a priority for a learning platform at this scale. Defer to Phase 3. |
| NG-3 | `sendBeacon` for page-close data | Adds complexity for marginal gain at current usage level. |
| NG-4 | Error grouping / deduplication beyond PRD-0037 | The signature-based rate limiting from PRD-0037 is sufficient. |
| NG-5 | External alerting (email, SMS, push notifications) | Solo developer checks admin panel regularly. Visual indicators are sufficient. |
| NG-6 | Capturing raw binary files (PDFs, DOCXs) in I/O bundles | Too large. Capture the extracted text content instead. |
| NG-7 | Real-time streaming of I/O captures | Fire-and-forget upload is sufficient. No WebSocket streaming needed. |
| NG-8 | AI-powered analysis of I/O bundles | The developer reviews bundles manually. AI analysis can be added later. |
| NG-9 | User-facing quality indicators | Students and teachers should not see confidence scores or diagnostic data. |

---

## 6. Design Considerations

### 6.1: R2 Storage Layout
```
diagnostic-io/
  thcs-parse/
    2026-03-18/
      1710736800000-parse-paste.json
      1710739200000-parse-upload.json
  ai-operations/
    2026-03-18/
      1710736800000-generateFeedback.json
      1710739200000-gradeWriting.json
  anti-cheat/
    2026-03-18/
      1710736800000-session-ABC123.json
  document-upload/
    2026-03-18/
      1710736800000-parseDocument.json
recordings/
  2026-03-18/
    1710736800000-manual-recording.json
```

### 6.2: I/O Bundle Schema (Common Structure)
```json
{
  "bundleId": "uuid-v4",
  "bundleType": "thcs-parse | ai-operation | anti-cheat | document-upload | manual-recording",
  "timestamp": 1710736800000,
  "buildVersion": "1.2.3",
  "flagged": false,
  "flagReason": null,
  "user": {
    "id": "uid",
    "name": "Teacher Name",
    "role": "teacher"
  },
  "pipeline": {
    "name": "thcs-paste-parse",
    "durationMs": 4500,
    "stages": [
      {
        "name": "conversion",
        "input": "...",
        "output": "...",
        "durationMs": 200
      }
    ]
  },
  "qualitySignals": {
    "overallConfidence": 72,
    "questionCount": 15,
    "warnings": [],
    "triggerReason": "confidence < 75%"
  },
  "consoleLogs": [],
  "metadata": {}
}
```

### 6.3: Admin UI Placement
- **I/O Bundles:** New tab "I/O Captures" in the Admin Reports page. Shows a list of recent bundles grouped by pipeline type with date filters.
- **Recording:** Button in Admin Reports page header bar, next to existing controls.
- **Feature Contracts:** New tab "Contracts" in the Admin Reports page.
- **Metadata Display:** Expandable section within existing event detail views.

### 6.4: Performance Budget
- All I/O capture logic MUST execute asynchronously using `setTimeout(fn, 0)` or `queueMicrotask()` to avoid blocking the main thread.
- Bundle serialization for large inputs (>100KB of text) SHOULD use chunked processing if it causes measurable frame drops.
- At current scale (<10 users), no throttling or sampling is needed.

---

## 7. Technical Considerations

### 7.1: Dependencies
- **R2 Worker:** Reuse existing `r2-backup-worker` (`VITE_BACKUP_WORKER_URL`). Add a new route `/api/io-capture` that accepts JSON bundles and stores them under `diagnostic-io/`. Authentication via existing `VITE_DIAGNOSTIC_TOKEN`.
- **Firebase RTDB:** No new nodes needed for I/O capture (bundles go to R2). Contract verification reads existing event data.
- **`featureRegistry.ts`:** Extended with `contracts` field.
- **`reportingService.ts`:** Extended with `onTrackAction` hook for recording service.
- **`diagnosticLogger.js`:** Reused by recording service for console interception.

### 7.2: New Files
| File | Purpose |
|------|---------|
| `src/services/pipelineCaptureService.ts` | Core I/O capture singleton |
| `src/services/recordingService.ts` | On-demand recording singleton |
| `src/services/contractVerificationService.ts` | Contract coverage calculation |
| `src/components/admin/IOCaptureTab.tsx` | Admin UI for I/O bundles |
| `src/components/admin/ContractCoverageTab.tsx` | Admin UI for contract verification |
| `src/components/admin/RecordingControls.tsx` | Start/Stop recording button |

### 7.3: Modified Files
| File | Changes |
|------|---------|
| `src/config/featureRegistry.ts` | Add `contracts` to `FeatureDefinition`, populate for all features |
| `src/services/reportingService.ts` | Add `onTrackAction` hook, add `buildVersion` to all events |
| `src/services/test-creation/thcsDocumentParser.service.ts` | Add pipeline capture wrapper |
| `src/services/ai/router.service.ts` | Add pipeline capture wrapper |
| `src/hooks/test/useTestIntegrity.ts` | Add anti-cheat completeness capture |
| `src/pages/AdminReportsPage.tsx` | Add metadata display, new tabs, recording controls |
| `.agent/skills/observability-tracking/SKILL.md` | Update with contract + I/O requirements |
| `.agents/skills/observability-tracking/SKILL.md` | Mirror of above for Gemini |
| `documentation/rules/observability.md` | Add pipeline capture triggers |

### 7.4: R2 Worker Route Addition
The existing `r2-backup-worker` needs a new route:
```
POST /api/io-capture
Authorization: Bearer <VITE_DIAGNOSTIC_TOKEN>
Content-Type: application/json
Body: { bundleType, bundleId, data }
Response: { url: "https://..." }
```
Storage path: `diagnostic-io/{bundleType}/{YYYY-MM-DD}/{bundleId}.json`

### 7.5: Auto-Capture Threshold Detail

**THCS Parse Confidence:**
- The `overallConfidence` comes from `__PARSE_DEBUG.overallConfidence` which is calculated by the pipeline
- This is a single numeric value (0–100) reflecting the parser's self-assessment
- Threshold: < 75% triggers capture

**AI Score Variance:**
- AI operations have different quality signals depending on the operation type:
  - `gradeWritingAnswer`: `gradingTier` (pass/borderline/fail/teacher-review)
  - `generateFeedback`: Response validation (is it valid JSON? Does it have required fields?)
  - `classifyQuestion`: `confidence` from `ClassificationResult`
- The trigger is NOT a single universal threshold but per-operation type logic defined in `PipelineCaptureService`

**Combined AI + Regex concern:**
- For THCS parsing, AI confidence and regex confidence can diverge (AI scores high but regex low, or vice versa)
- The system captures when EITHER is below threshold, not just one
- The `reclassifications.length > 0` trigger specifically catches cases where the type classifier had to override AI assignments, indicating disagreement

### 7.6: Data Retention
- I/O bundles in R2: Retained for 90 days (align with existing backup retention policy).
- Recording bundles in R2: Retained for 30 days (these are ad-hoc investigations).
- Contract coverage data: Derived from RTDB event data, which already has its own retention from PRD-0037.

---

## 8. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| I/O bundle capture rate | 100% of below-threshold pipeline runs have a bundle within 5s | Check R2 bundle timestamps vs. event timestamps |
| Contract coverage | >90% of registered contracts observed within 7 days of deployment | Contract coverage dashboard |
| Diagnosis time reduction | Root cause identified in < 15 minutes using bundle data | Developer self-reported |
| Zero silent failures > 24h | No functional failure remains undetected for more than 24 hours | Admin dashboard alert badge |
| Agent compliance | 100% of new features added in Phase 2+ include contracts and I/O hooks | Code review / grep audit |

---

## 9. Open Questions

| # | Question | Status |
|---|----------|--------|
| OQ-1 | Should the "Flag Bad Result" button be available in the THCS editor modal only, or also in the test review/preview screen? | **Resolved: Both** — anywhere the teacher can see parse results |
| OQ-2 | Should on-demand recording capture network requests (fetch/XHR) in addition to console logs and events? | **Recommended: Yes** for router.service.ts AI calls. Full network interception is NG. |
| OQ-3 | How long should the R2 worker take to process a 500KB I/O bundle upload? | Expected <2 seconds at current scale |
| OQ-4 | Should there be a hard limit on I/O bundle size to prevent accidental cost spikes? | **Recommended: 2MB per bundle, truncate text inputs >100KB** |

---

## 10. Implementation Order

### Phase A: Foundation (Must-Have)
1. `PipelineCaptureService` core implementation
2. R2 worker `/api/io-capture` route
3. THCS parse pipeline capture integration
4. Admin "I/O Captures" tab (list view)
5. Build version tracking in all events

### Phase B: Coverage (Must-Have)
6. AI operations capture integration
7. Anti-cheat completeness capture
8. Document upload capture
9. Feature contract schema + self-registration audit
10. Admin "Contracts" tab

### Phase C: Tools (Should-Have)
11. On-demand recording service
12. Recording controls in admin UI
13. "Flag Bad Result" button in THCS editor
14. Metadata display in admin event details
15. Error visibility indicator/badge

### Phase D: Enforcement (Must-Have)
16. Updated observability skill (both agent dirs)
17. Updated observability rule
18. Skill standardization across Claude/Gemini agent directories

---

## 11. Edge Cases & Preventions

| Edge Case | Prevention |
|-----------|------------|
| Bundle upload fails (R2 worker down) | Fire-and-forget: log to console, don't retry. Bundle data is ephemeral diagnostic aid, not critical data. |
| Very large input text (>500KB) | Truncate text in bundle to first 100KB + last 10KB with `[...truncated...]` marker. Save original text length in metadata. |
| Recording left active by accident | Auto-stop after 30 minutes. Show elapsed time prominently. Store recording state in service singleton (survives navigation) but show periodic reminder toast every 5 minutes. |
| Two capture triggers for same pipeline run | `PipelineCaptureService` MUST deduplicate by checking a `capturedRunId` (UUID generated at pipeline start). Only one bundle per run. |
| Contract showing "never observed" for admin-only actions | `expectationType: 'admin-only'` contracts are excluded from the coverage percentage calculation and shown in a separate section. |
| RTDB event data purged before contract check | Contract verification MUST use a rolling window (last 30 days). If no events exist, show "No data" rather than "Missing". |
| Build version not set in dev environment | Default to `'dev'`. Contract and threshold logic MUST work regardless of build version value. |
| Teacher flags result but I/O wasn't captured (thresholds were met) | "Flag Bad Result" MUST independently trigger a fresh capture at flag time, not rely on the auto-capture having already run. The flag function re-reads current state and bundles it. |
