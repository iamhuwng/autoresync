# PRD-0039: Test Results Slide Panel

> **Status:** Draft v2 (Audited 2026-03-20)
> **Created:** 2026-03-20
> **Replaces:** Current `ResultDetailPage.tsx` (full-page view) and `ResultDetailModal.tsx` (centered modal)
> **Design Reference:** `mockup-result-slide-panel.html` (project root)

---

## 1. Introduction / Overview

The current test result viewing experience uses either a full-page layout (`ResultDetailPage.tsx`) or a centered modal (`ResultDetailModal.tsx`). Both approaches take the student away from their workflow context. This PRD introduces a **slide-in panel** that opens from the right side of the screen, covering the entire content area except the left sidebar, providing a rich, tabbed result view without losing page context.

**Key motivations:**
- Students should review results without leaving their current page (Academic Record, Dashboard, etc.)
- AI-generated feedback (explanations + study resource recommendations) should be integrated seamlessly
- THCS and IELTS test types need adapted UI (different score displays, section breakdowns)
- Attempt history across multiple submissions of the same test should be visible in one place
- Score trends and class positioning provide motivational context

---

## 2. Goals

| # | Goal | Metric |
|---|------|--------|
| G1 | Replace full-page result view with contextual slide panel | `ResultDetailPage.tsx` becomes a redirect wrapper to the new panel |
| G2 | Integrate AI-generated per-question explanations and study resource recommendations | AI feedback sections render without layout shift |
| G3 | Support both THCS and IELTS test types with appropriate score displays and AI feedback | Correct score format displayed for each type |
| G4 | Provide full attempt history with comparison metrics | Student can view and switch between all attempts |
| G5 | Mobile-optimized: full-screen overlay on small screens | Panel is usable on screen widths ≤ 768px |
| G6 | URL deep-linking for result sharing and bookmarking | Browser URL updates with result ID; direct navigation opens panel |
| G7 | Provide score trend and class positioning context | Student sees performance trajectory and relative standing |

---

## 3. User Stories

| # | As a... | I want to... | So that... |
|---|---------|-------------|-----------|
| US-1 | Student | Click a result card to see my full results in a slide panel | I don't lose my place in the Academic Record page |
| US-2 | Student | See which questions I got wrong via a colored pill grid | I can quickly identify weak areas |
| US-3 | Student | Click an incorrect pill to jump to that question's detailed review | I can efficiently review my mistakes |
| US-4 | Student | See AI-generated explanations for each incorrect question | I understand why my answer was wrong |
| US-5 | Student | Get study resource recommendations (e.g., book chapters) | I know exactly what to study next |
| US-6 | Student | View all my attempts for the same test in one panel | I can track my improvement over time |
| US-7 | Student | See IELTS passage-level breakdown in the overview | I know which passage I struggled with |
| US-8 | Student | Close the panel with ESC or the back button | I can quickly return to browsing |
| US-9 | Student | See my score trend across recent tests | I can see if I'm improving |
| US-10 | Student | See how I compare to my class average | I understand my relative performance |
| US-11 | Student | Share or bookmark a specific result via URL | I can return to it later or share with others |

---

## 4. Functional Requirements

### 4.1 Panel Layout & Behavior

**FR-01: Slide-in animation.**
Panel slides in from the right edge of the viewport.
- Animation: 350ms `cubic-bezier(0.16, 1, 0.3, 1)` transform (spring-like overshoot)
- Panel width: `calc(100% - var(--sidebar-w))` (covers entire content area except left sidebar)
- Panel max-width: `calc(1400px - var(--sidebar-w))`
- Panel anchored to the right edge

**FR-02: Backdrop.**
Light semi-transparent backdrop:
- `background: rgba(0, 0, 0, 0.08)` — subtle darkening, sidebar remains clearly visible
- No blur effect
- Clicking backdrop closes the panel

**FR-03: Close mechanisms.**
- ESC key
- Back arrow button (←) in panel header
- Backdrop click

**FR-04: Mobile behavior.**
On screens ≤ 768px, panel becomes a full-screen overlay (width: 100vw, height: 100vh). No backdrop — panel fills the screen.

**FR-05: Panel header.**
Contains:
- Back arrow (←) on the left
- Test title (truncated with ellipsis if too long)
- Test type badge (THCS / IELTS Reading / IELTS Listening)
- **Subtitle line** below title: `Skill/Section • Date` (e.g., "Reading & Vocabulary • 20 Mar 2026"). Date only, no time used.

**FR-06: Tabbed content.**
Three tabs with sticky headers:
- **Overview** — Score ring + stats, answer map pill grid, section breakdown, performance feedback
- **Review Mistakes** — Detailed question-by-question review (incorrect only by default, toggle to show all)
- **Feedback** — AI performance analysis, study resource recommendations, score trend, class position

