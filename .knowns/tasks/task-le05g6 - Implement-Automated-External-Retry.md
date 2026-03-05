---
id: le05g6
title: Implement Automated External Retry
status: done
priority: medium
labels:
  - from-spec-v2
  - pipeline
createdAt: '2026-03-04T22:46:30.654Z'
updatedAt: '2026-03-05T02:36:57.676Z'
timeSpent: 296
assignee: '@me'
spec: specs/ai-pipeline-redesign
fulfills:
  - AC-16
order: 10
---
# Implement Automated External Retry

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When `formatConfidence < 50` after all internal passes (Pass 1 + Pass 2), call external AI API (Gemini/GPT) with original text + structured audit log. Max 3 retries. Each retry re-enters pipeline at preClean. All fail → escalate to teacher with full audit log. This is a DIFFERENT mechanism from the internal retry chain — different API, prompt structure, and termination logic. Depends on @task-{Pass2}, @task-0yg6fx.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Triggers when formatConfidence < 50 after Pass 1 + Pass 2
- [x] #2 Calls external AI API (not teachers manual session)
- [x] #3 Audit log includes: issue codes, failed sections, Q count mismatches
- [x] #4 Each retry re-enters at preClean
- [x] #5 Max 3 retries enforced
- [x] #6 All fail → teacher escalation with full audit log
- [x] #7 Order: 5 (depends on T7 pqr0rq)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### New file
`src/services/test-creation/thcs-external-retry.ts`

### Architecture
A last-resort mechanism — completely different from the internal retry chain. When the internal pipeline (Pass 1 + Pass 2) can't get confidence above 50, this calls an EXTERNAL AI API (Gemini/GPT — not Groq) with the ORIGINAL teacher text + a structured audit log of what went wrong.

### Key Distinction from Internal Retry
| Aspect | Internal (Pass 2) | External Retry |
|---|---|---|
| Trigger | `formatConfidence 50-79` | `formatConfidence < 50` after ALL internal passes |
| AI used | Groq/Gemini for TEXT REPAIR | Gemini/GPT for FULL RE-EXTRACTION |
| Prompt type | Fragment-based repair prompt | Original teacher text + audit log |
| Input | Restructured text | Original raw teacher text |
| Output | Repaired text (plain text) | Text re-enters pipeline at preClean |
| Max tries | Per retry chain (2-3 steps) | Fixed: max 3 |
| On failure | Escalate model/temp | Escalate to teacher |

### Interfaces

```typescript
interface ExternalRetryResult {
  outcome: 'success' | 'teacher-escalation';
  bestText: string | null;           // best re-extracted text (if success)
  attemptsUsed: number;             // 1-3
  auditLog: ExternalRetryAuditEntry[];
  teacherMessage: string | null;    // shown when escalating to teacher
}

interface ExternalRetryAuditEntry {
  attempt: number;
  timestamp: number;
  provider: string;
  issueCodes: string[];
  formatConfidence: number;
  sectionsMissing: string[];
  questionCountMismatch: { expected: number; got: number } | null;
}
```

### Core Function

```typescript
async function executeExternalRetry(
  originalInput: string,           // raw teacher text
  internalAuditLog: RepairAuditEntry[],  // from Pass 2 attempts
  validationReport: ValidationReport,     // final internal report
  callAI: (provider: string, prompt: string) => Promise<string | null>,
): Promise<ExternalRetryResult>
```

#### Logic:

1. **Build audit summary** for the external AI:
   ```
   === PARSING AUDIT LOG ===
   Issues found: MERGED_QUESTIONS (section 2), MISSING_ANSWER_KEY (global)
   Failed sections: Section 3 ("Reading B") - 0 questions parsed
   Question count: Expected ~40 (estimated from text length), parsed 28
   Internal repair attempts: 2 (both produced worse results)
   Specific problems:
   - Lines 45-52: Questions merged, could not split reliably
   - Answer key format "1-5: BACDC" could not be expanded
   ```

2. **Build external prompt**:
   ```
   A Vietnamese THCS English test was automatically parsed but the results were poor.
   Below is the original teacher text and an audit log of what went wrong.
   Please re-extract the test content, paying special attention to the flagged issues.

   === AUDIT LOG ===
   {auditSummary}

   === ORIGINAL TEXT ===
   {originalInput}

   Please extract and structure the test content. Output as clean, well-formatted text with:
   - Clear section headers with [TYPE: xxx] tags
   - One question per line with "Question N." prefix
   - Options on separate lines (A. / B. / C. / D.)
   - Answer key section with one answer per line
   ```

3. **Retry loop** (max 3):
   a. Call external AI (Gemini Flash → Gemini Pro → GPT-4o-mini)
   b. Pass response through `preCleanText()` (re-enters pipeline)
   c. Run Pass 1 on result
   d. Run code validation on Pass 1 output
   e. If `formatConfidence >= 50`: SUCCESS — return this text
   f. If still < 50: add to audit log, try next provider/attempt
   g. After attempt, update audit summary with new findings

4. **All 3 fail**: Return `teacher-escalation` with:
   ```
   teacherMessage: "Automatic parsing could not reliably extract this test after 3 attempts.
   Issues found: [summary]. Please review the text format and try again, or create the
   test manually using the editor."
   ```

### Key Design Decisions

1. **Original text, not processed** — the external retry starts from scratch with the teacher's original paste. The processed versions from internal passes are discarded.

2. **Different provider chain** — External retry uses Gemini Flash → Pro → GPT-4o-mini. NOT the same chain as internal repair (which uses Groq → Gemini Flash).

3. **Re-enters at preClean** — each retry output goes through the full validation pipeline (preClean → Pass 1 → code validation). This ensures we use the same quality criteria.

4. **Separate from circuit breaker** — the 5-call circuit breaker is for INTERNAL AI calls. External retry has its own separate max (3 attempts). This is per FR-15 spec.

5. **Teacher escalation is graceful** — includes the full audit log so the teacher understands what went wrong.

### Files changed
- `src/services/test-creation/thcs-external-retry.ts` (NEW — ~100 lines)

### Dependencies
- `thcs-text-validator.ts` → `validateRestructuredText`, `ValidationReport`
- `thcs-pass1-restructure.ts` → `executePass1` (for re-validation)
- `thcs-prompt-builder.ts` → `RepairAuditEntry` type

### Consumed by
- Task `8085zl` (Integration) → calls `executeExternalRetry()` when `formatConfidence < 50`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Notes
- Created `thcs-external-retry.ts` (~200 lines)
- Separate from internal 5-call circuit breaker
- Provider chain: Gemini Flash → Gemini Pro → GPT-4o-mini
- Each attempt: external AI → re-enters pipeline at preClean → validate
- Success: formatConfidence ≥ 50
- Failure: teacher escalation with full audit log + human-readable message
- Tracks best result across all attempts
- 15 unit tests passing
<!-- SECTION:NOTES:END -->

