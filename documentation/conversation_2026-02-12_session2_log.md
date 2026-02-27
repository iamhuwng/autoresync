# Conversation Log - 2026-02-12 (Session 2)

## 1. Matching Features Display Bug Fix (15:00 - 15:20)

### User Request
In the review step (ParseReviewPanel), "Matching Features" questions display only option letters (A, B, C) instead of the full text (e.g., "A. Freeman"). Answer highlighting is also broken.

### Root Cause
In `ParseReviewPanel.tsx`, the matching-type `<Chip>` component:
1. Used only `String.fromCharCode(65 + i)` as the label → showed "A" not "A. Freeman"
2. Used the full option text as `value` → didn't match answer format (single letters), breaking highlight

### Solution
**File:** `src/components/test-creation/ParseReviewPanel.tsx`
- Chip label → `{letter}. {optionText}` (e.g., "A. Freeman")
- Chip value → letter only (`String.fromCharCode(65 + i)`) for correct answer matching
- Increased threshold from 5 → 8 before switching to dropdown
- Added `wrap="wrap"` for overflow handling

**Status:** ✅ Complete

---

## 2. Summary Completion List Paragraph Fragmentation Fix (15:20 - 16:25)

### User Request
"Summary Completion (List)" questions display as disconnected fragments instead of a flowing paragraph. Opening text of the summary paragraph is completely missing.

### Root Cause Analysis (Multi-Layer Pipeline Trace)

| Layer | Component | Finding |
|-------|-----------|---------|
| **Rendering** | `IELTSQuestionsPanel.tsx` (lines 550-585) | Two modes: full-paragraph (splits first question by `______`) and fragment-concatenation (joins all). Logic is correct — problem is upstream data. |
| **AI Prompts** | `gemini.provider.ts`, `groq.provider.ts` | ❌ **ROOT CAUSE** — Prompts told AI to extract each blank as a separate fragment, losing paragraph beginning and inter-blank text. |
| **Validation** | `response.validator.ts` (line 42) | `questionText: z.string().min(1)` would reject empty strings needed for subsequent questions in the group. |
| **Data Pipeline** | `validator.service.ts`, `TestCreationModal.tsx` | `sectionInstruction` is dropped at `AIQuestionResult` → `MergedQuestion` boundary. Separate issue, doesn't block fix. |

### Solution (4 Files)

#### 1. `src/services/ai/gemini.provider.ts`
- **`buildQuestionsPrompt`** (~line 365): Added `⚠️ FIRST question MUST contain ENTIRE summary paragraph with ALL blanks`
- **`buildQuestionsAndAnswersPrompt`** (~lines 707-730): Added detailed CRITICAL section with correct/wrong examples
- **JSON output example** (~lines 940-960): Added concrete Q27 (full paragraph) + Q28 (empty text) examples

#### 2. `src/services/ai/groq.provider.ts`
- Mirrored same instructions in both prompt methods (~lines 434, 670)
- Added matching JSON output examples (~lines 785-806)

#### 3. `src/services/ai/response.validator.ts`
- Changed `questionText: z.string().min(1)` → `.min(0)` to allow empty strings for subsequent questions

#### 4. (Previous session) `src/components/test-creation/ParseReviewPanel.tsx`
- Already fixed in Item 1 above

### How the Fix Works End-to-End
1. AI receives prompt → instructed to put full paragraph with ALL blanks in first question's `questionText`
2. Validator accepts → `min(0)` allows subsequent questions to have `questionText = ""`
3. Renderer processes → `blankCount >= group.questions.length` triggers full-paragraph mode
4. Student sees → Complete flowing paragraph with inline dropdown selectors

### Identified Gaps (Documented, Not Addressed)
1. **sectionInstruction pipeline gap** — Summary title heading (e.g., "The value attached to original works of art") won't appear unless `sectionInstruction` is carried through `MergedQuestion` → draft → published test
2. **Existing tests need re-parse** — Old fragmented data continues using fallback concatenation path
3. **`min(0)` is global** — Allows empty questionText for ALL types, not just summary-completion-list
4. **AI compliance not guaranteed** — LLMs may ignore prompt instructions under edge cases
5. **`summary-completion-text`** — Same issue may exist but was not investigated

### User's Reevaluation Request (16:25)
User asked for a critical reevaluation of the implementation — whether the fix reaches the root of the problem, handles edge cases, and creates a sustainable environment. The gaps above were identified and documented in response.

**Status:** ⚠️ Prompt fix applied. Requires re-parse to test. 5 gaps documented.

---

## Documentation Updates