Each tab scrolls independently. Tab bar stays fixed at the top of the content area.

**FR-07: URL deep-linking.**
When the panel opens, update the browser URL to include the result ID (e.g., `?result={resultId}`).
- Navigating directly to a URL with `?result=` auto-opens the panel for that result
- `ResultDetailPage.tsx` remains as a deep-link entry point: page mounts and auto-opens the slide panel
- Closing the panel removes the query parameter from the URL without page reload

**FR-08: Staggered content animations.**
Content elements within the panel use staggered fade-in animations:
- `@keyframes dashFadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }`
- Base duration: 0.3s ease-out
- Delay classes: `.fade-in-d1` (50ms), `.fade-in-d2` (100ms), `.fade-in-d3` (150ms), `.fade-in-d4` (200ms), `.fade-in-d5` (250ms)
- Applied to stat cards, section cards, answer map, feedback cards

---

### 4.2 Overview Tab

#### 4.2.1 Score Display (Test-Type Adaptive)

**FR-09: Score ring + stat cards horizontal layout.**
The score display uses a single horizontal row containing:
1. **Circular progress ring** (SVG, 100×100px):
   - Stroke circle shows percentage filled with accent color
   - Center: Large score value (1.5rem, weight 800) + small fraction below (0.65rem)
   - Stroke width: 8px, track color: `#e5e7eb`, fill color: test-type dependent
2. **Three stat cards** in a row beside the ring:
   - Each card: white background, rounded corners, centered text
   - Large number (1.5rem, weight 700) + small label below (0.7rem, gray)

**FR-10: THCS score display.**
- Ring value: `scaledScore/10` (e.g., `8.3`)
- Ring fraction: `X out of 10`
- Stat cards: Points Earned | Scaled Score | Time Spent
- Ring fill color: green ≥ 7, amber ≥ 5, red < 5
- Data source: `result.thcsData.scaledScore`

**FR-11: IELTS score display.**
- Ring value: `Band X.X` (e.g., `6.5`)
- Ring fraction: `Y/Z correct`
- Stat cards: Band Score | Correct Answers | Time Spent
- Data source: `result.bandScore`, `result.correct`, `result.totalQuestions`

**FR-12: Non-THCS/non-IELTS score display (fallback).**
- Ring value: `XX%`
- Stat cards: Score | Correct | Time Spent

#### 4.2.2 Answer Map Pill Grid

**FR-13: Pill grid layout.**
Compact 20-column grid for the Overview answer map:
- `grid-template-columns: repeat(20, 1fr)`
- Gap: 4px
- Pill size: compact (auto-sized by grid, approximately 28-32px)
- Border-radius: 6px
- Odd number of questions: last row fills left-to-right naturally

> For tests with > 50 questions, switch to 10-column grid for readability. Last row has fewer pills (e.g., 53 questions = 5 rows + 1 row with 3 pills).

**FR-14: Answer map legend.**
Above the pill grid, show a header row with colored dots summarizing results:
- `●` green dot + "X correct"
- `●` red dot + "Y incorrect"
- Dot size: 8×8px, inline with text (0.75rem, gray)

**FR-15: Pill content.**
- Question number only (small text, centered)
- Color indicates correct/incorrect (see FR-16)
- No answer letter in the compact Overview pills

**FR-16: Pill colors.**
Pastel backgrounds with dark colored text (matches mockup; NOT solid fills):
- Correct: Light green bg (`#ecfdf5`) + dark green text (`#059669`)
- Incorrect: Light red bg (`#fef2f2`) + dark red text (`#dc2626`), cursor pointer
  - Hover: `scale(1.18)` + `box-shadow: 0 2px 8px rgba(220,38,38,0.25)` + `z-index: 2`
  - Correct pills hover: `scale(1.12)` only
- Partial credit: Light amber bg (`#fef3c7`) + dark amber text (`#d97706`)
- Pending review (writing questions): Light gray bg (`#f3f4f6`) + muted text (`#94a3b8`)

**FR-17: Pill click behavior — goToQuestion.**
Clicking an **incorrect** pill calls `goToQuestion(questionNumber)`:
1. Switches to "Review Mistakes" tab
2. After 80ms delay (DOM render), scrolls to the target question card using `document.getElementById('qcard-${num}')?.scrollIntoView({ behavior: 'smooth', block: 'center' })`
3. **Highlight animation:** After scroll completes, apply 2-second accent glow to the target card:
   - `boxShadow: '0 0 0 3px rgba(79,70,229,0.3)'`
   - `borderColor: var(--accent)`
   - Remove after 2000ms via `setTimeout`

