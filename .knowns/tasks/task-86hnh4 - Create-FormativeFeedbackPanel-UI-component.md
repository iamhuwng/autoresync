---
id: 86hnh4
title: Create FormativeFeedbackPanel UI component
status: done
priority: medium
labels:
  - from-spec
  - formative-feedback
createdAt: '2026-03-04T21:25:35.018Z'
updatedAt: '2026-03-04T22:25:54.602Z'
timeSpent: 168
spec: specs/ai-formative-assessment-feedback
fulfills:
  - AC-8
  - AC-10
order: 5
---
# Create FormativeFeedbackPanel UI component

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build FormativeFeedbackPanel.tsx that displays the overall narrative feedback with three sections (strengths/revision/critical) using icons and color coding. Shows deterministic fallback while AI feedback loads, then upgrades to AI version. Panel placed below score, above question pills grid.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Panel displays summary line (You achieved X/Y correct answers, Z/10)
- [x] #2 Strengths section shown with ✅ icon and green accent
- [x] #3 Revision section shown with ⚠️ icon and amber accent
- [x] #4 Critical section shown with 🔴 icon and red accent
- [x] #5 Question numbers referenced in parentheses in AI feedback text
- [x] #6 Graceful display when only deterministic feedback available (no AI)
- [x] #7 No panel shown when formativeFeedback is null/undefined (backward compat)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan: Create FormativeFeedbackPanel UI Component

### File: `src/components/thcs-student/FormativeFeedbackPanel.tsx` (NEW)

### Props Interface
```typescript
interface FormativeFeedbackPanelProps {
    feedback: FormativeFeedback;
}
```

### Design Decisions
- **Match existing design language**: Use inline styles (same as THCSTestLayout, StudentTestResultsPage)
- **Use the project's glassmorphism Card component**: `import { Card, CardBody } from '../modern';`
- **Color palette**: Match existing `QUESTION_NAV_COLORS` and the student view purple theme
- **NO Mantine** for this component (per Rule #15) — only Card from `../modern`

### Component Structure

```
┌─────────────────────────────────────────────┐
│ 📊 Performance Analysis                     │
│                                             │
│ "You achieved X/Y correct answers (Z/10)"   │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ ✅ Strengths                            │ │
│ │ • Vocabulary (Q1, Q2) — 5/5 correct    │ │
│ │ • Reading Comprehension (Q8, Q9, Q10)  │ │
│ │                                        │ │
│ │ AI: "Your vocabulary range is..."      │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ ⚠️ Needs Revision                       │ │
│ │ • Grammar (Q3, Q4, Q5) — 2/4 correct  │ │
│ │                                        │ │
│ │ AI: "Focus on present perfect vs..."   │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ 🔴 Critical Gaps                        │ │
│ │ • Pronunciation (Q6, Q7) — 0/3 correct│ │
│ │                                        │ │
│ │ AI: "You need to urgently review..."   │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Step 1: Summary Line
```typescript
<div style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', marginBottom: '1rem' }}>
    You achieved {feedback.totalCorrect}/{feedback.totalQuestions} correct answers ({feedback.scaledScore.toFixed(1)}/10)
</div>
```

### Step 2: Three Section Panels (Strengths, Revision, Critical)

Each section rendered by a helper function:
```typescript
function renderSection(
    title: string,
    icon: string,
    skills: SkillAnalysis[],
    aiText: string | undefined,
    accentColor: string,
    bgColor: string,
)
```

Color mapping:
| Section | Icon | Accent | Background |
|---------|------|--------|------------|
| Strengths | ✅ | #10b981 (green) | rgba(16,185,129,0.06) |
| Revision | ⚠️ | #f59e0b (amber) | rgba(245,158,11,0.06) |
| Critical | 🔴 | #ef4444 (red) | rgba(239,68,68,0.06) |

Each section:
1. Header line: `{icon} {title}` with color accent
2. Bullet list of `SkillAnalysis` entries:
   - `• {skillName} (Q{questionNumbers.join(', Q')}) — {correct}/{total} correct`
   - Wrong questions highlighted: `(wrong: Q{wrongQuestionNumbers.join(', Q')})`
3. AI narrative text (if available) in slightly different style — italicized, lighter color

### Step 3: AI vs Deterministic Display Logic
```typescript
// If AI feedback available, show rich narrative
if (feedback.aiFeedback) {
    // Render AI summary + per-section AI text
    // Show within each section panel
}

// If only deterministic, show plain bulleted analysis
// (same structure, just no AI narrative text beneath each section)
```

### Step 4: Backward Compatibility / Null Guard
The parent component handles the null check:
```typescript
// In parent:
{feedback && <FormativeFeedbackPanel feedback={feedback} />}
```
So the component itself can assume `feedback` is non-null.

### Step 5: Skeleton/Empty States
- Empty strengths → don't render strengths section at all
- Empty revision → don't render revision section
- Empty critical → don't render critical section
- All empty (shouldn't happen, but guard) → show only summary line

### Animations
- Use CSS `transition: all 0.3s ease` on section panels
- Subtle slide-in when AI feedback arrives (can be done with simple opacity transition if parent re-renders with AI data)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created `src/components/thcs-student/FormativeFeedbackPanel.tsx` (267 lines)

**Component structure:**
- `FormativeFeedbackPanel` — main component, takes `{ feedback: FormativeFeedback }`
- `TierSection` — renders one tier (strengths/revision/critical) with colored bg, skill bullets, and optional AI narrative
- `SkillBullet` — renders one skill entry with skill name, question numbers, score, and wrong question indicators

**Design compliance:**
- Follows student-view-design standard: flat white card, `#ffffff` bg, `1px solid #e5e7eb` border
- Uses standard color palette: `#059669` green / `#d97706` amber / `#dc2626` red
- No glassmorphism, no Mantine, no gradient backgrounds
- Pill-shaped badge for "AI-enhanced" indicator
- `border-radius: 16px` on outer card, `12px` on inner tier cards

**Features:**
- Summary line shows AI summary (when available) or deterministic \"You achieved X/Y\" text
- Each tier section has colored bg, header with icon + skill count badge, bullet list
- AI narrative rendered in italicized bordered box under each tier's bullet list
- Empty tiers hidden — only renders sections with skills
- Backward compatible: parent does null check before rendering

**TypeScript compilation verified** — no new errors.

📚 Extracted to @doc/patterns/pattern-deterministic-first-ai-enhancement
<!-- SECTION:NOTES:END -->

