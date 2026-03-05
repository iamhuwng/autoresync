---
id: 23fbgf
title: Implement deterministic feedback analysis
status: done
priority: high
labels:
  - from-spec
  - formative-feedback
createdAt: '2026-03-04T21:24:56.105Z'
updatedAt: '2026-03-04T22:25:53.532Z'
timeSpent: 162
spec: specs/ai-formative-assessment-feedback
fulfills:
  - AC-1
  - AC-2
order: 2
---
# Implement deterministic feedback analysis

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create `formativeFeedback.service.ts` with deterministic bucketing logic: read intentBreakdown from grading result, sort by performance ratio, bucket into strengths (≥80%) / revision (50-79%) / critical (<50%), attach question numbers per bucket, generate template-based fallback text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 analyzeFeedback() correctly buckets intents by percentage thresholds (≥80% strengths, 50-79% revision, <50% critical)
- [x] #2 Question numbers attached to each SkillAnalysis entry (both all and wrong-only)
- [x] #3 INTENT_SKILL_MAP used for human-friendly names in each bucket entry
- [x] #4 Template text generated for deterministic fallback (deterministicFeedback field)
- [x] #5 Handles empty/null intentBreakdown gracefully
- [x] #6 Perfect score (100%) produces only strengths, no revision/critical sections
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan: Deterministic Feedback Analysis

### File: `src/services/formativeFeedback.service.ts` (NEW)

**Step 1: Create the service file with core function**

```typescript
import type { THCSGradingResult, SectionResult, THCSSection, FormativeFeedback, SkillAnalysis } from '../types/thcs-test.types';
import { INTENT_SKILL_MAP } from '../types/thcs-test.types';
```

**Step 2: Implement `buildDeterministicAnalysis()`**
Inputs: `gradingResult: THCSGradingResult`, `sections: THCSSection[]`
Logic:
1. Call `mergeIntentBreakdowns(gradingResult.sectionResults)` to get aggregated intent map
2. For each intent in merged breakdown:
   a. Calculate `percentage = (correct / total) * 100`
   b. Look up human name via `INTENT_SKILL_MAP[intent]`
   c. Scan `gradingResult.questionResults` to find question numbers matching this intent (by cross-referencing with section questions)
   d. Build `SkillAnalysis` entry with questionNumbers and wrongQuestionNumbers
3. Sort all entries by percentage descending
4. Bucket: ≥80% → strengths, 50-79% → revision, <50% → critical
5. Return `{ strengths, revision, critical }`

**Step 3: Implement question number extraction**
Helper: `getQuestionNumbersByIntent(sections, intent)`
- Iterate all sections → all questions
- For each question where `question.type === intent` OR `question.intent === intent`
- Return { all: number[], wrong: number[] } (wrong = not in gradingResult.questionResults as correct)

**Step 4: Implement `buildDeterministicText()`**
Generates the fallback text from the analysis buckets:
```
"You achieved X/Y correct answers (Z/10).
Strengths: [skillName] (Q1, Q2) — X/Y correct. ...
Needs revision: ...
Critical gaps: ..."
```
Handle edge cases:
- Perfect score → only strengths text, no revision/critical
- Empty intentBreakdown → return generic text
- 0% on all → only critical text

**Step 5: Implement main `generateDeterministicFeedback()` function**
Combines Steps 2-4:
```typescript
export function generateDeterministicFeedback(
    gradingResult: THCSGradingResult,
    sections: THCSSection[],
): FormativeFeedback { ... }
```
Returns complete FormativeFeedback with analysis populated, questionTopics/aiFeedback undefined, deterministicFeedback text populated, metadata fields set.

### Edge Cases to Handle
- `intentBreakdown` is empty/null → return empty buckets + generic text
- All questions correct (100%) → strengths only
- All questions wrong (0%) → critical only  
- Single question type test → single entry in one bucket
- Section has no intent (Phase 2 question with no MCQ intent) → use `question.type` as fallback
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created `src/services/formativeFeedback.service.ts` with complete deterministic analysis engine:

**Functions implemented:**
- `mergeIntentBreakdowns()` — aggregates intent data across all sections
- `getQuestionNumbersByIntent()` — extracts question numbers per intent with wrong tracking
- `buildSkillAnalysisList()` — builds SkillAnalysis entries with INTENT_SKILL_MAP names
- `bucketByPerformance()` — buckets into strengths (≥80%), revision (50-79%), critical (<50%)
- `buildDeterministicText()` — generates human-readable fallback text
- `generateDeterministicFeedback()` — public API for deterministic-only feedback
- `generateFormativeFeedback()` — async wrapper that saves to RTDB (AI enrichment placeholder for task 2gv1pn)

**Edge cases handled:**
- Empty/null sectionResults → generic text
- Empty intentBreakdown → empty buckets
- Perfect score → only strengths entries
- Missing question results → treated as wrong
- Unknown intents → fallback to intent string as name

**TypeScript compilation verified** — no new errors introduced.

📚 Extracted to @doc/patterns/pattern-deterministic-first-ai-enhancement
<!-- SECTION:NOTES:END -->