Clicking a correct pill does nothing (no action).

**FR-18: Pill click discoverability — CSS hover tooltip.**
Incorrect pills in the Overview answer map show a tooltip on hover via CSS `::after` pseudo-element:
- Content: `"Click to review"`
- Position: absolute, centered above the pill
- Style: small text (0.65rem), dark background, white text, rounded
- Fade-in on hover with slight delay
- **No static hint text below the grid** (avoids visual clutter on Overview)

#### 4.2.3 Section / Passage Breakdown

**FR-19: THCS section breakdown.**
Display existing `thcsData.sectionResults` as a list of section cards.
Each card shows: Section Name | Points (X/Y) | Correct count | Percentage bar.
Data source: `result.thcsData.sectionResults[]`.

**FR-20: IELTS passage breakdown.**
Display passage-level results derived from test section structure.
Each passage card shows: Passage N | Correct (X/Y) | Percentage bar.
Data source: new `result.ieltsData.passageResults[]` (see §6.2).

> **IMPORTANT:** IELTS tests have variable passage counts (1, 2, or 3 passages). The passage-to-question mapping MUST be derived from the test's section structure at save time, NOT hardcoded.

**FR-21: THCS intent/skill breakdown.**
Display `thcsData.intentBreakdown` as a compact skill performance grid.
Each skill shows: Skill Name | Correct/Total | Color-coded bar (green ≥ 70%, amber ≥ 50%, red < 50%).

#### 4.2.4 Performance Feedback Card

**FR-22: AI-generated performance summary.**
At the bottom of the Overview tab, display a performance feedback card:
- Source: `formativeFeedback.aiFeedback` field (AI-generated natural language summary)
- Display: Card with emoji (🎉 for excellent, 💪 for good, 📚 for needs work) + title + text
- Style: Subtle background (e.g., light green for high scores, light amber for moderate, light blue for low)
- Loading: Show shimmer skeleton while AI feedback is loading (follows same pattern as FR-23)
- If AI feedback is unavailable: Card is not shown (graceful absence, not an error state)

#### 4.2.5 AI Feedback Integration

**FR-23: Auto-trigger pattern.**
When the panel opens and the result has no `formativeFeedback`:
1. Check if this is a THCS **or IELTS** test
2. If yes and `formativeFeedback` is missing, auto-trigger `handleGenerateFormativeFeedback()`
3. Use `feedbackAttemptedRef` to prevent duplicate triggers
4. Show shimmer skeleton while waiting (see FR-24)
5. RTDB `onValue` listener auto-updates the UI when feedback arrives

This is the existing "fire-and-forget + RTDB real-time + auto-trigger with dedup" pattern.

> **Note (v2 change):** IELTS tests now also trigger AI feedback generation. The `handleGenerateFormativeFeedback()` function must be extended to handle IELTS results (they lack `thcsData` but have `questionResults` + `bandScore`). See FR-44.

**FR-24: Loading state (shimmer).**
While waiting for AI feedback:
- Purple-gradient border card
- Spinning circle + "🤖 Generating personalized feedback..." text
- 4 shimmer bars at 85%, 70%, 55%, 40% width
- Animation: `feedbackShimmer` keyframes (1.5s ease-in-out infinite)

**FR-25: Error state.**
If AI feedback fails:
- Red-gradient border card
- "⚠️ Feedback unavailable" title
- "AI service is temporarily busy. You can try again." subtitle
- "🔄 Retry" button that resets `feedbackAttemptedRef` and re-triggers generation

**FR-26: AI feedback display (when available).**
Render the existing `FormativeFeedbackPanel` component with `feedback={(result as any).formativeFeedback}`.

**FR-27: Per-question AI explanations.**
Pass `formativeFeedback.questionExplanations` to the question detail cards.
In the Review Mistakes tab, each incorrect question card shows:
- "Your Answer" vs "Correct Answer"
- AI explanation (if available) in a styled callout with 🤖 icon

---

### 4.3 Review Mistakes Tab

**FR-28: Single-column question card layout.**
Display question cards in a single-column vertical layout (`flex-direction: column; gap: 16px`).
No pill navigation strip at top — users navigate via Overview tab's interactive answer map.

> **Rationale:** Single column provides more room for AI explanation text and answer comparisons. The Overview tab answer map already provides efficient navigation via `goToQuestion()`, making a secondary pill strip redundant.

**FR-29: Incorrect heading banner.**
Above the question cards, show a styled heading row:
- `❌` icon (1.25rem) + "Incorrect Questions" title (weight 700, 1rem) + count badge (e.g., "6 questions")
- Count badge: pill shape (`border-radius: 999px`), light red bg (`error-bg`), red text (`error`)
- Bottom border separator (`1px solid var(--border)`, `padding-bottom: 12px`, `margin-bottom: 16px`)

