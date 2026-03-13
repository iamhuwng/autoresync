---
id: 8085zl
title: Pipeline Integration + Review Panel Updates
status: done
priority: medium
labels:
  - from-spec-v2
  - integration
createdAt: '2026-03-04T22:46:39.478Z'
updatedAt: '2026-03-09T18:24:16.150Z'
timeSpent: 402069
assignee: '@me'
spec: specs/ai-pipeline-redesign
fulfills:
  - AC-11
  - AC-12
order: 11
---
# Pipeline Integration + Review Panel Updates

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wire everything into `parseThcsText()` replacing current internal AI call. Preserve `ParsedTest` output interface. Update `THCSParseReviewPanel.tsx` with new visual indicators: yellow (AI-inferred), orange (compromised), warning icon (uncertain), expandable reasoning logs. Remove old 97-line JSON prompt and band-aid steps. Depends on @task-4f54n5 (engine), @task-pqr0rq (repair), @task-78pz92 (compromise), @task-le05g6 (external retry).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Order: 6 (depends on T6A 4f54n5 + T7 pqr0rq + T8 78pz92 + T9 le05g6)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### The "Big Rewrite" — replaces `parseThcsText()` internals + updates review panel

### Files changed
1. `src/services/test-creation/thcsDocumentParser.service.ts` — rewrite `parseThcsText()` (lines 415-610)
2. `src/components/thcs-editor/THCSParseReviewPanel.tsx` — add new visual indicators (242 lines, modify ~80)

---

### Part 1: Rewrite `parseThcsText()` (thcsDocumentParser.service.ts)

#### Current pipeline (to REMOVE — lines 433-604):
```
Stage 2: AI Extraction → callGroqDirect/callGeminiDirect → JSON ParsedTest
Stage 3: Regex fallback
Stage 3b: Section reconciliation (Q# overlap)
Stage 4: Post-processing (answer key apply)
Stage 5: Diagnostics
```

