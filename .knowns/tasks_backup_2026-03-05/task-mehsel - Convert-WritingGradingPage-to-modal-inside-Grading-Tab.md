---
id: mehsel
title: Convert WritingGradingPage to modal inside Grading Tab
status: done
priority: high
labels:
  - ui
  - refactor
  - writing-grading
createdAt: '2026-02-28T20:37:46.238Z'
updatedAt: '2026-03-01T04:59:00.785Z'
timeSpent: 1322
assignee: '@me'
---
# Convert WritingGradingPage to modal inside Grading Tab

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Instead of navigating to a separate WritingGradingPage (/teacher/grading/writing/:submissionId), convert the grading editor into a modal that opens inside the Grading Tab (TeacherGradingPage). The modal should follow the same design language as the IELTS Writing TestCreationModal (glassmorphism, lavender accents, fixed header/footer, scrollable body).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 WritingGradingModal component created with same logic as WritingGradingPage
- [x] #2 Modal uses TestCreationModal glassmorphism design (gradient bg, lavender borders, blur backdrop, rounded corners)
- [x] #3 Clicking Grade button in Writing tab opens modal instead of navigating to new page
- [x] #4 Side-by-side grading layout (essay left, scoring right) works inside modal
- [x] #5 Save Draft and Submit Grading work correctly from modal
- [x] #6 Modal closes and refreshes submission list after successful grading
- [x] #7 beforeunload warning still works for unsaved changes
- [x] #8 Auto-save still works within modal context
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### Step 1: Create WritingGradingModal component
- New file: `src/components/writing-grading/WritingGradingModal.tsx`
- Extract the core logic from `WritingGradingPage.tsx` into a modal component
- Props: `{ opened: boolean; submissionId: string | null; onClose: () => void }`
- Uses the same child components: AnnotatedEssayRenderer, AnnotationToolbar, CriteriaScoringPanel, FeedbackPanel, VoidTaskButton, GradingAuditTrail, CategoryManager
- Keep the side-by-side layout (left: essay, right: scoring) inside the modal body

### Step 2: Style the modal to match TestCreationModal design
- Copy the glassmorphism modal shell from TestCreationModal:
  - `background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,243,255,0.98) 100%)`
  - `backdropFilter: blur(20px)`, lavender border `rgba(139,92,246,0.2)`
  - `boxShadow: 0 25px 50px -12px rgba(139,92,246,0.25)`, `borderRadius: 1.25rem`
  - Fixed header with student name + actions, scrollable body, fixed footer with overall band + submit
- Use `Modal` from Mantine with custom `styles` prop (same pattern as TestCreationModal)
- Modal size: `xl` or `95vw` to accommodate the side-by-side layout

### Step 3: Update TeacherGradingPage to use the modal
- Add state: `gradingSubmissionId: string | null` (controls which submission modal is open for)
- Replace `navigate(/teacher/grading/writing/${sub.id})` calls with `setGradingSubmissionId(sub.id)`
- Render `<WritingGradingModal opened={!!gradingSubmissionId} submissionId={gradingSubmissionId} onClose={() => setGradingSubmissionId(null)} />`
- On successful grading submission, close modal + refresh the writing submissions list

### Step 4: Update other callers that navigate to WritingGradingPage
- `WritingTestResultsSection.tsx` line 266: change navigate to either open modal or keep as-is (depending on context — only the grading tab should use modal)
- `WritingResultDetailModal.tsx` line 38: this is student-facing, may still need the page route as fallback
- For non-grading-tab callers, keep the route working as a fallback (don't remove the page/route yet)

### Step 5: Update WebMCP tools registration
- Update `writing-test.tools.ts` to reflect the new modal-based grading flow
- Active routes should reference the grading tab route instead of the detail route

### Step 6: CSS cleanup
- Create `WritingGradingModal.css` with adapted styles from `WritingGradingPage.css`
- Ensure the side-by-side layout works within the modal's constrained viewport
- Keep `WritingGradingPage.css` for fallback page (deprecation path)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Complete

### Files Created:
- `src/components/writing-grading/WritingGradingModal.tsx` — New modal component using createPortal (NO Mantine). Extracts all grading logic from WritingGradingPage. Uses glassmorphism design matching TestCreationModal.
- `src/components/writing-grading/WritingGradingModal.css` — CSS with glassmorphism styling (lavender accents, blur backdrop, gradient header, rounded corners).

### Files Modified:
- `src/pages/TeacherGradingPage.tsx` — Added `gradingSubmissionId` state. Replaced `navigate()` calls with `setGradingSubmissionId()`. Renders `WritingGradingModal` with `onGradingComplete={fetchWritingSubmissions}`.
- `src/webmcp/tools/writing-test.tools.ts` — Updated 4 WebMCP tools to work with modal (`.wgm-*` selectors, `/teacher/grading` route).
- `src/components/writing-results/WritingResultDetailModal.tsx` — Updated Edit Grades navigation to `/teacher/grading`.
- `src/components/writing-results/WritingTestResultsSection.tsx` — Updated Grade button navigation to `/teacher/grading`.
- `src/pages/WritingGradingQueuePage.tsx` — Updated navigation to `/teacher/grading`.

### Key Design Decisions:
- Used `createPortal` to document.body (no Mantine Modal) per No-Mantine rule
- Kept `WritingGradingPage.tsx` and its route as fallback (still registered in App.jsx)
- Modal resets all state on close for clean re-entry
- Escape key handled with unsaved changes check
- Auto-save 30s timer uses the same hot-value ref pattern

WebMCP removed from project - Step 5 (WebMCP tools update) no longer applicable
<!-- SECTION:NOTES:END -->