**FR-29a: Question filter toggle.**
By default, show ONLY incorrect questions. Provide a toggle: "Show all questions / Show incorrect only".

**FR-30: Question card structure.**
Each card has `id="qcard-${questionNumber}"` for scroll targeting. Structure:
- Question number badge (circle, color-coded)
- Question type label (e.g., "Multiple Choice", "Fill-in-Blank", "Sentence Rewrite")
- "Your Answer" block — student's answer with red/green background based on correctness
- "Correct Answer" block — correct answer with green background (hidden if student was correct)
- Model Answers — for sentence-rewrite questions, show all accepted model answers
- AI Explanation — if `questionExplanations[questionNumber]` exists, show in a purple-tinted callout
- Writing status — for sentence-rewrite with `gradingTier: 'pending'`, show "⏳ Pending teacher review"

**FR-31: Answer format display.**
- MCQ: Show letter (e.g., "A") with option text if available
- Fill-in-blank: Show the typed word/phrase
- Sentence-rewrite: Show full sentence, student answer vs model answers
- IELTS word answers: Show the word/phrase as-is (e.g., "approximately", "TRUE")

---

### 4.4 Feedback Tab

**FR-32: Feedback tab layout.**
Responsive two-column layout:
- Desktop (> 768px): CSS grid with `grid-template-columns: 3fr 2fr` + gap: 24px
  - Left column (3fr): AI Performance Analysis
  - Right column (2fr): Study Resources, Score Trend, Class Position (stacked vertically)
- Mobile (≤ 768px): Single column, all sections stacked vertically

#### 4.4.1 AI Performance Analysis

**FR-33: AI performance analysis card.**
Left column of the Feedback tab. Content sourced from `formativeFeedback.aiFeedback`:
- **Header:** "🤖 AI Performance Analysis" with accent-colored icon
- **Strengths section:** Bullet list of areas the student performed well in
- **Areas for Improvement section:** Bullet list of weak areas with specific question references
- **Recommended Practice section:** Actionable suggestions based on weak areas
- Loading: Shimmer skeleton while AI feedback loads (same auto-trigger as FR-23)

#### 4.4.2 Study Resource Recommendations

**FR-34: Resource recommendation engine.**
Create `src/config/studyResources.config.ts` with the approved 9-book catalog and topic-level mapping. Exact chapter-level overrides are optional and may be added later without blocking implementation:

```typescript
interface StudyResource {
  bookTitle: string;
  author: string;
  publisher: string;
  focusLabel: string; // e.g., "Grammar reference and sentence accuracy"
}

interface ResourceMapping {
  // Maps skill/topic intent to relevant resources
  [intentKey: string]: StudyResource[];
}

// Two top-level groups:
export const THCS_RESOURCES: ResourceMapping = { ... };
export const IELTS_RESOURCES: ResourceMapping = { ... };
```

**FR-35: Approved book library (Phase 1).**

| # | Title | Author | Publisher |
|---|-------|--------|-----------|
| 1 | *English Grammar in Use* (5th Edition) | Raymond Murphy | Cambridge University Press |
| 2 | *Advanced Grammar in Use* (3rd Edition) | Martin Hewings | Cambridge University Press |
| 3 | *English Vocabulary in Use* (Pre-intermediate & Intermediate) | Stuart Redman | Cambridge University Press |
| 4 | *English Vocabulary in Use* (Upper-intermediate) | Michael McCarthy & Felicity O'Dell | Cambridge University Press |
| 5 | *Cambridge IELTS Practice Tests* (Books 14-19) | Cambridge | Cambridge University Press |
| 6 | *The Official Cambridge Guide to IELTS* | Pauline Cullen & Amanda French | Cambridge University Press |
| 7 | *Grammar for IELTS* | Diana Hopkins | Cambridge University Press |
| 8 | *Vocabulary for IELTS* (Intermediate & Advanced) | Pauline Cullen | Cambridge University Press |
| 9 | *Academic Word List* (AWL Sublists 1-10) | Averil Coxhead | Victoria University of Wellington |

> **Note:** No grade-level differentiation for now. Vietnamese curriculum textbooks excluded from Phase 1. Collins Vocabulary for IELTS excluded per user decision.

