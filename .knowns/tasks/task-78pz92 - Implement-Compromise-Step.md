---
id: 78pz92
title: Implement Compromise Step
status: done
priority: medium
labels:
  - from-spec-v2
  - pipeline
createdAt: '2026-03-04T22:46:30.235Z'
updatedAt: '2026-03-05T02:26:52.360Z'
timeSpent: 293
assignee: '@me'
spec: specs/ai-pipeline-redesign
fulfills:
  - AC-9
order: 9
---
# Implement Compromise Step

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When code validation detects unsupported types, route to compromise or skip. 7 compromise routes (matching → mcq-vocabulary, true-false → reading-comprehension, etc.) + 4 uncompromisable skips (listening, speaking, essay, composition). Uses `buildCompromisePrompt()` from prompt builder. Tags output `[COMPROMISED: old → new]`. Depends on @task-9vafnp, @task-0yg6fx, @task-wei3uc.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All 7 compromise routes implemented
- [x] #2 4 uncompromisable types correctly skipped with teacher warning
- [x] #3 buildCompromisePrompt() called with correct type + originalInput
- [x] #4 Output tagged [COMPROMISED: old → new]
- [x] #5 Compromise reasoning logged
- [x] #6 Retry follows compromise model/temp progression
- [x] #7 Order: 4 (depends on T3 9vafnp + T4 0yg6fx + T5 wei3uc)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### New file
`src/services/test-creation/thcs-compromise-step.ts`

### Architecture
An orchestrator for unsupported type conversion. Very similar in structure to Pass 2 Repair but with different decision logic and prompt builder.

### Flow
```
ValidationReport.unsupportedTypes[]
  → for each unsupported type:
    → if canCompromise: buildCompromisePrompt() → AI call → parseCompromiseResponse()
    → if uncompromisable: add skip warning
  → return CompromiseResult
```

### Interfaces

```typescript
interface CompromiseResult {
  compromisedSections: Array<{
    sectionIndex: number;
    originalType: string;
    convertedType: string;
    convertedText: string;
    reasoning: CompromiseReasoning;
  }>;
  skippedSections: Array<{
    sectionIndex: number;
    type: string;
    reason: string;        // e.g., "Listening requires audio — cannot digitize"
  }>;
  auditLog: RepairAuditEntry[];
}
```

### Core Function

```typescript
async function executeCompromiseStep(
  unsupportedTypes: ValidationReport['unsupportedTypes'],
  processedText: string,
  originalInput: string,
  retrySession: RetrySession,
  callAI: (step: RetryStep) => Promise<AICallResult | null>,
): Promise<CompromiseResult>
```

#### Logic:
1. Partition unsupported types into `compromisable` vs `uncompromisable`
   ```
   Compromisable: matching, true-false, translation, matching-headings,
                  gap-fill-open, word-ordering, picture-description (if has options)
   Uncompromisable: listening, speaking, essay, composition,
                    picture-description (if open-ended)
   ```

2. For each **uncompromisable type**: add to `skippedSections` with teacher warning message
   - `listening`: "Listening comprehension requires audio files — cannot be digitized. Section skipped."
   - `speaking`: "Speaking tasks require oral interaction — cannot be digitized."
   - `essay`: "Extended essay writing needs manual grading setup — section skipped."
   - `composition`: "Composition tasks need manual grading — section skipped."

3. For each **compromisable type**:
   a. Extract section text from `processedText` (by section boundaries/indices)
   b. Look up target type from `COMPROMISE_TEMPLATES`
   c. `buildCompromisePrompt(sourceType, targetType, sectionText, originalInput)`
   d. Call AI via `executeRetryChain(session, COMPROMISE_CHAIN, callCompromise, compareCompromise)`
   e. Parse response: `parseCompromiseResponse(rawResponse)`
   f. Verify `[COMPROMISED: old → new]` tag is present in output
   g. Log audit entry

4. Return `CompromiseResult`

### Key Design Decisions

1. **Per-section processing** — each unsupported section is compromised independently. One section failing doesn't block others.
2. **Shared retry session** — compromise calls count toward the same 5-call circuit breaker as Pass 2 repair.
3. **Output text includes tags** — `[COMPROMISED: old → new]` tags are left in the text for the engine's `consumeAITags()` to process.
4. **Skip reasons are teacher-readable** — used by the review panel to explain why certain sections were dropped.

### Files changed
- `src/services/test-creation/thcs-compromise-step.ts` (NEW — ~70 lines)

### Dependencies
- `thcs-prompt-builder.ts` → `buildCompromisePrompt`, `parseCompromiseResponse`, `COMPROMISE_TEMPLATES`
- `thcs-retry-manager.ts` → `executeRetryChain`, `COMPROMISE_CHAIN`, `RetrySession`
- `thcs-text-validator.ts` → `ValidationReport` type
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Notes
- Created `thcs-compromise-step.ts` (~160 lines)
- Routes unsupported types: 7 compromise routes + 4 uncompromisable skips
- picture-description auto-detects MCQ vs open based on option patterns
- Shared retry session with Pass 2 Repair
- Teacher-readable skip reasons for review panel
- 13 unit tests passing
<!-- SECTION:NOTES:END -->