#### New pipeline (to REPLACE WITH):
```typescript
async function parseThcsText(rawText, onProgress): Promise<Result<ParsedTest>> {
  // ─── Stage 1: Pre-clean (KEEP) ───
  const cleaned = preCleanText(rawText);
  if (cleaned.trim().length < 50) return { success: false, error: '...' };

  // ─── Stage 2: Pass 1 — Restructure + Confidence (NEW) ───
  onProgress?.({ stage: 'parsing', percent: 10, message: 'Analyzing text structure...' });
  const retrySession = createRetrySession(5);
  const pass1 = await executePass1(cleaned, retrySession);

  // ─── Stage 3: Code Validation (NEW) ───
  onProgress?.({ stage: 'parsing', percent: 25, message: 'Validating format...' });
  const validationReport = validateRestructuredText(
    pass1.restructuredText, rawText, pass1.confidence
  );

  // ─── Stage 4: Branch Decision (NEW) ───
  let bestText = pass1.restructuredText;
  let allAuditEntries: RepairAuditEntry[] = [];
  let compromiseResult: CompromiseResult | null = null;
  let confidenceWarning: string | null = null;

  // 4a: Compromise unsupported types (if any)
  if (validationReport.unsupportedTypes.length > 0) {
    onProgress?.({ stage: 'parsing', percent: 35, message: 'Converting unsupported sections...' });
    compromiseResult = await executeCompromiseStep(
      validationReport.unsupportedTypes, bestText, rawText, retrySession, callAI
    );
  }

  // 4b: Repair known issues (if formatConfidence 50-79)
  if (validationReport.formatConfidence >= 50 && validationReport.issues.length > 0) {
    onProgress?.({ stage: 'parsing', percent: 45, message: 'Repairing formatting issues...' });
    const pass2 = await executePass2Repair(
      validationReport, pass1.confidence, retrySession, callAI
    );
    bestText = pass2.repairedText;
    allAuditEntries.push(...pass2.auditLog);
    confidenceWarning = pass2.confidenceWarning;
  }

  // 4c: External retry (if formatConfidence < 50 after all internal passes)
  if (validationReport.formatConfidence < 50) {
    onProgress?.({ stage: 'parsing', percent: 50, message: 'Requesting external re-extraction...' });
    const extRetry = await executeExternalRetry(rawText, allAuditEntries, validationReport, callExternalAI);
    if (extRetry.outcome === 'success' && extRetry.bestText) {
      bestText = extRetry.bestText;
    } else {
      // Teacher escalation — return error with audit log
      return {
        success: false,
        error: extRetry.teacherMessage || 'Automatic parsing failed. Please review text format.',
      };
    }
  }

  // ─── Stage 5: Regex Engine Parse (EXISTING — adapted) ───
  onProgress?.({ stage: 'parsing', percent: 65, message: 'Parsing content...' });
  const parsedTest = await parseThcsTextRegex(bestText, undefined, true);
  if (!parsedTest.success || !parsedTest.data) {
    return { success: false, error: 'Regex parsing failed on processed text.' };
  }

  // ─── Stage 6: Engine Enhancements (NEW) ───
  onProgress?.({ stage: 'classifying', percent: 80, message: 'Applying engine enhancements...' });
  // Type classification (existing)
  classifyQuestionTypes(parsedTest.data.sections);
  reclassifyByContent(parsedTest.data.sections);
  // Engine enhancements (new — task 4f54n5)
  // runEngineEnhancements called inside draft converter

  // ─── Stage 7: Diagnostics (ENHANCED) ───
  // Attach pipeline debug data (same pattern as current, but with new fields)
  parsedTest.data.warnings = [...(parsedTest.data.warnings || [])];
  if (confidenceWarning) {
    parsedTest.data.warnings.push({ type: 'confidence-mismatch', message: confidenceWarning });
  }
  if (compromiseResult) {
    for (const skip of compromiseResult.skippedSections) {
      parsedTest.data.warnings.push({ type: 'skipped-section', message: skip.reason });
    }
  }

  // Attach audit data for review panel
  (parsedTest.data as any)._pipelineDebug = {
    pass1Confidence: pass1.confidence,
    codeConfidence: validationReport.formatConfidence,
    issuesFound: validationReport.issues.map(i => i.code),
    auditLog: allAuditEntries,
    compromisedSections: compromiseResult?.compromisedSections || [],
    skippedSections: compromiseResult?.skippedSections || [],
    hasInferredAnswers: pass1.hasInferredAnswers,
  };

  onProgress?.({ stage: 'done', percent: 100, message: 'Done!' });
  return parsedTest;
}
```

#### What gets REMOVED from parseThcsText:
- Lines 438-462: `attemptAIParse(fullPrompt, 'groq'/'gemini')` — the old JSON AI call
- Lines 479-534: Q# overlap reconciliation — no longer needed (pipeline handles quality internally)
- Lines 440: `thcs-ai-extraction-prompt.txt` import — old 97-line JSON prompt

#### What gets KEPT:
- `preCleanText()` call (line 427)
- `parseThcsTextRegex()` — still used as the regex engine
- `classifyQuestionTypes() + reclassifyByContent()` — still used
- Metadata override pattern (if exists)
- `window.__PARSE_DEBUG` diagnostics (enhanced, not removed)

#### `callAI` callback implementation
```typescript
// Created in parseThcsText, passed to all sub-modules
const callAI = async (step: { provider: string; model: string; temperature: number }, prompt: string) => {
  if (step.provider === 'groq') {
    return await callGroqDirectPlainText(prompt, step.model, step.temperature);
  } else {
    return await callGeminiDirectPlainText(prompt, step.model, step.temperature);
  }
};
```

Must create `callGroqDirectPlainText` and `callGeminiDirectPlainText` — same as existing `callGroqDirect`/`callGeminiDirect` but expecting plain text response (no JSON parsing, no `extractJSON` call).

---

### Part 2: Review Panel Updates (THCSParseReviewPanel.tsx)

#### New visual indicators (AC-12):

1. **Yellow badge**: Questions with `answerSource: 'ai-inferred'`
   - Small yellow badge next to question number: "AI-Inferred"

2. **Orange badge**: Sections with `compromised: true`
   - Section header has orange badge: "Compromised: {originalType} → {convertedType}"

3. **Warning icon**: Sections with `[UNCERTAIN]` tags in warnings
   - IconAlertTriangle next to section name