**FR-36: AI-composed recommendations.**
After the AI feedback loads, the Feedback tab shows a "📚 What to Study Next" section:
1. Takes the `intentBreakdown`, `analysis`, or `questionExplanations` from formative feedback
2. Maps weak skills to approved resources from `studyResources.config.ts`
3. Composes a natural-language recommendation using the approved book titles and their known focus areas
4. If curated chapter/section data exists later, it can enrich the recommendation copy, but chapter precision is not required to ship Phase 1
5. If the student got 0 incorrect (perfect score), show congratulatory message with advanced-level resource suggestions

**FR-37: Resource display format.**
Each recommendation card shows:
- 📖 Book title (bold) + author
- Focus area text from the approved catalog (chapter/section override optional)
- Skill tag badge (e.g., "Grammar", "Vocabulary")

#### 4.4.3 Score Trend

**FR-38: Score trend widget.**
Shows a bar chart of the student's recent scores for the same test type/subject:
- Query: `getHistoricalScores(studentId, testType/subject, limit: 5)` — latest 5 results
- Display: Vertical bar chart with score percentage labels
- X-axis: Test labels ("Test 1", "Test 2", etc.) or abbreviated dates
- Color: Accent gradient for bars
- Trend indicator: Arrow + text ("Improving ↑" / "Declining ↓" / "Stable →")

> **Data source:** Requires a new service function `getHistoricalScores()` that queries `test_results/` for the same student, filtered by test type or subject, sorted by `submittedAt DESC`, limited to 5 results.

#### 4.4.4 Class Position

**FR-39: Class position widget.**
Shows the student's score relative to the class average:
- Display: "Your score: X%" vs "Class average: Y%"
- Visual: Horizontal bar comparison or simple text comparison
- Status badge: "Above Average ↑" (green) / "At Average →" (amber) / "Below Average ↓" (red)
- Data: Compute from all students' results for the same test in the same class

> **Data source:** Requires a new service function `getClassTestScores(testId, classId)` that queries all students' results for the given test. The class average is computed client-side from the results.

---

### 4.5 Attempt History

**FR-40: Multi-attempt detection.**
Query ALL results for the same `testId + studentId` combination (not just the latest).
Sort by `submittedAt DESC`.
Return all matching results as an array.

> **Implementation note:** Modify `getStudentSessionResult()` to optionally return all results instead of just `matching[0]`. Add a new function `getStudentTestAttempts(studentId, testId): TestResultRecord[]`.

**FR-41: Attempt history in ResultCard (list pages).**
When a test has multiple attempts, the ResultCard should show:
- A small badge: "Attempt 3 of 3" (bottom-left, near the date)
- A tiny sparkline or trend indicator: 📈 if improving, 📉 if declining, ➡️ if stable
- Score shown is always the **latest** attempt's score

> **Note:** The current `ResultCard` is simple (title, score, badges, date, feedback indicator). The attempt badge is an additive enhancement — it does NOT change the card layout significantly.

**FR-42: Attempt history in slide panel.**
At the top of the Overview tab (below score display, above section breakdown):

```
┌─ Attempt History ─────────────────────────┐
│  Viewing: [Attempt 3 of 3 ▾]  (dropdown) │
│                                            │
│  #3  Mar 20, 3:35 PM   85%  ████████░  📈│
│  #2  Mar 18, 2:10 PM   72%  ███████░░     │
│  #1  Mar 15, 9:00 AM   58%  █████░░░░     │
│                                            │
│  Improvement: +27% since first attempt     │
└────────────────────────────────────────────┘
```

**FR-43: Attempt switching via dropdown.**
The panel header shows a dropdown: "Attempt 3 ▾".
Selecting a different attempt reloads the entire panel content (score, pills, review, AI feedback) with that attempt's data.
Data is loaded from `test_results/{attemptResultId}`.

**FR-44: Attempt scope.**
Attempt tracking applies to ALL test types: THCS, IELTS Reading, IELTS Listening, homework submissions.
The grouping key is: `testId + studentId` (matching across sessions).

**FR-45: Single-attempt behavior.**
If only 1 attempt exists, the attempt history section is hidden entirely. No "Attempt 1 of 1" badge is shown.

---

### 4.6 IELTS-Specific Adaptations

**FR-46: IELTS passage breakdown (new data).**
At test submission time (`useTestSubmission.ts` → `savePermanentResult()`), derive passage-level results from the test's section structure and save as `ieltsData`:

```typescript
// New field on TestResultRecord
ieltsData?: {
  passageResults: {
    passageName: string;     // e.g., "Passage 1" or section name
    questionRange: [number, number]; // e.g., [1, 13]
    correct: number;
    total: number;
    percentage: number;
  }[];
};
```

**FR-47: Deriving passage results.**
Since IELTS tests have variable passage counts (not always 3):
1. At save time, read the `testData.questions` array or test sections
2. Group questions by their section/passage (using `passageId` if available, or sequential grouping)
3. Count correct/incorrect per group
4. Save as `ieltsData.passageResults`

