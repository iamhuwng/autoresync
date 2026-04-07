---
id: jc9j30
title: Canonicalize IELTS writing correction/comment foundation
status: done
priority: high
labels:
  - ielts-writing
  - grading
  - annotations
createdAt: '2026-04-06T09:48:53.249Z'
updatedAt: '2026-04-06T10:06:17.497Z'
timeSpent: 1032
---
# Canonicalize IELTS writing correction/comment foundation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement first-class persisted corrections, shared annotation focus request contract, and compatibility adapters across grading and published result surfaces.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented canonical correction foundation for IELTS writing.

Changes:
- Added first-class persisted `corrections[]` to `WritingTaskMarkupState` and expanded `GradingCorrection` with `createdAt`/`updatedAt`.
- Added shared correction normalization/extraction utility at `src/utils/writingCorrections.ts`.
- `WritingGradingPage` now owns correction create/edit/delete as canonical task state, while `EssayEditor` only projects marks and backfills legacy markup when canonical corrections are absent.
- `writingSubmissionService` now normalizes draft/published task markup on load/save/publish and projects canonical corrections into compatibility annotations during publish.
- `writingResultSurface` now prefers canonical corrections and only falls back to markup extraction when canonical corrections are absent.
- Added regression coverage in `WritingGradingPage.test.tsx`, `writingSubmissionService.test.ts`, and `writingResultSurface.test.ts`.

Verification:
- `cmd /c npx vitest run src/pages/WritingGradingPage.test.tsx --reporter=basic`
- `cmd /c npx vitest run src/services/writingSubmissionService.test.ts --reporter=basic`
- `cmd /c npx vitest run src/components/writing-results/writingResultSurface.test.ts --reporter=basic`
- `cmd /c npx vitest run src/components/writing-grading/EssayEditor.test.tsx src/components/writing-grading/CommentSidebar.test.tsx src/components/writing-results/PublishedFeedbackPanel.test.tsx src/components/writing-results/WritingStudentResultSurface.test.tsx src/components/writing-results/WritingTeacherResultSurface.test.tsx --reporter=basic`
- `cmd /c npm run check:utf8 -- src/types/ielts-writing.types.ts src/utils/writingCorrections.ts src/pages/WritingGradingPage.tsx src/pages/WritingGradingPage.test.tsx src/services/writingSubmissionService.ts src/services/writingSubmissionService.test.ts src/components/writing-results/writingResultSurface.ts src/components/writing-results/writingResultSurface.test.ts`
- `cmd /c npm run build`

Known residual gap:
- Root architecture docs and Knowns docs were not updated in this pass; implementation focused on foundation code and tests only.
<!-- SECTION:NOTES:END -->

