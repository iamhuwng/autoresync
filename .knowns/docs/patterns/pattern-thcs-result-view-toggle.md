---
title: 'Pattern: THCS Result View Toggle'
createdAt: '2026-03-01T18:11:00.617Z'
updatedAt: '2026-03-05T08:31:19.855Z'
description: Reusable pattern for overview/detailed view toggle on THCS test results
tags:
  - pattern
  - ui
  - student
  - thcs
  - result-view
---
# Pattern: THCS Result View Toggle

> Reusable pattern for showing test results in two switchable views — Pills Overview and Detailed Card List.

## Problem

THCS test results contain 40+ questions of mixed types. Showing all in a single long list overwhelms students. Students need:
1. A quick "at a glance" view to see which questions were correct/incorrect
2. A detailed view for reviewing specific questions and feedback

## Solution

Implement a **view mode toggle** with two dedicated components:

### Component 1: QuestionPillsGrid (Overview)

A grid of colored pills — one per question:
- **Green** `#22c55e` — Correct
- **Red** `#ef4444` — Incorrect  
- **Amber** `#f59e0b` — Partial score or pending writing grade

Click a pill → inline expansion shows the question detail without page navigation.

### Component 2: QuestionDetailedList (Detailed)

Scrollable list of expandable cards. Each card shows:
- Question text + student answer + correct answer
- For writing: original sentence, teacher feedback, model answer, "Graded by {teacherName}"
- Score badge with color coding

### Toggle UX

A segmented control pill above the question grid (not full-width buttons):
```tsx
<div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
  <button
    onClick={() => setQuestionViewMode('overview')}
    style={{
      padding: '5px 12px',
      borderRadius: '6px',
      border: 'none',
      fontSize: '0.75rem',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      background: questionViewMode === 'overview' ? '#fff' : 'transparent',
      color: questionViewMode === 'overview' ? '#4f46e5' : '#6b7280',
      boxShadow: questionViewMode === 'overview' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
    }}
  >
    Tổng quan
  </button>
  <button
    onClick={() => setQuestionViewMode('detailed')}
    style={{
      padding: '5px 12px',
      borderRadius: '6px',
      border: 'none',
      fontSize: '0.75rem',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      background: questionViewMode === 'detailed' ? '#fff' : 'transparent',
      color: questionViewMode === 'detailed' ? '#4f46e5' : '#6b7280',
      boxShadow: questionViewMode === 'detailed' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
    }}
  >
    Chi tiết
  </button>
</div>
```

### Integration in ResultDetailModal

The toggle lives inside the `showDetailedFeedback` guard, in the "Chi tiết từng câu" section header:

```tsx
// State
const [questionViewMode, setQuestionViewMode] = useState<'overview' | 'detailed'>('overview');

// Rendering
{showDetailedFeedback && (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: 32, height: 32, borderRadius: '8px', background: '#7c3aed', color: 'white', ... }}>🔍</div>
        Chi tiết từng câu
      </div>
      {/* Toggle buttons (see above) */}
    </div>

    {questionViewMode === 'overview' && result.questionResults && (
      <QuestionPillsGrid
        questions={result.questionResults.map(qr => ({
          questionNumber: qr.questionNumber,
          questionType: qr.questionType || 'multiple-choice',
          isCorrect: qr.isCorrect,
          score: qr.score,
          maxScore: qr.maxScore,
          studentAnswer: qr.studentAnswer,
          correctAnswer: qr.correctAnswer,
          feedback: qr.feedback || '',
        } as QuestionResultItem))}
        formatAnswer={formatAnswer}
      />
    )}

    {questionViewMode === 'detailed' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {result.questionResults?.map((qr) => { /* ... existing inline cards */ })}
      </div>
    )}
  </div>
)}
```

### Data Mapping

`result.questionResults` items map directly to `QuestionResultItem` — same field names. The only transform needed is defaulting `questionType` if absent:
```typescript
questionType: qr.questionType || 'multiple-choice',
feedback: qr.feedback || '',
```

## Key Files

| File | Purpose |
|------|---------|
| `src/components/results/QuestionPillsGrid.tsx` | Overview pills component (also exports `QuestionResultItem` type) |
| `src/components/results/QuestionDetailedList.tsx` | Detailed cards component (imports type from QuestionPillsGrid) |
| `src/components/results/ResultDetailModal.tsx` | Integration point — uses both components with state toggle |

## Design Standard

Follows Student View Design Standard:
- Flat background, no gradients/glass
- White surface cards with `1px solid #e5e7eb` border
- No Mantine — pure inline styles
- Inter font, segmented control pill, SVG chevrons

## Notes

- `overview` is the **default** mode — students see the pills grid first, not the full list
- `QuestionDetailedList.tsx` is imported from `QuestionPillsGrid` for the type — keep them co-located
- Both components are **fully built** but were historically not wired to `ResultDetailModal`. See @doc/patterns/pattern-feature-exists-but-never-invoked

## Source

Integrated March 2026 — `src/components/results/ResultDetailModal.tsx`