> **Implementation pattern:** Model this after `thcsResultToTestMarkingResult()` in `thcsAutoMarking.service.ts`. Create an analogous `deriveIeltsPassageResults()` utility.

**FR-48: IELTS pill abbreviations.**
Add answer abbreviation mapping to pill rendering:

```typescript
const IELTS_ABBREVIATIONS: Record<string, string> = {
  'true': 'T',
  'false': 'F',
  'not given': 'NG',
  'yes': 'Y',
  'no': 'N',
};
```

Apply in `getShortAnswerLabel()`: before checking length > 3, check if `answer.toLowerCase()` matches an abbreviation key. If so, return the abbreviation.

**FR-49: IELTS AI feedback support.**
IELTS tests now receive AI-generated feedback.
- Extend `handleGenerateFormativeFeedback()` to handle IELTS results (they have `questionResults` + `bandScore` but no `thcsData`)
- Extend the `formativeFeedback.service.ts` to accept IELTS result format
- IELTS AI feedback prompt should reference passage context and question types (matching, T/F/NG, summary completion, etc.)
- AI explanations appear per-question in the Review Mistakes tab, same as THCS

> **Note (v2 change):** This was previously out of scope. Included per user decision to provide full AI support for all test types.

---

### 4.7 Offline / Error Handling

**FR-50: RTDB listener error handling.**
Keep existing pattern from `ResultDetailModal.tsx`:
1. Primary: RTDB `onValue` real-time listener
2. If listener fails before first snapshot: fallback to `getTestResult()` (REST one-shot read)
3. If REST fallback also fails: show inline error card with "Unable to load results. Check your internet connection." message + "🔄 Try Again" button
4. Already-loaded data remains visible if connection drops after initial load (Firebase RTDB caches locally)

---

## 5. Non-Goals (Out of Scope)

| # | Non-Goal | Reason |
|---|----------|--------|
| NG-1 | Guest user support in slide panel | Deprioritized (current guest flow uses separate `GuestResultsPage`) |
| NG-2 | Speaking test results | Not yet implemented in the system |
| NG-3 | Vietnamese curriculum textbook recommendations | Phase 2 — approved book list covers international resources only |
| NG-4 | Grade-level specific resource recommendations | Phase 2 |
| NG-5 | Teacher-facing slide panel | This PRD is student-facing only |
| NG-6 | `pending-review` result masking | Not needed — existing system handles pending writing questions gracefully (see §7.4) |
| NG-7 | Collins Vocabulary for IELTS | Excluded from book library per user decision |

---

## 6. Technical Considerations

### 6.1 Files to Create

| File | Purpose |
|------|---------|
| `src/components/results/ResultSlidePanel.tsx` | Main panel component (slide-in + tabs + content) |
| `src/components/results/AttemptHistory.tsx` | Attempt timeline + dropdown switcher |
| `src/components/results/StudyRecommendations.tsx` | AI-composed study resource section |
| `src/components/results/ScoreTrendWidget.tsx` | Bar chart of historical scores |
| `src/components/results/ClassPositionWidget.tsx` | Student vs class average comparison |
| `src/components/results/AIPerformanceAnalysis.tsx` | Strengths / Areas for Improvement / Recommendations |
| `src/config/studyResources.config.ts` | Static book-to-topic mapping |
| `src/hooks/useTestAttempts.ts` | Hook to fetch all attempts for a testId+studentId |
| `src/hooks/useHistoricalScores.ts` | Hook to fetch recent scores for same test type |
| `src/hooks/useClassPosition.ts` | Hook to fetch class average for a given test |

### 6.2 Files to Modify

| File | Change |
|------|--------|
| `src/services/testResults.service.ts` | Add `ieltsData` to `TestResultRecord`, add `getStudentTestAttempts()`, `getHistoricalScores()`, `getClassTestScores()` functions |
| `src/services/formativeFeedback.service.ts` | Extend to handle IELTS results (non-THCS feedback generation) |
| `src/hooks/test/useTestSubmission.ts` | Call `deriveIeltsPassageResults()` at save time for non-THCS tests |
| `src/components/results/QuestionPillsGrid.tsx` | Add IELTS abbreviation mapping in `getShortAnswerLabel()` |
| `src/components/academicRecord/ResultCard.tsx` | Add attempt count badge |
| `src/components/academicRecord/ResultsBySkill.tsx` | Wire `ResultCard.onClick` to open `ResultSlidePanel` instead of navigating |
| `src/components/academicRecord/ResultTimeline.tsx` | Same wiring |
| `src/components/academicRecord/ResultsByCourse.tsx` | Same wiring |
| `src/components/academicRecord/ResultsByTestType.tsx` | Same wiring |

