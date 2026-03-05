---
id: cybx0j
title: Define FormativeFeedback types & INTENT_SKILL_MAP
status: done
priority: high
labels:
  - from-spec
  - formative-feedback
createdAt: '2026-03-04T21:24:43.716Z'
updatedAt: '2026-03-04T22:28:15.357Z'
timeSpent: 259
spec: specs/ai-formative-assessment-feedback
fulfills:
  - AC-10
order: 1
---
# Define FormativeFeedback types & INTENT_SKILL_MAP

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the `FormativeFeedback` and `SkillAnalysis` TypeScript interfaces. Add the optional `formativeFeedback` property to the test result record type. Define the `INTENT_SKILL_MAP` constant mapping all 20 question intents to human-friendly names.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 FormativeFeedback interface defined with all fields (analysis, questionTopics, questionExplanations, aiFeedback, deterministicFeedback, metadata)
- [x] #2 SkillAnalysis interface defined with intent, skillName, correct, total, percentage, questionNumbers, wrongQuestionNumbers
- [x] #3 INTENT_SKILL_MAP constant maps all 20 question intents to { name, category }
- [x] #4 Test result type extended with optional formativeFeedback property
- [x] #5 No breaking changes to existing result types
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan: Define FormativeFeedback Types & INTENT_SKILL_MAP

### File: `src/types/thcs-test.types.ts`

**Step 1: Add FormativeFeedback interface** (after QuestionResult, ~line 330)
```typescript
export interface FormativeFeedback {
    analysis: {
        strengths: SkillAnalysis[];
        revision: SkillAnalysis[];
        critical: SkillAnalysis[];
    };
    questionTopics?: Record<string, { topic: string; category: string }>;
    questionExplanations?: Record<string, string>;
    aiFeedback?: {
        summary: string;
        strengths: string;
        revision: string;
        critical: string;
    };
    aiModel?: string;
    deterministicFeedback: string;
    generatedAt: number;
    totalCorrect: number;
    totalQuestions: number;
    scaledScore: number;
}

export interface SkillAnalysis {
    intent: THCSQuestionType;
    skillName: string;
    correct: number;
    total: number;
    percentage: number;
    questionNumbers: number[];
    wrongQuestionNumbers: number[];
}
```

**Step 2: Add INTENT_SKILL_MAP constant** (after ALL_INSTRUCTION_TEMPLATES, ~line 372)
```typescript
export const INTENT_SKILL_MAP: Record<string, { name: string; category: string }> = {
    'pronunciation': { name: 'Pronunciation', category: 'Phonetics' },
    'word-stress': { name: 'Word Stress', category: 'Phonetics' },
    // ... all 20 intents from the spec
};
```

### File: `src/types/results.types.ts`

**Step 3: Add optional formativeFeedback to EnhancedTestResultRecord** (~line 97)
```typescript
import type { FormativeFeedback } from './thcs-test.types';
// Add after markingStatus field:
formativeFeedback?: FormativeFeedback;
```

### Verification
- Check that no existing code breaks by running `npm run dev`
- Confirm FormativeFeedback import is accessible from services/
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented all 5 ACs:
1. FormativeFeedback interface defined in thcs-test.types.ts (lines 416-451) with analysis, questionTopics, questionExplanations, aiFeedback, aiModel, deterministicFeedback, generatedAt, totalCorrect, totalQuestions, scaledScore
2. SkillAnalysis interface defined in thcs-test.types.ts (lines 457-475) with all required fields
3. INTENT_SKILL_MAP constant defined with all 20 intents mapped to { name, category } (lines 481-502)
4. EnhancedTestResultRecord extended with optional formativeFeedback (results.types.ts line 96) and TestResultRecord extended (testResults.service.ts line 130)
5. No breaking changes — all additions are optional fields and new exports, verified via tsc --noEmit (only pre-existing errors in unrelated files)

📚 Extracted to @doc/reference/thcs-english-topic-taxonomy
📚 Extracted to @doc/patterns/pattern-rule-vs-ai-decision-boundary
<!-- SECTION:NOTES:END -->

