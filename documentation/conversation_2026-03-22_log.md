# Conversation Log - 2026-03-22

**Session window:** 2026-03-22 (UTC+7)

**Extracted pattern:** [AI Feedback Trust Contract](./knowledge-extract-ai-feedback-trust-contract.md)

---

## 1. PRD Fidelity Review and Gap Closure for Result Slide Panel

**User request:**
- Reassess PRD 0039 implementation fidelity.
- Compare against earlier review notes and close remaining gaps.
- Mark task 10.5 completed/skipped.

### Outcomes
- Re-reviewed the implementation against the original PRD and the task breakdown.
- Closed the main functional gap around IELTS-specific formative-feedback prompting.
- Fixed stale state and result/attempt wiring issues across the slide panel and academic record host flow.
- Added missing regression coverage for hooks, result entry points, and legacy result rendering.
- Marked task 10.5 completed/skipped in the task checklist per user instruction.

### Important Clarifications
- Confirmed that some earlier items were true open issues rather than coding defects:
  - PRD vs task-list hover behavior drift for incorrect pills.
  - highlight glow color drift.
  - blocked study-resource appendix interpretation.
- Distinguished true implementation gaps from documentation/spec drift.

### Verification
- Focused result-panel regression and build passed during this workstream.

---

## 2. Study Recommendations: Appendix Block Removed, AI-Driven Model Adopted

**User direction:**
- Clarified that the earlier product decision was to let AI handle resource suggestions using the approved popular book catalog.
- Requested removal of the false Appendix A blocker.

### Outcomes
- Re-read the conversation refinement document and confirmed the approved direction:
  - AI may recommend from the approved book list.
  - exact hand-authored chapter mapping is not a ship blocker.
- Updated PRD/task interpretation accordingly.
- Implemented study recommendations in the Feedback tab.
- Later replaced the deterministic mapping-heavy version with an AI-authored `studyRecommendations` payload carrying:
  - skill tag
  - linked question numbers
  - guidance
  - book title / author / section title / reason
- Removed unnecessary deterministic topic-to-book mapping logic once the AI-owned model became authoritative.

### Verification
- Added direct component and service coverage for study recommendations.
- Focused tests and build passed.

---

## 3. Result Modal UI Alignment and Surface Integration

**User requests addressed:**
- Align result modal with the HTML mockup.
- Remove old Overview feedback blocks.
- Move attempt selector into the top header.
- Keep header metadata on one line.
- Make Review Mistakes incorrect-only.
- Make Overview incorrect pills jump correctly into Review Mistakes.
- Collapse long Performance by Section by default.
- Fix attempt dropdown clipping.
- Make result modal independent on dashboard/feed/homework surfaces instead of navigating through Academic Record.
- Rebalance Feedback tab layout, including Score Trend placement.

### Outcomes
- Restyled shell, header, Overview, Review, Feedback, and Attempt History to better match the approved mockup.
- Removed legacy strengths/weakness/critical paneling from Overview.
- Moved attempt controls into the top header and corrected dropdown layering.
- Ensured dashboard/feed/homework surfaces open the slide panel locally rather than redirecting to Academic Record.
- Added responsive balancing so `Score Trend` can move to the left column when the right side becomes too tall.

### Verification
- Updated relevant component/page tests and kept the focused UI regression green.

---

## 4. Feedback Reliability: From One-Shot Fallback Persistence to AI Upgrade Flow

**User concern:**
- Deterministic fallback feedback was being saved as if final.
- AI only effectively got one attempt.
- Retry did not truly force AI regeneration.

### Root Cause Found
- Stored `formativeFeedback` was being reused immediately once present.
- `generationMode` existed only as metadata.
- Retry still went through the same stored-reuse path.
- Result surfaces only auto-generated when no feedback existed at all.

### Implemented Architecture Change
- Introduced upgrade-needed detection for stored feedback.
- Added `forceAiUpgrade` support through the saved-result feedback generation service.
- Changed result surfaces so deterministic or weak stored feedback can auto-attempt AI upgrade on open.
- Changed retry actions so they now truly force AI regeneration instead of reusing stored fallback.
- Preserved the existing saved payload if AI upgrade fails, while clearly surfacing that the feedback still needs AI upgrade.

