# Academic Record Progressive Feedback Implementation

## Objective
Implement the approved Academic Record changes with implementation-first workflow.

## Scope
- Reset Records page when clicking `Records` again from the sidebar
- Simplify Academic Record middle column
- Remove Badges module from Academic Record page flow
- Make `THCS/THPT` the default main view
- Add Progressive Feedback summary block
- Implement stored Progressive Feedback generation and refresh flow

## Implementation Log

### Step 1 — Navigation reset
- Updated `src/components/layout/StudentSidebar.tsx`
- `Records` now re-navigates with `resetRecordsView: true` when already active
- Academic Record page listens for that state and returns to the default main view

### Step 2 — Academic Record page simplification
- Updated `src/pages/AcademicRecordPage.tsx`
- Removed the extra subtitle under `Academic Record`
- Removed `X results found`
- Removed the center-page Badges flow
- Set `THCS/THPT` as the default main view
- Added compact stat cards for total tests, average score, and best score

### Step 3 — Progressive Feedback data contract
- Updated `src/types/academicRecord.types.ts`
- Added:
  - `ProgressiveFeedbackSnapshot`
  - `ProgressiveFeedbackNarrative`
  - `ProgressiveFeedbackRecord`
- Extended `AcademicSummary` with optional `progressiveFeedback`

### Step 4 — Progressive Feedback service
- Added `src/services/progressiveFeedback.service.ts`
- Stores data under `academic_records/{studentId}/progressiveFeedback`
- Uses latest 25 results
- Computes a 5-day window summary
- Supports:
  - automatic refresh cadence every 5 days
  - manual refresh cooldown of 24 hours
- Includes deterministic narrative fallback
- Attempts AI narrative enhancement with Gemini key rotation pattern
- Wrapped write flow with `withRestoreGuard()`

### Step 5 — Progressive Feedback UI wiring
- Updated `src/pages/AcademicRecordPage.tsx`
- Loads stored progressive feedback on page load
- Auto-refreshes when due
- Supports manual refresh button
- Shows generated timestamp and whether AI or deterministic fallback was used

### Step 6 — Progressive Feedback presentation refinement
- Updated `src/services/progressiveFeedback.service.ts`
- Reworked deterministic feedback into a coaching-style voice instead of report-style phrasing
- Tightened the Gemini prompt so generated text focuses on patterns, repeated mistakes, and next learning actions
- Updated `src/pages/AcademicRecordPage.tsx` to:
  - show only `Generated ...` in the footer
  - remove the extra `5-day AI summary` meta line
  - render the feedback as flowing guidance instead of labeled report bullets

### Step 7 — Header/filter and sidebar module navigation
- Updated `src/pages/AcademicRecordPage.tsx`
- Moved the date filter into the top-right of the header row, aligned with `Academic Record`

### Step 8 — Right-column module layout and fixed THCS middle view
- Updated `src/pages/AcademicRecordPage.tsx`
- Kept `THCS/THPT` as the permanent middle-column content
- Moved non-THCS record modules into the right column as their own separate boxes:
  - `By Course`
  - `By Skill`
  - `By Type`
  - `Writing`
  - `Statistics`
- Updated `src/components/layout/StudentSidebar.tsx`
- Removed the temporary left-sidebar record-module navigation so the shared sidebar returns to standard Records navigation only

### Step 9 — Progressive Feedback paragraph rewrite
- Updated `src/services/progressiveFeedback.service.ts`
- Reworked deterministic feedback into one natural paragraph instead of segmented report-style lines
- Tightened repeated-error phrasing so recurring mistakes are described as patterns that may settle into habits if left uncorrected
- Strengthened the Gemini prompt to produce more human, less mechanical coaching language grounded in recent test patterns
- Updated `src/pages/AcademicRecordPage.tsx` to render the single paragraph in the middle column

### Step 10 — Module selector refinement and THCS result opening
- Updated `src/pages/AcademicRecordPage.tsx`
- Restored the right-column pill selector below `Overview`
- Kept the right panel to one selected module at a time through a dropdown menu
- Trimmed module data passed into the right panel so previews stay more compact and preview-oriented
- Updated `src/components/academicRecord/THCSProgressTab.tsx`
- Made `Test History` rows clickable so they open the individual result detail view in Academic Record
- Updated `src/services/progressiveFeedback.service.ts`
- Strengthened the deterministic fallback so it does not collapse into a dry score-window summary when AI output is unavailable

### Step 11 — THCS history ID mismatch fix
- Updated `src/pages/AcademicRecordPage.tsx`
- Resolved THCS `Test History` clicks against the already-loaded student result records before opening `ResultDetailModal`
- This avoids sending the stored THCS `testId` directly into the modal, which was causing `permission_denied` when the modal attempted to read `test_results/{resultId}` with the wrong key

### Step 12 — Layout tightening and on-demand formative feedback
- Updated `src/pages/AcademicRecordPage.tsx`
- Moved the right-column stats visually higher by tightening the content spacing under `Progressive Feedback`
- Removed the extra card wrapper around the right-column module selector and changed the dropdown to float over the preview area instead of pushing the module preview down
- Updated `src/components/results/ResultDetailModal.tsx`
- Added an inline action for THCS results that do not yet have formative feedback so users can generate formative assessment feedback and incorrect-answer explanations from the individual result view

### Step 13 — Gap correction, upward dropdown, and safe manual generation
- Updated `src/pages/AcademicRecordPage.tsx`
- Reduced the gap between the top Academic Record summary cards and the THCS cards below without moving the `Progressive Feedback` card itself
- Changed the right-column module selector dropdown to open upward above the pill button
- Updated `src/services/formativeFeedback.service.ts`
- Made deterministic formative feedback generation resilient when saved result data does not include full THCS `sections[].questions`
- Updated `src/components/results/ResultDetailModal.tsx`
- Switched manual formative feedback generation to use a safe fallback section source for existing saved THCS results

## Current Caveats
- The page still uses inline styles in several existing components. These are existing warnings and were not migrated in this pass.
- RTDB rules already allow writes under `academic_records/{studentId}` for student/teacher/super-admin, so no new rules file change was required for this node extension.

## Next Recommended Pass
- Verify the Progressive Feedback service in-browser with real test history
- Optionally replace remaining banned/glassy card variants in result/grouped components if still present