### 6.3 Files to Deprecate (After Migration)

| File | Replacement |
|------|-------------|
| `src/pages/ResultDetailPage.tsx` | `ResultSlidePanel.tsx` (page becomes thin wrapper that opens panel on mount via deep-link) |

### 6.4 Data Schema Addition

```typescript
// Addition to TestResultRecord in testResults.service.ts
interface TestResultRecord {
  // ... existing fields ...

  /** IELTS-specific passage breakdown */
  ieltsData?: {
    passageResults: {
      passageName: string;
      questionRange: [number, number];
      correct: number;
      total: number;
      percentage: number;
    }[];
  };
}
```

### 6.5 Existing Patterns to Reuse

| Pattern | Source | Usage |
|---------|--------|-------|
| Fire-and-forget + RTDB real-time + auto-trigger | `ResultDetailModal.tsx` lines 92-180 | AI feedback auto-generation |
| Shimmer skeleton loading | `ResultDetailModal.tsx` lines 421-456 | AI feedback waiting state |
| Section results rendering | `ResultDetailModal.tsx` lines 337-400 | THCS section breakdown |
| Answer formatting | `QuestionPillsGrid.tsx` `getShortAnswerLabel()` | Pill content display |
| goToQuestion scroll | `mockup-result-slide-panel.html` | Pill → Review Mistakes navigation |

---

## 7. Edge Cases & Handling

### 7.1 Mixed Question Types (MCQ + Fill-in + Sentence-Rewrite)

**Scenario:** A THCS test contains MCQ, fill-in-blank, AND sentence-rewrite questions.

**Handling:**
- Overview pills: All show question number only (compact grid)
- Review Mistakes: Each question card adapts its display format
- Sentence-rewrite with `gradingTier: 'pending'`: pill is gray, card shows "⏳ Pending"
- Auto-graded questions show green/red normally regardless of pending writing questions

### 7.2 0 Incorrect Questions (Perfect Score)

**Handling:**
- Pill grid: All green
- Review Mistakes tab: Show congratulations card with gradient green background:
  - `background: linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%)`
  - `border: 1px solid #a7f3d0`
  - `padding: 40px`
  - Large emoji (🎉), bold title, congratulatory text
- Study recommendations: Show advanced-level suggestions (e.g., "Ready for the next level? Try Advanced Grammar in Use...")
- No tooltip on pills (since none are incorrect)

### 7.3 50+ Question Tests

**Handling:**
- Pill grid switches to fixed 10-column layout
- Scroll within the overview tab is sufficient (no pagination)
- Last row has fewer pills (e.g., 53 questions = 5 full rows + 1 row with 3 pills)

### 7.4 Writing Questions (`pending-review`)

**Handling:** The existing system handles this gracefully *without* special panel logic:
- Pure writing tests → Student redirected to `/submission-complete`, panel never opens until graded
- Mixed tests → Writing questions show `✎`-equivalent pill in gray + "Pending review" in the card
- RTDB real-time listener auto-updates when teacher finishes grading
- No score masking or banner needed

### 7.5 Re-submitted Results (Attempt Tracking)

**Handling:**
- Each submission creates a unique `resultId`
- `getStudentTestAttempts(studentId, testId)` returns all matching results sorted by `submittedAt DESC`
- Panel defaults to latest attempt
- Dropdown allows switching to any prior attempt
- If only 1 attempt exists, attempt history section is hidden

### 7.6 No Internet After Load

**Handling:**
- Already-loaded data remains visible (Firebase RTDB local cache)
- If `onValue` error fires before any data: fallback to `getTestResult()` REST call
- If REST also fails: inline error card with retry button
- Previously generated AI feedback (already in RTDB) persists

### 7.7 Panel Opened Before AI Feedback Loads

**Handling:**
- Shimmer skeleton shown immediately (FR-24)
- RTDB listener auto-updates panel when feedback arrives
- No manual "refresh" needed

### 7.8 IELTS Variable Passage Count

**Handling:**
- Tests can have 1, 2, or 3 passages
- Passage-to-question mapping derived from test section structure at save time
- If no section structure available (legacy data), passage breakdown is simply not shown
- `ieltsData.passageResults` length matches actual passage count

### 7.9 Score Trend — Insufficient Data

**Handling:**
- If student has only 1 result for the test type, Score Trend widget shows a single bar with text: "Take more tests to see your trend"
- If student has 0 prior results for the test type (first ever), Score Trend widget is hidden

### 7.10 Class Position — No Class Context