### Verification
- Added/updated regression coverage for:
  - service-layer upgrade behavior
  - result slide panel
  - result detail modal
  - feedback tab retry state
- Focused suite and build passed.

---

## 5. Root-Cause Follow-Up: Fallback-Like Question Explanations Passing as AI

**User report:**
- Result modals still displayed explanation text matching the deterministic fallback style even when active AI keys existed.
- Examples included clue-based reading fallback wording and deterministic sentence-ordering walkthroughs.

### Root Cause
- The system could save an overall AI-enriched result while still filling some question explanations from the deterministic fallback path.
- Those fallback explanations were not broad enough to be recognized as weak once saved.
- AI response validation also did not require complete, strong coverage for every wrong-answer explanation.

### Final Fix Applied
- Expanded weak-explanation detection to catch the actual fallback phrasings that were appearing in production-like output.
- Tightened AI response validation so a provider response is rejected unless it includes strong explanations for every wrong-answer question.
- Normalized `Q1`/`1` explanation keys during validation to avoid false acceptance/rejection from inconsistent key formats.
- This means:
  - fallback-style question explanations now qualify stored feedback for AI upgrade,
  - partial/weak AI responses are rejected earlier instead of being saved as acceptable AI output,
  - provider rotation/fallback can continue before the system settles on deterministic-only output.

### Verification
- Focused feedback regression: 6 test files, 56 tests passed.
- Production build: passed.

---

## End State

By the end of the session:
- PRD 0039 implementation drift was re-audited and major actionable gaps were closed.
- The study-recommendation feature now follows the approved AI-driven model rather than a false appendix blocker.
- The result modal design and behavior were brought much closer to the intended mockup and interaction flow.
- Formative feedback now supports true AI upgrade attempts for weak/deterministic saved payloads.
- Fallback-style question explanations are no longer accepted as valid AI output during response validation.

---

## 6. Generic Results Were Not Entering the AI Upgrade Path

**User report:**
- Even after the earlier AI-upgrade fixes, some result modals still showed old fallback-style explanations.
- This was still happening on non-THCS, non-IELTS results.

### Root Cause
- The saved-result feedback payload builder only returned payloads for THCS and IELTS-style results.
- Generic results could still use the general feedback prompt path, but they were blocked earlier and never reached AI regeneration.
- IELTS detection was also too broad and could misclassify generic reading/listening results.
- Modal auto-upgrade logic had previously been biased toward THCS and IELTS result families.

### Fix Applied
- Narrowed IELTS-result detection so it now relies on explicit IELTS evidence instead of broad reading/listening heuristics.
- Extended the saved-result payload builder to return a valid `family: 'generic'` feedback payload for non-THCS, non-IELTS results.
- Removed the family restriction from modal auto-upgrade behavior so weak saved feedback on generic results can trigger forced AI regeneration too.
- Added regression coverage for:
  - generic payload generation,
  - generic-result auto-upgrade in the result slide panel,
  - generic-result auto-upgrade in the legacy result modal.

### Verification
- Focused regression and build passed after this fix.

---

## 7. Stronger Fix: Stop Rendering Deterministic Scaffold Text as AI Explanations

**User report:**
- Result modals still showed explanations such as:
  - clue-based scaffold text like "The strongest clue for this question is ..."
  - generic unanswered boilerplate like "You did not answer this question. The correct answer is ..."
- These were still not acceptable as meaningful student-facing explanations, even if they were being caught as weak in validation.

### Root Cause
- The deterministic fallback generator still wrote per-question scaffold text into the same `questionExplanations` field used by the UI for AI explanations.
- That meant the rendering layer had no distinction between:
  - genuine AI-authored detailed explanations,
  - deterministic backup text generated only to avoid empty states.
- So even after validation became stricter, saved results could still display fallback text as if it were finished AI output whenever AI had not yet produced a strong replacement.