4. **Expandable reasoning logs**:
   - Collapsible section at bottom of panel
   - Shows `_pipelineDebug.auditLog` entries in a formatted list
   - Each entry: model, temperature, issues targeted, confidence result

5. **Confidence comparison warning** (FR-13):
   - Alert banner at top if `_pipelineDebug.pass1Confidence` and `_pipelineDebug.codeConfidence` disagree by >25 points

#### Implementation approach:
- The panel already uses Mantine components (existing code, not adding new Mantine imports)
- Add conditional rendering based on `_pipelineDebug` data
- Use existing `Badge`, `Alert`, `Text` components
- Add `Collapse` for reasoning log expandability (already in Mantine)

---

### Part 3: Old Code Cleanup

#### Remove:
- `thcs-ai-extraction-prompt.txt` — old 97-line JSON extraction prompt (REPLACED by Pass 1 static prompt)
- `attemptAIParse()` function — no longer needed
- `callGroqDirect()` JSON path — refactored into `callGroqDirectPlainText()`
- `callGeminiDirect()` JSON path — refactored into `callGeminiDirectPlainText()`

#### Keep as fallback (safety net):
- `callGroqDirect()` / `callGeminiDirect()` original functions — keep for now, rename to `_legacy_callGroqDirect` etc. Remove in a follow-up cleanup after the new pipeline is validated.

---

### Files changed
- `src/services/test-creation/thcsDocumentParser.service.ts` — rewrite `parseThcsText()` (~200 lines changed), add `callXxxDirectPlainText()` functions
- `src/components/thcs-editor/THCSParseReviewPanel.tsx` — add 4 new visual indicator sections (~80 lines added)

### Dependencies (ALL upstream tasks must be complete)
- `thcs-pass1-restructure.ts` (task `q6lxtq`) → `executePass1`
- `thcs-text-validator.ts` (task `9vafnp`) → `validateRestructuredText`
- `thcs-pass2-repair.ts` (task `pqr0rq`) → `executePass2Repair`
- `thcs-compromise-step.ts` (task `78pz92`) → `executeCompromiseStep`
- `thcs-external-retry.ts` (task `le05g6`) → `executeExternalRetry`
- `thcs-retry-manager.ts` (task `0yg6fx`) → `createRetrySession`
- `thcs-engine-enhancements.ts` (task `4f54n5`) → `runEngineEnhancements` (via converter)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Complete (Session 2)

### Parser Service (`thcsDocumentParser.service.ts`)
- **New imports**: executePass1, validateRestructuredText, executePass2Repair, executeCompromiseStep, executeExternalRetry, createRetrySession
- **Extended ParseWarning type**: Added 'confidence-mismatch', 'skipped-section', 'compromised-section'
- **New PipelineDebug interface**: pass1Confidence, codeConfidence, issuesFound, auditLog, compromisedSections, skippedSections, hasInferredAnswers, pipeline, provider, parseDurationMs
- **Rewrote parseThcsText()**: 7-stage pipeline (pre-clean → Pass 1 → validation → branch decision → regex engine → type classification → diagnostics)
- **Added callGroqDirectPlainText()**: Plain text Groq API call for Pass 1/2/Compromise
- **Added callGeminiDirectPlainText()**: Plain text Gemini API call for Pass 2/External Retry
- **Removed legacy code**: validateAIResult(), callGroqDirect(), callGeminiDirect(), _legacy_attemptAIParse(), extractJSON import, _lastReclassifications module variable

### Review Panel (`THCSParseReviewPanel.tsx`)
- **Added _pipelineDebug to ParsedTest interface**: Full pipeline debug data structure
- **Confidence disagreement warning (FR-13)**: Yellow Alert when AI vs code confidence gap >25
- **Section badges**: Yellow "AI-Inferred" for sections with missing answers when AI inferred, Orange compromise badge showing original→converted type, Red "Skipped" badge for unsupported sections
- **Expandable audit log**: Collapsible reasoning log showing repair attempts with model, temperature, issues, and confidence
- **Pipeline info**: Duration and pipeline name in header stats

### Type Check
- Zero errors in thcsDocumentParser.service.ts
- Zero errors in THCSParseReviewPanel.tsx
- Only pre-existing errors in THCSDocumentUpload.tsx (unrelated)
<!-- SECTION:NOTES:END -->