**Handling:**
- If the test is not associated with a class (e.g., self-practice), Class Position widget is hidden
- If the class has only 1 student, show score without comparison
- Privacy: Only the aggregate average is shown, never individual student scores

---

## 8. Design Considerations

### 8.1 Visual Reference

The HTML mockup at `mockup-result-slide-panel.html` serves as the design reference. Key visual elements:
- Clean white panel with subtle shadow (`box-shadow: -8px 0 40px rgba(0,0,0,0.08)`)
- Purple gradient accents for AI feedback sections
- Green/red/amber color coding for question status
- SVG circular progress ring for score display
- Compact stat cards with large numbers and small labels
- Spring-like slide-in animation with cubic-bezier easing
- Staggered fade-in animations on content elements
- Light backdrop (0.08 opacity) preserving sidebar visibility

### 8.2 Component Library

Use native HTML/CSS components (no Mantine). Follow existing patterns from `ResultDetailModal.tsx` inline styles.

### 8.3 Responsive Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| > 768px | Full-content-area slide panel (`calc(100% - var(--sidebar-w))`), 3:2 grid in Feedback tab |
| ≤ 768px | Full-screen overlay, single column for all tabs |

---

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Panel open-to-render time | < 500ms for cached results |
| AI feedback load time | < 10s (existing SLA) |
| Zero layout shift during AI feedback load | CLS = 0 for shimmer→content transition |
| All test types (THCS + IELTS) render correctly with AI feedback | 100% coverage |
| Attempt history loads for multi-attempt tests | All attempts visible |
| Score Trend loads within 2s | Historical data fetched efficiently |
| Class Position computes within 3s | Class-wide query performant |

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| OQ-1 | Study resource config data — optional chapter-to-topic override layer for each approved book | Deferred — Phase 1 may ship with book-level recommendations from the approved catalog |
| OQ-2 | Should attempt history group by `testId` alone or by `testId + sessionCode`? | Suggested: `testId + studentId` (cross-session grouping) |

---

## Appendix A: Decisions Log

All decisions captured from conversation audit (2026-03-20):

| # | Decision | Choice | Source |
|---|----------|--------|--------|
| D1 | Tab count | 3 tabs: Overview / Review Mistakes / Feedback | Conversation pre-compilation check |
| D2 | Panel width | Full content area minus sidebar | User message: "cover everything from the right to ALL the middle column" |
| D3 | Score ring | Include SVG circular progress ring | User: "moving percentage round circle next to stat cards" |
| D4 | Pill tooltip | CSS hover tooltip on incorrect pills, no static hint text | User: "add it to be displayed in overview tab is not wise due to clusterness" |
| D5 | Scroll highlight | 2-second accent glow after goToQuestion scroll | Mockup implementation, approved |
| D6 | Feedback tab content | AI Performance Analysis + Study Resources + Score Trend + Class Position | User Q1: A |
| D7 | Feedback tab layout | Responsive 3fr 2fr grid (desktop), single column (mobile) | User Q2: A and C |
| D8 | Question card layout | Single column | User Q3: A |
| D9 | Review Mistakes pills | No pill navigation strip (redundant with Overview nav) | User Q4: follow recommendation (B) |
| D10 | Backdrop style | Light (0.08 opacity, no blur) | User Q5: follow recommendation (A) |
| D11 | Score Trend + Class Position | Include in this PRD | User Q6: now |
| D12 | Performance feedback source | AI-generated from formativeFeedback.aiFeedback | User Q7: B |
| D13 | IELTS AI feedback | Include in this PRD | User Q8a: include now |
| D14 | URL deep-linking | Show unique URL with result ID | User Q8c: show unique url |
| D15 | Book list | AWL stays, Collins removed → 9 books total | User Q8e: AWL, remove collins |
| D16 | Teacher feedback in panel | Removed — replaced by AI study resources | Early conversation: "replace Teacher Feedback with AI generated suggestion" |
| D17 | Panel subtitle | Skill/Section + Date only (no time used) | User directive on Gap 4 |
| D18 | Guest user support | Deprioritized (option C) | Conversation round 3 |
| D19 | IELTS passage count | Variable (1-3 passages), not hardcoded | Conversation round 4 |
| D20 | Attempt switcher UX | Dropdown ("Attempt 3 ▾") | User: B |
| D21 | Attempt scope | All test types (THCS + IELTS + homework) | User: C |
| D22 | Attempt visibility | Both result cards AND slide panel | User: A |
| D23 | Close ✕ button | Not included per user ("ignore gap 3") | User directive on mockup gaps |
| D24 | Vietnamese textbooks | Not included in Phase 1 | User: "no for now" |
| D25 | pending-review masking | Not needed — existing system handles gracefully | Audit finding: system handles by accident |