### Stronger Architecture Change
- Introduced a stricter render contract:
  - only strong AI explanations are renderable as question explanations,
  - deterministic backup explanations are stored separately and no longer shown as AI output.
- Added a dedicated `fallbackQuestionExplanations` field to `FormativeFeedback`.
- Added a helper that filters saved explanations down to only renderable, non-weak explanations.
- Updated generation so:
  - AI explanations are sanitized before save,
  - deterministic fallback explanations are stored separately instead of replacing weak AI text inside the main render field.
- Updated result review surfaces so:
  - weak saved explanations are hidden,
  - the UI shows a pending state when a real detailed AI explanation is still needed,
  - fallback scaffold text is no longer presented as a finished `AI Explanation`.

### Surfaces Updated
- Review tab
- Question pill detail card inside the legacy result modal
- Result detail modal plumbing for pending AI explanation state

### Verification
- Focused regression:
  - `src/services/formativeFeedback.service.test.ts`
  - `src/components/results/ReviewTab.test.tsx`
  - `src/components/results/ResultDetailModal.test.tsx`
  - `src/components/results/ResultSlidePanel.test.tsx`
- Result: 4 test files, 49 tests passed.
- Production build: passed.

### Final Effect
- Weak scaffold explanations are no longer displayed to students as if they were completed AI explanations.
- Existing saved weak explanations now remain upgrade-needed and render as pending until a strong AI explanation is available.
- This is a stronger root-cause fix than pattern suppression alone because it separates backup content from trusted AI explanation content at the storage and UI-contract level.


---

## 8. Teacher Student History -> Result Detail Bug, Route Contract Repair, and Result-View Separation

**Initial user problem report:**
- Teacher flow failed at: `Teacher Lobby -> Students Tab -> Analytics -> Student History -> View`.
- Example failing URL path started from a teacher-owned student history page like:
  - `http://localhost:5173/teacher/student/x3hDfjYVN7cJtSbwq0ChIjl1Bk62/history`
- Clicking `View` on a test sent the teacher to a `Session not found` page.
- Console evidence showed the teacher page loading a session-oriented route and attempting to resolve a session code that did not represent a valid active `game_sessions/{sessionCode}` record for that permanent result.

### First Proposal / Initial Hypothesis
- The first working hypothesis was that the teacher history page was reusing the wrong entry point:
  - instead of opening a permanent saved result by `resultId`,
  - it was navigating into the old teacher session analytics page by `sessionCode`.
- Planned direction:
  - trace the exact click handler from teacher student history,
  - compare teacher view and student view result entry contracts,
  - preserve the existing session analytics page for true live/class session reports,
  - but move permanent result viewing onto the shared result-detail contract.

### Root Cause Confirmed
- `TeacherStudentHistoryPage.tsx` used:
  - `navigate(`/teacher-test-results/${result.sessionCode}`)`
- That route renders `TeacherTestResultsPage.tsx`, which always loads:
  - `game_sessions/{sessionCode}`
- This is correct only for session analytics.
- It is incorrect for permanent academic-history records because teacher student history rows come from:
  - `test_results/{resultId}`
- Many of those records belong to:
  - homework,
  - self-study/practice,
  - ended/expired sessions,
  - legacy or non-live result contexts.
- For those records, `sessionCode` is not a reliable detail-page key, so `TeacherTestResultsPage` correctly failed with `Session not found`.

### Trial Findings and Failures During Investigation
- Confirmed that the teacher session analytics page itself was not the core bug.
  - It still has a valid role when a teacher intentionally opens class/session-wide analytics for a true session.
- Confirmed that the current bug was a caller-contract mismatch, not just a missing record.
- While auditing related paths, another linked contract problem was found:
  - several student notification/result links already pointed to `/student/results/${resultId}`,
  - but `StudentTestResultsPage.tsx` still treated that param as a session code.
- This meant the same category of mismatch existed in student deep links too:
  - teacher history broke by opening a session page with a permanent result's `sessionCode`,
  - student notification links could also enter a session-oriented page using a `resultId` param.

### Logic Changes Applied

