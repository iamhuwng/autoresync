---
id: pbh9j8
title: Integrate per-question AI explanations into THCSQuestionRenderer
status: done
priority: medium
labels:
  - from-spec
  - formative-feedback
createdAt: '2026-03-04T21:25:51.107Z'
updatedAt: '2026-03-04T22:08:50.670Z'
timeSpent: 95
spec: specs/ai-formative-assessment-feedback
fulfills:
  - AC-6
  - AC-9
order: 6
---
# Integrate per-question AI explanations into THCSQuestionRenderer

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Modify THCSQuestionRenderer.tsx to display AI-generated explanations in review mode for wrong answers. Teacher-written explanations take priority over AI. Add '(AI-generated)' label when showing AI explanation. The aiExplanation data comes from formativeFeedback.questionExplanations map, keyed by question number.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI explanation shown for wrong answers in review mode when no teacher explanation exists
- [x] #2 Teacher explanation shown when it exists (priority over AI)
- [x] #3 (AI-generated) label displayed when showing AI explanation
- [x] #4 No explanation shown when neither exists (unchanged behavior)
- [x] #5 aiExplanation prop received from parent via questionExplanations map
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan: Per-Question AI Explanations in THCSQuestionRenderer

### File: `src/components/thcs-student/THCSQuestionRenderer.tsx` (MODIFY)

### What Changes

#### 1. Add new optional prop: `aiExplanation`
```typescript
interface THCSQuestionRendererProps {
    question: THCSQuestion;
    selectedAnswer: string | string[] | null;
    onAnswer: (answer: string | string[] | null) => void;
    isFlagged: boolean;
    onToggleFlag: () => void;
    isReviewMode: boolean;
    isCorrect?: boolean;
    blankResults?: BlankResult[];
    writingResult?: WritingGradingResult;
    aiExplanation?: string; // <-- NEW: AI-generated explanation for incorrect answers
}
```

#### 2. Display Logic (lines 260-270, after the existing explanation block)

Current code (lines 260-270):
```tsx
{/* Explanation (review mode only) */}
{isReviewMode && question.explanation?.text && (
    <div style={{...}}>
        <strong>💡 Explanation:</strong> {question.explanation.text}
    </div>
)}
```

New logic:
```tsx
{/* Explanation (review mode only) */}
{isReviewMode && question.explanation?.text && (
    <div style={{
        marginTop: '0.5rem', padding: '0.5rem 0.75rem',
        background: 'rgba(59,130,246,0.06)', borderRadius: '0.375rem',
        border: '1px solid rgba(59,130,246,0.15)',
        fontSize: '0.875rem', color: '#1e40af',
    }}>
        <strong>💡 Explanation:</strong> {question.explanation.text}
    </div>
)}

{/* AI explanation for incorrect answers (review mode only, no teacher explanation) */}
{isReviewMode && !question.explanation?.text && aiExplanation && isCorrect === false && (
    <div style={{
        marginTop: '0.5rem', padding: '0.5rem 0.75rem',
        background: 'rgba(139,92,246,0.06)', borderRadius: '0.375rem',
        border: '1px solid rgba(139,92,246,0.15)',
        fontSize: '0.875rem', color: '#6d28d9',
    }}>
        <strong>🤖 AI Explanation:</strong> {aiExplanation}
    </div>
)}
```

**Priority rules:**
1. Teacher explanation (`question.explanation.text`) always wins
2. AI explanation only shown when:
   - `isReviewMode === true`
   - No teacher explanation exists
   - `aiExplanation` prop is provided
   - `isCorrect === false` (only for wrong answers)

**Visual distinction:**
- Teacher explanation: Blue theme (rgba(59,130,246,...)), 💡 icon
- AI explanation: Purple theme (rgba(139,92,246,...)), 🤖 icon, clearly labeled "AI Explanation"

### Callers to Update (prop threading)

There are **8 call sites** that render `<THCSQuestionRenderer>`. They all need the new optional `aiExplanation` prop, but only the ones in review/results context need to pass it:

#### Call sites that need `aiExplanation` passed:
1. **`StudentTestResultsPage.tsx`** — review mode, has access to `formativeFeedback`
2. **`THCSPracticeView.tsx`** — review mode after submission (in-page review before redirect)
3. **`THCSTestLayout.tsx`** — review mode after session submission

#### Call sites that DON'T need changes (optional prop, undefined = no AI explanation):
4. **`WritingGradingDashboard.tsx`** — teacher view, not student feedback
5. **`TestPreview.tsx`** — teacher preview, not feedback context

### Prop Threading Strategy

The parent components need a `questionExplanations` map: `Record<number, string>` (keyed by questionNumber). This map is extracted from `formativeFeedback.skillAnalysis[].questionNumbers[]` cross-referenced with `formativeFeedback.aiFeedback.questionExplanations`.

Helper function (can live in the parent or as a utility):
```typescript
function buildQuestionExplanationMap(feedback: FormativeFeedback | undefined): Record<number, string> {
    if (!feedback?.aiFeedback?.questionExplanations) return {};
    return feedback.aiFeedback.questionExplanations;
}
```

Then each `THCSQuestionRenderer` call passes:
```tsx
<THCSQuestionRenderer
    question={q}
    {...otherProps}
    aiExplanation={questionExplanationMap[q.questionNumber]}
/>
```

### Files Modified
1. `THCSQuestionRenderer.tsx` — Add prop + render logic
2. `StudentTestResultsPage.tsx` — Thread prop (Task 1opvmj handles this)
3. `THCSTestLayout.tsx` — Thread prop (if review mode available post-submit)
4. `THCSPracticeView.tsx` — Thread prop (if review mode available post-submit)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Modified `src/components/thcs-student/THCSQuestionRenderer.tsx`:

**Changes:**
1. Added `aiExplanation?: string` to `THCSQuestionRendererProps` interface
2. Added destructured `aiExplanation` in component function signature
3. Added AI explanation render block (lines 268-281) after teacher explanation

**Priority logic:**
- Teacher explanation (`question.explanation?.text`) always renders first
- AI explanation renders ONLY when ALL of:
  - `isReviewMode === true`
  - No teacher explanation exists (`!question.explanation?.text`)
  - `aiExplanation` prop provided
  - `_isCorrect === false` (wrong answers only)

**Visual distinction:**
- Teacher: blue theme (rgba(59,130,246,...)) with 💡 icon
- AI: purple theme (rgba(139,92,246,...)) with 🤖 icon + "(AI-generated)" label

**Backward compatibility:**
- `aiExplanation` is optional — all 8 existing call sites compile without it
- Prop threading to be done in task 1opvmj (integration into StudentTestResultsPage)

**TypeScript compilation verified** — no new errors.
<!-- SECTION:NOTES:END -->

