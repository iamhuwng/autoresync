---
id: 1opvmj
title: Integrate FormativeFeedbackPanel into StudentTestResultsPage
status: done
priority: medium
labels:
  - from-spec
  - formative-feedback
createdAt: '2026-03-04T21:26:01.536Z'
updatedAt: '2026-03-04T22:11:26.959Z'
timeSpent: 126
spec: specs/ai-formative-assessment-feedback
fulfills:
  - AC-8
  - AC-9
  - AC-10
order: 7
---
# Integrate FormativeFeedbackPanel into StudentTestResultsPage

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add FormativeFeedbackPanel to StudentTestResultsPage.tsx between the score section and question pills grid. Load formativeFeedback from the result record. Pass questionExplanations to the question review section so THCSQuestionRenderer can display per-question AI explanations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 FormativeFeedbackPanel rendered below score, above pills grid
- [x] #2 formativeFeedback loaded from result data
- [x] #3 questionExplanations passed to THCSQuestionRenderer for each question
- [x] #4 Page renders normally when formativeFeedback is absent (old results)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan: Integrate FormativeFeedbackPanel into StudentTestResultsPage

### File: `src/pages/StudentTestResultsPage.tsx` (MODIFY)

### Context
This page renders test results from `permanentResultRecord` (type `TestResultRecord`). Once Task `cybx0j` is done, `TestResultRecord` will have an optional `formativeFeedback?: FormativeFeedback` field. This task plugs the `FormativeFeedbackPanel` (Task `86hnh4`) into the page.

### Step 1: Import the FormativeFeedbackPanel component
```typescript
// At top of file, after existing imports
import FormativeFeedbackPanel from '../components/thcs-student/FormativeFeedbackPanel';
import type { FormativeFeedback } from '../types/thcs-test.types';
```

### Step 2: Place the panel in the results view

**Location**: Between "Performance Feedback" card (line 584-600) and "Teacher Overall Feedback" card (line 602-623). This positions AI feedback after the generic percentage-based feedback but before teacher comments.

```tsx
{/* AI Formative Feedback (THCS tests only, async — may appear after page load) */}
{permanentResultRecord?.formativeFeedback && (
    <FormativeFeedbackPanel feedback={permanentResultRecord.formativeFeedback as FormativeFeedback} />
)}
```

**Why here?** 
- After the generic "Performance Feedback" → provides deeper analysis
- Before Teacher's Feedback → teacher feedback always takes visual priority (higher on page)
- Only renders when `formativeFeedback` exists → backward compatible with all existing results

### Step 3: Thread per-question AI explanations to question review

In the question-by-question review section (lines 639-793), extract the explanation map and pass it down:

```typescript
// Before the question map (around line 638)
const questionExplanationMap: Record<number, string> = (() => {
    const fb = permanentResultRecord?.formativeFeedback as FormativeFeedback | undefined;
    if (!fb?.aiFeedback?.questionExplanations) return {};
    return fb.aiFeedback.questionExplanations;
})();
```

Then inside the expanded question details (after Teacher Feedback, ~line 787), add:
```tsx
{/* AI Explanation for incorrect answers (only when no teacher feedback) */}
{(() => {
    const hasTeacherFeedback = permanentResultRecord?.questionResults?.find(
        q => q.questionNumber === result.questionNumber
    )?.teacherFeedback;
    const aiExplanation = questionExplanationMap[result.questionNumber];
    
    if (hasTeacherFeedback || !aiExplanation || result.isCorrect) return null;
    
    return (
        <div style={{
            marginTop: '1rem', padding: '0.5rem 0.75rem',
            background: 'rgba(139,92,246,0.06)', borderRadius: '0.375rem',
            border: '1px solid rgba(139,92,246,0.15)',
            fontSize: '0.875rem', color: '#6d28d9',
        }}>
            <strong>🤖 AI Explanation:</strong> {aiExplanation}
        </div>
    );
})()}
```

### Step 4: Handle async feedback arrival

Since feedback is generated asynchronously and saved to RTDB after the result, the first page load may not have it. Options:

**Option A (Simple — recommended for MVP):** User refreshes page to see feedback. The `loadResults` function already calls `getStudentSessionResult` which reads the full record. If feedback has been written by then, it shows up. No extra polling needed.

**Option B (Enhanced, future):** Add a `useEffect` with a one-time delayed re-fetch (e.g., 10 seconds after load) to check if feedback has arrived. This can be added later as an enhancement.

For this task, **Option A** is sufficient — the panel simply renders if data exists.

### Step 5: No THCS-only gate needed?

The `formativeFeedback` field only exists when the feedback service runs (only for THCS tests, per Task `ygx4vv`). So the `permanentResultRecord?.formativeFeedback` null check naturally gates it to THCS results only. No explicit `testType === 'THCS-THPT'` check required.

### Files Modified
1. `StudentTestResultsPage.tsx` — Import + render panel + question explanations

### Dependencies
- Task `cybx0j` — Defines `FormativeFeedback` type
- Task `86hnh4` — Creates `FormativeFeedbackPanel` component
- Task `ygx4vv` — Generates and saves the data
- Task `pbh9j8` — Per-question explanation in THCSQuestionRenderer (separate integration for THCSTestLayout/THCSPracticeView contexts; this task handles the StudentTestResultsPage context)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Modified `src/pages/StudentTestResultsPage.tsx`:

**Changes:**
1. **Imports** (line 37-38): Added `FormativeFeedbackPanel` component and `FormativeFeedback` type
2. **Panel integration** (line 601-607): Inserted `FormativeFeedbackPanel` between Performance Feedback card and Teacher Overall Feedback card
   - Wrapped in `permanentResultRecord?.formativeFeedback &&` null guard
   - Cast to `FormativeFeedback` type for prop safety
3. **Per-question AI explanation** (line 789-812): Added AI explanation block in expanded question details
   - Shows after teacher feedback IIFE
   - Priority: teacher feedback > AI explanation > nothing
   - Only for wrong answers (`!result.isCorrect`)
   - Reads from `formativeFeedback.questionExplanations[questionNumber]`
   - Purple theme with 🤖 icon and "(AI-generated)" label

**Backward compatibility:**
- `permanentResultRecord?.formativeFeedback` null check gates everything
- Old results without formativeFeedback field render exactly as before
- No explicit THCS gate needed — only THCS tests generate formativeFeedback

**Pre-existing TS error (NOT ours):**
- Line 908: `markingStatus` type mismatch — pre-existing, unrelated to our changes

**TypeScript compilation verified** — no new errors introduced.
<!-- SECTION:NOTES:END -->