#### A. Canonical permanent-result contract established
- Registered shared canonical result-detail routing with `resultId` as the key.
- Added missing route constants:
  - `TEACHER_STUDENT_HISTORY`
  - `RESULT_DETAIL`
- Updated route tests to cover both.

#### B. Teacher history fixed to open permanent result detail, not session analytics
- `TeacherStudentHistoryPage.tsx` now opens:
  - `/result/:resultId`
- It also tracks the action through the existing results observability path.
- This means teacher result review now resolves from the permanent saved record instead of trying to reconstruct a session-level report from `sessionCode`.

#### C. Teacher navigation cleaned up and centralized
- `TeacherStudentsPage.tsx` previously used direct `window.location.href` for the student-history jump.
- It now uses centralized typed navigation via the route registry.
- Breadcrumb and feature-registry support were updated so the route is formally recognized by the app's navigation/reporting system.

#### D. Student legacy result links made compatible
- `StudentTestResultsPage.tsx` now checks legacy `/student/results/...` entry paths.
- If the route parameter actually resolves as a saved result ID, the page redirects to:
  - `/result/:resultId`
- This preserves backward compatibility for older links while moving the permanent result contract onto the proper result-detail route.

#### E. Notification and saved-result links standardized
- Permanent-result notifications and post-save result links were updated to emit canonical links through `RESULT_DETAIL`.
- This removes the old ambiguity between:
  - session-result paths,
  - permanent saved-result paths.

#### F. Unnecessary/broken component removed
- Deleted unused `TeacherStudentResultsView.tsx`.
- Reasons:
  - it still hardcoded the broken session-results navigation pattern,
  - it brought Mantine into a dead path,
  - leaving it in place would preserve another latent broken entry point.

### Separation / Redesign Outcome
The final architecture now cleanly separates two different result surfaces:

1. **Session analytics view**
- Route family: `TeacherTestResultsPage`
- Keyed by: `sessionCode`
- Purpose: teacher class/session-wide analytics for real live/class sessions
- Data source emphasis:
  - `game_sessions/{sessionCode}`
  - aggregated session/player data
  - session result indexes

2. **Permanent result detail view**
- Route family: `ResultDetailPage` -> `LegacyResultDetailView`
- Keyed by: `resultId`
- Purpose: teacher/admin/student review of one saved result record
- Data source emphasis:
  - `test_results/{resultId}`
- This is now the correct destination for:
  - teacher student history rows,
  - saved-result notifications,
  - permanent academic-record style result access.

This keeps teacher view and student view well-separated in behavior while still efficient in shared code:
- same permanent saved-record contract,
- same canonical route key (`resultId`),
- role-specific rendering behavior remains handled at the page/view layer,
- old session analytics page remains available only where its `sessionCode` contract is actually valid.

### Files Changed for the Working Fix
- `src/constants/routes.ts`
- `src/constants/routes.test.ts`
- `src/pages/TeacherStudentHistoryPage.tsx`
- `src/pages/TeacherStudentHistoryPage.test.tsx`
- `src/pages/TeacherStudentsPage.tsx`
- `src/pages/StudentTestResultsPage.tsx`
- `src/pages/StudentTestResultsPage.test.tsx`
- `src/services/notificationService.ts`
- `src/services/testResults.service.ts`
- `src/services/testResults.service.test.ts`
- `src/config/featureRegistry.ts`
- `src/config/breadcrumbConfig.ts`
- `src/App.jsx`
- Removed: `src/components/results/TeacherStudentResultsView.tsx`

### Final Working Solution
- Teacher student history `View` now opens the correct permanent result detail page by `resultId`.
- Legacy student `/student/results/...` result deep links are redirected to the canonical result-detail route when they represent saved result IDs.
- Notifications for permanent results now point to the canonical result-detail route.
- Session analytics remains intact for routes that truly operate on `sessionCode`.

### Verification
Focused regression suite executed and passed:
- `src/pages/TeacherStudentHistoryPage.test.tsx`
- `src/pages/StudentTestResultsPage.test.tsx`
- `src/services/testResults.service.test.ts`
- `src/constants/routes.test.ts`

**Result:** 4 test files, 92 tests passed.