### Files Created
- `documentation/SOP/0033-matching-features-and-summary-completion-list-fixes.md` — Full retrospective with root cause analysis, design decisions, and gap assessment

### Files Updated
- `documentation/README.md` — Added new SOP entry to Latest Updates and SOP list sections

---

## 3. Test End Flow — Race Condition Debugging (18:00 - 18:37)

### User Request
When a teacher ends an IELTS test early, students are redirected to a results page that shows "Test results are still being processed" or "Test not found." The user wanted the root cause investigated — not surface-level patches.

### Debugging Journey — 3 Hypotheses

#### Hypothesis 1: Results Page Load Order (Surface Fix)
**Theory:** `StudentTestResultsPage.loadResults()` tried to load `tests/${testId}` first, but teacher's `endFullSession()` clears `testId: null` before the student arrives.
**Action:** Restructured `loadResults()` to prioritize the permanent result record (`getStudentSessionResult()`) over testId-based lookup.
**Outcome:** Build succeeded but still failed. The permanent result simply didn't exist at the expected path.

#### Hypothesis 2: Firebase Propagation Timing (Surface Fix)
**Theory:** `saveTestResult()` write hadn't propagated to student's SDK cache by the time the results page loaded.
**Action:** Added 5-retry logic with progressive delays (1.5s, 3s, 4.5s, 6s, 7.5s) to `loadResults()`.
**Outcome:** All retries exhausted — permanently not found. NOT a timing issue.

#### Hypothesis 3: Guest Detection Bug (ROOT CAUSE ✅)
**Discovery trigger:** User pushed back firmly: *"Investigate the root cause, not just surface-level symptoms."*

**Full pipeline trace of teacher-side auto-submit:**
```
endFullSession() → autoSubmitAllUnsubmittedStudents() → saveTestResult()
  → const isGuest = student.studentId.startsWith('guest_') || !student.studentId.includes('_')
```

Firebase Auth UID `G5yDXmkDfsVhoKYTp7xTwbbggtB2` has no underscore → `isGuest = true` → result saved to `guest_results/` instead of `test_results/`. Student results page queries `test_results_by_session/` → NOT FOUND.

### Fix Applied (3 Files)
Changed `isGuest` logic to only check `guest_` prefix:

| File | Line |
|------|------|
| `src/utils/monitor/autoSubmitDisconnected.ts` | 349 |
| `src/utils/resultsMigration.ts` | 64 |
| `src/hooks/test/useTestSubmission.ts` | 360 |

**Status:** ✅ Bug fixed in all 3 files.

---

## 4. Test End Flow — Architectural Redesign (18:37 - 18:55)

### User's Architectural Challenge
After the root cause fix, the user questioned the redirect design itself: *"Why redirect students away from the session to a results page? They should return to the lobby."*

### Key User Decisions (via Edge Case Q&A)

| Question | User Decision |
|----------|---------------|
| Where should students go after test ends? | **Back to the waiting lobby** (same session) |
| How to see results? | **Modal/dialog** that auto-opens in the lobby |
| Can they reopen it? | **Yes** — close and reopen freely |
| Student submitted 0 questions? | Gets a result record **(0%)** with results modal |
| Multiple tests in session? | Show only the **most recent test** |
| Modal design? | Full detailed breakdown, single-screen, tight layout, follows app design standards |

### PRD Created
**File:** `documentation/tasks/PRD-test-end-flow-refactor.md`

6-phase implementation plan:

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Fix guest detection bug | ✅ Done |
| 2 | Change redirect → lobby (not results page) | ⏳ Pending |
| 3 | Create `TestResultsModal` component | ⏳ Pending |
| 4 | Integrate modal into `StudentWaitingRoomPage` | ⏳ Pending |
| 5 | Clean up `endFullSession()` (`isSubmitted` cleanup) | ⏳ Pending |
| 6 | Revert retry logic from `StudentTestResultsPage` | ⏳ Pending |

**Status:** ⏳ PRD delivered, awaiting user assessment before implementation.

---

## Documentation Updates (Addendum)

### Files Created
- `documentation/sop/0034-test-end-flow-debugging-retrospective-2026-02-12.md` — Full retrospective with 3-hypothesis debugging narrative, lessons learned
- `documentation/tasks/PRD-test-end-flow-refactor.md` — 6-phase PRD for architectural redesign

### Files Updated
- `documentation/README.md` — Added SOP 0034 entry and PRD entry
- `src/utils/monitor/autoSubmitDisconnected.ts` — Fixed guest detection (line 349)
- `src/utils/resultsMigration.ts` — Fixed guest detection (line 64)
- `src/hooks/test/useTestSubmission.ts` — Fixed guest detection (line 360)
