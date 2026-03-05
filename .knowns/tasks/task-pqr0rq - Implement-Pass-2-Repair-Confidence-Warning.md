---
id: pqr0rq
title: Implement Pass 2 Repair + Confidence Warning
status: done
priority: medium
labels:
  - from-spec-v2
  - pipeline
createdAt: '2026-03-04T22:46:25.363Z'
updatedAt: '2026-03-05T02:22:34.264Z'
timeSpent: 723
assignee: '@me'
spec: specs/ai-pipeline-redesign
fulfills:
  - AC-14
order: 8
---
# Implement Pass 2 Repair + Confidence Warning

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wire Pass 2 adaptive repair: code validation flags issues → `buildRepairPrompt()` → internal AI → re-validate → better/worse decision. Implement FR-13 confidence comparison warning (>25pt gap between AI and code → teacher warning). Depends on @task-9vafnp (code validator), @task-0yg6fx (retry manager), @task-wei3uc (prompt builder).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Code validation issues trigger buildRepairPrompt()
- [x] #2 AI response parsed by parseAIRepairResponse()
- [x] #3 Re-validation runs on fixed text
- [x] #4 Better/worse comparison: keep better, escalate if worse
- [x] #5 Retry follows model/temp progression from retry manager
- [x] #6 Confidence comparison: >25pt gap → teacher warning displayed
- [x] #7 RepairAuditEntry logged for each AI call
- [x] #8 Order: 4 (depends on T3 9vafnp + T4 0yg6fx + T5 wei3uc)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### New file
`src/services/test-creation/thcs-pass2-repair.ts`

### Architecture
An orchestrator that connects the three upstream modules to implement the adaptive repair loop. This is NOT a large module — it's ~80 lines of glue code.

### Flow
```
ValidationReport (from code validator)
  → filter to repairable issues (exclude unsupported types — those go to Compromise)
  → if 0 repair issues → skip Pass 2
  → buildRepairPrompt(issues, originalInput, processedText)
  → call AI via retry manager (REPAIR_CHAIN)
  → parseAIRepairResponse(rawResponse)
  → re-validate fixed text
  → compare: fewer issues = better
  → if better: use as new base, continue chain
  → if worse/same: keep previous, escalate
  → log RepairAuditEntry per AI call
  → check confidence disagreement (FR-13)
  → return Pass2Result
```

### Interfaces

```typescript
interface Pass2Result {
  repairedText: string;            // best text after repair attempts
  wasRepaired: boolean;            // true if any successful repair happened
  finalReport: ValidationReport;   // re-validated report on the repaired text
  auditLog: RepairAuditEntry[];    // one entry per AI call
  confidenceWarning: string | null; // FR-13: message if >25pt disagreement
  reasoningLog: ReasoningEntry[];  // aggregated from all repair attempts
}
```

### Core Function

```typescript
async function executePass2Repair(
  validationReport: ValidationReport,
  aiConfidence: number,          // from Pass 1
  retrySession: RetrySession,    // shared session (circuit breaker)
  callAI: (step: RetryStep) => Promise<AICallResult | null>,
): Promise<Pass2Result>
```

#### Logic:
1. **Filter repairable issues**: `report.issues.filter(i => !isUnsupportedTypeIssue(i))`
   - If 0 repair issues → return early with `wasRepaired: false`

2. **Build repair prompt**: `buildRepairPrompt(repairIssues, report.originalInput, report.processedText)`
   - Also computes `fragmentHash` via `computeFragmentHash()`

3. **Execute retry chain**: `executeRetryChain(session, REPAIR_CHAIN, callRepair, compareRepair)`
   - `callRepair(step)`:
     a. Call AI with step's provider/model/temperature + the repair prompt
     b. Parse response: `parseAIRepairResponse(rawResponse)`
     c. Re-validate: `validateRestructuredText(fixedText, report.originalInput, aiConfidence)`
     d. Return `{ result: { fixedText, validationReport, reasoningLog }, issueCount: newReport.issues.length }`
   - `compareRepair(prev, curr)`:
     a. Compare `prev.issueCount` vs `curr.issueCount`
     b. `fewer issues` → `better`, `more` → `worse`, `same` → `same`

4. **Log audit entries**: For each AI call in the chain, create `RepairAuditEntry` via `createAuditEntry()`

5. **Confidence comparison (FR-13)**:
   - Compare `aiConfidence` (Pass 1 self-report) vs `finalReport.formatConfidence` (code validator)
   - If `|aiConfidence - formatConfidence| > 25` → set `confidenceWarning` to human-readable message

6. **Return `Pass2Result`** with the best text and aggregated diagnostics

### Key Design Decisions

1. **Pass 2 only handles REPAIRS** — unsupported types route to Compromise (separate task `78pz92`). The filtering happens at step 1.

2. **Re-validation after each attempt** — the `callRepair` callback re-runs the full validator on the fixed text. This is cheap (deterministic regex, <50ms) and gives accurate issue counts for comparison.

3. **Shared `RetrySession`** — Pass 2 shares the same session as the rest of the pipeline. If Pass 1 used 1 call, Pass 2 has 4 remaining toward the circuit breaker.

4. **`callAI` callback** — Pass 2 doesn't initialize SDKs or manage API keys. The integration task (T11) provides a callback that handles provider routing.

5. **Aggregated reasoning log** — Each retry produces a `ReasoningEntry[]`. Pass 2 concatenates them all for the review panel.

### FR-13 Confidence Warning Implementation

```typescript
function checkConfidenceDisagreement(
  aiConfidence: number,
  codeConfidence: number
): string | null {
  const gap = Math.abs(aiConfidence - codeConfidence);
  if (gap > 25) {
    if (aiConfidence > codeConfidence) {
      return `AI reports ${aiConfidence}% confidence but code validation found ${codeConfidence}% — AI may be overconfident. Review flagged issues.`;
    } else {
      return `AI reports ${aiConfidence}% confidence but code validation found ${codeConfidence}% — the text may be better than AI suggests.`;
    }
  }
  return null;
}
```

### Files changed
- `src/services/test-creation/thcs-pass2-repair.ts` (NEW — ~80 lines)

### Dependencies (all planned upstream)
- `thcs-text-validator.ts` (task `9vafnp`) → `validateRestructuredText`, `ValidationReport`
- `thcs-prompt-builder.ts` (task `wei3uc`) → `buildRepairPrompt`, `parseAIRepairResponse`, `computeFragmentHash`, `createAuditEntry`
- `thcs-retry-manager.ts` (task `0yg6fx`) → `executeRetryChain`, `REPAIR_CHAIN`, `RetrySession`

### Consumed by
- Task `8085zl` (Integration) → calls `executePass2Repair()` when `50 ≤ formatConfidence < 80`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Notes
- Created `thcs-pass2-repair.ts` (~150 lines)
- Glue module connecting 3 upstream modules:
  - thcs-text-validator → ValidationReport, re-validation
  - thcs-prompt-builder → buildRepairPrompt, parseAIRepairResponse, audit entries
  - thcs-retry-manager → executeRetryChain, REPAIR_CHAIN, shared session
- Key function: executePass2Repair() — async orchestrator
- FR-13 confidence disagreement: checkConfidenceDisagreement() warns on >25pt gap
- callAI callback pattern: integration task provides the actual AI call
- 12 unit tests passing
<!-- SECTION:NOTES:END -->

